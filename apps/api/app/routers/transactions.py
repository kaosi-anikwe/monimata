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
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.bank_account import BankAccount
from app.models.category import Category
from app.models.transaction import Transaction, TransactionSource, TransactionSplit
from app.models.user import User
from app.schemas.transactions import (
    ClusterCategorizeRequest,
    ClusterCategorizeResponse,
    ClustersResponse,
    ConfirmCategoryRequest,
    ManualTransactionRequest,
    ReviewQueueItem,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return tx


def _enqueue_embed(rule_id: str) -> None:
    """Fire-and-forget: enqueue embedding generation for a UserCategoryRule."""
    from typing import cast

    from app.worker.celery_app import CeleryTask
    from app.worker.tasks import embed_category_rule

    cast(CeleryTask, embed_category_rule).delay(rule_id)


def _upsert_narration_map(db: Session, user_id: str, narration: str, category_id: str) -> None:
    """Store / update the user's narration→category mapping.

    Writes to UserCategoryRule (Tier 1 exact-match cache) and retroactively
    categorises uncategorised transactions whose cleaned_narration matches
    the new rule, back-filling telemetry fields.
    """
    from datetime import UTC, datetime

    from app.models.user_category_rule import UserCategoryRule
    from app.services.categorization import clean_narration

    cleaned_key = clean_narration(narration)
    if not cleaned_key:
        return

    # ── UserCategoryRule (Tier 1 cache) ───────────────────────────────────────
    rule = (
        db.query(UserCategoryRule)
        .filter(
            UserCategoryRule.user_id == user_id,
            UserCategoryRule.cleaned_narration == cleaned_key,
        )
        .first()
    )
    if rule:
        rule.category_id = category_id
        rule.hit_count += 1
        rule.last_triggered = datetime.now(UTC)
        # Re-embed if the mapping changed (category re-assignment).
        _enqueue_embed(rule.id)
    else:
        new_rule = UserCategoryRule(
            user_id=user_id,
            cleaned_narration=cleaned_key,
            category_id=category_id,
        )
        db.add(new_rule)
        db.flush()  # populate new_rule.id before enqueue
        _enqueue_embed(new_rule.id)

    # ── Retroactive back-fill ─────────────────────────────────────────────────
    uncategorized = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.category_id.is_(None),
        )
        .all()
    )
    for other_tx in uncategorized:
        other_key = other_tx.cleaned_narration or clean_narration(other_tx.narration)
        if other_key == cleaned_key:
            month_str = other_tx.date.strftime("%Y-%m")
            other_tx.category_id = category_id
            other_tx.categorization_source = "exact_match"
            other_tx.category_confidence = 100
            bm = get_or_create_budget_month(db, user_id, category_id, month_str)
            bm.activity += other_tx.amount


# ── GET /transactions ─────────────────────────────────────────────────────────


