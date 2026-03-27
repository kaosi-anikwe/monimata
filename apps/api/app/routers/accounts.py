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
Bank accounts router.

Account lifecycle
─────────────────
  MANUAL (no Mono) ──link──▶ LINKED (has Mono)
       │                           │
       └──delete──▶ SOFT-DELETED ◀─┘
                    (deleted_at set)

Endpoints
─────────
  POST   /accounts/manual          Create a manual account (no BVN required)
  POST   /accounts/connect         Link a NEW Mono account (BVN required)
  GET    /accounts                 List live (non-deleted) accounts
  POST   /accounts/{id}/link       Link an existing manual account to Mono
  POST   /accounts/{id}/unlink     Disconnect Mono, keep account + history
  PATCH  /accounts/{id}/balance    Update manual balance (manual accounts only)
  POST   /accounts/{id}/sync       Trigger Mono sync (Mono-linked accounts only)
  GET    /accounts/{id}/sync-status
  DELETE /accounts/{id}            Soft-delete
"""

from __future__ import annotations

import logging
from typing import Any, cast
from datetime import datetime, timezone

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.models.user import User
from app.models.transaction import Transaction
from app.schemas.accounts import (
    AddManualAccountRequest,
    BankAccountResponse,
    ConnectAccountRequest,
    SyncStatusResponse,
    UpdateAliasRequest,
    UpdateManualBalanceRequest,
)
from app.worker.celery_app import CeleryTask
from app.models.bank_account import BankAccount
from app.worker.tasks import fetch_transactions
from app.services.mono_client import mono_client
from app.core.deps import get_current_user, get_verified_user
from app.ws_manager import notify_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── POST /accounts/manual ─────────────────────────────────────────────────────


@router.post(
    "/manual", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED
)
async def add_manual_account(
    payload: AddManualAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Create a manual (non-Mono) bank account.

    The alias field is the user-facing display name and is always editable.
    account_name is reserved for the name returned by Mono when/if the account
    is later linked.
    """
    # Check if the user already has a live account with the same account number
    existing = (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == current_user.id,
            BankAccount.account_number == payload.account_number,
            BankAccount.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an account with that account number.",
        )

    bank_account = BankAccount(
        user_id=current_user.id,
        institution=payload.institution,
        account_name=payload.alias,  # placeholder until Mono overwrites it
        alias=payload.alias,
        account_number=payload.account_number,
        bank_code=payload.bank_code,
        account_type=payload.account_type.upper(),
        currency=payload.currency,
        balance=payload.balance,
        starting_balance=payload.balance,
        balance_as_of=datetime.now(timezone.utc),
        is_mono_linked=False,
    )
    db.add(bank_account)
    db.commit()
    db.refresh(bank_account)

    # Create a "Starting balance" credit transaction so the opening funds flow
    # into TBB.  Without this, the balance lives only in bank_accounts.balance
    # and TBB (which sums credit transactions) never sees it.
    if bank_account.balance != 0:
        opening_tx = Transaction(
            user_id=current_user.id,
            account_id=bank_account.id,
            date=datetime.now(timezone.utc),
            amount=bank_account.balance,
            narration="Starting balance",
            type="credit",
            is_manual=True,
            source="manual",
        )
        db.add(opening_tx)
        # The transaction now accounts for the full opening balance; zero the
        # anchor so it isn't double-counted if the account is later Mono-linked.
        bank_account.starting_balance = 0
        db.commit()

    # Push invalidation so the mobile client refreshes TBB, net worth, and
    # the transactions list without requiring a manual pull-to-refresh.
    notify_user(current_user.id, ["accounts", "transactions", "budget"])

    return bank_account


# ── POST /accounts/connect ────────────────────────────────────────────────────


