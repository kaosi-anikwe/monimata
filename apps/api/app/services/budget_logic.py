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
Budget business logic — TBB calculation, carry-forward, required_this_month,
and default category seeding.

All money values are in kobo.
"""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from math import ceil

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.budget import BudgetMonth
from app.models.category import Category, CategoryGroup
from app.models.transaction import Transaction
from app.models.user import User

logger = logging.getLogger(__name__)

# ── Month helpers ─────────────────────────────────────────────────────────────


def month_date_range(month: str) -> tuple[datetime, datetime]:
    """Return (start_of_month, start_of_next_month) as UTC-aware datetimes."""
    dt = datetime.strptime(month, "%Y-%m")
    first = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=UTC)
    _, last_day = monthrange(first.year, first.month)
    next_first = first.replace(day=last_day) + timedelta(days=1)
    return first, next_first


def prev_month_str(month: str) -> str:
    """Return the "YYYY-MM" string for the month before the given one."""
    dt = datetime.strptime(month, "%Y-%m")
    first = dt.date().replace(day=1)
    prev_last = first - timedelta(days=1)
    return prev_last.strftime("%Y-%m")


def str_to_month_date(month: str) -> date:
    """Convert 'YYYY-MM' to a date object normalised to the 1st of the month."""
    y, m = int(month[:4]), int(month[5:7])
    return date(y, m, 1)


# ── Core budget computations ──────────────────────────────────────────────────


def _null_category_income_in_month(db: Session, user_id: str, month: str) -> int:
    """Sum of credit transactions with category_id IS NULL — the raw TBB inflow pool.

    Type A income (salary, dividends, side hustles) arrives with category_id=None
    and feeds TBB directly.  Type B inflows (refunds, reimbursements) are already
    categorised and bypass TBB entirely.
    """
    start, end = month_date_range(month)
    result = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "credit",
            Transaction.category_id.is_(None),
            Transaction.date >= start,
            Transaction.date < end,
        )
        .scalar()
    )
    return int(result or 0)


def _assigned_in_month(db: Session, user_id: str, month: str) -> int:
    """Sum of all budget_months.assigned for a user in a month."""
    result = (
        db.query(func.coalesce(func.sum(BudgetMonth.assigned), 0))
        .filter(
            BudgetMonth.user_id == user_id,
            BudgetMonth.month == str_to_month_date(month),
        )
        .scalar()
    )
    return int(result or 0)


def compute_tbb(db: Session, user_id: str, month: str, _depth: int = 0) -> int:
    """
    Compute To Be Budgeted for a given month.

    TBB(M) = null_category_income(M) - assigned(M) + max(0, TBB(M-1))

    Only credits with category_id IS NULL feed the TBB pool (Type A income:
    salary, dividends, etc.).  Categorised credits (Type B: refunds,
    reimbursements) flow straight into their category's activity and never
    inflate TBB.

    Recursion stops at MAX_DEPTH months back, or at the first month with no
    data (income == 0 and assigned == 0 at depth > 0).
    """
    MAX_DEPTH = 12
    if _depth >= MAX_DEPTH:
        return 0

    income = _null_category_income_in_month(db, user_id, month)
    assigned = _assigned_in_month(db, user_id, month)

    # Short-circuit: if there's no data at all for this month AND we've gone back
    # at least one step, stop the recursion to avoid querying forever.
    if _depth > 0 and income == 0 and assigned == 0:
        return 0

    prev = prev_month_str(month)
    prev_tbb = compute_tbb(db, user_id, prev, _depth + 1)

    return income - assigned + max(0, prev_tbb)


def compute_available(db: Session, user_id: str, category_id: str, month: str) -> int:
    """
    Available = assigned - activity, with carry-forward from previous month.

    Carry-forward: the previous month's available (if positive) rolls into
    the current month's starting available.

    available(M) = assigned(M) - activity(M) + max(0, available(M-1))
    """
    bm = (
        db.query(BudgetMonth)
        .filter(
            BudgetMonth.user_id == user_id,
            BudgetMonth.category_id == category_id,
            BudgetMonth.month == str_to_month_date(month),
        )
        .first()
    )
    if bm is None:
        return 0
    return bm.available


def ensure_budget_month_initialized(db: Session, user_id: str, month: str) -> None:
    """Lazily initialize BudgetMonth snapshot rows for the given month.

    If any row already exists for (user_id, month) this is a no-op (cache hit).
    Otherwise the previous month's rows are read and a new row is stamped for
    each category with::

        carried_over = max(0, prev.available)

    Negative closing balances are clamped to zero per the ZBB liquid-cash rule
    (spec §8.2).  Brand-new categories with no prior history are not touched
    here; they are created on-demand with carried_over=0 by
    get_or_create_budget_month().

    Uses db.flush() — the caller controls transaction commit boundaries.
    """
    target_date = str_to_month_date(month)

    # Cache hit: at least one snapshot row exists for this month
    exists = (
        db.query(BudgetMonth)
        .filter(
            BudgetMonth.user_id == user_id,
            BudgetMonth.month == target_date,
        )
        .first()
    )
    if exists:
        return

    # Load previous month's closing snapshots
    prev_date = (target_date - timedelta(days=1)).replace(day=1)
    prev_snapshots = (
        db.query(BudgetMonth)
        .filter(
            BudgetMonth.user_id == user_id,
            BudgetMonth.month == prev_date,
        )
        .all()
    )

    for prev in prev_snapshots:
        carried = max(0, prev.available)  # clamp: never roll over a deficit
        db.add(
            BudgetMonth(
                user_id=user_id,
                category_id=prev.category_id,
                month=target_date,
                assigned=0,
                activity=0,
                carried_over=carried,
            )
        )

    if prev_snapshots:
        db.flush()


def get_or_create_budget_month(
    db: Session, user_id: str, category_id: str, month: str
) -> BudgetMonth:
    """Ensure the month is initialized, then fetch or create this category's row."""
    ensure_budget_month_initialized(db, user_id, month)
    month_date = str_to_month_date(month)
    bm = (
        db.query(BudgetMonth)
        .filter(
            BudgetMonth.user_id == user_id,
            BudgetMonth.category_id == category_id,
            BudgetMonth.month == month_date,
        )
        .first()
    )
    if bm is None:
        # Brand-new category with no prior-month history — start fresh
        bm = BudgetMonth(
            user_id=user_id,
            category_id=category_id,
            month=month_date,
            assigned=0,
            activity=0,
            carried_over=0,
        )
        db.add(bm)
        db.flush()  # populate .id without committing
    return bm


