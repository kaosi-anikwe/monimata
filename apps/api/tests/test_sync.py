"""Tests for the sync router."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import (
    TEST_USER_ID,
    make_account,
    make_budget_month,
    make_category,
    make_group,
    make_transaction,
    make_user,
)


class TestSyncPull:
    def test_full_pull(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/sync/pull")
        assert resp.status_code == 200
        data = resp.json()
        assert "changes" in data
        assert "timestamp" in data
        changes = data["changes"]
        assert "transactions" in changes
        assert "categories" in changes
        assert "category_groups" in changes

    def test_pull_with_data(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        make_transaction(db, TEST_USER_ID, acct_id, category_id=cid)
        # Use a past month to avoid collision with auto-generated budget months
        make_budget_month(db, TEST_USER_ID, cid, "2026-04", assigned=10000)

        resp = client.get("/sync/pull")
        assert resp.status_code == 200
        data = resp.json()
        changes = data["changes"]
        assert len(changes["transactions"]["created"]) >= 1
        assert len(changes["categories"]["created"]) >= 1

    def test_since_filter(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/sync/pull?since=2026-05-01T00:00:00Z")
        assert resp.status_code == 200


class TestSyncPush:
    def test_push_no_changes(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post("/sync/push", json={})
        assert resp.status_code == 200