@router.post(
    "/connect", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED
)
async def connect_account(
    payload: ConnectAccountRequest,
    current_user: User = Depends(get_verified_user),  # requires identity_verified
    db: Session = Depends(get_db),
) -> BankAccount:
    """Exchange a Mono auth_code for a linked bank account.

    If an account with the resolved account number already exists as a manual
    account for this user, it is promoted to a linked account (data merged).
    """
    try:
        auth_data = await mono_client.exchange_auth_code(payload.code)
    except httpx.HTTPStatusError as exc:
        logger.warning("Mono auth_code exchange failed: %s", exc.response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not connect bank account. Please try again.",
        )

    mono_account_id: str = auth_data.get("data", {}).get("id", "")
    if not mono_account_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mono did not return an account ID",
        )

    try:
        account_data = await mono_client.get_account(mono_account_id)
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch account details from Mono",
        )

    acct_info: dict = account_data.get("data", {}).get("account", account_data)

    # Check if this Mono account is already linked (cross-user conflict)
    existing_mono = (
        db.query(BankAccount)
        .filter(BankAccount.mono_account_id == mono_account_id)
        .first()
    )
    if existing_mono:
        if existing_mono.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This bank account is already linked to another user",
            )
        # Re-activate if the account exists but was unlinked
        existing_mono.is_mono_linked = True
        existing_mono.is_active = True
        existing_mono.linked_at = existing_mono.linked_at or datetime.now(timezone.utc)
        existing_mono.unlinked_at = None
        db.commit()
        db.refresh(existing_mono)
        cast(CeleryTask, fetch_transactions).delay(mono_account_id)
        return existing_mono

    mono_account_number: str = acct_info.get("account_number", "")

    # Check for a manual account to merge into
    manual_match: BankAccount | None = None
    if mono_account_number:
        manual_match = (
            db.query(BankAccount)
            .filter(
                BankAccount.user_id == current_user.id,
                BankAccount.account_number == mono_account_number,
                BankAccount.is_mono_linked == False,
                BankAccount.deleted_at.is_(None),
            )
            .first()
        )

    now = datetime.now(timezone.utc)

    if manual_match:
        # Promote the existing manual account with Mono data.
        # account_name is overwritten by Mono; alias stays as the user set it.
        manual_match.mono_account_id = mono_account_id
        manual_match.institution = acct_info.get("institution", {}).get(
            "name", manual_match.institution
        )
        manual_match.account_name = acct_info.get("name", manual_match.account_name)
        manual_match.account_type = acct_info.get(
            "type", manual_match.account_type
        ).upper()
        manual_match.currency = acct_info.get("currency", manual_match.currency)
        manual_match.balance = int(acct_info.get("balance", manual_match.balance))
        manual_match.is_mono_linked = True
        manual_match.is_active = True
        manual_match.linked_at = now
        manual_match.unlinked_at = None
        db.commit()
        db.refresh(manual_match)
        cast(CeleryTask, fetch_transactions).delay(mono_account_id)
        return manual_match

    bank_account = BankAccount(
        user_id=current_user.id,
        mono_account_id=mono_account_id,
        institution=acct_info.get("institution", {}).get("name", "Unknown Bank"),
        account_name=acct_info.get("name", ""),
        account_number=mono_account_number or None,
        account_type=acct_info.get("type", "SAVINGS").upper(),
        currency=acct_info.get("currency", "NGN"),
        balance=int(acct_info.get("balance", 0)),
        is_mono_linked=True,
        linked_at=now,
    )
    db.add(bank_account)
    db.commit()
    db.refresh(bank_account)
    cast(CeleryTask, fetch_transactions).delay(mono_account_id)
    return bank_account


# ── GET /accounts ─────────────────────────────────────────────────────────────


@router.get("", response_model=list[BankAccountResponse])
def list_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BankAccountResponse]:
    accounts = (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == current_user.id,
            BankAccount.deleted_at.is_(None),
        )
        .all()
    )

    result: list[BankAccountResponse] = []
    for acct in accounts:
        if acct.is_mono_linked:
            # For Mono-linked accounts, compute balance from transactions
            computed_balance: int = acct.starting_balance + (
                db.query(func.sum(Transaction.amount))
                .filter(Transaction.account_id == acct.id)
                .scalar()
                or 0
            )
        else:
            # Manual accounts: balance field is the source of truth
            computed_balance = acct.balance

        resp = BankAccountResponse.model_validate(acct)
        resp.balance = int(computed_balance)
        result.append(resp)

    return result


# ── POST /accounts/{id}/link ──────────────────────────────────────────────────