# ── required_this_month ───────────────────────────────────────────────────────


def required_this_month(target, bm: BudgetMonth | None, today: date) -> int | None:
    """
    Return the kobo amount that should be assigned this month to meet the target.
    Returns None if the target is unknown or inapplicable.

    Implements three behavior models (spec §7.1):
      set_aside — fund fresh each period, ignoring carried-over rollover
                  underfunded = max(0, amount - assigned_t)
      refill    — top up counting both carry-forward and current assignment
                  underfunded = max(0, amount - carried_over_t - assigned_t)
      balance   — maintain live available balance at or above target
                  underfunded = max(0, amount - available_t)

    For weekly frequency the target_amount is first scaled by the exact number
    of occurrences of target.day_of_week in the active month (spec §7.2).
    For yearly/custom sinking funds, the behavior-aware underfunded amount is
    spread evenly over the months remaining until target_date.
    """
    if target is None:
        return None

    freq: str = target.frequency
    behavior: str = target.behavior
    amount: int = target.target_amount

    # Decompose the BudgetMonth into the three values the formulas need
    assigned_t: int = bm.assigned if bm is not None else 0
    carried_over_t: int = bm.carried_over if bm is not None else 0
    available_t: int = bm.available if bm is not None else 0

    def _needed(scaled_amount: int) -> int:
        """Behavior-aware underfunded amount for a given (possibly scaled) target."""
        if behavior == "set_aside":
            return max(0, scaled_amount - assigned_t)
        if behavior == "refill":
            return max(0, scaled_amount - carried_over_t - assigned_t)
        # balance
        return max(0, scaled_amount - available_t)

    if freq == "monthly":
        return _needed(amount)

    if freq == "weekly":
        # Scale target_amount by the exact number of occurrences of day_of_week
        # in the active month (spec §7.2).
        dow: int = target.day_of_week if target.day_of_week is not None else today.weekday()
        _, days_in_month = monthrange(today.year, today.month)
        count = sum(
            1
            for d in range(1, days_in_month + 1)
            if date(today.year, today.month, d).weekday() == dow
        )
        return _needed(amount * count)

    if freq in ("yearly", "custom"):
        total_needed = _needed(amount)
        if total_needed <= 0:
            return 0

        if behavior == "balance":
            # Live cushion — no sinking-fund spread; just top up now
            return total_needed

        # set_aside / refill: sinking fund spread over remaining months
        target_dt = target.target_date
        if not target_dt:
            if freq == "custom":
                return None  # no date → spread is undefined
            target_dt = date(today.year, 12, 31)  # yearly fallback: end of year

        if target_dt <= today:
            return total_needed  # past due — assign the full shortfall now

        months_left = (target_dt.year - today.year) * 12 + (target_dt.month - today.month) + 1
        return ceil(total_needed / max(1, months_left))

    return None


# ── Default category seeding ──────────────────────────────────────────────────

# Standard category groups and categories seeded for every new user.
# Keep category names concise and recognizable for Nigerians.
DEFAULT_CATEGORIES: list[tuple[str, list[str]]] = [
    (
        "Monthly Bills",
        ["Rent / Housing", "Electricity", "Internet", "Water", "Insurance"],
    ),
    (
        "Everyday Expenses",
        ["Food & Groceries", "Transport", "Airtime & Data", "Fuel"],
    ),
    (
        "Financial Goals",
        ["Savings", "Emergency Fund", "Investments", "Loan Repayment"],
    ),
    (
        "Personal",
        ["Health & Pharmacy", "Clothing", "Entertainment", "Subscriptions", "Shopping"],
    ),
    (
        "Family & Giving",
        ["School Fees", "Family Support", "Giving / Offerings"],
    ),
    (
        "Irregular Expenses",
        ["Car Maintenance", "Home Repairs", "Travel", "Taxes"],
    ),
]


def seed_default_categories(db: Session, user: User) -> None:
    """
    Create the standard category groups and categories for a new user.
    Called synchronously inside the registration transaction.
    """
    for group_order, (group_name, cat_names) in enumerate(DEFAULT_CATEGORIES):
        group = CategoryGroup(
            user_id=str(user.id),
            name=group_name,
            sort_order=group_order,
        )
        db.add(group)
        db.flush()  # get group.id

        for cat_order, cat_name in enumerate(cat_names):
            db.add(
                Category(
                    user_id=str(user.id),
                    group_id=str(group.id),
                    name=cat_name,
                    sort_order=cat_order,
                )
            )

    logger.info("Seeded default categories for user %s", user.id)
