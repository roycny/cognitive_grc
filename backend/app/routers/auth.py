import os
import secrets

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Response, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
from typing import Optional
import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    revoke_access_token,
    revoke_refresh_token,
    lock_user_tokens,
    unlock_user_tokens,
    oauth2_scheme,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
    ALGORITHM,
    get_current_active_user,
    get_password_hash,
    redis_client,
    revoke_all_user_refresh_tokens,
)
from app.schemas.token import Token, TokenRefreshResponse
from app.schemas.user import UserPasswordChange
from app.rate_limit import limiter
from app.services.audit_log_service import emit_audit_log, get_client_ip

router = APIRouter(
    prefix="/auth",
    tags=["auth"]
)

# Account lockout settings
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15

# Secure flag defaults to True — cookies are only sent over HTTPS.
# Set SECURE_COOKIES=false explicitly for local HTTP development.
_SECURE_COOKIES: bool = os.getenv("SECURE_COOKIES", "true").lower() != "false"

_COOKIE_KWARGS = dict(
    httponly=True,
    secure=_SECURE_COOKIES,
    samesite="lax",
)

# Pre-computed dummy hash to prevent timing attacks on username enumeration
_DUMMY_HASH = get_password_hash("dummy_password_for_timing")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        "access_token", access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **_COOKIE_KWARGS,
    )
    response.set_cookie(
        "refresh_token", refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/auth/refresh",
        **_COOKIE_KWARGS,
    )
    # CSRF double-submit cookie: set a random token in a non-httpOnly cookie
    # so the frontend JavaScript can read it and echo it as X-CSRF-Token header.
    csrf_token = secrets.token_hex(32)
    response.set_cookie(
        "csrf_token", csrf_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=False,
        secure=_SECURE_COOKIES,
        samesite="lax",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", **_COOKIE_KWARGS)
    response.delete_cookie("refresh_token", path="/auth/refresh", **_COOKIE_KWARGS)
    response.delete_cookie("csrf_token", httponly=False, secure=_SECURE_COOKIES, samesite="lax")


class RefreshRequest(BaseModel):
    # Optional — the cookie carries the token for browser clients.
    # API clients that don't use cookies can still pass it in the body.
    refresh_token: Optional[str] = None


@router.post("/token", response_model=Token)
@limiter.limit("5/minute")
async def login_for_access_token(request: Request, response: Response, bg: BackgroundTasks, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()

    if not user:
        verify_password(form_data.password, _DUMMY_HASH)
        emit_audit_log(form_data.username, "LOGIN_FAILURE", detail="Unknown username", ip_address=get_client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if account is locked
    if user.locked_until:
        try:
            locked_until = datetime.fromisoformat(user.locked_until)
            # Ensure locked_until has a timezone if we compare it to a timezone-aware datetime
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < locked_until:
                remaining_minutes = int((locked_until - datetime.now(timezone.utc)).total_seconds() / 60) + 1
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Account locked due to too many failed login attempts. Try again in {remaining_minutes} minute(s).",
                )
            else:
                # Lock period expired — reset counters
                user.failed_login_attempts = 0
                user.locked_until = None
                unlock_user_tokens(user.username)
                db.commit()
        except ValueError:
            # Invalid locked_until value — fail secure to prevent lockout bypass
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account is locked due to too many failed login attempts. Contact an administrator.",
            )

    if not verify_password(form_data.password, user.hashed_password):
        # Increment failed login attempts
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1

        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)).isoformat()
            db.commit()
            lock_user_tokens(user.username, LOCKOUT_DURATION_MINUTES * 60)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account locked due to too many failed login attempts. Try again in {LOCKOUT_DURATION_MINUTES} minutes.",
            )

        db.commit()
        emit_audit_log(form_data.username, "LOGIN_FAILURE", detail="Bad password", ip_address=get_client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    # Successful login — reset failed attempts and any token lock
    user.failed_login_attempts = 0
    user.locked_until = None
    unlock_user_tokens(user.username)
    db.commit()

    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(user.username)
    _set_auth_cookies(response, access_token, refresh_token)
    bg.add_task(emit_audit_log, user.username, "LOGIN_SUCCESS", ip_address=get_client_ip(request))
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/refresh", response_model=TokenRefreshResponse)
@limiter.limit("10/minute")
async def refresh_access_token(
    request: Request,
    response: Response,
    body: RefreshRequest,
    refresh_token_cookie: Optional[str] = Cookie(default=None, alias="refresh_token"),
):
    """Exchange a valid refresh token for a new access token and rotated refresh token.

    The refresh token is read from the httpOnly cookie (browser clients) or the
    request body (API clients).  New tokens are written back to both cookies and
    the JSON response body.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    raw_refresh = refresh_token_cookie or body.refresh_token
    if not raw_refresh:
        raise credentials_exception

    try:
        payload = jwt.decode(raw_refresh, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        jti: str = payload.get("jti")
        token_type: str = payload.get("type")
        if not username or not jti or token_type != "refresh":
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception

    # Verify the refresh token JTI is still valid in Redis (not revoked / not expired)
    stored_username = redis_client.get(f"refresh:{jti}")
    if stored_username is None or stored_username != username:
        raise credentials_exception

    # Rotate: revoke the old refresh token and issue new tokens
    revoke_refresh_token(jti)
    new_access_token = create_access_token(
        data={"sub": username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    new_refresh_token = create_refresh_token(username)
    _set_auth_cookies(response, new_access_token, new_refresh_token)
    return {"access_token": new_access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    bg: BackgroundTasks,
    body: RefreshRequest,
    access_token_cookie: Optional[str] = Cookie(default=None, alias="access_token"),
    refresh_token_cookie: Optional[str] = Cookie(default=None, alias="refresh_token"),
    bearer_token: Optional[str] = Depends(oauth2_scheme),
):
    """Revoke the current access token and the provided refresh token, then clear cookies."""
    raw_access = access_token_cookie or bearer_token
    raw_refresh = refresh_token_cookie or body.refresh_token

    # Revoke access token via JTI blocklist
    if raw_access:
        try:
            payload = jwt.decode(raw_access, SECRET_KEY, algorithms=[ALGORITHM])
            jti = payload.get("jti")
            exp_ts = payload.get("exp")
            if jti and exp_ts:
                exp_dt = datetime.fromtimestamp(exp_ts, tz=timezone.utc)
                revoke_access_token(jti, exp_dt)
        except InvalidTokenError:
            pass  # Already invalid — nothing to revoke

    # Revoke refresh token
    if raw_refresh:
        try:
            refresh_payload = jwt.decode(raw_refresh, SECRET_KEY, algorithms=[ALGORITHM])
            refresh_jti = refresh_payload.get("jti")
            if refresh_jti:
                revoke_refresh_token(refresh_jti)
        except InvalidTokenError:
            pass  # Already invalid — nothing to revoke

    # Clear cookies regardless of token validity
    _clear_auth_cookies(response)

    # Best-effort: extract username for audit log
    uname = "unknown"
    if raw_access:
        try:
            payload = jwt.decode(raw_access, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            uname = payload.get("sub", "unknown")
        except InvalidTokenError:
            pass
    bg.add_task(emit_audit_log, uname, "LOGOUT", ip_address=get_client_ip(request))


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    password_data: UserPasswordChange,
    request: Request,
    bg: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.add(current_user)
    revoke_all_user_refresh_tokens(current_user.username)
    db.commit()

    bg.add_task(emit_audit_log, current_user.username, "PASSWORD_CHANGE", ip_address=get_client_ip(request))
    return {"message": "Password updated successfully"}
