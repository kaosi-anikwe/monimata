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
SQLAlchemy event listeners: real-time BudgetMonth.activity synchronisation.

Import this module once at application startup (app/main.py) and once in the
Celery worker process (app/worker/tasks.py).  After import, listeners are
registered globally on the Transaction mapper and fire for every ORM-level
insert / update / delete regardless of which session owns the instance.

All SQL mutations use ``connection.execute()`` with Core expressions — safe to
call inside a Session.flush() without triggering re-entrant ORM operations.
The ``after_update`` listener also expires any matching BudgetMonth object in
the session identity map so subsequent ORM reads always see the fresh DB value.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import event, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import attributes, object_session

from app.models.budget import BudgetMonth
from app.models.transaction import Transaction
from app.services.budget_logic import str_to_month_date

# ── Internal helpers ──────────────────────────────────────────────────────────


def _upsert_budget_month_row(connection, user_id: str, category_id: str, month_str: str) -> None:
    """Ensure a BudgetMonth row exists for (user, category, month).

    Uses INSERT ON CONFLICT DO NOTHING so calling this multiple times is safe.
    The ``carried_over`` value is derived from the previous month's closing
    available balance via a subquery in the same statement, so the first row
    stamped for a new month correctly inherits the ZBB rollover.
    """
    month_date = str_to_month_date(month_str)
    prev_date = (month_date - timedelta(days=1)).replace(day=1)
    tbl = BudgetMonth.__table__

    prev_avail = (
        select(tbl.c.carried_over + tbl.c.assigned + tbl.c.activity)
        .where(
            tbl.c.user_id == user_id,
            tbl.c.category_id == category_id,
            tbl.c.month == prev_date,
        )
        .scalar_subquery()
    )

    connection.execute(
        pg_insert(tbl)  # type: ignore[arg-type]
        .values(
            id=str(uuid.uuid4()),
            user_id=user_id,
            category_id=category_id,
            month=month_date,
            assigned=0,
            activity=0,
            carried_over=func.greatest(0, func.coalesce(prev_avail, 0)),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(constraint="uq_budget_months_user_cat_month")
    )


def _delta_activity(
    connection,
    target: Transaction,
    user_id: str,
    category_id: str,
    month_str: str,
    delta: int,
) -> None:
    """Atomically add *delta* kobo to budget_months.activity.

    Also expires any matching BudgetMonth object in the session identity map
    so subsequent ORM reads (e.g. nudge engine) fetch the updated value from
    the DB rather than returning a stale cached result.
    """
    if delta == 0:
        return

    month_date = str_to_month_date(month_str)
    tbl = BudgetMonth.__table__
    connection.execute(
        tbl.update()  # type: ignore[attr-defined]
        .where(
            tbl.c.user_id == user_id,
            tbl.c.category_id == category_id,
            tbl.c.month == month_date,
        )
        .values(activity=tbl.c.activity + delta)
    )

    # Expire cached BudgetMonth objects so the next ORM read re-fetches from DB
    session = object_session(target)
    if session is not None:
        for obj in list(session.identity_map.values()):
            if (
                isinstance(obj, BudgetMonth)
                and obj.user_id == user_id
                and obj.category_id == category_id
                and obj.month == month_date
            ):
                session.expire(obj)
                break


# ── Event listeners ───────────────────────────────────────────────────────────


@event.listens_for(Transaction, "after_insert")
def _on_transaction_insert(mapper, connection, target: Transaction) -> None:
    """Credit or debit the BudgetMonth when a categorised transaction is inserted.

    Transactions inserted with ``category_id=None`` feed TBB dynamically and
    require no BudgetMonth row update.
    """
    if not target.category_id:
        return

    month_str = target.date.strftime("%Y-%m")
    _upsert_budget_month_row(connection, target.user_id, target.category_id, month_str)
    _delta_activity(
        connection, target, target.user_id, target.category_id, month_str, target.amount
    )


@event.listens_for(Transaction, "after_update")
def _on_transaction_update(mapper, connection, target: Transaction) -> None:
    """Rebalance BudgetMonth activity when a transaction's category or amount changes.

    Covers all re-categorisation paths: manual edits, the Tier 1-3 pipeline,
    and the LLM fallback task.
    """
    cat_hist = attributes.get_history(target, "category_id")
    amt_hist = attributes.get_history(target, "amount")

    cat_changed = bool(cat_hist.deleted)
    amt_changed = bool(amt_hist.deleted)
    if not cat_changed and not amt_changed:
        return  # No budget-relevant attributes changed

    old_cat: str | None = cat_hist.deleted[0] if cat_hist.deleted else target.category_id
    new_cat: str | None = cat_hist.added[0] if cat_hist.added else target.category_id
    old_amount: int = amt_hist.deleted[0] if amt_hist.deleted else target.amount
    new_amount: int = amt_hist.added[0] if amt_hist.added else target.amount

    month_str = target.date.strftime("%Y-%m")

    # Reverse the old category's contribution (skip if it was NULL / TBB)
    if old_cat:
        _delta_activity(connection, target, target.user_id, old_cat, month_str, -old_amount)

    # Apply the new category's contribution (skip if moving back to NULL / TBB)
    if new_cat:
        _upsert_budget_month_row(connection, target.user_id, new_cat, month_str)
        _delta_activity(connection, target, target.user_id, new_cat, month_str, new_amount)


@event.listens_for(Transaction, "after_delete")
def _on_transaction_delete(mapper, connection, target: Transaction) -> None:
    """Reverse a deleted transaction's contribution to BudgetMonth activity."""
    if not target.category_id:
        return

    month_str = target.date.strftime("%Y-%m")
    _delta_activity(
        connection, target, target.user_id, target.category_id, month_str, -target.amount
    )
