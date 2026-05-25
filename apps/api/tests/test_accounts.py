"""Tests for the accounts router."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import make_account, make_user


class TestSupportedBanks:
    def test_returns_list(self, client: TestClient):
        resp = client.get("/accounts/supported-banks")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Each entry should have slug, name, channels
        if data:
            assert "slug" in data[0]
            assert "name" in data[0]
            assert "channels" in data[0]


class TestListAccounts:
    def test_empty_list(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/accounts")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_user_accounts(self, client: TestClient, db: Session):
        make_user(db)
        make_account(db, institution="GTBank")
        resp = client.get("/accounts")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["institution"] == "GTBank"

    def test_excludes_deleted_accounts(self, client: TestClient, db: Session):
        from datetime import UTC, datetime

        from app.models.bank_account import BankAccount

        make_user(db)
        acct_id = make_account(db)
        acct = db.query(BankAccount).filter(BankAccount.id == acct_id).first()
        assert acct is not None
        acct.deleted_at = datetime.now(UTC)
        db.commit()

        resp = client.get("/accounts")
        assert resp.status_code == 200
        assert resp.json() == []


class TestAddManualAccount:
    def test_create_manual_account(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/accounts/manual",
            json={
                "institution": "GTBank",
                "bank_slug": "gtbank",
                "account_number": "0123456789",
                "alias": "My GTB",
                "account_type": "SAVINGS",
                "currency": "NGN",
                "balance": 100000,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["institution"] == "GTBank"
        assert data["alias"] == "My GTB"

    def test_unsupported_bank_rejected(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/accounts/manual",
            json={
                "institution": "Unknown Bank",
                "bank_slug": "nonexistent_bank_xyz",
                "account_number": "0123456789",
                "alias": "My Account",
            },
        )
        assert resp.status_code == 400

    def test_duplicate_account_number_rejected(self, client: TestClient, db: Session):
        make_user(db)
        # Create first account
        client.post(
            "/accounts/manual",
            json={
                "institution": "GTBank",
                "bank_slug": "gtbank",
                "account_number": "0123456789",
                "alias": "First",
            },
        )
        # Try duplicate
        resp = client.post(
            "/accounts/manual",
            json={
                "institution": "GTBank",
                "bank_slug": "gtbank",
                "account_number": "0123456789",
                "alias": "Second",
            },
        )
        assert resp.status_code == 409

    def test_invalid_account_number_format(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/accounts/manual",
            json={
                "institution": "GTBank",
                "bank_slug": "gtbank",
                "account_number": "123",
                "alias": "Bad",
            },
        )
        assert resp.status_code == 422


class TestUpdateAlias:
    def test_update_alias(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        resp = client.patch(f"/accounts/{acct_id}/alias", json={"alias": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["alias"] == "New Name"

    def test_update_alias_not_found(self, client: TestClient, db: Session):
        make_user(db)
        import uuid

        resp = client.patch(f"/accounts/{uuid.uuid4()}/alias", json={"alias": "X"})
        assert resp.status_code == 404


class TestUpdateBalance:
    def test_update_balance(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db, balance=0)
        resp = client.patch(
            f"/accounts/{acct_id}/balance",
            json={"balance": 50000, "note": "Manual update"},
        )
        assert resp.status_code == 200

    def test_negative_balance_rejected(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db)
        resp = client.patch(f"/accounts/{acct_id}/balance", json={"balance": -100})
        assert resp.status_code == 422


class TestDeleteAccount:
    def test_soft_delete(self, client: TestClient, db: Session):
        from app.models.bank_account import BankAccount

        make_user(db)
        acct_id = make_account(db)
        resp = client.delete(f"/accounts/{acct_id}")
        assert resp.status_code == 204

        acct = db.query(BankAccount).filter(BankAccount.id == acct_id).first()
        assert acct is not None
        assert acct.deleted_at is not None

    def test_delete_not_found(self, client: TestClient, db: Session):
        make_user(db)
        import uuid

        resp = client.delete(f"/accounts/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestReconcileAccount:
    def test_reconcile_no_delta(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db, balance=0)
        resp = client.post(
            f"/accounts/{acct_id}/reconcile",
            json={"true_actual_balance": 0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["delta"] == 0
        assert data["transaction_id"] is None

    def test_reconcile_with_delta(self, client: TestClient, db: Session):
        make_user(db)
        acct_id = make_account(db, balance=0)
        resp = client.post(
            f"/accounts/{acct_id}/reconcile",
            json={"true_actual_balance": 10000},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["delta"] == 10000
        assert data["transaction_id"] is not None
