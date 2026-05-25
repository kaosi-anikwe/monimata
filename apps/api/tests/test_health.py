"""Tests for the health check endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


class TestHealthCheck:
    def test_health_returns_ok(self, client: TestClient):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "monimata-api"