@router.get("", response_model=TransactionListResponse)
def list_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    account_id: UUID | None = Query(None),
    category_id: UUID | None = Query(None),
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    uncategorized: bool | None = Query(None),
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
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=UTC)
            q = q.filter(Transaction.date >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            # end_date is inclusive — include all transactions up to end of that UTC day
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, microsecond=999999, tzinfo=UTC
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

# ── GET /transactions/clusters ──────────────────────────────────────────
# Must be defined before GET /{tx_id} so FastAPI does not interpret
# the literal string ‘clusters’ as a tx_id path parameter.


@router.get("/clusters", response_model=ClustersResponse)
def list_clusters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClustersResponse:
    """Return Levenshtein-clustered merchant groups for all uncategorised transactions.

    Use this during onboarding to present a card-stack of merchant groups so the
    user can categorise hundreds of transactions in a handful of taps.
    """
    from sqlalchemy import text

    from app.schemas.transactions import ClusterItem as ClusterItemSchema
    from app.services.categorization.clustering import (  # type: ignore[attr-defined]
        build_clusters,
    )

    # 6a: pre-aggregate via SQL GROUP BY to compress N tx rows → K unique narrations.
    # Only cluster on transactions that have a cleaned_narration — all incoming
    # transactions are guaranteed to have it from the ingestion pipeline.
    rows = db.execute(
        text("""
            SELECT cleaned_narration      AS narration_key,
                   COUNT(*)::int          AS cnt,
                   SUM(ABS(amount))::int  AS total
            FROM transactions
            WHERE user_id       = :uid
              AND category_id   IS NULL
              AND cleaned_narration IS NOT NULL
              AND cleaned_narration <> ''
            GROUP BY cleaned_narration
        """),
        {"uid": str(current_user.id)},
    ).fetchall()

    total_uncategorised: int = (
        db.execute(
            text("SELECT COUNT(*) FROM transactions WHERE user_id = :uid AND category_id IS NULL"),
            {"uid": str(current_user.id)},
        ).scalar()
        or 0
    )

    if not rows:
        return ClustersResponse(clusters=[], total_uncategorised=total_uncategorised)

    # 6b: in-memory Levenshtein clustering on the pre-aggregated candidates.
    raw_tuples = [(r.narration_key, r.cnt, r.total) for r in rows]
    clusters = build_clusters(raw_tuples)

    return ClustersResponse(
        clusters=[
            ClusterItemSchema(
                key=c.key,
                member_narrations=c.member_narrations,
                count=c.count,
                total_amount=c.total_amount,
            )
            for c in clusters
        ],
        total_uncategorised=total_uncategorised,
    )


# ── POST /transactions/clusters/categorize ──────────────────────────────────


@router.post("/clusters/categorize", response_model=ClusterCategorizeResponse)
def categorize_cluster(
    body: ClusterCategorizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClusterCategorizeResponse:
    """Batch-assign a category to every uncategorised transaction in a cluster.

    The server re-derives cluster membership by finding all unique
    cleaned_narrations within Levenshtein threshold of ``cluster_key``, then
    batch-updates the matching transactions and writes a UserCategoryRule.
    """
    from sqlalchemy import text

    from app.services.categorization.clustering import find_cluster_members

    cat = (
        db.query(Category)
        .filter(Category.id == str(body.category_id), Category.user_id == str(current_user.id))
        .first()
    )
    if cat is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Category not found"
        )

    # Fetch unique uncategorised narrations to compare against cluster_key.
    unique_narrations: list[str] = [
        r[0]
        for r in db.execute(
            text("""
                SELECT DISTINCT cleaned_narration
                FROM transactions
                WHERE user_id = :uid
                  AND category_id IS NULL
                  AND cleaned_narration IS NOT NULL
                  AND cleaned_narration <> ''
            """),
            {"uid": str(current_user.id)},
        ).fetchall()
    ]

    members = find_cluster_members(body.cluster_key, unique_narrations)
    if not members:
        return ClusterCategorizeResponse(updated_count=0)

    # Fetch and update matching transactions.
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == str(current_user.id),
            Transaction.category_id.is_(None),
            Transaction.cleaned_narration.in_(members),
        )
        .all()
    )

    from app.services.budget_logic import get_or_create_budget_month as _get_bm

    for tx in txs:
        month_str = tx.date.strftime("%Y-%m")
        tx.category_id = str(body.category_id)
        tx.categorization_source = "exact_match"
        tx.category_confidence = 100
        bm = _get_bm(db, str(current_user.id), str(body.category_id), month_str)
        bm.activity += tx.amount

    # Write UserCategoryRule for the cluster representative.
    _upsert_narration_map(db, str(current_user.id), body.cluster_key, str(body.category_id))

    db.commit()
    return ClusterCategorizeResponse(updated_count=len(txs))


# ── GET /transactions/review-queue ─────────────────────────────────────────
# Must be defined before GET /{tx_id}.


