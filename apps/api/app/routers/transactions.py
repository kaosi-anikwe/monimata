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
Transactions router — list, detail, patch (re-categorize), split, manual entry, delete.
"""

from __future__ import annotations

import logging
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.user import User
from app.core.database import get_db
from app.models.category import Category
from app.core.deps import get_current_user
from app.models.bank_account import BankAccount
from app.models.narration_map import NarrationCategoryMap
from app.models.transaction import Transaction, TransactionSplit
from app.schemas.transactions import (
    ManualTransactionRequest,
    TransactionListResponse,
    TransactionPatchRequest,
    TransactionResponse,
    TransactionSplitRequest,
)
from app.services.budget_logic import get_or_create_budget_month

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_tx_or_404(db: Session, tx_id: str, user_id: str) -> Transaction:
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == user_id)
        .first()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )
    return tx


def _recalculate_budget_activity(
    db: Session, tx: Transaction, old_category_id: Optional[str]
) -> None:
    """
    When a transaction's category changes, subtract its amount from the OLD
    budget month and add to the NEW one.
    """
    month_str = tx.date.strftime("%Y-%m")

    if old_category_id:
        old_bm = get_or_create_budget_month(
            db, str(tx.user_id), old_category_id, month_str
        )
        old_bm.activity -= tx.amount  # undo the previous contribution

    if tx.category_id:
        new_bm = get_or_create_budget_month(
            db, str(tx.user_id), str(tx.category_id), month_str
        )
        new_bm.activity += tx.amount


def _upsert_narration_map(
    db: Session, user_id: str, narration: str, category_id: str
) -> None:
    """
    Store / update the user's narration→category mapping at confidence 1.0.
    Also retroactively categorizes uncategorized transactions with the same key.
    """
    from app.services.categorization import _normalize_narration  # avoid circular

    key = _normalize_narration(narration)
    if not key:
        return

    existing = (
        db.query(NarrationCategoryMap)
        .filter(
            NarrationCategoryMap.user_id == user_id,
            NarrationCategoryMap.narration_key == key,
        )
        .first()
    )
    if existing:
        existing.category_id = category_id
        existing.confidence = 1.0
    else:
        db.add(
            NarrationCategoryMap(
                user_id=user_id,
                narration_key=key,
                category_id=category_id,
                confidence=1.0,
            )
        )

    # Retroactively assign uncategorized transactions with same narration key
    uncategorized = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.category_id.is_(None),
        )
        .all()
    )
    for other_tx in uncategorized:
        if _normalize_narration(other_tx.narration) == key:
            month_str = other_tx.date.strftime("%Y-%m")
            other_tx.category_id = category_id
            bm = get_or_create_budget_month(db, user_id, category_id, month_str)
            bm.activity += other_tx.amount


# ── GET /transactions ─────────────────────────────────────────────────────────


@router.get("", response_model=TransactionListResponse)
def list_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    account_id: Optional[UUID] = Query(None),
    category_id: Optional[UUID] = Query(None),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    uncategorized: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionListResponse:
    q = (
        db.query(Transaction)
        .filter(Transaction.user_id == str(current_user.id))
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
    )

    if account_id:
        q = q.filter(Transaction.account_id == str(account_id))
    if category_id:
        q = q.filter(Transaction.category_id == str(category_id))
    if uncategorized is True:
        q = q.filter(Transaction.category_id.is_(None))
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            q = q.filter(Transaction.date >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            # end_date is inclusive — include all transactions up to end of that UTC day
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc
            )
            q = q.filter(Transaction.date <= end_dt)
        except ValueError:
            pass

    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    return TransactionListResponse.model_validate(
        {"items": items, "total": total, "page": page, "limit": limit}
    )


# ── GET /transactions/{id} ────────────────────────────────────────────────────


@router.get("/{tx_id}", response_model=TransactionResponse)
def get_transaction(
    tx_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    return _get_tx_or_404(db, str(tx_id), str(current_user.id))


# ── PATCH /transactions/{id} ──────────────────────────────────────────────────


@router.patch("/{tx_id}", response_model=TransactionResponse)
def patch_transaction(
    tx_id: UUID,
    body: TransactionPatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """
    Patch a transaction.

    category_id / memo apply to all transactions.
    type / amount / narration / date / account_id only apply to manual
    transactions; they are silently ignored for Mono imports.

    Budget activity is recalculated atomically — one undo of the old state,
    one application of the new state — to avoid double-counting when amount,
    type, date, and/or category change in the same request.
    """
    tx = _get_tx_or_404(db, str(tx_id), str(current_user.id))

    # Save pre-edit values for account balance adjustment below.
    old_amount = tx.amount
    old_account_id_str = str(tx.account_id)

    # ── Resolve intended final values ──────────────────────────────────────────
    # Financial fields (amount/type/date/narration/account) are editable only on
    # *uncleared* manual transactions.  Once Mono confirms a manual entry by
    # matching it (mono_id is set), the bank record becomes immutable — only the
    # user's annotations (category, memo) remain editable.
    is_editable = tx.is_manual and tx.mono_id is None
    if is_editable:
        new_type = body.type if body.type is not None else tx.type
        new_abs = abs(body.amount) if body.amount is not None else abs(tx.amount)
        new_date: datetime = body.date if body.date is not None else tx.date
    else:
        new_type = tx.type
        new_abs = abs(tx.amount)
        new_date = tx.date

    new_signed = -new_abs if new_type == "debit" else new_abs

    # Resolve new category
    if body.category_id is not None:
        cat = (
            db.query(Category)
            .filter(
                Category.id == str(body.category_id),
                Category.user_id == str(current_user.id),
            )
            .first()
        )
        if cat is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Category not found",
            )
        new_category_id: Optional[str] = str(body.category_id)
    else:
        new_category_id = str(tx.category_id) if tx.category_id else None

    # ── Atomic budget impact recalculation ─────────────────────────────────
    old_category_id = str(tx.category_id) if tx.category_id else None
    old_month = tx.date.strftime("%Y-%m")
    new_month = new_date.strftime("%Y-%m")
    budget_changed = (
        new_signed != tx.amount
        or new_month != old_month
        or new_category_id != old_category_id
    )

    if budget_changed:
        if old_category_id:
            old_bm = get_or_create_budget_month(
                db, str(current_user.id), old_category_id, old_month
            )
            old_bm.activity -= tx.amount
        if new_category_id:
            new_bm = get_or_create_budget_month(
                db, str(current_user.id), new_category_id, new_month
            )
            new_bm.activity += new_signed

    # ── Apply field changes ─────────────────────────────────────────────────
    if is_editable:
        tx.type = new_type
        tx.amount = new_signed
        tx.date = new_date
        if body.narration is not None:
            tx.narration = body.narration
        if body.account_id is not None:
            account = (
                db.query(BankAccount)
                .filter(
                    BankAccount.id == str(body.account_id),
                    BankAccount.user_id == str(current_user.id),
                )
                .first()
            )
            if account is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Account not found",
                )
            tx.account_id = str(body.account_id)

    # ── Update manual account balances to reflect financial field changes ──────
    if is_editable:
        new_account_id_str = str(tx.account_id)  # may have been updated above
        if old_account_id_str != new_account_id_str:
            # Account changed: undo old amount from old account, apply new amount to new account
            old_acct = db.query(BankAccount).filter(BankAccount.id == old_account_id_str).first()
            new_acct = db.query(BankAccount).filter(BankAccount.id == new_account_id_str).first()
            if old_acct and not old_acct.is_mono_linked:
                old_acct.balance -= old_amount
            if new_acct and not new_acct.is_mono_linked:
                new_acct.balance += new_signed
        else:
            # Same account: apply the signed delta
            acct = db.query(BankAccount).filter(BankAccount.id == old_account_id_str).first()
            if acct and not acct.is_mono_linked:
                acct.balance += new_signed - old_amount

    tx.category_id = new_category_id
    if body.memo is not None:
        tx.memo = body.memo

    # Upsert narration→category map when category is explicitly assigned
    if (
        body.category_id is not None
        and new_category_id
        and new_category_id != old_category_id
    ):
        _upsert_narration_map(db, str(current_user.id), tx.narration, new_category_id)

    tx.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tx)

    # Evaluate nudge triggers when a category is assigned or changed.
    # Only fires for debit transactions with an active category — consistent
    # with the Celery path.
    if (
        body.category_id is not None
        and new_category_id
        and new_category_id != old_category_id
        and tx.type == "debit"
    ):
        try:
            from app.services.nudge_engine import evaluate_transaction_nudges

            evaluate_transaction_nudges(db, tx)
            db.commit()
        except Exception:
            logger.exception("evaluate_transaction_nudges failed for tx=%s", tx.id)

    return tx


# ── POST /transactions/{id}/split ─────────────────────────────────────────────


@router.post("/{tx_id}/split", response_model=TransactionResponse)
def split_transaction(
    tx_id: UUID,
    body: TransactionSplitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """
    Replace this transaction's category assignment with 2+ split assignments.
    The split amounts must sum to ABS(transaction.amount).
    """
    tx = _get_tx_or_404(db, str(tx_id), str(current_user.id))

    if tx.is_manual is False and tx.source == "interswitch":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Interswitch bill payment transactions cannot be split",
        )

    total_abs = abs(tx.amount)
    split_sum = sum(s.amount for s in body.splits)
    if split_sum != total_abs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Split amounts sum to {split_sum} kobo but transaction is {total_abs} kobo",
        )

    # Validate all categories belong to this user
    for item in body.splits:
        cat = (
            db.query(Category)
            .filter(
                Category.id == str(item.category_id),
                Category.user_id == str(current_user.id),
            )
            .first()
        )
        if cat is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Category {item.category_id} not found",
            )

    # Undo old budget activity
    month_str = tx.date.strftime("%Y-%m")
    if tx.category_id:
        old_bm = get_or_create_budget_month(
            db, str(current_user.id), str(tx.category_id), month_str
        )
        old_bm.activity -= tx.amount
    for old_split in tx.splits:
        if old_split.category_id:
            bm = get_or_create_budget_month(
                db, str(current_user.id), str(old_split.category_id), month_str
            )
            # split amounts are always positive; sign comes from parent tx type
            sign = -1 if tx.type == "debit" else 1
            bm.activity -= sign * old_split.amount

    # Delete old splits
    for old_split in list(tx.splits):
        db.delete(old_split)

    # Create new splits and apply budget activity
    sign = -1 if tx.type == "debit" else 1
    for item in body.splits:
        db.add(
            TransactionSplit(
                transaction_id=str(tx.id),
                category_id=str(item.category_id),
                amount=item.amount,
                memo=item.memo,
            )
        )
        bm = get_or_create_budget_month(
            db, str(current_user.id), str(item.category_id), month_str
        )
        bm.activity += sign * item.amount

    tx.category_id = None
    tx.is_split = True
    tx.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(tx)
    return tx


# ── DELETE /transactions/{id}/split ───────────────────────────────────────────


@router.delete("/{tx_id}/split", response_model=TransactionResponse)
def remove_split(
    tx_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """Remove all splits, reverting the transaction to uncategorized."""
    tx = _get_tx_or_404(db, str(tx_id), str(current_user.id))
    if not tx.is_split:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Transaction is not split",
        )

    month_str = tx.date.strftime("%Y-%m")
    sign = -1 if tx.type == "debit" else 1
    for split in list(tx.splits):
        if split.category_id:
            bm = get_or_create_budget_month(
                db, str(current_user.id), str(split.category_id), month_str
            )
            bm.activity -= sign * split.amount
        db.delete(split)

    tx.is_split = False
    tx.category_id = None
    tx.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(tx)
    return tx


# ── POST /transactions/manual ─────────────────────────────────────────────────


@router.post(
    "/manual", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED
)
def create_manual_transaction(
    body: ManualTransactionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """Create a cash/manual transaction (not from Mono)."""
    # Verify account belongs to user
    account = (
        db.query(BankAccount)
        .filter(
            BankAccount.id == str(body.account_id),
            BankAccount.user_id == str(current_user.id),
        )
        .first()
    )
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Account not found"
        )

    if body.category_id:
        cat = (
            db.query(Category)
            .filter(
                Category.id == str(body.category_id),
                Category.user_id == str(current_user.id),
            )
            .first()
        )
        if cat is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Category not found",
            )

    # Amount sign convention: debit → negative, credit → positive
    signed_amount = -abs(body.amount) if body.type == "debit" else abs(body.amount)

    tx = Transaction(
        user_id=str(current_user.id),
        account_id=str(body.account_id),
        date=body.date,
        amount=signed_amount,
        narration=body.narration,
        type=body.type,
        category_id=str(body.category_id) if body.category_id else None,
        memo=body.memo,
        is_manual=True,
        source="manual",
    )
    db.add(tx)
    db.flush()

    if body.category_id:
        month_str = body.date.strftime("%Y-%m")
        bm = get_or_create_budget_month(
            db, str(current_user.id), str(body.category_id), month_str
        )
        bm.activity += signed_amount

    # Keep the stored balance in sync for manual (non-Mono) accounts.
    # Mono-linked accounts derive their balance from SUM(transactions.amount)
    # at read time, so they don't need this.
    if not account.is_mono_linked:
        account.balance += signed_amount

    db.commit()
    db.refresh(tx)

    # Evaluate nudge triggers for categorized manual transactions.
    if tx.category_id:
        try:
            from app.services.nudge_engine import evaluate_transaction_nudges

            evaluate_transaction_nudges(db, tx)
            db.commit()
        except Exception:
            logger.exception(
                "evaluate_transaction_nudges failed for manual tx=%s", tx.id
            )

    return tx


# ── DELETE /transactions/{id} ─────────────────────────────────────────────────


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    tx_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a manual transaction only."""
    tx = _get_tx_or_404(db, str(tx_id), str(current_user.id))
    if not tx.is_manual:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only manually created transactions can be deleted",
        )

    # Undo budget activity
    if tx.category_id:
        month_str = tx.date.strftime("%Y-%m")
        bm = get_or_create_budget_month(
            db, str(current_user.id), str(tx.category_id), month_str
        )
        bm.activity -= tx.amount

    # Reverse the balance adjustment on manual (non-Mono) accounts.
    acct = db.query(BankAccount).filter(BankAccount.id == str(tx.account_id)).first()
    if acct and not acct.is_mono_linked:
        acct.balance -= tx.amount

    db.delete(tx)
    db.commit()
