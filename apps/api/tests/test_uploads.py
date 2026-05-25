"""Tests for the uploads router."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import make_user


class TestUploadReceipt:
    def test_upload_receipt_accepted(self, client: TestClient, db: Session):
        make_user(db)
        with patch("app.worker.tasks.process_receipt") as mock_task:
            mock_task.delay = MagicMock()
            resp = client.post(
                "/uploads/receipt",
                files={"file": ("receipt.jpg", b"\xff\xd8\xff\xe0" + b"x" * 100, "image/jpeg")},
            )
        assert resp.status_code == 202
        assert resp.json()["status"] == "accepted"

    def test_upload_empty_file(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/uploads/receipt",
            files={"file": ("receipt.jpg", b"", "image/jpeg")},
        )
        assert resp.status_code == 400

    def test_upload_unsupported_type(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/uploads/receipt",
            files={"file": ("receipt.txt", b"plain text content", "text/plain")},
        )
        assert resp.status_code == 415


class TestUploadStatement:
    def test_upload_unrecognized_pdf(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/uploads/statement",
            files={"file": ("statement.pdf", b"%PDF-1.4" + b"x" * 100, "application/pdf")},
        )
        assert resp.status_code == 422

    def test_upload_non_pdf_rejected(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/uploads/statement",
            files={"file": ("statement.csv", b"date,amount\n2026-01-01,5000", "text/csv")},
        )
        assert resp.status_code == 415
