"""Tests for the budget router."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import (
    TEST_USER_ID,
    make_budget_month,
    make_category,
    make_group,
    make_user,
)


class TestGetBudget:
    def test_empty_budget(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/budget?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["month"] == "2026-05"
        assert "tbb" in data
        assert data["groups"] == []

    def test_budget_with_categories(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db, name="Needs")
        cid = make_category(db, gid, name="Food")
        make_budget_month(db, TEST_USER_ID, cid, "2026-05", assigned=50000, activity=-20000)

        resp = client.get("/budget?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["groups"]) == 1
        cats = data["groups"][0]["categories"]
        assert len(cats) == 1
        assert cats[0]["name"] == "Food"
        assert cats[0]["assigned"] == 50000
        assert cats[0]["activity"] == -20000


class TestSetAssignment:
    def test_set_assignment(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid, name="Food")

        resp = client.patch(
            f"/budget/{cid}?month=2026-05",
            json={"assigned": 100000},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["assigned"] == 100000

    def test_negative_assignment_rejected(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        resp = client.patch(
            f"/budget/{cid}?month=2026-05",
            json={"assigned": -100},
        )
        assert resp.status_code == 422

    def test_nonexistent_category(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.patch(
            f"/budget/{uuid.uuid4()}?month=2026-05",
            json={"assigned": 100},
        )
        assert resp.status_code == 404


class TestMoveMoney:
    def test_move_money(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cat1 = make_category(db, gid, name="Food")
        cat2 = make_category(db, gid, name="Transport")
        make_budget_month(db, TEST_USER_ID, cat1, "2026-05", assigned=50000)

        resp = client.post(
            "/budget/move",
            json={
                "from_category_id": cat1,
                "to_category_id": cat2,
                "amount": 20000,
                "month": "2026-05",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["amount"] == 20000

    def test_same_category_rejected(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        resp = client.post(
            "/budget/move",
            json={
                "from_category_id": cid,
                "to_category_id": cid,
                "amount": 1000,
                "month": "2026-05",
            },
        )
        assert resp.status_code == 422

    def test_insufficient_funds_rejected(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cat1 = make_category(db, gid, name="Food")
        cat2 = make_category(db, gid, name="Transport")
        # cat1 has 0 available
        resp = client.post(
            "/budget/move",
            json={
                "from_category_id": cat1,
                "to_category_id": cat2,
                "amount": 50000,
                "month": "2026-05",
            },
        )
        assert resp.status_code == 422

    def test_nonexistent_category_rejected(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        resp = client.post(
            "/budget/move",
            json={
                "from_category_id": cid,
                "to_category_id": str(uuid.uuid4()),
                "amount": 1000,
                "month": "2026-05",
            },
        )
        assert resp.status_code == 404

    def test_zero_amount_rejected(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cat1 = make_category(db, gid, name="A")
        cat2 = make_category(db, gid, name="B")
        resp = client.post(
            "/budget/move",
            json={
                "from_category_id": cat1,
                "to_category_id": cat2,
                "amount": 0,
                "month": "2026-05",
            },
        )
        assert resp.status_code == 422


class TestGetTBB:
    def test_get_tbb(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/budget/tbb?month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert "tbb" in data
        assert data["month"] == "2026-05"


class TestListUnderfunded:
    def test_no_underfunded(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/budget/underfunded?month=2026-05")
        assert resp.status_code == 200
        assert resp.json() == []


class TestAutoAssign:
    def test_underfunded_strategy_no_tbb(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post("/budget/auto-assign?strategy=underfunded&month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["assignments_made"] == 0

    def test_assigned_last_month_strategy(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid, name="Food")
        make_budget_month(db, TEST_USER_ID, cid, "2026-04", assigned=30000)

        resp = client.post("/budget/auto-assign?strategy=assigned_last_month&month=2026-05")
        assert resp.status_code == 200
        data = resp.json()
        assert data["strategy"] == "assigned_last_month"
