"""Tests for the MinAppVersionMiddleware."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import make_user


class TestMinAppVersionMiddleware:
    def test_health_exempt(self, client: TestClient, db: Session):
        """Health endpoint should never require app version header."""
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_no_enforcement_when_disabled(self, client: TestClient, db: Session):
        """When MIN_APP_VERSION is empty, no enforcement happens."""
        make_user(db)
        resp = client.get("/accounts")
        # Should succeed without X-App-Version header
        assert resp.status_code == 200
