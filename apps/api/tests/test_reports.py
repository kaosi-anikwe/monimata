"""Tests for the reports router."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import (
    TEST_USER_ID,
    make_account,
    make_category,
    make_group,
    make_transaction,
    make_user,
)


class TestMonthlySummary:
    def test_empty_month(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/monthly-summary?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["month"] == "2026-05"
        assert data["total_income"] == 0
        assert data["total_expenses"] == 0

    def test_with_transactions(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        make_transaction(
            db,
            TEST_USER_ID,
            acct_id,
            amount=100000,
            tx_type="credit",
            date=datetime(2026, 5, 15, tzinfo=UTC),
        )
        make_transaction(
            db,
            TEST_USER_ID,
            acct_id,
            amount=-30000,
            tx_type="debit",
            category_id=cid,
            date=datetime(2026, 5, 15, tzinfo=UTC),
        )
        resp = client.get("/reports/monthly-summary?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_income"] == 100000
        assert data["total_expenses"] == 30000


class TestIncomeExpenseTrend:
    def test_trend_range(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/income-expense-trend?months=3")
        assert resp.status_code == 200
        data = resp.json()
        assert "points" in data


class TestSpendingByCategory:
    def test_empty(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/spending-by-category?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["month"] == "2026-05"
        assert data["total_spent"] == 0
        assert data["categories"] == []


class TestCategoryTrend:
    def test_requires_category_id(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        resp = client.get(f"/reports/category-trend?category_id={cid}&months=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["category_id"] == cid


class TestTopMerchants:
    def test_empty(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/top-merchants?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["merchants"] == []


class TestBudgetPerformance:
    def test_empty(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/budget-performance?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["month"] == "2026-05"


class TestCashFlow:
    def test_cash_flow_monthly(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/cash-flow?start=2026-03&end=2026-05&granularity=monthly")
        assert resp.status_code == 200
        data = resp.json()
        assert data["granularity"] == "monthly"

    def test_cash_flow_daily(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/cash-flow?start=2026-05&end=2026-06&granularity=daily")
        assert resp.status_code == 200
        data = resp.json()
        assert data["granularity"] == "daily"


class TestAccountBalances:
    def test_empty(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/account-balances")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_balance"] == 0
        assert data["accounts"] == []

    def test_with_accounts(self, client: TestClient, db: Session):
        make_user(db)
        make_account(db, balance=50000, institution="GTBank")
        resp = client.get("/reports/account-balances")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_balance"] == 50000
        assert len(data["accounts"]) == 1


class TestAgeOfMoney:
    def test_age_of_money(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/reports/age-of-money")
        assert resp.status_code == 200
        data = resp.json()
        assert "age_days" in data
        assert "total_balance" in data
