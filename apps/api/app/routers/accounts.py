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
Bank accounts router — link Mono accounts, list, delete, sync.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from typing import Any, cast

from app.core.database import get_db
from app.core.deps import get_current_user, get_verified_user
from app.models.bank_account import BankAccount
from app.models.user import User
from app.schemas.accounts import (
    BankAccountResponse,
    ConnectAccountRequest,
    SyncStatusResponse,
)
from app.services.mono_client import mono_client
from app.worker.celery_app import CeleryTask
from app.worker.tasks import fetch_transactions

logger = logging.getLogger(__name__)
router = APIRouter()


# ── POST /accounts/connect ────────────────────────────────────────────────────


@router.post(
    "/connect", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED
)
async def connect_account(
    payload: ConnectAccountRequest,
    current_user: User = Depends(get_verified_user),  # requires identity_verified
    db: Session = Depends(get_db),
) -> BankAccount:
    try:
        auth_data = await mono_client.exchange_auth_code(payload.code)
    except httpx.HTTPStatusError as exc:
        logger.warning("Mono auth_code exchange failed: %s", exc.response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not connect bank account. Please try again.",
        )

    mono_account_id: str = auth_data.get("id") or auth_data.get("account", {}).get(
        "id", ""
    )
    if not mono_account_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mono did not return an account ID",
        )

    # Fetch account details
    try:
        account_data = await mono_client.get_account(mono_account_id)
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch account details from Mono",
        )

    acct_info = account_data.get("account", account_data)

    # Check for duplicate
    existing = (
        db.query(BankAccount)
        .filter(BankAccount.mono_account_id == mono_account_id)
        .first()
    )
    if existing:
        if existing.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This bank account is already linked to another user",
            )
        # Re-activate if previously unlinked
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        cast(CeleryTask, fetch_transactions).delay(mono_account_id)
        return existing

    bank_account = BankAccount(
        user_id=current_user.id,
        mono_account_id=mono_account_id,
        institution=acct_info.get("institution", {}).get("name", "Unknown Bank"),
        account_name=acct_info.get("name", ""),
        account_type=acct_info.get("type", "SAVINGS").upper(),
        currency=acct_info.get("currency", "NGN"),
        balance=int(acct_info.get("balance", 0)),
    )
    db.add(bank_account)
    db.commit()
    db.refresh(bank_account)

    # Trigger initial backfill asynchronously
    cast(CeleryTask, fetch_transactions).delay(mono_account_id)

    return bank_account


# ── GET /accounts ─────────────────────────────────────────────────────────────


@router.get("", response_model=list[BankAccountResponse])
def list_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BankAccount]:
    return (
        db.query(BankAccount)
        .filter(BankAccount.user_id == current_user.id, BankAccount.is_active == True)
        .all()
    )


# ── DELETE /accounts/{id} ─────────────────────────────────────────────────────


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    account = _get_account_or_404(db, account_id, current_user.id)
    account.is_active = False
    db.commit()


# ── POST /accounts/{id}/sync ──────────────────────────────────────────────────


@router.post("/{account_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    account = _get_account_or_404(db, account_id, current_user.id)

    try:
        await mono_client.trigger_sync(account.mono_account_id)
    except httpx.HTTPStatusError:
        pass  # Mono may return 4xx for accounts that don't support manual sync — still enqueue our fetch

    cast(CeleryTask, fetch_transactions).delay(account.mono_account_id)
    return {"status": "syncing"}


# ── GET /accounts/{id}/sync-status ────────────────────────────────────────────


@router.get("/{account_id}/sync-status", response_model=SyncStatusResponse)
def sync_status(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncStatusResponse:
    account = _get_account_or_404(db, account_id, current_user.id)
    return SyncStatusResponse(syncing=False, last_synced_at=account.last_synced_at)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_account_or_404(db: Session, account_id: str, user_id: str) -> BankAccount:
    """Fetch account belonging to user; raises 404 if not found or belongs to another user."""
    account = (
        db.query(BankAccount)
        .filter(
            BankAccount.id == account_id,
            BankAccount.user_id == user_id,
        )
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )
    return account
