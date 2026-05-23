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

import json
import logging
import time
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.core.limiter import limiter
from app.models.bank_account import BankAccount
from app.models.budget import BudgetMonth
from app.models.category import Category, CategoryGroup
from app.models.recurring_rule import RecurringRule
from app.models.target import CategoryTarget
from app.models.transaction import Transaction, TransactionSource
from app.schemas.transactions import TransactionResponse
from app.services.budget_logic import get_or_create_budget_month, str_to_month_date
from app.ws_manager import notify_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Serialisation helpers ─────────────────────────────────────────────────────


def _ts_ms(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp() * 1000)


def _serialize_transaction(tx: Transaction) -> dict[str, Any]:
    data = TransactionResponse.model_validate(tx).model_dump(mode="json")
    # WatermelonDB expects integer ms timestamps, not ISO strings.
    data["date"] = _ts_ms(tx.date) if tx.date else None
    data["created_at"] = _ts_ms(tx.created_at)
    data["updated_at"] = _ts_ms(tx.updated_at)
    # user_id is required by WatermelonDB for scoping but absent from TransactionResponse.
    data["user_id"] = str(tx.user_id)
    # splits are not a flat WatermelonDB column — omit from the transaction row.
    data.pop("splits", None)
    return data


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
        "created_at": _ts_ms(bm.created_at) if bm.created_at else None,
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
                next_d = (next_d.replace(day=1) + relativedelta(months=1)) - timedelta(days=1)
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

    from app.services.categorization import clean_narration

    for rule in rules:
        current_due = rule.next_due
        while current_due <= today:
            # Honour ends_on
            if rule.ends_on and current_due > rule.ends_on:
                rule.is_active = False
                break

            tmpl = rule.template
            if isinstance(tmpl, str):
                tmpl = json.loads(tmpl)
            recur_narration = tmpl.get("narration", "Recurring")
            tx = Transaction(
                id=str(uuid.uuid4()),
                user_id=user_id,
                account_id=tmpl["account_id"],
                date=current_due,
                amount=int(tmpl["amount"]),
                narration=recur_narration,
                cleaned_narration=clean_narration(recur_narration),
                type=tmpl.get("type", "debit"),
                category_id=tmpl.get("category_id"),
                memo=tmpl.get("memo"),
                source=TransactionSource.manual,
                recurrence_id=str(rule.id),
            )
            db.add(tx)

            # Update budget activity if categorised
            if tx.category_id:
                month_str = current_due.strftime("%Y-%m")
                bm = get_or_create_budget_month(db, user_id, str(tx.category_id), month_str)
                bm.activity += tx.amount

            current_due = _advance_next_due(rule, current_due)

        rule.next_due = current_due


# ── GET /sync/pull ────────────────────────────────────────────────────────────


@router.get("/pull")
@limiter.limit("60/minute")
def pull(
    request: Request,
    last_pulled_at: int = Query(
        0, description="Unix millisecond timestamp of last successful pull"
    ),
    current_user: CurrentUser = Depends(get_current_user),
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
        datetime.fromtimestamp(last_pulled_at / 1000, tz=UTC)
        if last_pulled_at
        else datetime.min.replace(tzinfo=UTC)
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
    three_months_ago = str_to_month_date(
        (today.replace(day=1) - timedelta(days=90)).strftime("%Y-%m")
    )
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
                    if g.updated_at
                    and _ts_ms(g.updated_at) > last_pulled_at
                    and g.created_at
                    and _ts_ms(g.created_at) <= last_pulled_at
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
                    if c.updated_at
                    and _ts_ms(c.updated_at) > last_pulled_at
                    and c.created_at
                    and _ts_ms(c.created_at) <= last_pulled_at
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
                    if b.updated_at
                    and _ts_ms(b.updated_at) > last_pulled_at
                    and b.created_at
                    and _ts_ms(b.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
            "category_targets": {
                "created": [
                    _serialize_target(t) for t in targets if _ts_ms(t.created_at) > last_pulled_at
                ],
                "updated": [
                    _serialize_target(t)
                    for t in targets
                    if _ts_ms(t.updated_at) > last_pulled_at
                    and _ts_ms(t.created_at) <= last_pulled_at
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
                    if _ts_ms(r.updated_at) > last_pulled_at
                    and _ts_ms(r.created_at) <= last_pulled_at
                ],
                "deleted": [],
            },
        },
        "timestamp": server_timestamp,
    }


