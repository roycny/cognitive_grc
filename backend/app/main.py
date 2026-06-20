import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.rate_limit import limiter
from app.routers import auth, users, audits, issues, audit_logs, ai, glba, kri, ai_tools, project_risk, policy_gap
from app.database import engine, Base

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Create any new tables (e.g. users, audit_logs) that don't exist yet
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        logger.warning("Table auto-creation failed — will retry on first request")
    # Pre-warm the DB connection pool so the first user request isn't slow
    try:
        with engine.connect():
            pass
    except Exception:
        logger.warning("DB connection pool warmup failed — will retry on first request")
    yield


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-XSS-Protection"] = "0"  # Disabled; CSP is the modern defence
        # Content-Security-Policy: sensible defaults for an API backend.
        # Tighten (e.g. drop 'unsafe-eval'/'unsafe-inline', add nonces) to match
        # whatever the frontend you build on top of this actually requires.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "object-src 'none'; "
            "base-uri 'self';"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


# ---------------------------------------------------------------------------
# CSRF protection — double-submit cookie pattern
# ---------------------------------------------------------------------------
# Safe (read-only) methods and auth endpoints that *issue* cookies are exempt.
_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PATHS = {"/auth/token", "/auth/refresh"}


class CSRFMiddleware(BaseHTTPMiddleware):
    """Validate that the X-CSRF-Token header matches the csrf_token cookie
    on every state-changing request.  This prevents cross-site form
    submissions from exploiting the httpOnly auth cookies."""

    async def dispatch(self, request: Request, call_next):
        if (
            request.method not in _CSRF_SAFE_METHODS
            and request.url.path not in _CSRF_EXEMPT_PATHS
        ):
            cookie_token = request.cookies.get("csrf_token")
            header_token = request.headers.get("x-csrf-token")
            if not cookie_token or not header_token or cookie_token != header_token:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF validation failed"},
                )
        return await call_next(request)


# Docs are disabled by default. Set ENABLE_DOCS=true to expose /docs and /redoc
# (useful in development; should remain false in production).
_enable_docs = os.getenv("ENABLE_DOCS", "false").lower() == "true"

app = FastAPI(
    title="Cognitive GRC API",
    lifespan=lifespan,
    docs_url="/docs" if _enable_docs else None,
    redoc_url="/redoc" if _enable_docs else None,
    openapi_url="/openapi.json" if _enable_docs else None,
)

# Attach limiter to the app state so routers can import it
app.state.limiter = limiter

# Register the 429 error handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add SlowAPI middleware to inject X-RateLimit-* response headers
app.add_middleware(SlowAPIMiddleware)

# Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# CSRF double-submit cookie validation
app.add_middleware(CSRFMiddleware)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# Comma-separated list of allowed origins.  Defaults to localhost dev servers.
# Override with ALLOWED_ORIGINS env var for staging/production deployments.
_allowed_origins_env = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:42003,http://127.0.0.1:42003"
)
origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-CSRF-Token"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(audits.router)
app.include_router(issues.router)
app.include_router(audit_logs.router)
app.include_router(ai.router)
app.include_router(glba.router)
app.include_router(kri.router)
app.include_router(ai_tools.router)
app.include_router(project_risk.router)
app.include_router(policy_gap.router)

# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the full error details server-side only
    logger.error(f"Unhandled exception on {request.method} {request.url.path}", exc_info=exc)
    # Return a generic error message to the client — never expose internal details
    return JSONResponse(
        status_code=500,
        content={"message": "An internal server error occurred. Please try again later."},
    )

@app.get("/")
def read_root():
    return {"message": "Welcome to Cognitive GRC API"}
