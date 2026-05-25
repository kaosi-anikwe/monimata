"""Tests for unauthenticated access."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import make_user


class TestUnauthenticatedAccess:
    def test_accounts_requires_auth(self, unauth_client: TestClient, db: Session):
        make_user(db)
        resp = unauth_client.get("/accounts")
        assert resp.status_code == 401

    def test_transactions_requires_auth(self, unauth_client: TestClient, db: Session):
        make_user(db)
        resp = unauth_client.get("/transactions")
        assert resp.status_code == 401

    def test_budget_requires_auth(self, unauth_client: TestClient, db: Session):
        make_user(db)
        resp = unauth_client.get("/budget")
        assert resp.status_code == 401

    def test_categories_requires_auth(self, unauth_client: TestClient, db: Session):
        make_user(db)
        resp = unauth_client.get("/categories")
        assert resp.status_code == 401

    def test_nudges_requires_auth(self, unauth_client: TestClient, db: Session):
        make_user(db)
        resp = unauth_client.get("/nudges")
        assert resp.status_code == 401

    def test_reports_requires_auth(self, unauth_client: TestClient, db: Session):
        make_user(db)
        resp = unauth_client.get("/reports/monthly-summary?month=2026-05")
        assert resp.status_code == 401

    def test_health_is_public(self, unauth_client: TestClient, db: Session):
        resp = unauth_client.get("/health")
        assert resp.status_code == 200

    def test_supported_banks_is_public(self, unauth_client: TestClient, db: Session):
        resp = unauth_client.get("/accounts/supported-banks")
        assert resp.status_code == 200
