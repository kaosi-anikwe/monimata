"""Tests for the recurring rules router."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import TEST_USER_ID, make_account, make_user


def _make_recurring_rule(db: Session, user_id: str, account_id: str, **kwargs) -> str:
    from datetime import date

    from app.models.recurring_rule import RecurringRule

    rule_id = str(uuid.uuid4())
    template = {
        "account_id": account_id,
        "amount": kwargs.get("amount", -5000),
        "narration": kwargs.get("narration", "Monthly subscription"),
        "type": kwargs.get("type", "debit"),
    }
    rule = RecurringRule(
        id=rule_id,
        user_id=user_id,
        frequency=kwargs.get("frequency", "monthly"),
        interval=kwargs.get("interval", 1),
        next_due=kwargs.get("next_due", date(2026, 6, 1)),
        template=template,
        is_active=kwargs.get("is_active", True),
    )
    db.add(rule)
    db.commit()
    return rule_id


class TestListRecurringRules:
    def test_empty(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/recurring-rules")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_rules(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        _make_recurring_rule(db, TEST_USER_ID, acct_id)
        resp = client.get("/recurring-rules")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestGetRecurringRule:
    def test_get_existing(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        rule_id = _make_recurring_rule(db, TEST_USER_ID, acct_id)
        resp = client.get(f"/recurring-rules/{rule_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == rule_id

    def test_get_not_found(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get(f"/recurring-rules/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestCreateRecurringRule:
    def test_create_rule(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        resp = client.post(
            "/recurring-rules",
            json={
                "frequency": "monthly",
                "interval": 1,
                "next_due": "2026-06-01",
                "template": {
                    "account_id": acct_id,
                    "amount": -10000,
                    "narration": "Netflix",
                    "type": "debit",
                },
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["frequency"] == "monthly"

    def test_invalid_interval(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        resp = client.post(
            "/recurring-rules",
            json={
                "frequency": "monthly",
                "interval": 0,
                "next_due": "2026-06-01",
                "template": {
                    "account_id": acct_id,
                    "amount": -10000,
                    "narration": "Test",
                    "type": "debit",
                },
            },
        )
        assert resp.status_code == 422


class TestUpdateRecurringRule:
    def test_deactivate_rule(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        rule_id = _make_recurring_rule(db, TEST_USER_ID, acct_id)
        resp = client.patch(
            f"/recurring-rules/{rule_id}",
            json={"is_active": False},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False


class TestDeleteRecurringRule:
    def test_delete_rule(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        rule_id = _make_recurring_rule(db, TEST_USER_ID, acct_id)
        resp = client.delete(f"/recurring-rules/{rule_id}")
        assert resp.status_code == 204

    def test_delete_not_found(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.delete(f"/recurring-rules/{uuid.uuid4()}")
        assert resp.status_code == 404
