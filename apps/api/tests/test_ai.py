"""Tests for the AI credentials and usage router."""

from __future__ import annotations

import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import TEST_USER_ID, make_user


def _make_ai_credential(db: Session, user_id: str = TEST_USER_ID, **kwargs) -> str:
    from app.models.user_ai_credential import UserAiCredential

    cred_id = str(uuid.uuid4())
    cred = UserAiCredential(
        id=cred_id,
        user_id=user_id,
        provider=kwargs.get("provider", "openai"),
        encrypted_api_key=kwargs.get("encrypted_api_key", "encrypted-test-key"),
        is_active=kwargs.get("is_active", True),
    )
    db.add(cred)
    db.commit()
    return cred_id


class TestListCredentials:
    def test_empty(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/ai/credentials")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_credentials(self, client: TestClient, db: Session):
        make_user(db)
        _make_ai_credential(db)
        resp = client.get("/ai/credentials")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["provider"] == "openai"
        # API key should NOT be returned
        assert "encrypted_api_key" not in data[0]
        assert "api_key" not in data[0]


class TestCreateCredential:
    def test_create_credential(self, client: TestClient, db: Session):
        make_user(db)
        with (
            patch("app.services.llm.validate_api_key"),
            patch("app.routers.ai.encrypt_api_key", return_value="encrypted-value"),
        ):
            resp = client.post(
                "/ai/credentials",
                json={"provider": "openai", "api_key": "sk-test-key-1234567890"},
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["provider"] == "openai"

    def test_invalid_provider_rejected(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/ai/credentials",
            json={"provider": "invalid_provider", "api_key": "sk-test-key-1234567890"},
        )
        assert resp.status_code == 422

    def test_short_api_key_rejected(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/ai/credentials",
            json={"provider": "openai", "api_key": "short"},
        )
        assert resp.status_code == 422


class TestDeleteCredential:
    def test_delete_credential(self, client: TestClient, db: Session):
        make_user(db)
        cred_id = _make_ai_credential(db)
        resp = client.delete(f"/ai/credentials/{cred_id}")
        assert resp.status_code == 204

    def test_delete_not_found(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.delete(f"/ai/credentials/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestAiUsage:
    def test_usage_stats(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/ai/usage")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_categorised" in data
        assert "offline_categorised" in data