# ── POST /sync/push ───────────────────────────────────────────────────────────


@router.post("/push", status_code=status.HTTP_200_OK)
@limiter.limit("60/minute")
def push(
    request: Request,
    last_pulled_at: int = Query(
        0, description="Unix millisecond timestamp of last successful pull"
    ),
    body: dict[str, Any] = Body(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Process client-side writes for all six WatermelonDB tables.
    Rate-limited to 60 pushes per user per minute via slowapi.
    """
    user_id = str(current_user.id)
    # `last_pulled_at` is the server_timestamp from the preceding pull.
    # Using it as created_at for newly pushed records ensures created_at <= last_pulled_at
    # on the next pull, so those records never re-appear in the `created` bucket.
    push_created_at = (
        datetime.fromtimestamp(last_pulled_at / 1000, tz=UTC)
        if last_pulled_at > 0
        else datetime.now(UTC)
    )
    changes = body.get("changes", {})

    # ── Security pre-validation ───────────────────────────────────────────────
    # Scan every record that carries a direct user_id field. 403 the ENTIRE
    # push if any record targets a different user (could be an injection attempt).
    _user_id_tables = [
        "transactions",
        "category_groups",
        "categories",
        "budget_months",
        "recurring_rules",
    ]
    for _table in _user_id_tables:
        _tbl_changes = changes.get(_table, {})
        for _rec in _tbl_changes.get("created", []) + _tbl_changes.get("updated", []):
            _rec_uid = _rec.get("user_id")
            if _rec_uid is not None and _rec_uid != user_id:
                logger.warning(
                    "Sync push 403: record %s in %s belongs to user %s (expected %s)",
                    _rec.get("id"),
                    _table,
                    _rec_uid,
                    user_id,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"Forbidden: record {_rec.get('id')!r} in {_table!r} "
                        "belongs to a different user."
                    ),
                )

    # ── Side-effect tracking ──────────────────────────────────────────────────
    new_tx_ids: list[str] = []  # all created transaction ids
    new_uncategorised_tx_ids: list[str] = []  # subset with category_id == None
    updated_tx_ids: list[str] = []  # all updated transaction ids
    has_budget_changes = False
    has_category_changes = False

    # ── category_groups ───────────────────────────────────────────────────────
    cg_changes = changes.get("category_groups", {})
    for record in cg_changes.get("created", []) + cg_changes.get("updated", []):
        existing = db.query(CategoryGroup).filter(CategoryGroup.id == record["id"]).first()
        if existing:
            if existing.user_id != user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            existing.name = record.get("name", existing.name)
            existing.sort_order = int(record.get("sort_order", existing.sort_order))
            existing.is_hidden = bool(record.get("is_hidden", existing.is_hidden))
            existing.updated_at = datetime.now(UTC)
        else:
            db.add(
                CategoryGroup(
                    id=record["id"],
                    user_id=user_id,
                    name=record["name"],
                    sort_order=int(record.get("sort_order", 0)),
                    is_hidden=bool(record.get("is_hidden", False)),
                    created_at=push_created_at,
                )
            )
        has_category_changes = True

    for record_id in cg_changes.get("deleted", []):
        row = (
            db.query(CategoryGroup)
            .filter(CategoryGroup.id == record_id, CategoryGroup.user_id == user_id)
            .first()
        )
        if row:
            db.delete(row)
            has_category_changes = True

    # ── categories ────────────────────────────────────────────────────────────
    cat_changes = changes.get("categories", {})
    for record in cat_changes.get("created", []) + cat_changes.get("updated", []):
        cat_existing = db.query(Category).filter(Category.id == record["id"]).first()
        if cat_existing:
            if cat_existing.user_id != user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            cat_existing.name = record.get("name", cat_existing.name)
            cat_existing.group_id = record.get("group_id", cat_existing.group_id)
            cat_existing.sort_order = int(record.get("sort_order", cat_existing.sort_order))
            cat_existing.is_hidden = bool(record.get("is_hidden", cat_existing.is_hidden))
            cat_existing.updated_at = datetime.now(UTC)
        else:
            db.add(
                Category(
                    id=record["id"],
                    user_id=user_id,
                    group_id=record["group_id"],
                    name=record["name"],
                    sort_order=int(record.get("sort_order", 0)),
                    is_hidden=bool(record.get("is_hidden", False)),
                    created_at=push_created_at,
                )
            )
        has_category_changes = True

    for record_id in cat_changes.get("deleted", []):
        cat_row = (
            db.query(Category).filter(Category.id == record_id, Category.user_id == user_id).first()
        )
        if cat_row:
            db.delete(cat_row)
            has_category_changes = True

    # ── budget_months ─────────────────────────────────────────────────────────
    bm_changes = changes.get("budget_months", {})
    for record in bm_changes.get("created", []) + bm_changes.get("updated", []):
        # Look up by client-supplied ID first (idempotency on duplicate push).
        bm_existing = db.query(BudgetMonth).filter(BudgetMonth.id == record["id"]).first()
        if bm_existing:
            if bm_existing.user_id != user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            bm_existing.assigned = int(record.get("assigned", bm_existing.assigned))
            bm_existing.updated_at = datetime.now(UTC)
        else:
            # A server-generated row may already exist for the same
            # (user, category, month) with a different UUID.  Update it so the
            # server's canonical ID is preserved; the client reconciles on the
            # next pull.
            conflict = (
                db.query(BudgetMonth)
                .filter(
                    BudgetMonth.user_id == user_id,
                    BudgetMonth.category_id == record["category_id"],
                    BudgetMonth.month == str_to_month_date(str(record["month"])),
                )
                .first()
            )
            if conflict:
                conflict.assigned = int(record.get("assigned", conflict.assigned))
                conflict.updated_at = datetime.now(UTC)
            else:
                db.add(
                    BudgetMonth(
                        id=record["id"],
                        user_id=user_id,
                        category_id=record["category_id"],
                        month=str_to_month_date(str(record["month"])),
                        assigned=int(record.get("assigned", 0)),
                        activity=0,  # activity is server-owned; never trust client
                        created_at=push_created_at,
                    )
                )
        has_budget_changes = True

    for record_id in bm_changes.get("deleted", []):
        bm_row = (
            db.query(BudgetMonth)
            .filter(BudgetMonth.id == record_id, BudgetMonth.user_id == user_id)
            .first()
        )
        if bm_row:
            db.delete(bm_row)
            has_budget_changes = True

    # ── category_targets ──────────────────────────────────────────────────────
    # Ownership is through the category (targets have no direct user_id column).
    # The DB has UNIQUE(category_id) — upsert by category_id, not by the
    # client-supplied id, to prevent duplicate-key violations when the client
    # sends a new target UUID for a category that already has one server-side.
    ct_changes = changes.get("category_targets", {})
    for record in ct_changes.get("created", []) + ct_changes.get("updated", []):
        # Verify the referenced category belongs to current user.
        owning_category = (
            db.query(Category)
            .filter(
                Category.id == record["category_id"],
                Category.user_id == user_id,
            )
            .first()
        )
        if owning_category is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Forbidden: category {record.get('category_id')!r} not found for this user."
                ),
            )

        target_date_val = None
        if record.get("target_date"):
            from datetime import date as _date

            try:
                target_date_val = _date.fromisoformat(record["target_date"])
            except (ValueError, TypeError):
                target_date_val = None

        # Look up existing target by category_id (the unique key), not by the
        # client-supplied primary key, to avoid creating duplicates.
        ct_existing = (
            db.query(CategoryTarget)
            .filter(CategoryTarget.category_id == record["category_id"])
            .first()
        )
        if ct_existing:
            ct_existing.frequency = record.get("frequency", ct_existing.frequency)
            ct_existing.behavior = record.get("behavior", ct_existing.behavior)
            ct_existing.target_amount = int(record.get("target_amount", ct_existing.target_amount))
            ct_existing.day_of_week = record.get("day_of_week", ct_existing.day_of_week)
            ct_existing.day_of_month = record.get("day_of_month", ct_existing.day_of_month)
            if "target_date" in record:
                ct_existing.target_date = target_date_val
            ct_existing.repeats = bool(record.get("repeats", ct_existing.repeats))
            ct_existing.updated_at = datetime.now(UTC)
        else:
            db.add(
                CategoryTarget(
                    id=record["id"],
                    category_id=record["category_id"],
                    frequency=record["frequency"],
                    behavior=record.get("behavior", "set_aside"),
                    target_amount=int(record["target_amount"]),
                    day_of_week=record.get("day_of_week"),
                    day_of_month=record.get("day_of_month"),
                    target_date=target_date_val,
                    repeats=bool(record.get("repeats", False)),
                    created_at=push_created_at,
                )
            )
        has_category_changes = True

    for record_id in ct_changes.get("deleted", []):
        ct_row = (
            db.query(CategoryTarget)
            .filter(CategoryTarget.id == record_id)
            .join(CategoryTarget.category)
            .filter(Category.user_id == user_id)
            .first()
        )
        if ct_row:
            db.delete(ct_row)
            has_category_changes = True

    # ── recurring_rules ───────────────────────────────────────────────────────
    rr_changes = changes.get("recurring_rules", {})
    for record in rr_changes.get("created", []) + rr_changes.get("updated", []):
        from datetime import date as _date

        next_due_val = None
        if record.get("next_due"):
            try:
                next_due_val = _date.fromisoformat(record["next_due"])
            except (ValueError, TypeError):
                next_due_val = None

        ends_on_val = None
        if record.get("ends_on"):
            try:
                ends_on_val = _date.fromisoformat(record["ends_on"])
            except (ValueError, TypeError):
                ends_on_val = None

        rr_existing = db.query(RecurringRule).filter(RecurringRule.id == record["id"]).first()
        if rr_existing:
            if rr_existing.user_id != user_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            rr_existing.frequency = record.get("frequency", rr_existing.frequency)
            rr_existing.interval = int(record.get("interval", rr_existing.interval))
            rr_existing.day_of_week = record.get("day_of_week", rr_existing.day_of_week)
            rr_existing.day_of_month = record.get("day_of_month", rr_existing.day_of_month)
            if next_due_val is not None:
                rr_existing.next_due = next_due_val
            if "ends_on" in record:
                rr_existing.ends_on = ends_on_val
            rr_existing.is_active = bool(record.get("is_active", rr_existing.is_active))
            if "template" in record:
                _tmpl = record["template"]
                if isinstance(_tmpl, str):
                    _tmpl = _tmpl.strip()
                    rr_existing.template = json.loads(_tmpl) if _tmpl else rr_existing.template
                else:
                    rr_existing.template = _tmpl
            rr_existing.updated_at = datetime.now(UTC)
        else:
            if next_due_val is None:
                logger.warning(
                    "Skipping recurring_rule %s: missing or invalid next_due",
                    record.get("id"),
                )
                continue
            db.add(
                RecurringRule(
                    id=record["id"],
                    user_id=user_id,
                    frequency=record["frequency"],
                    interval=int(record.get("interval", 1)),
                    day_of_week=record.get("day_of_week"),
                    day_of_month=record.get("day_of_month"),
                    next_due=next_due_val,
                    ends_on=ends_on_val,
                    is_active=bool(record.get("is_active", True)),
                    template=json.loads(_t)
                    if isinstance(_t := record.get("template", {}), str)
                    else _t,
                    created_at=push_created_at,
                )
            )

    for record_id in rr_changes.get("deleted", []):
        rr_row = (
            db.query(RecurringRule)
            .filter(RecurringRule.id == record_id, RecurringRule.user_id == user_id)
            .first()
        )
        if rr_row:
            db.delete(rr_row)

    # ── transactions ──────────────────────────────────────────────────────────
    tx_changes = changes.get("transactions", {})

    from app.services.categorization import clean_narration

    for record in tx_changes.get("created", []):
        tx_existing = db.query(Transaction).filter(Transaction.id == record["id"]).first()
        if tx_existing:
            continue  # idempotent duplicate push

        tx_date = datetime.fromtimestamp(record["date"] / 1000, tz=UTC)
        push_narration = record.get("narration", "Manual")
        new_tx = Transaction(
            id=record["id"],
            user_id=user_id,
            account_id=record["account_id"],
            date=tx_date,
            amount=int(record["amount"]),
            narration=push_narration,
            cleaned_narration=clean_narration(push_narration),
            type=record.get("type", "debit"),
            category_id=record.get("category_id"),
            memo=record.get("memo"),
            is_split=bool(record.get("is_split", False)),
            source=TransactionSource(record.get("source", "manual")),
            recurrence_id=record.get("recurrence_id"),
            created_at=push_created_at,
        )
        db.add(new_tx)

        if new_tx.category_id:
            month_str = tx_date.strftime("%Y-%m")
            bm = get_or_create_budget_month(db, user_id, str(new_tx.category_id), month_str)
            bm.activity += new_tx.amount
            has_budget_changes = True

        # Keep account.balance in sync.
        _create_acct = (
            db.query(BankAccount)
            .filter(
                BankAccount.id == record["account_id"],
                BankAccount.user_id == user_id,
            )
            .first()
        )
        if _create_acct:
            _create_acct.balance += new_tx.amount

        new_tx_ids.append(record["id"])
        if new_tx.category_id is None:
            new_uncategorised_tx_ids.append(record["id"])

    for record in tx_changes.get("updated", []):
        tx = (
            db.query(Transaction)
            .filter(Transaction.id == record["id"], Transaction.user_id == user_id)
            .first()
        )
        if tx is None:
            logger.warning(
                "Sync push: transaction %s not found for user %s — skipping",
                record.get("id"),
                user_id,
            )
            continue

        # All fields are editable — the user may correct bank-alert transactions.
        # Exception: statement-sourced transactions are immutable for financial
        # fields (amount, type, date, account, narration) because statement data
        # is more accurate than email parsing or manual entry.  Category, memo,
        # and is_split remain user-editable on all sources.
        is_statement = tx.source == TransactionSource.statement

        _old_amount = tx.amount
        _old_account_id = str(tx.account_id)

        if "type" in record and not is_statement:
            tx.type = record["type"]
        if "date" in record and not is_statement:
            tx.date = datetime.fromtimestamp(record["date"] / 1000, tz=UTC)
        if "account_id" in record and not is_statement:
            tx.account_id = record["account_id"]
        if "narration" in record and not is_statement:
            tx.narration = record["narration"]
        if "amount" in record and not is_statement:
            tx.amount = int(record["amount"])

        # Adjust account balance(s).
        _new_amount = tx.amount
        _new_account_id = str(tx.account_id)
        if _old_account_id != _new_account_id:
            _old_upd_acct = (
                db.query(BankAccount)
                .filter(BankAccount.id == _old_account_id, BankAccount.user_id == user_id)
                .first()
            )
            if _old_upd_acct:
                _old_upd_acct.balance -= _old_amount
            _new_upd_acct = (
                db.query(BankAccount)
                .filter(BankAccount.id == _new_account_id, BankAccount.user_id == user_id)
                .first()
            )
            if _new_upd_acct:
                _new_upd_acct.balance += _new_amount
        elif _new_amount != _old_amount:
            _upd_acct = (
                db.query(BankAccount)
                .filter(BankAccount.id == _old_account_id, BankAccount.user_id == user_id)
                .first()
            )
            if _upd_acct:
                _upd_acct.balance += _new_amount - _old_amount

        # Rebalance budget_months.activity when the category changes.
        old_category_id = str(tx.category_id) if tx.category_id else None
        new_category_id = record.get("category_id", old_category_id)

        # Guard: debit transactions cannot be un-categorised once assigned.
        if (
            "category_id" in record
            and new_category_id is None
            and old_category_id is not None
            and tx.type == "debit"
        ):
            logger.warning(
                "Sync push: ignoring category_id=null on categorised debit %s — "
                "debit transactions cannot be un-categorised",
                tx.id,
            )
            new_category_id = old_category_id

        if "category_id" in record:
            tx.category_id = new_category_id

        if "memo" in record:
            tx.memo = record["memo"]

        if "recurrence_id" in record:
            tx.recurrence_id = record["recurrence_id"]

        if old_category_id != new_category_id:
            tx_month = tx.date.strftime("%Y-%m")
            if old_category_id:
                old_bm = get_or_create_budget_month(db, user_id, old_category_id, tx_month)
                old_bm.activity -= tx.amount
            if new_category_id:
                new_bm = get_or_create_budget_month(db, user_id, new_category_id, tx_month)
                new_bm.activity += tx.amount
            has_budget_changes = True

        tx.updated_at = datetime.now(UTC)
        updated_tx_ids.append(str(tx.id))

    for record_id in tx_changes.get("deleted", []):
        tx = (
            db.query(Transaction)
            .filter(Transaction.id == record_id, Transaction.user_id == user_id)
            .first()
        )
        if tx is None:
            continue  # already gone — idempotent

        # Reverse budget activity before deleting the transaction row.
        if tx.category_id:
            tx_month = tx.date.strftime("%Y-%m")
            bm = get_or_create_budget_month(db, user_id, str(tx.category_id), tx_month)
            bm.activity -= tx.amount
            has_budget_changes = True

        # Reverse account balance.
        _del_acct = (
            db.query(BankAccount)
            .filter(BankAccount.id == tx.account_id, BankAccount.user_id == user_id)
            .first()
        )
        if _del_acct:
            _del_acct.balance -= tx.amount

        db.delete(tx)

    # ── Commit ────────────────────────────────────────────────────────────────
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Sync push commit failed for user=%s", user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    # ── Post-push side effects ────────────────────────────────────────────────
    # Fire after commit so the new rows are visible to Celery workers.

    # 1. Categorise new transactions that have no category yet.
    if new_uncategorised_tx_ids:
        from typing import cast

        from app.worker.celery_app import CeleryTask
        from app.worker.celery_app import celery_app as _celery

        cast(
            CeleryTask,
            _celery.signature("app.worker.tasks.categorize_transactions"),
        ).delay(new_uncategorised_tx_ids)

    # 2. Evaluate nudges for all created/updated transactions that already
    #    have a category (categorize_transactions handles the others internally).
    needs_nudge_eval = [
        tid for tid in new_tx_ids if tid not in new_uncategorised_tx_ids
    ] + updated_tx_ids
    if needs_nudge_eval:
        from typing import cast

        from app.worker.celery_app import CeleryTask
        from app.worker.celery_app import celery_app as _celery

        cast(
            CeleryTask,
            _celery.signature("app.worker.tasks.evaluate_nudges_for_transactions"),
        ).delay(needs_nudge_eval)

    # 3. Emit WebSocket invalidate event to the user's active connections.
    invalidate_keys: list[str] = []
    if new_tx_ids or updated_tx_ids or tx_changes.get("deleted"):
        invalidate_keys.append("transactions")
        # Account balances change whenever manual transactions are created,
        # updated or deleted — invalidate so the client refreshes balances
        # and net worth immediately after sync completes.
        invalidate_keys.append("accounts")
    if has_budget_changes:
        invalidate_keys.append("budget")
    if has_category_changes:
        invalidate_keys.append("categories")

    if invalidate_keys:
        notify_user(user_id, invalidate_keys)

    return {}