@router.post("/{account_id}/link", response_model=BankAccountResponse)
async def link_account(
    account_id: str,
    payload: ConnectAccountRequest,
    current_user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Link an existing manual account to Mono using a fresh auth_code."""
    account = _get_live_account_or_404(db, account_id, current_user.id)

    if account.is_mono_linked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is already linked to Mono.",
        )

    try:
        auth_data = await mono_client.exchange_auth_code(payload.code)
    except httpx.HTTPStatusError as exc:
        logger.warning("Mono auth_code exchange failed: %s", exc.response.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not connect bank account. Please try again.",
        )

    mono_account_id: str = auth_data.get("data", {}).get("id", "")
    if not mono_account_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mono did not return an account ID",
        )

    # Conflict: another account already owns this Mono ID
    conflict = (
        db.query(BankAccount)
        .filter(
            BankAccount.mono_account_id == mono_account_id,
            BankAccount.id != account_id,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This bank account is already linked to another entry.",
        )

    try:
        account_data = await mono_client.get_account(mono_account_id)
    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch account details from Mono",
        )

    acct_info: dict = account_data.get("data", {}).get("account", account_data)
    now = datetime.now(timezone.utc)

    account.mono_account_id = mono_account_id
    account.institution = acct_info.get("institution", {}).get(
        "name", account.institution
    )
    # Mono overwrites account_name; alias is preserved as the user-facing display name
    account.account_name = acct_info.get("name", account.account_name)
    account.account_type = acct_info.get("type", account.account_type).upper()
    account.balance = int(acct_info.get("balance", account.balance))
    account.is_mono_linked = True
    account.is_active = True
    account.linked_at = now
    account.unlinked_at = None

    db.commit()
    db.refresh(account)
    cast(CeleryTask, fetch_transactions).delay(mono_account_id)
    return account


# ── POST /accounts/{id}/unlink ────────────────────────────────────────────────


@router.post("/{account_id}/unlink", response_model=BankAccountResponse)
async def unlink_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Disconnect Mono from the account. Account and transaction history are kept."""
    account = _get_live_account_or_404(db, account_id, current_user.id)

    if not account.is_mono_linked or not account.mono_account_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Account is not linked to Mono.",
        )

    try:
        await mono_client.unlink_account(account.mono_account_id)
    except httpx.HTTPStatusError as exc:
        # Log but proceed — local state must still be updated even if Mono call fails
        logger.warning(
            "Mono unlink call failed for account=%s: %s", account_id, exc.response.text
        )

    now = datetime.now(timezone.utc)
    account.previous_mono_account_id = account.mono_account_id
    account.mono_account_id = None
    account.is_mono_linked = False
    account.unlinked_at = now

    db.commit()
    db.refresh(account)
    return account


# ── PATCH /accounts/{id}/alias ───────────────────────────────────────────────


@router.patch("/{account_id}/alias", response_model=BankAccountResponse)
def update_alias(
    account_id: str,
    payload: UpdateAliasRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Update the display alias for any account (manual or linked)."""
    account = _get_live_account_or_404(db, account_id, current_user.id)
    account.alias = payload.alias.strip()
    db.commit()
    db.refresh(account)
    return account


# ── PATCH /accounts/{id}/balance ─────────────────────────────────────────────


@router.patch("/{account_id}/balance", response_model=BankAccountResponse)
def update_manual_balance(
    account_id: str,
    payload: UpdateManualBalanceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Update the balance of a manual account and append an audit entry."""
    account = _get_live_account_or_404(db, account_id, current_user.id)

    if account.is_mono_linked:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Balance cannot be edited on Mono-linked accounts.",
        )

    now = datetime.now(timezone.utc)
    audit_entry: dict[str, Any] = {
        "previous_balance": account.balance,
        "new_balance": payload.balance,
        "changed_at": now.isoformat(),
    }
    if payload.note:
        audit_entry["note"] = payload.note

    account.balance = payload.balance
    account.starting_balance = (
        payload.balance
    )  # reset so computed_balance stays in sync
    account.balance_as_of = now
    account.balance_adjustments = (account.balance_adjustments or []) + [audit_entry]

    db.commit()
    db.refresh(account)
    return account


# ── DELETE /accounts/{id} — soft delete ──────────────────────────────────────


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete an account. Transaction history is preserved."""
    account = _get_live_account_or_404(db, account_id, current_user.id)
    account.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ── POST /accounts/{id}/sync ──────────────────────────────────────────────────


@router.post("/{account_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    account = _get_live_account_or_404(db, account_id, current_user.id)

    if not account.is_mono_linked or not account.mono_account_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sync is only available for Mono-linked accounts.",
        )

    try:
        await mono_client.trigger_sync(account.mono_account_id)
    except httpx.HTTPStatusError:
        pass  # Mono may return 4xx for accounts that don't support manual sync

    cast(CeleryTask, fetch_transactions).delay(account.mono_account_id)
    return {"status": "syncing"}


# ── GET /accounts/{id}/sync-status ────────────────────────────────────────────


@router.get("/{account_id}/sync-status", response_model=SyncStatusResponse)
def sync_status(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncStatusResponse:
    account = _get_live_account_or_404(db, account_id, current_user.id)
    return SyncStatusResponse(syncing=False, last_synced_at=account.last_synced_at)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_live_account_or_404(db: Session, account_id: str, user_id: str) -> BankAccount:
    """Fetch a non-deleted account belonging to user; raises 404 otherwise."""
    account = (
        db.query(BankAccount)
        .filter(
            BankAccount.id == account_id,
            BankAccount.user_id == user_id,
            BankAccount.deleted_at.is_(None),
        )
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )
    return account