@router.get("/review-queue", response_model=ReviewQueueItem | None)
def get_review_queue(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewQueueItem | None:
    """Return the next uncategorised transaction with top-3 category suggestions.

    Transactions are served oldest-first so the user works through history in
    chronological order.  Returns null when the queue is empty.
    """
    from sqlalchemy import text

    from app.schemas.transactions import CategorySuggestion
    from app.services.categorization import get_category_suggestions

    tx = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == str(current_user.id),
            Transaction.category_id.is_(None),
        )
        .order_by(Transaction.date.asc())
        .first()
    )
    if tx is None:
        return None

    remaining_count: int = (
        db.execute(
            text("SELECT COUNT(*) FROM transactions WHERE user_id = :uid AND category_id IS NULL"),
            {"uid": str(current_user.id)},
        ).scalar()
        or 0
    )

    raw_suggestions = get_category_suggestions(db, tx, limit=3)

    return ReviewQueueItem(
        transaction=tx,  # type: ignore[arg-type]
        suggestions=[
            CategorySuggestion(
                category_id=s["category_id"],
                category_name=s["category_name"],
                confidence=s["confidence"],
                source=s["source"],
            )
            for s in raw_suggestions
        ],
        remaining_count=remaining_count,
    )


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
    Patch a transaction. All fields are editable by the owner.

    Budget activity is recalculated atomically — one undo of the old state,
    one application of the new state — to avoid double-counting when amount,
    type, date, and/or category change in the same request.
    """
    tx = _get_tx_or_404(db, str(tx_id), str(current_user.id))

    # Save pre-edit values for account balance adjustment below.
    old_amount = tx.amount
    old_account_id_str = str(tx.account_id)

    # ── Resolve intended final values ──────────────────────────────────────────
    new_type = body.type if body.type is not None else tx.type
    new_abs = abs(body.amount) if body.amount is not None else abs(tx.amount)
    new_date: datetime = body.date if body.date is not None else tx.date

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
        new_category_id: str | None = str(body.category_id)
    else:
        new_category_id = str(tx.category_id) if tx.category_id else None

    # ── Atomic budget impact recalculation ─────────────────────────────────
    old_category_id = str(tx.category_id) if tx.category_id else None
    old_month = tx.date.strftime("%Y-%m")
    new_month = new_date.strftime("%Y-%m")
    budget_changed = (
        new_signed != tx.amount or new_month != old_month or new_category_id != old_category_id
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

    # ── Update account balances to reflect financial field changes ────────────
    new_account_id_str = str(tx.account_id)  # may have been updated above
    if old_account_id_str != new_account_id_str:
        # Account changed: undo old amount from old account, apply new amount to new account
        old_acct = db.query(BankAccount).filter(BankAccount.id == old_account_id_str).first()
        new_acct = db.query(BankAccount).filter(BankAccount.id == new_account_id_str).first()
        if old_acct:
            old_acct.balance -= old_amount
        if new_acct:
            new_acct.balance += new_signed
    else:
        # Same account: apply the signed delta
        acct = db.query(BankAccount).filter(BankAccount.id == old_account_id_str).first()
        if acct:
            acct.balance += new_signed - old_amount

    tx.category_id = new_category_id
    if body.memo is not None:
        tx.memo = body.memo

    # Upsert narration→category map when category is explicitly assigned
    if body.category_id is not None and new_category_id and new_category_id != old_category_id:
        _upsert_narration_map(db, str(current_user.id), tx.narration, new_category_id)

    tx.updated_at = datetime.now(UTC)
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

# ── POST /transactions/{id}/confirm-category ─────────────────────────────────


@router.post("/{tx_id}/confirm-category", response_model=TransactionResponse)
def confirm_category(
    tx_id: UUID,
    body: ConfirmCategoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """Confirm or override a category suggestion for a transaction.

    Upserts a UserCategoryRule so future transactions with the same
    cleaned_narration are categorised immediately at Tier 1.
    """
    tx = _get_tx_or_404(db, str(tx_id), str(current_user.id))

    cat = (
        db.query(Category)
        .filter(Category.id == str(body.category_id), Category.user_id == str(current_user.id))
        .first()
    )
    if cat is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Category not found"
        )

    old_category_id = str(tx.category_id) if tx.category_id else None
    old_month = tx.date.strftime("%Y-%m")
    new_category_id = str(body.category_id)

    # Adjust budget activity.
    if old_category_id and old_category_id != new_category_id:
        old_bm = get_or_create_budget_month(db, str(current_user.id), old_category_id, old_month)
        old_bm.activity -= tx.amount
    if not old_category_id or old_category_id != new_category_id:
        new_bm = get_or_create_budget_month(db, str(current_user.id), new_category_id, old_month)
        new_bm.activity += tx.amount

    tx.category_id = new_category_id
    tx.categorization_source = "manual"
    tx.category_confidence = 100
    tx.updated_at = datetime.now(UTC)

    # Upsert Tier 1 cache so the same narration is auto-matched next time.
    _upsert_narration_map(db, str(current_user.id), tx.narration, new_category_id)

    db.commit()
    db.refresh(tx)
    return tx


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
        bm = get_or_create_budget_month(db, str(current_user.id), str(item.category_id), month_str)
        bm.activity += sign * item.amount

    tx.category_id = None
    tx.is_split = True
    tx.updated_at = datetime.now(UTC)

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
    tx.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(tx)
    return tx


# ── POST /transactions/manual ─────────────────────────────────────────────────


@router.post("/manual", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_manual_transaction(
    body: ManualTransactionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    """Create a transaction entered manually by the user."""
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

    from app.services.categorization import clean_narration

    tx = Transaction(
        user_id=str(current_user.id),
        account_id=str(body.account_id),
        date=body.date,
        amount=signed_amount,
        narration=body.narration,
        cleaned_narration=clean_narration(body.narration),
        type=body.type,
        category_id=str(body.category_id) if body.category_id else None,
        memo=body.memo,
        source=TransactionSource.manual,
    )
    db.add(tx)
    db.flush()

    if body.category_id:
        month_str = body.date.strftime("%Y-%m")
        bm = get_or_create_budget_month(db, str(current_user.id), str(body.category_id), month_str)
        bm.activity += signed_amount

    # Keep the stored balance in sync.
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
            logger.exception("evaluate_transaction_nudges failed for manual tx=%s", tx.id)

    return tx


# ── DELETE /transactions/{id} ─────────────────────────────────────────────────


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    tx_id: UUID,
    cancel_rule: bool = Query(
        False,
        description=(
            "When true and the transaction has a recurrence_id, "
            "also deactivate the recurring rule so no further instances are generated."
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a transaction. Pass cancel_rule=true to also stop the associated recurring rule."""
    from app.models.recurring_rule import RecurringRule

    tx = _get_tx_or_404(db, str(tx_id), str(current_user.id))

    # Optionally deactivate the recurring rule before deleting the transaction.
    if cancel_rule and tx.recurrence_id:
        rule = (
            db.query(RecurringRule)
            .filter(
                RecurringRule.id == tx.recurrence_id,
                RecurringRule.user_id == str(current_user.id),
            )
            .first()
        )
        if rule:
            rule.is_active = False

    # Undo budget activity
    if tx.category_id:
        month_str = tx.date.strftime("%Y-%m")
        bm = get_or_create_budget_month(db, str(current_user.id), str(tx.category_id), month_str)
        bm.activity -= tx.amount

    # Reverse the balance adjustment.
    acct = db.query(BankAccount).filter(BankAccount.id == str(tx.account_id)).first()
    if acct:
        acct.balance -= tx.amount

    db.delete(tx)
    db.commit()
