import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import redis as redis_lib
from dotenv import load_dotenv
from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("CRITICAL: SECRET_KEY environment variable is not set. Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\"")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# auto_error=False so the dependency returns None (instead of 401) when the
# Authorization header is absent — lets get_current_user try the cookie first.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token", auto_error=False)

# ---------------------------------------------------------------------------
# Redis client — used for refresh token storage and access token revocation
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    jti = str(uuid.uuid4())
    to_encode.update({"exp": expire, "jti": jti, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(username: str) -> str:
    """Create a long-lived refresh token and store its JTI in Redis."""
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": username, "exp": expire, "jti": jti, "type": "refresh"}
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    ttl = int(timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
    redis_client.setex(f"refresh:{jti}", ttl, username)
    return token


def revoke_access_token(jti: str, exp: datetime) -> None:
    """Add access token JTI to the revocation blocklist with TTL = remaining lifetime."""
    # Ensure both are timezone-aware or naive. Given exp might be a timestamp or naive from decode, normalize:
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    remaining = int((exp - datetime.now(timezone.utc)).total_seconds())
    if remaining > 0:
        redis_client.setex(f"revoked_access:{jti}", remaining, "1")


def revoke_refresh_token(jti: str) -> None:
    """Remove a refresh token JTI from Redis, invalidating it."""
    redis_client.delete(f"refresh:{jti}")


def revoke_all_user_refresh_tokens(username: str) -> None:
    """Revoke all active refresh tokens for a user by scanning and deleting matching keys in Redis."""
    for key in redis_client.scan_iter("refresh:*"):
        stored_username = redis_client.get(key)
        if stored_username == username:
            redis_client.delete(key)


def _is_access_token_revoked(jti: str) -> bool:
    return redis_client.exists(f"revoked_access:{jti}") > 0


def lock_user_tokens(username: str, lockout_seconds: int) -> None:
    """Block all token access for a locked account for the lockout duration."""
    redis_client.setex(f"user_locked:{username}", lockout_seconds, "1")


def unlock_user_tokens(username: str) -> None:
    """Remove the token block when a lockout expires or is manually cleared."""
    redis_client.delete(f"user_locked:{username}")


async def get_current_user(
    bearer_token: Optional[str] = Depends(oauth2_scheme),
    access_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    """Accept the JWT from an httpOnly cookie (preferred) or Authorization: Bearer header."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = access_token or bearer_token
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        # Reject refresh tokens used as access tokens
        if payload.get("type") == "refresh":
            raise credentials_exception
        # Check per-user lock (set when account is locked out after failed logins)
        if redis_client.exists(f"user_locked:{username}"):
            raise credentials_exception
        # Check revocation blocklist (only for tokens that carry a JTI)
        jti = payload.get("jti")
        if jti and _is_access_token_revoked(jti):
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user
