# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""
Auth router — register, login, refresh, logout, forgot/reset password.
"""

from __future__ import annotations

import hmac
import logging
from datetime import UTC, datetime
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from slowapi.util import get_remote_address
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bearer_scheme, get_current_user
from app.core.limiter import limiter
from app.core.redis_client import (
    blocklist_token,
    delete_refresh_token,
    get_stored_refresh_token,
    store_refresh_token,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    AccessTokenResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenResponse,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
    VerifyResetCodeRequest,
)
from app.services.budget_logic import seed_default_categories

logger = logging.getLogger(__name__)
router = APIRouter()


# ── POST /auth/register ───────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour", key_func=get_remote_address)
async def register(
    request: Request, payload: RegisterRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    user = User(
        email=payload.email.lower(),
        username=payload.username,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    seed_default_categories(db, user)
    db.commit()

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token()
    store_refresh_token(user.id, refresh_token)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


# ── POST /auth/login ──────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/minute", key_func=get_remote_address)
async def login(
    request: Request, payload: LoginRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    user: User | None = db.query(User).filter(User.email == payload.email.lower()).first()

    # Constant-time check — always call verify_password even on miss to avoid timing attacks
    # Always call verify_password (even on a miss) to prevent timing-based
    # user enumeration. The dummy hash is a valid bcrypt hash that never matches.
    _DUMMY_HASH = "$2b$12$notarealpasswordhashXXuu8qkFBYKNsTVMjbDSEMqhvdEoKHHunq"
    valid = verify_password(payload.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user.last_login = datetime.now(UTC)
    db.commit()

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token()
    store_refresh_token(user.id, refresh_token)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


# ── POST /auth/refresh ────────────────────────────────────────────────────────


@router.post("/refresh", response_model=AccessTokenResponse)
@limiter.limit("30/minute")
async def refresh_token(
    request: Request, payload: RefreshRequest, db: Session = Depends(get_db)
) -> AccessTokenResponse:
    """
    Exchange a valid refresh token for a new access token.
    The refresh token is rotated on every use.
    """
    from app.core.redis_client import get_redis

    r = get_redis()
    user_id: str | None = cast(str | None, r.get(f"rt_reverse:{payload.refresh_token}"))
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    stored = get_stored_refresh_token(user_id)
    if stored != payload.refresh_token:
        # Possible token reuse — invalidate all tokens for this user
        delete_refresh_token(user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected",
        )

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate: delete old, issue new
    delete_refresh_token(user_id)
    new_refresh = create_refresh_token()
    store_refresh_token(user.id, new_refresh)

    access_token = create_access_token(subject=user.id)
    return AccessTokenResponse(access_token=access_token, refresh_token=new_refresh)


# ── POST /auth/logout ─────────────────────────────────────────────────────────


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Invalidate both the refresh token (Redis delete) and the current access
    token (jti blocklist, expiring when the token would have expired naturally).
    After this returns, the access token is unusable even within its 15-min window.
    """
    import time as _time

    from jose import JWTError

    delete_refresh_token(current_user.id)

    # Blocklist the access token for its remaining lifetime.
    try:
        payload = decode_access_token(credentials.credentials)
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            remaining = int(exp) - int(_time.time())
            blocklist_token(jti, remaining)
    except JWTError:
        pass  # already invalid — nothing to blocklist


# ── GET /auth/me ──────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


