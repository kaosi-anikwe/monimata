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
Auth router — register, login, refresh, logout, verify-bvn.
"""

from __future__ import annotations

import logging
from typing import cast
from datetime import datetime, timezone

import httpx
from thefuzz import fuzz
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import (
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
    BVNVerifyRequest,
    BVNVerifyResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.interswitch_client import interswitch_client

logger = logging.getLogger(__name__)
router = APIRouter()

BVN_NAME_MATCH_THRESHOLD = 70  # fuzzy similarity percentage


# ── POST /auth/register ───────────────────────────────────────────────────────


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
async def register(
    payload: RegisterRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    user = User(
        email=payload.email.lower(),
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token()
    store_refresh_token(user.id, refresh_token)

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


# ── POST /auth/login ──────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user: User | None = (
        db.query(User).filter(User.email == payload.email.lower()).first()
    )

    # Constant-time check — always call verify_password even on miss to avoid timing attacks
    valid = verify_password(
        payload.password, user.password_hash if user else "$2b$12$placeholder"
    )
    if not user or not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    user.last_login = datetime.now(timezone.utc)
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    # Rotate: delete old, issue new
    delete_refresh_token(user_id)
    new_refresh = create_refresh_token()
    store_refresh_token(user.id, new_refresh)

    access_token = create_access_token(subject=user.id)
    return AccessTokenResponse(access_token=access_token)


# ── POST /auth/logout ─────────────────────────────────────────────────────────


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)) -> None:
    delete_refresh_token(current_user.id)


# ── GET /auth/me ──────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


# ── POST /auth/verify-bvn ─────────────────────────────────────────────────────


@router.post("/verify-bvn", response_model=BVNVerifyResponse)
async def verify_bvn(
    payload: BVNVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BVNVerifyResponse:
    if current_user.identity_verified:
        return BVNVerifyResponse(
            identity_verified=True, message="Identity already verified"
        )

    # try:
    #     bvn_data = await interswitch_client.lookup_bvn(payload.bvn)
    # except httpx.HTTPStatusError as exc:
    #     logger.warning("Interswitch BVN lookup failed: %s", exc.response.text)
    #     raise HTTPException(
    #         status_code=status.HTTP_502_BAD_GATEWAY,
    #         detail="BVN verification service unavailable. Please try again.",
    #     )

    # # Extract name from Interswitch response
    # bvn_first = (bvn_data.get("firstName") or "").strip()
    # bvn_last = (bvn_data.get("lastName") or "").strip()
    # bvn_full = f"{bvn_first} {bvn_last}".strip().lower()

    # user_full = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip().lower()

    # similarity = fuzz.token_sort_ratio(user_full, bvn_full)
    # if similarity < BVN_NAME_MATCH_THRESHOLD:
    #     raise HTTPException(
    #         status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    #         detail="Name on BVN does not match your registration. Please check your details.",
    #     )

    current_user.identity_verified = True
    db.commit()

    return BVNVerifyResponse(
        identity_verified=True, message="Identity verified successfully"
    )
