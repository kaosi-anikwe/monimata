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
Auth router — register, login, refresh, logout.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import bearer_scheme, get_current_user
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
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
)
from app.services.budget_logic import seed_default_categories

logger = logging.getLogger(__name__)
router = APIRouter()


# ── POST /auth/register ───────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
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
async def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
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
async def refresh_token(
    payload: RefreshRequest, db: Session = Depends(get_db)
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
async def logout(
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
async def check_username(username: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    """
    Real-time uniqueness check for use during signup.
    Returns {"available": true} when the username is valid and not yet taken.
    No authentication required — called as the user types.
    Rate-limited by the API gateway / Nginx upstream.
    """
    import re

    username = username.lower().strip()
    if not re.match(r"^[a-z0-9_-]{3,30}$", username):
        return {"available": False}
    taken = db.query(User.id).filter(User.username == username).first() is not None
    return {"available": not taken}
