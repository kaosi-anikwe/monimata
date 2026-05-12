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

Accounts are created manually by the user.  Transactions are added
automatically via forwarded bank alert emails or by manual entry in the app.

Endpoints
─────────
  POST   /accounts/manual          Create a manual account
  GET    /accounts                 List live (non-deleted) accounts
  PATCH  /accounts/{id}/alias      Update the display alias
  PATCH  /accounts/{id}/balance    Update manual balance
  DELETE /accounts/{id}            Soft-delete
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.bank_account import BankAccount
from app.models.transaction import Transaction, TransactionSource
from app.models.user import User
from app.schemas.accounts import (
    AddManualAccountRequest,
    BankAccountResponse,
    UpdateAliasRequest,
    UpdateManualBalanceRequest,
)
from app.ws_manager import notify_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── POST /accounts/manual ─────────────────────────────────────────────────────


@router.post("/manual", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED)
async def add_manual_account(
    payload: AddManualAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Create a manual bank account.

    The alias field is the user-facing display name and is always editable.
    account_name mirrors alias on creation and can be updated independently.
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
        account_name=payload.alias,
        alias=payload.alias,
        account_number=payload.account_number,
        bank_code=payload.bank_code,
        account_type=payload.account_type.upper(),
        currency=payload.currency,
        balance=payload.balance,
        starting_balance=payload.balance,
        balance_as_of=datetime.now(UTC),
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
            date=datetime.now(UTC),
            amount=bank_account.balance,
            narration="Starting balance",
            type="credit",
            source=TransactionSource.manual,
        )
        db.add(opening_tx)
        bank_account.starting_balance = 0
        db.commit()

    # Push invalidation so the mobile client refreshes TBB, net worth, and
    # the transactions list without requiring a manual pull-to-refresh.
    notify_user(current_user.id, ["accounts", "transactions", "budget"])

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
        # Balance = starting_balance + sum of all transactions for the account.
        # The starting_balance anchor is set to 0 when an opening transaction is
        # created, so this formula works for both new and existing accounts.
        computed_balance: int = acct.starting_balance + (
            db.query(func.sum(Transaction.amount))
            .filter(Transaction.account_id == acct.id)
            .scalar()
            or 0
        )
        resp = BankAccountResponse.model_validate(acct)
        resp.balance = int(computed_balance)
        result.append(resp)

    return result


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

    now = datetime.now(UTC)
    audit_entry: dict[str, Any] = {
        "previous_balance": account.balance,
        "new_balance": payload.balance,
        "changed_at": now.isoformat(),
    }
    if payload.note:
        audit_entry["note"] = payload.note

    account.balance = payload.balance
    account.starting_balance = payload.balance  # reset so computed_balance stays in sync
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
    account.deleted_at = datetime.now(UTC)
    db.commit()


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account
