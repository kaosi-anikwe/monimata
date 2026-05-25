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
Reports router — comprehensive financial analytics.

All amounts are returned in **kobo** (1 NGN = 100 kobo) to match the rest
of the API.  Expenses are always returned as positive numbers for display
convenience.
"""

from __future__ import annotations

import calendar
import logging
from datetime import date, datetime
from uuid import UUID

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, literal_column
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.models.bank_account import BankAccount
from app.models.budget import BudgetMonth
from app.models.category import Category, CategoryGroup
from app.models.recurring_rule import RecurringRule
from app.models.transaction import Transaction
from app.schemas.reports import (
    AccountBalance,
    AccountBalancesResponse,
    AgeOfMoneyResponse,
    BudgetCategoryPerformance,
    BudgetPerformanceResponse,
    CashFlowPoint,
    CashFlowResponse,
    CategorySpend,
    CategoryTrendPoint,
    CategoryTrendResponse,
    Granularity,
    IncomeExpensePoint,
    IncomeExpenseTrendResponse,
    MerchantSpend,
    MonthComparison,
    MonthlySummaryResponse,
    RecurringCommitment,
    RecurringCommitmentsResponse,
    SpendingByCategoryResponse,
    TopCategorySpend,
    TopMerchantsResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────


def _parse_month(month_str: str) -> date:
    """Parse 'YYYY-MM' into the first day of that month."""
    return datetime.strptime(month_str, "%Y-%m").date().replace(day=1)


def _month_range(month: date) -> tuple[datetime, datetime]:
    """Return (inclusive start, exclusive end) datetimes for a calendar month."""
    start = datetime(month.year, month.month, 1)
    _, last_day = calendar.monthrange(month.year, month.month)
    end = datetime(month.year, month.month, last_day, 23, 59, 59, 999999)
    return start, end


def _pct_change(current: int, previous: int) -> float | None:
    if previous == 0:
        return None
    return round((current - previous) / abs(previous) * 100, 1)


def _resolve_months(db: Session, user_id: str, months: int | None) -> int:
    """Return actual month count: use *months* if given, else span from earliest txn."""
    if months is not None:
        return months
    earliest = db.query(func.min(Transaction.date)).filter(Transaction.user_id == user_id).scalar()
    if earliest is None:
        return 1
    today = date.today()
    return (
        (today.year - earliest.year) * 12
        + (today.month - earliest.month)
        + 1  # include both endpoints
    )


def _income_expense_for_month(db: Session, user_id: str, month: date) -> tuple[int, int]:
    """Return (total_income, total_expenses) for a month. Expenses as positive."""
    start, end = _month_range(month)
    row = (
        db.query(
            func.coalesce(
                func.sum(case((Transaction.type == "credit", Transaction.amount))),
                0,
            ).label("income"),
            func.coalesce(
                func.sum(case((Transaction.type == "debit", func.abs(Transaction.amount)))),
                0,
            ).label("expenses"),
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .one()
    )
    return int(row.income), int(row.expenses)


# ── 1. Monthly Summary ──────────────────────────────────────────────────


@router.get("/monthly-summary", response_model=MonthlySummaryResponse)
def monthly_summary(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    top_n: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    High-level financial snapshot for a single month.

    Returns total income, expenses, net savings, savings rate,
    month-over-month comparison, and top spending categories.
    """
    m = _parse_month(month)
    start, end = _month_range(m)

    # Current month totals
    income, expenses = _income_expense_for_month(db, user.id, m)
    net = income - expenses
    savings_rate = round(net / income * 100, 1) if income > 0 else 0.0

    # Transaction counts
    counts = (
        db.query(
            func.count(case((Transaction.type == "credit", 1))).label("credits"),
            func.count(case((Transaction.type == "debit", 1))).label("debits"),
        )
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .one()
    )

    # Average daily expense
    _, last_day = calendar.monthrange(m.year, m.month)
    today = date.today()
    days_elapsed = min(last_day, (today - m).days + 1) if today >= m else last_day
    avg_daily = expenses // max(days_elapsed, 1)

    # Top spending categories
    top_cats_q = (
        db.query(
            Category.id,
            Category.name,
            CategoryGroup.name.label("group_name"),
            func.sum(func.abs(Transaction.amount)).label("total_spent"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .join(CategoryGroup, Category.group_id == CategoryGroup.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.type == "debit",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Category.id, Category.name, CategoryGroup.name)
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
        .limit(top_n)
        .all()
    )
    top_categories = [
        TopCategorySpend(
            category_id=r.id,
            category_name=r.name,
            group_name=r.group_name,
            total_spent=int(r.total_spent),
            percentage=round(int(r.total_spent) / expenses * 100, 1) if expenses else 0,
        )
        for r in top_cats_q
    ]

    # Month-over-month comparison
    prev_m = m - relativedelta(months=1)
    prev_income, prev_expenses = _income_expense_for_month(db, user.id, prev_m)
    prev_net = prev_income - prev_expenses
    comparison = MonthComparison(
        income_change_pct=_pct_change(income, prev_income),
        expense_change_pct=_pct_change(expenses, prev_expenses),
        savings_change_pct=_pct_change(net, prev_net),
    )

    return MonthlySummaryResponse(
        month=month,
        total_income=income,
        total_expenses=expenses,
        net_savings=net,
        savings_rate=savings_rate,
        credit_count=int(counts.credits),
        debit_count=int(counts.debits),
        avg_daily_expense=avg_daily,
        top_categories=top_categories,
        comparison=comparison,
    )


# ── 2. Income vs Expense Trend ──────────────────────────────────────────


@router.get("/income-expense-trend", response_model=IncomeExpenseTrendResponse)
def income_expense_trend(
    months: int | None = Query(
        None, ge=1, le=24, description="Months to look back; omit for all history"
    ),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Monthly income and expense totals for the last N months.
    Suitable for bar/line charts.  Omit *months* to retrieve full history.
    """
    resolved = _resolve_months(db, user.id, months)
    today = date.today()
    current = today.replace(day=1)
    points: list[IncomeExpensePoint] = []

    for i in range(resolved - 1, -1, -1):
        m = current - relativedelta(months=i)
        inc, exp = _income_expense_for_month(db, user.id, m)
        points.append(
            IncomeExpensePoint(
                month=m.strftime("%Y-%m"),
                income=inc,
                expenses=exp,
                net=inc - exp,
            )
        )

    return IncomeExpenseTrendResponse(points=points)


# ── 3. Spending by Category ─────────────────────────────────────────────


@router.get("/spending-by-category", response_model=SpendingByCategoryResponse)
def spending_by_category(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Full category-level spending breakdown for a month.
    Returns each category's total, percentage, count, and average.
    """
    m = _parse_month(month)
    start, end = _month_range(m)

    rows = (
        db.query(
            Category.id,
            Category.name,
            CategoryGroup.id.label("group_id"),
            CategoryGroup.name.label("group_name"),
            func.sum(func.abs(Transaction.amount)).label("total_spent"),
            func.count(Transaction.id).label("tx_count"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .join(CategoryGroup, Category.group_id == CategoryGroup.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.type == "debit",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Category.id, Category.name, CategoryGroup.id, CategoryGroup.name)
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
        .all()
    )

    total_spent = sum(int(r.total_spent) for r in rows)
    categories = [
        CategorySpend(
            category_id=r.id,
            category_name=r.name,
            group_id=r.group_id,
            group_name=r.group_name,
            total_spent=int(r.total_spent),
            percentage=round(int(r.total_spent) / total_spent * 100, 1) if total_spent else 0,
            transaction_count=int(r.tx_count),
            avg_transaction=int(r.total_spent) // int(r.tx_count) if r.tx_count else 0,
        )
        for r in rows
    ]

    return SpendingByCategoryResponse(
        month=month,
        total_spent=total_spent,
        categories=categories,
    )


# ── 4. Category Trend ───────────────────────────────────────────────────


@router.get("/category-trend", response_model=CategoryTrendResponse)
def category_trend(
    category_id: UUID = Query(...),
    months: int | None = Query(
        None, ge=1, le=24, description="Months to look back; omit for all history"
    ),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    A single category's spending over the last N months.
    Useful for sparklines or detailed category views.  Omit *months* for full history.
    """
    resolved = _resolve_months(db, user.id, months)
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == user.id).first()
    cat_name = cat.name if cat else "Unknown"

    today = date.today()
    current = today.replace(day=1)
    points: list[CategoryTrendPoint] = []

    for i in range(resolved - 1, -1, -1):
        m = current - relativedelta(months=i)
        start, end = _month_range(m)
        row = (
            db.query(
                func.coalesce(func.sum(func.abs(Transaction.amount)), 0).label("spent"),
                func.count(Transaction.id).label("tx_count"),
            )
            .filter(
                Transaction.user_id == user.id,
                Transaction.category_id == category_id,
                Transaction.type == "debit",
                Transaction.date >= start,
                Transaction.date <= end,
            )
            .one()
        )
        points.append(
            CategoryTrendPoint(
                month=m.strftime("%Y-%m"),
                spent=int(row.spent),
                transaction_count=int(row.tx_count),
            )
        )

    return CategoryTrendResponse(
        category_id=category_id,
        category_name=cat_name,
        points=points,
    )


# ── 5. Top Merchants ────────────────────────────────────────────────────


@router.get("/top-merchants", response_model=TopMerchantsResponse)
def top_merchants(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Top merchants by total spend in a month, grouped by cleaned narration.
    """
    m = _parse_month(month)
    start, end = _month_range(m)

    rows = (
        db.query(
            func.coalesce(Transaction.cleaned_narration, Transaction.narration).label("narration"),
            func.sum(func.abs(Transaction.amount)).label("total_spent"),
            func.count(Transaction.id).label("tx_count"),
            func.max(Transaction.date).label("last_date"),
            # Pick the most common category for this narration
            func.mode().within_group(Category.name).label("category_name"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.type == "debit",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(func.coalesce(Transaction.cleaned_narration, Transaction.narration))
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
        .limit(limit)
        .all()
    )

    merchants = [
        MerchantSpend(
            narration=r.narration or "",
            total_spent=int(r.total_spent),
            transaction_count=int(r.tx_count),
            avg_transaction=int(r.total_spent) // int(r.tx_count) if r.tx_count else 0,
            category_name=r.category_name,
            last_date=r.last_date,
        )
        for r in rows
    ]

    return TopMerchantsResponse(month=month, merchants=merchants)


# ── 6. Budget Performance ───────────────────────────────────────────────


@router.get("/budget-performance", response_model=BudgetPerformanceResponse)
def budget_performance(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Budget vs. actual spending for each budgeted category in a month.
    """
    m = _parse_month(month)

    rows = (
        db.query(
            BudgetMonth.category_id,
            Category.name.label("category_name"),
            CategoryGroup.name.label("group_name"),
            BudgetMonth.assigned,
            BudgetMonth.activity,
            BudgetMonth.carried_over,
        )
        .join(Category, BudgetMonth.category_id == Category.id)
        .join(CategoryGroup, Category.group_id == CategoryGroup.id)
        .filter(
            BudgetMonth.user_id == user.id,
            BudgetMonth.month == m,
        )
        .all()
    )

    categories: list[BudgetCategoryPerformance] = []
    total_assigned = 0
    total_spent = 0
    total_available = 0

    for r in rows:
        assigned = int(r.assigned)
        spent = abs(int(r.activity))  # activity is negative for spending
        available = int(r.carried_over) + assigned + int(r.activity)
        utilization = round(spent / assigned * 100, 1) if assigned > 0 else 0.0

        total_assigned += assigned
        total_spent += spent
        total_available += available

        categories.append(
            BudgetCategoryPerformance(
                category_id=r.category_id,
                category_name=r.category_name,
                group_name=r.group_name,
                assigned=assigned,
                spent=spent,
                available=available,
                utilization_pct=utilization,
            )
        )

    overall_util = round(total_spent / total_assigned * 100, 1) if total_assigned > 0 else 0.0

    return BudgetPerformanceResponse(
        month=month,
        total_assigned=total_assigned,
        total_spent=total_spent,
        total_available=total_available,
        overall_utilization_pct=overall_util,
        categories=categories,
    )


# ── 7. Cash Flow ────────────────────────────────────────────────────────


@router.get("/cash-flow", response_model=CashFlowResponse)
def cash_flow(
    start: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Start YYYY-MM"),
    end: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="End YYYY-MM"),
    granularity: Granularity = Query(Granularity.monthly),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Cash in/out/net over a date range at daily, weekly, or monthly granularity.
    """
    start_d = _parse_month(start)
    end_m = _parse_month(end)
    _, end_last = calendar.monthrange(end_m.year, end_m.month)
    end_d = datetime(end_m.year, end_m.month, end_last, 23, 59, 59, 999999)
    start_dt = datetime(start_d.year, start_d.month, 1)

    if granularity == Granularity.daily:
        trunc = func.date_trunc(literal_column("'day'"), Transaction.date)
        fmt = "%Y-%m-%d"
    elif granularity == Granularity.weekly:
        trunc = func.date_trunc(literal_column("'week'"), Transaction.date)
        fmt = None  # handled manually
    else:
        trunc = func.date_trunc(literal_column("'month'"), Transaction.date)
        fmt = "%Y-%m"

    rows = (
        db.query(
            trunc.label("period"),
            func.coalesce(
                func.sum(case((Transaction.type == "credit", Transaction.amount))),
                0,
            ).label("inflow"),
            func.coalesce(
                func.sum(case((Transaction.type == "debit", func.abs(Transaction.amount)))),
                0,
            ).label("outflow"),
        )
        .filter(
            Transaction.user_id == user.id,
            Transaction.date >= start_dt,
            Transaction.date <= end_d,
        )
        .group_by(trunc)
        .order_by(trunc)
        .all()
    )

    points: list[CashFlowPoint] = []
    for r in rows:
        if granularity == Granularity.weekly:
            period_label = r.period.strftime("%G-W%V")
        else:
            period_label = r.period.strftime(fmt)

        inflow = int(r.inflow)
        outflow = int(r.outflow)
        points.append(
            CashFlowPoint(
                period=period_label,
                inflow=inflow,
                outflow=outflow,
                net=inflow - outflow,
            )
        )

    return CashFlowResponse(granularity=granularity, points=points)


# ── 8. Account Balances ─────────────────────────────────────────────────


@router.get("/account-balances", response_model=AccountBalancesResponse)
def account_balances(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Current balances for all active accounts and total net worth.
    """
    accounts = (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == user.id,
            BankAccount.is_active.is_(True),
            BankAccount.deleted_at.is_(None),
        )
        .order_by(BankAccount.institution)
        .all()
    )

    acct_list = [
        AccountBalance(
            account_id=a.id,
            institution=a.institution,
            account_name=a.alias or a.account_name,
            alias=a.alias,
            account_type=a.account_type,
            currency=a.currency,
            balance=int(a.balance),
        )
        for a in accounts
    ]

    total = sum(a.balance for a in acct_list)

    return AccountBalancesResponse(total_balance=total, accounts=acct_list)


# ── 9. Recurring Commitments ────────────────────────────────────────────

_MONTHLY_MULTIPLIERS: dict[str, float] = {
    "daily": 30.0,
    "weekly": 4.33,
    "biweekly": 2.17,
    "monthly": 1.0,
    "yearly": 1 / 12,
}


@router.get("/recurring-commitments", response_model=RecurringCommitmentsResponse)
def recurring_commitments(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Active recurring rules with estimated monthly impact.
    """
    rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == user.id,
            RecurringRule.is_active.is_(True),
        )
        .order_by(RecurringRule.next_due)
        .all()
    )

    commitments: list[RecurringCommitment] = []
    total_monthly_out = 0
    total_monthly_in = 0

    for r in rules:
        tmpl = r.template or {}
        amount = abs(int(tmpl.get("amount", 0)))
        tx_type = tmpl.get("type", "debit")
        narration = tmpl.get("narration", "")

        # Resolve category name
        cat_name: str | None = None
        cat_id = tmpl.get("category_id")
        if cat_id:
            cat = db.query(Category.name).filter(Category.id == cat_id).first()
            cat_name = cat.name if cat else None

        # Resolve account name
        acct_name: str | None = None
        acct_id = tmpl.get("account_id")
        if acct_id:
            acct = (
                db.query(BankAccount.account_name, BankAccount.alias)
                .filter(BankAccount.id == acct_id)
                .first()
            )
            acct_name = (acct.alias or acct.account_name) if acct else None

        # Estimate monthly amount
        multiplier = _MONTHLY_MULTIPLIERS.get(r.frequency, 1.0)
        if r.frequency == "custom" and r.interval:
            multiplier = 30.0 / r.interval
        monthly_amount = int(amount * multiplier / (r.interval if r.frequency != "custom" else 1))

        if tx_type == "debit":
            total_monthly_out += monthly_amount
        else:
            total_monthly_in += monthly_amount

        commitments.append(
            RecurringCommitment(
                rule_id=r.id,
                narration=narration,
                amount=amount,
                type=tx_type,
                frequency=r.frequency,
                next_due=r.next_due,
                category_name=cat_name,
                account_name=acct_name,
            )
        )

    return RecurringCommitmentsResponse(
        total_monthly_outflow=total_monthly_out,
        total_monthly_inflow=total_monthly_in,
        active_count=len(commitments),
        commitments=commitments,
    )


# ── 10. Age of Money ────────────────────────────────────────────────────


def _total_expenses_in_range(
    db: Session, user_id: str, start_dt: datetime, end_dt: datetime
) -> int:
    """Total debit amount (positive) in a datetime range."""
    row = (
        db.query(
            func.coalesce(
                func.sum(func.abs(Transaction.amount)),
                0,
            )
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "debit",
            Transaction.date >= start_dt,
            Transaction.date <= end_dt,
        )
        .scalar()
    )
    return int(row)


@router.get("/age-of-money", response_model=AgeOfMoneyResponse)
def age_of_money(
    lookback_days: int = Query(30, ge=7, le=90, description="Days to average over"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Age of Money — estimates how many days old the money you spend today is.

    Calculated as: total cash balance ÷ average daily spending.
    A higher number means you're living on older money (more financial buffer).

    Also returns a trend comparing the current period against the prior
    equal-length period (positive = improving).
    """
    now = datetime.utcnow()

    # Current period
    period_start = now - relativedelta(days=lookback_days)
    total_expenses = _total_expenses_in_range(db, user.id, period_start, now)
    avg_daily = total_expenses // max(lookback_days, 1)

    # Total balance across active accounts
    total_balance = (
        db.query(func.coalesce(func.sum(BankAccount.balance), 0))
        .filter(
            BankAccount.user_id == user.id,
            BankAccount.is_active.is_(True),
            BankAccount.deleted_at.is_(None),
        )
        .scalar()
    )
    total_balance = int(total_balance)

    age_days = round(total_balance / avg_daily, 1) if avg_daily > 0 else 0.0

    # Trend: compare against prior period of the same length
    prev_end = period_start
    prev_start = prev_end - relativedelta(days=lookback_days)
    prev_expenses = _total_expenses_in_range(db, user.id, prev_start, prev_end)
    prev_avg_daily = prev_expenses // max(lookback_days, 1)
    prev_age = round(total_balance / prev_avg_daily, 1) if prev_avg_daily > 0 else None
    trend = round(age_days - prev_age, 1) if prev_age is not None else None

    return AgeOfMoneyResponse(
        age_days=age_days,
        total_balance=total_balance,
        avg_daily_expense=avg_daily,
        lookback_days=lookback_days,
        trend=trend,
    )
