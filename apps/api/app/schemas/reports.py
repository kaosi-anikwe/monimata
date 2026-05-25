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

"""Pydantic schemas for the reports endpoints."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel

# ── Enums ────────────────────────────────────────────────────────────────


class Granularity(StrEnum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


# ── Monthly Summary ─────────────────────────────────────────────────────


class TopCategorySpend(BaseModel):
    category_id: UUID
    category_name: str
    group_name: str
    total_spent: int  # kobo, positive
    percentage: float  # 0–100


class MonthComparison(BaseModel):
    income_change_pct: float | None  # None if no prior month data
    expense_change_pct: float | None
    savings_change_pct: float | None


class MonthlySummaryResponse(BaseModel):
    month: str  # "YYYY-MM"
    total_income: int  # kobo
    total_expenses: int  # kobo, positive
    net_savings: int  # kobo (income - expenses)
    savings_rate: float  # 0–100; 0 when no income
    credit_count: int
    debit_count: int
    avg_daily_expense: int  # kobo
    top_categories: list[TopCategorySpend]
    comparison: MonthComparison


# ── Income vs Expense Trend ─────────────────────────────────────────────


class IncomeExpensePoint(BaseModel):
    month: str  # "YYYY-MM"
    income: int  # kobo
    expenses: int  # kobo, positive
    net: int  # kobo


class IncomeExpenseTrendResponse(BaseModel):
    points: list[IncomeExpensePoint]


# ── Spending by Category ────────────────────────────────────────────────


class CategorySpend(BaseModel):
    category_id: UUID
    category_name: str
    group_id: UUID
    group_name: str
    total_spent: int  # kobo, positive
    percentage: float  # 0–100
    transaction_count: int
    avg_transaction: int  # kobo


class SpendingByCategoryResponse(BaseModel):
    month: str  # "YYYY-MM"
    total_spent: int  # kobo
    categories: list[CategorySpend]


# ── Category Trend ──────────────────────────────────────────────────────


class CategoryTrendPoint(BaseModel):
    month: str  # "YYYY-MM"
    spent: int  # kobo, positive
    transaction_count: int


class CategoryTrendResponse(BaseModel):
    category_id: UUID
    category_name: str
    points: list[CategoryTrendPoint]


# ── Top Merchants ───────────────────────────────────────────────────────


class MerchantSpend(BaseModel):
    narration: str  # cleaned narration
    total_spent: int  # kobo, positive
    transaction_count: int
    avg_transaction: int  # kobo
    category_name: str | None
    last_date: datetime


class TopMerchantsResponse(BaseModel):
    month: str  # "YYYY-MM"
    merchants: list[MerchantSpend]


# ── Budget Performance ──────────────────────────────────────────────────


class BudgetCategoryPerformance(BaseModel):
    category_id: UUID
    category_name: str
    group_name: str
    assigned: int  # kobo
    spent: int  # kobo, positive (abs of activity)
    available: int  # kobo
    utilization_pct: float  # 0–100+; 0 when nothing assigned


class BudgetPerformanceResponse(BaseModel):
    month: str  # "YYYY-MM"
    total_assigned: int  # kobo
    total_spent: int  # kobo
    total_available: int  # kobo
    overall_utilization_pct: float
    categories: list[BudgetCategoryPerformance]


# ── Cash Flow ───────────────────────────────────────────────────────────


class CashFlowPoint(BaseModel):
    period: str  # "YYYY-MM-DD" for daily, "YYYY-Www" for weekly, "YYYY-MM" for monthly
    inflow: int  # kobo
    outflow: int  # kobo, positive
    net: int  # kobo


class CashFlowResponse(BaseModel):
    granularity: Granularity
    points: list[CashFlowPoint]


# ── Account Balances ────────────────────────────────────────────────────


class AccountBalance(BaseModel):
    account_id: str
    institution: str
    account_name: str
    alias: str | None
    account_type: str
    currency: str
    balance: int  # kobo


class AccountBalancesResponse(BaseModel):
    total_balance: int  # kobo (sum across all active accounts)
    accounts: list[AccountBalance]


# ── Recurring Commitments ───────────────────────────────────────────────


class RecurringCommitment(BaseModel):
    rule_id: str
    narration: str
    amount: int  # kobo
    type: str  # "debit" | "credit"
    frequency: str
    next_due: date
    category_name: str | None
    account_name: str | None


class RecurringCommitmentsResponse(BaseModel):
    total_monthly_outflow: int  # kobo — estimated monthly recurring debits
    total_monthly_inflow: int  # kobo — estimated monthly recurring credits
    active_count: int
    commitments: list[RecurringCommitment]


# ── Age of Money ────────────────────────────────────────────────────────


class AgeOfMoneyResponse(BaseModel):
    age_days: float  # estimated days old the money you spend is
    total_balance: int  # kobo — current total across active accounts
    avg_daily_expense: int  # kobo — average daily outflow over lookback
    lookback_days: int  # how many days the average is computed over
    trend: float | None  # change vs previous period (positive = improving)
