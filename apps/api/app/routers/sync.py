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
Delta sync endpoints for WatermelonDB.

GET  /sync/pull?last_pulled_at=<unix_ms>
POST /sync/push

The server processes push first, then the client pulls to receive its own writes
back (ensuring the local DB reflects the canonical server state).

Pull: transactions (last 90 days), category_groups, categories, budget_months
      (last 3 months), category_targets (all), recurring_rules (active)
Push: budget_months (assignment changes), transactions (manual + re-categorization)

Recurring generation: lazy — on each pull the server inspects all active
RecurringRule rows for the user where next_due <= today.  For each such rule it
creates a transaction instance and advances next_due until it is in the future.
The generated transactions are included in the pull response automatically
because they land in the transaction window.

Deletions: tracked via a soft-delete pattern.  For now we return empty deleted
arrays; a deletions log table will be added in Phase 2.
"""

from __future__ import annotations

import time
import logging
import uuid
from typing import Any
from datetime import date, datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta

from sqlalchemy.orm import Session
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from app.models.user import User
from app.core.database import get_db
from app.models.budget import BudgetMonth
from app.models.target import CategoryTarget
from app.models.recurring_rule import RecurringRule
from app.core.deps import get_current_user
from app.models.transaction import Transaction
from app.models.category import Category, CategoryGroup
from app.services.budget_logic import get_or_create_budget_month

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Serialisation helpers ─────────────────────────────────────────────────────


def _ts_ms(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _serialize_transaction(tx: Transaction) -> dict[str, Any]:
    return {
        "id": str(tx.id),
        "account_id": str(tx.account_id),
        "user_id": str(tx.user_id),
        "mono_id": tx.mono_id,
        "date": _ts_ms(tx.date) if tx.date else None,
        "amount": tx.amount,
        "narration": tx.narration,
        "type": tx.type,
        "balance_after": tx.balance_after,
        "category_id": str(tx.category_id) if tx.category_id else None,
        "memo": tx.memo,
        "is_split": tx.is_split,
        "is_manual": tx.is_manual,
        "source": tx.source,
        "recurrence_id": str(tx.recurrence_id) if tx.recurrence_id else None,
        "created_at": _ts_ms(tx.created_at),
        "updated_at": _ts_ms(tx.updated_at),
    }


def _serialize_category_group(g: CategoryGroup) -> dict[str, Any]:
    return {
        "id": str(g.id),
        "user_id": str(g.user_id),
        "name": g.name,
        "sort_order": g.sort_order,
        "is_hidden": g.is_hidden,
        "created_at": _ts_ms(g.created_at) if g.created_at else None,
        "updated_at": _ts_ms(g.updated_at) if g.updated_at else None,
    }


def _serialize_category(c: Category) -> dict[str, Any]:
    return {
        "id": str(c.id),
        "user_id": str(c.user_id),
        "group_id": str(c.group_id),
        "name": c.name,
        "sort_order": c.sort_order,
        "is_hidden": c.is_hidden,
        "created_at": _ts_ms(c.created_at) if c.created_at else None,
        "updated_at": _ts_ms(c.updated_at) if c.updated_at else None,
    }


def _serialize_budget_month(bm: BudgetMonth) -> dict[str, Any]:
    return {
        "id": str(bm.id),
        "user_id": str(bm.user_id),
        "category_id": str(bm.category_id),
        "month": bm.month,
        "assigned": bm.assigned,
        "activity": bm.activity,
        "updated_at": _ts_ms(bm.updated_at) if bm.updated_at else None,
    }


def _serialize_target(t: CategoryTarget) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "category_id": str(t.category_id),
        "frequency": t.frequency,
        "behavior": t.behavior,
        "target_amount": t.target_amount,
        "day_of_week": t.day_of_week,
        "day_of_month": t.day_of_month,
        "target_date": t.target_date.isoformat() if t.target_date else None,
        "repeats": t.repeats,
        "created_at": _ts_ms(t.created_at),
        "updated_at": _ts_ms(t.updated_at),
    }


def _serialize_recurring_rule(r: RecurringRule) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "user_id": str(r.user_id),
        "frequency": r.frequency,
        "interval": r.interval,
        "day_of_week": r.day_of_week,
        "day_of_month": r.day_of_month,
        "next_due": r.next_due.isoformat(),
        "ends_on": r.ends_on.isoformat() if r.ends_on else None,
        "is_active": r.is_active,
        "template": r.template,
        "created_at": _ts_ms(r.created_at),
        "updated_at": _ts_ms(r.updated_at),
    }


def _advance_next_due(rule: RecurringRule, from_date: date) -> date:
    """Return the next due date after from_date according to rule.frequency."""
    n = rule.interval or 1
    if rule.frequency == "daily":
        return from_date + timedelta(days=n)
    if rule.frequency in ("weekly", "biweekly"):
        weeks = 1 if rule.frequency == "weekly" else 2
        weeks *= n
        return from_date + timedelta(weeks=weeks)
    if rule.frequency == "monthly":
        next_d = from_date + relativedelta(months=n)
        if rule.day_of_month is not None:
            if rule.day_of_month == 0:
                # last day of the resulting month
                next_d = (next_d.replace(day=1) + relativedelta(months=1)) - timedelta(
                    days=1
                )
            else:
                import calendar

                max_day = calendar.monthrange(next_d.year, next_d.month)[1]
                next_d = next_d.replace(day=min(rule.day_of_month, max_day))
        return next_d
    if rule.frequency == "yearly":
        return from_date + relativedelta(years=n)
    # custom — treat interval as days
    return from_date + timedelta(days=n)


def _generate_recurring_transactions(db: Session, user_id: str, today: date) -> None:
    """
    Lazy recurring-transaction generation.

    For every active RecurringRule belonging to the user where next_due <= today,
    create a Transaction from the rule's template and advance next_due.  Catch-up
    logic handles users who have not synced for extended periods: we loop until
    next_due > today.
    """
    rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == user_id,
            RecurringRule.is_active.is_(True),
            RecurringRule.next_due <= today,
        )
        .all()
    )

    for rule in rules:
        current_due = rule.next_due
        while current_due <= today:
            # Honour ends_on
            if rule.ends_on and current_due > rule.ends_on:
                rule.is_active = False
                break

            tmpl = rule.template
            tx = Transaction(
                id=str(uuid.uuid4()),
                user_id=user_id,
                account_id=tmpl["account_id"],
                date=current_due,
                amount=int(tmpl["amount"]),
                narration=tmpl.get("narration", "Recurring"),
                type=tmpl.get("type", "debit"),
                category_id=tmpl.get("category_id"),
                memo=tmpl.get("memo"),
                is_manual=True,
                source="manual",
                recurrence_id=str(rule.id),
            )
            db.add(tx)

            # Update budget activity if categorised
            if tx.category_id:
                month_str = current_due.strftime("%Y-%m")
                bm = get_or_create_budget_month(
                    db, user_id, str(tx.category_id), month_str
                )
                bm.activity += tx.amount

            current_due = _advance_next_due(rule, current_due)

        rule.next_due = current_due


# ── GET /sync/pull ────────────────────────────────────────────────────────────


@router.get("/pull")
def pull(
    last_pulled_at: int = Query(
        0, description="Unix millisecond timestamp of last successful pull"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Return all records created or updated since last_pulled_at.
    Runs lazy recurring-transaction generation before querying.
    Scoped to the authenticated user.
    """
    user_id = str(current_user.id)
    today = date.today()

    # Generate any overdue recurring transactions before querying
    _generate_recurring_transactions(db, user_id, today)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Recurring generation failed: %s", exc)

    # !! IMPORTANT: server_timestamp MUST be set before any DB reads.
    # WatermelonDB stores this as last_pulled_at; if it were set after the
    # queries, any record written between query-time and this assignment would
    # fall into a gap: not returned now (query missed it) and not returned on
    # the next pull either (updated_at < server_timestamp → below the since
    # threshold). The result is the client never receives it as "created" but
    # later gets it as "updated" → WatermelonDB "doesn't exist locally" error.
    server_timestamp = int(time.time() * 1000)

    since = (
        datetime.fromtimestamp(last_pulled_at / 1000, tz=timezone.utc)
        if last_pulled_at
        else datetime.min.replace(tzinfo=timezone.utc)
    )

    # ── Transactions — last 90 days ───────────────────────────────────────────
    cutoff_date = today - timedelta(days=90)
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= cutoff_date,
            Transaction.updated_at >= since,
        )
        .order_by(Transaction.updated_at)
        .all()
    )

    # ── Category groups — incremental by updated_at ─────────────────────────
    groups = (
        db.query(CategoryGroup)
        .filter(
            CategoryGroup.user_id == user_id,
            CategoryGroup.updated_at >= since,
        )
        .all()
    )

    # ── Categories — incremental by updated_at ────────────────────────────────
    cats = (
        db.query(Category)
        .filter(
            Category.user_id == user_id,
            Category.updated_at >= since,
        )
        .all()
    )

    # ── Budget months — last 3 months ─────────────────────────────────────────
    today = date.today()
    three_months_ago = (today.replace(day=1) - timedelta(days=90)).strftime("%Y-%m")
    bms = (
        db.query(BudgetMonth)
        .filter(
            BudgetMonth.user_id == user_id,
            BudgetMonth.month >= three_months_ago,
            BudgetMonth.updated_at >= since,
        )
        .all()
    )

    # ── Category targets — all (small table, always send full diff) ──────────
    # Joined through categories to scope by user_id
    targets = (
        db.query(CategoryTarget)
        .join(CategoryTarget.category)
        .filter(
            Category.user_id == user_id,
            CategoryTarget.updated_at >= since,
        )
        .all()
    )

    # ── Recurring rules — all active rules for user ──────────────────────────
    rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == user_id,
            RecurringRule.updated_at >= since,
        )
        .all()
    )

    return {
        "changes": {
            "transactions": {
                "created": [
                    _serialize_transaction(t)
                    for t in txns
                    if _ts_ms(t.created_at) and _ts_ms(t.created_at) > last_pulled_at
                ],
                "updated": [
                    _serialize_transaction(t)
                    for t in txns
                    if _ts_ms(t.updated_at)
                    and _ts_ms(t.updated_at) > last_pulled_at
                    and _ts_ms(t.created_at)
                    and _ts_ms(t.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
            "category_groups": {
                "created": [
                    _serialize_category_group(g)
                    for g in groups
                    if g.created_at and _ts_ms(g.created_at) > last_pulled_at
                ],
                "updated": [
                    _serialize_category_group(g)
                    for g in groups
                    if g.created_at and _ts_ms(g.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
            "categories": {
                "created": [
                    _serialize_category(c)
                    for c in cats
                    if c.created_at and _ts_ms(c.created_at) > last_pulled_at
                ],
                "updated": [
                    _serialize_category(c)
                    for c in cats
                    if c.created_at and _ts_ms(c.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
            "budget_months": {
                "created": [
                    _serialize_budget_month(b)
                    for b in bms
                    if b.created_at and _ts_ms(b.created_at) > last_pulled_at
                ],
                "updated": [
                    _serialize_budget_month(b)
                    for b in bms
                    if b.created_at and _ts_ms(b.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
            "category_targets": {
                "created": [
                    _serialize_target(t)
                    for t in targets
                    if _ts_ms(t.created_at) > last_pulled_at
                ],
                "updated": [
                    _serialize_target(t)
                    for t in targets
                    if _ts_ms(t.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
            "recurring_rules": {
                "created": [
                    _serialize_recurring_rule(r)
                    for r in rules
                    if _ts_ms(r.created_at) > last_pulled_at
                ],
                "updated": [
                    _serialize_recurring_rule(r)
                    for r in rules
                    if _ts_ms(r.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
        },
        "timestamp": server_timestamp,
    }


# ── POST /sync/push ───────────────────────────────────────────────────────────


@router.post("/push", status_code=status.HTTP_200_OK)
def push(
    body: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Process client-side writes:
    - budget_months: assignment changes (create or update)
    - transactions: manual creation and category/memo updates

    The server validates user_id on every record — clients cannot push records
    for other users.
    """
    user_id = str(current_user.id)
    changes = body.get("changes", {})
    errors: list[str] = []

    # ── budget_months push ────────────────────────────────────────────────────
    bm_changes = changes.get("budget_months", {})

    for record in bm_changes.get("created", []) + bm_changes.get("updated", []):
        if record.get("user_id") != user_id:
            errors.append(f"Rejected budget_month {record.get('id')}: user_id mismatch")
            continue
        try:
            bm = get_or_create_budget_month(
                db, user_id, record["category_id"], record["month"]
            )
            bm.assigned = int(record.get("assigned", bm.assigned))
            # activity is server-owned; ignore any client-pushed activity values
        except Exception as exc:
            errors.append(f"budget_month {record.get('id')}: {exc}")

    # ── transactions push ─────────────────────────────────────────────────────
    tx_changes = changes.get("transactions", {})

    for record in tx_changes.get("created", []):
        if record.get("user_id") != user_id:
            errors.append(f"Rejected transaction {record.get('id')}: user_id mismatch")
            continue
        if not record.get("is_manual"):
            errors.append(
                f"Rejected transaction {record.get('id')}: only manual transactions can be pushed as created"
            )
            continue
        try:
            existing = (
                db.query(Transaction).filter(Transaction.id == record["id"]).first()
            )
            if existing:
                continue  # already exists (duplicate push)
            tx = Transaction(
                id=record["id"],
                user_id=user_id,
                account_id=record["account_id"],
                date=datetime.fromtimestamp(record["date"] / 1000, tz=timezone.utc),
                amount=int(record["amount"]),
                narration=record.get("narration", "Manual"),
                type=record.get("type", "debit"),
                category_id=record.get("category_id"),
                memo=record.get("memo"),
                is_manual=True,
                source="manual",
            )
            db.add(tx)
            if tx.category_id:
                month_str = tx.date.strftime("%Y-%m")
                bm = get_or_create_budget_month(
                    db, user_id, str(tx.category_id), month_str
                )
                bm.activity += tx.amount
        except Exception as exc:
            errors.append(f"transaction create {record.get('id')}: {exc}")

    for record in tx_changes.get("updated", []):
        if record.get("user_id") != user_id:
            errors.append(f"Rejected transaction {record.get('id')}: user_id mismatch")
            continue
        try:
            tx = (
                db.query(Transaction)
                .filter(Transaction.id == record["id"], Transaction.user_id == user_id)
                .first()
            )
            if tx is None:
                errors.append(f"transaction {record.get('id')} not found")
                continue
            # For manual transactions allow editing more fields;
            # Mono-sourced transactions are limited to category + memo only.
            if tx.is_manual:
                if "type" in record:
                    tx.type = record["type"]
                    # Keep amount sign consistent with type
                    if record["type"] == "debit" and tx.amount > 0:
                        tx.amount = -abs(tx.amount)
                    elif record["type"] == "credit" and tx.amount < 0:
                        tx.amount = abs(tx.amount)
                if "date" in record:
                    tx.date = datetime.fromtimestamp(
                        record["date"] / 1000, tz=timezone.utc
                    )
                if "account_id" in record:
                    tx.account_id = record["account_id"]
                if "narration" in record:
                    tx.narration = record["narration"]
                if "amount" in record:
                    tx.amount = int(record["amount"])
            # category_id and memo are editable on all transactions
            if "category_id" in record:
                tx.category_id = record["category_id"]
            if "memo" in record:
                tx.memo = record["memo"]
            tx.updated_at = datetime.now(timezone.utc)
        except Exception as exc:
            errors.append(f"transaction update {record.get('id')}: {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        )

    if errors:
        logger.warning("Sync push completed with %d errors: %s", len(errors), errors)

    return {"errors": errors}
