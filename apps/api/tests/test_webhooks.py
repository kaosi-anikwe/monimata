"""Tests for the webhooks router."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import make_user


class TestBankAlertWebhook:
    def test_missing_secret_rejected(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/webhooks/bank-alerts",
            json={"from": "test@bank.com", "subject": "Alert", "body_text": "Debit"},
        )
        # Should reject without the secret header
        assert resp.status_code in (401, 403, 422)

    @patch("app.core.config.settings")
    def test_invalid_secret_rejected(self, mock_settings, client: TestClient, db: Session):
        make_user(db)
        mock_settings.BANK_ALERT_WEBHOOK_SECRET = "correct-secret"
        resp = client.post(
            "/webhooks/bank-alerts",
            json={"from": "test@bank.com", "subject": "Alert", "body_text": "Debit"},
            headers={"X-MoniMata-Secret": "wrong-secret"},
        )
        assert resp.status_code in (401, 403)
