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
from typing import Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.core.security import encrypt_pii
from app.models.bank_account import BankAccount
from app.models.transaction import Transaction, TransactionSource
from app.schemas.accounts import (
    AddManualAccountRequest,
    BankAccountResponse,
    ReconcileRequest,
    ReconcileResponse,
    SupportedBankResponse,
    UpdateAliasRequest,
    UpdateExcludeFromNetWorthRequest,
    UpdateManualBalanceRequest,
)
from app.services.ingestion import list_supported_banks
from app.ws_manager import notify_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── GET /accounts/supported-banks ───────────────────────────────────────────


@router.get("/supported-banks", response_model=list[SupportedBankResponse])
def supported_banks() -> list[SupportedBankResponse]:
    """Return every bank that MoniMata can ingest data from.

    Open endpoint — no authentication required.  Used to drive the bank
    picker in the "add account" flow.
    """
    return [
        SupportedBankResponse(
            slug=bank.slug,
            name=bank.display_name,
            channels=cast(list[Literal["email", "statement", "receipt"]], sorted(bank.channels)),
        )
        for bank in list_supported_banks()
    ]


# ── POST /accounts/manual ─────────────────────────────────────────────────────


@router.post("/manual", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED)
async def add_manual_account(
    payload: AddManualAccountRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Create a manual bank account.

    The alias field is the user-facing display name and is always editable.
    account_name mirrors alias on creation and can be updated independently.
    """
    from app.core.security import decrypt_pii
    from app.services.ingestion import is_bank_supported

    if not is_bank_supported(payload.bank_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported bank: {payload.bank_slug!r}. Use GET /accounts/supported-banks.",
        )

    # Check if the user already has a live account with the same account number.
    # account_number is stored encrypted; decrypt each candidate and compare.

    for candidate in (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == current_user.id,
            BankAccount.account_number.isnot(None),
            BankAccount.deleted_at.is_(None),
        )
        .all()
    ):
        try:
            if (
                candidate.account_number
                and decrypt_pii(candidate.account_number) == payload.account_number
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="You already have an account with that account number.",
                )
        except HTTPException:
            raise
        except Exception:
            pass  # malformed blob — skip

    bank_account = BankAccount(
        user_id=current_user.id,
        institution=payload.institution,
        bank_slug=payload.bank_slug,
        account_name=payload.alias,
        alias=payload.alias,
        account_number=encrypt_pii(payload.account_number),
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
        from app.services.categorization import clean_narration

        opening_tx = Transaction(
            user_id=current_user.id,
            account_id=bank_account.id,
            date=datetime.now(UTC),
            amount=bank_account.balance,
            narration="Starting balance",
            cleaned_narration=clean_narration("Starting balance"),
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
    current_user: CurrentUser = Depends(get_current_user),
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
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Update the display alias for any account (manual or linked)."""
    account = _get_live_account_or_404(db, account_id, current_user.id)
    account.alias = payload.alias.strip()
    db.commit()
    db.refresh(account)
    return account


# ── PATCH /accounts/{id}/exclude-from-net-worth ─────────────────────────────


@router.patch("/{account_id}/exclude-from-net-worth", response_model=BankAccountResponse)
def update_exclude_from_net_worth(
    account_id: str,
    payload: UpdateExcludeFromNetWorthRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Toggle whether this account is excluded from the net-worth calculation."""
    account = _get_live_account_or_404(db, account_id, current_user.id)
    account.exclude_from_net_worth = payload.exclude_from_net_worth
    db.commit()
    db.refresh(account)
    notify_user(current_user.id, ["accounts"])
    return account


# ── PATCH /accounts/{id}/balance ─────────────────────────────────────────────


@router.patch("/{account_id}/balance", response_model=BankAccountResponse)
def update_manual_balance(
    account_id: str,
    payload: UpdateManualBalanceRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BankAccount:
    """Update the balance of a manual account via an adjustment transaction.

    The delta between the current computed balance and the target is recorded
    as a credit (balance increase) or debit (balance decrease) transaction.
    This keeps TBB accurate and lets the user assign the adjustment to a
    category — particularly useful when updating from a zero balance.
    """
    account = _get_live_account_or_404(db, account_id, current_user.id)

    current_balance: int = account.starting_balance + int(
        db.query(func.sum(Transaction.amount)).filter(Transaction.account_id == account_id).scalar()
        or 0
    )
    delta = payload.balance - current_balance

    now = datetime.now(UTC)
    audit_entry: dict[str, Any] = {
        "previous_balance": current_balance,
        "new_balance": payload.balance,
        "delta": delta,
        "changed_at": now.isoformat(),
    }
    if payload.note:
        audit_entry["note"] = payload.note

    if delta != 0:
        from app.services.categorization import clean_narration

        bal_narration = payload.note or "Balance adjustment"
        db.add(
            Transaction(
                user_id=current_user.id,
                account_id=account.id,
                date=now,
                amount=delta,
                narration=bal_narration,
                cleaned_narration=clean_narration(bal_narration),
                type="credit" if delta > 0 else "debit",
                source=TransactionSource.manual,
            )
        )

    account.balance = payload.balance
    account.balance_as_of = now
    account.balance_adjustments = (account.balance_adjustments or []) + [audit_entry]

    db.commit()
    db.refresh(account)
    notify_user(current_user.id, ["accounts", "transactions", "budget"])
    return account


# ── DELETE /accounts/{id} — soft delete ──────────────────────────────────────


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete an account. Transaction history is preserved."""
    account = _get_live_account_or_404(db, account_id, current_user.id)
    account.deleted_at = datetime.now(UTC)
    db.commit()


# ── POST /accounts/{id}/reconcile ──────────────────────────────────────────────


@router.post("/{account_id}/reconcile", response_model=ReconcileResponse)
def reconcile_account(
    account_id: str,
    payload: ReconcileRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReconcileResponse:
    """Anchor the tracked balance to a verified real-world balance (spec §8.3).

    Computes delta = true_actual_balance − tracked_balance.  If non-zero, a
    synthetic MONIMATA_RECONCILIATION transaction is inserted with
    category_id=None so the adjustment flows directly into (or out of) TBB.
    """
    account = _get_live_account_or_404(db, account_id, current_user.id)

    tracked_balance: int = account.starting_balance + int(
        db.query(func.sum(Transaction.amount)).filter(Transaction.account_id == account_id).scalar()
        or 0
    )
    delta = payload.true_actual_balance - tracked_balance

    if delta == 0:
        return ReconcileResponse(
            delta=0,
            new_balance=tracked_balance,
            transaction_id=None,
        )

    from app.services.categorization import clean_narration

    tx = Transaction(
        user_id=str(current_user.id),
        account_id=account.id,
        date=datetime.now(UTC),
        amount=delta,
        narration="Manual Reconciliation",
        cleaned_narration=clean_narration("Manual Reconciliation"),
        type="credit" if delta > 0 else "debit",
        category_id=None,
        source=TransactionSource.system,
    )
    db.add(tx)
    db.commit()

    notify_user(str(current_user.id), ["accounts", "transactions", "budget"])

    return ReconcileResponse(
        delta=delta,
        new_balance=payload.true_actual_balance,
        transaction_id=str(tx.id),
    )


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