# ── PATCH /auth/me ───────────────────────────────────────────────────────────


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Update mutable profile fields. Only provided (non-None) fields are changed."""
    if payload.first_name is not None:
        current_user.first_name = payload.first_name
    if payload.last_name is not None:
        current_user.last_name = payload.last_name
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.onboarded is not None:
        current_user.onboarded = payload.onboarded
    if payload.username is not None:
        existing = db.query(User).filter(User.username == payload.username).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )
        current_user.username = payload.username
    if payload.email is not None:
        new_email = payload.email.lower()
        if new_email != current_user.email:
            existing = db.query(User).filter(User.email == new_email).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already in use",
                )
            current_user.email = new_email

    db.commit()
    db.refresh(current_user)
    return current_user


# ── GET /auth/check-username ──────────────────────────────────────────────────


@router.get("/check-username")
@limiter.limit("60/minute", key_func=get_remote_address)
async def check_username(
    request: Request, username: str, db: Session = Depends(get_db)
) -> dict[str, bool]:
    """
    Real-time uniqueness check for use during signup.
    Returns {"available": true} when the username is valid and not yet taken.
    No authentication required — called as the user types.
    """
    import re

    username = username.lower().strip()
    if not re.match(r"^[a-z0-9_-]{3,30}$", username):
        return {"available": False}
    taken = db.query(User.id).filter(User.username == username).first() is not None
    return {"available": not taken}


# ── POST /auth/forgot-password ────────────────────────────────────────────────


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour", key_func=get_remote_address)
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """
    Step 1 of the password-reset flow.

    Generates a 6-digit OTP, stores it in Redis for 10 minutes, and emails it
    to the user.  Always returns 200 regardless of whether the email is
    registered — this prevents user enumeration.

    Rate-limited to 5/hour per IP via slowapi.
    """
    from app.core.redis_client import store_otp
    from app.core.security import generate_otp
    from app.services.email_service import send_email

    email = payload.email.lower()
    _RESPONSE = {"detail": "If this email is registered, a reset code has been sent"}

    user: User | None = db.query(User).filter(User.email == email).first()
    if user:
        otp = generate_otp()
        store_otp(email, otp)
        send_email(
            to=email,
            subject="Your MoniMata password reset code",
            body=(
                f"Your password reset code is: {otp}\n\n"
                "This code expires in 10 minutes.\n\n"
                "If you did not request a password reset, please ignore this email."
            ),
        )

    return _RESPONSE


# ── POST /auth/verify-reset-code ──────────────────────────────────────────────


@router.post("/verify-reset-code", response_model=ResetTokenResponse)
@limiter.limit("10/hour", key_func=get_remote_address)
async def verify_reset_code(
    request: Request, payload: VerifyResetCodeRequest
) -> ResetTokenResponse:
    """
    Step 2 of the password-reset flow.

    Verifies the OTP sent in step 1.  On success the OTP is consumed (deleted)
    and a single-use reset token valid for 15 minutes is returned.  The client
    presents this token in step 3 instead of the raw OTP.

    Rate-limited to 10/hour per IP via slowapi.
    """
    import secrets

    from app.core.redis_client import (
        delete_otp,
        get_otp,
        store_reset_token,
    )

    email = payload.email.lower()

    stored_otp = get_otp(email)
    # Use hmac.compare_digest to prevent timing-based OTP oracle attacks.
    if not stored_otp or not hmac.compare_digest(stored_otp, payload.code.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired code",
        )

    delete_otp(email)

    reset_token = secrets.token_hex(32)
    store_reset_token(reset_token, email)

    return ResetTokenResponse(reset_token=reset_token)


# ── POST /auth/reset-password ─────────────────────────────────────────────────


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/hour", key_func=get_remote_address)
async def reset_password(
    request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)
) -> None:
    """
    Step 3 of the password-reset flow.

    Validates the reset token issued in step 2, updates the user's password,
    consumes the reset token (single-use), and revokes all active refresh
    tokens — forcing a fresh login after the reset completes.
    """
    from app.core.redis_client import (
        delete_refresh_token,
        delete_reset_token,
        get_reset_token_email,
    )
    from app.core.security import hash_password

    email = get_reset_token_email(payload.reset_token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user: User | None = db.query(User).filter(User.email == email).first()
    if not user:
        delete_reset_token(payload.reset_token)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user.password_hash = hash_password(payload.new_password)
    delete_reset_token(payload.reset_token)
    delete_refresh_token(user.id)  # revoke all active sessions
    db.commit()
