"""Tests for the nudges router."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import TEST_USER_ID, make_user


def _make_nudge(db: Session, user_id: str = TEST_USER_ID, **kwargs) -> str:
    from app.models.nudge import Nudge

    nudge_id = str(uuid.uuid4())
    nudge = Nudge(
        id=nudge_id,
        user_id=user_id,
        trigger_type=kwargs.get("trigger_type", "nudge"),
        title=kwargs.get("title", "Test Nudge"),
        message=kwargs.get("message", "This is a test nudge"),
        context=kwargs.get("context", None),
        is_opened=kwargs.get("is_opened", False),
        is_dismissed=kwargs.get("is_dismissed", False),
    )
    db.add(nudge)
    db.commit()
    return nudge_id


class TestListNudges:
    def test_empty_list(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/nudges")
        assert resp.status_code == 200
        data = resp.json()
        assert data["nudges"] == []
        assert data["total"] == 0

    def test_returns_nudges(self, client: TestClient, db: Session):
        make_user(db)
        _make_nudge(db)
        resp = client.get("/nudges")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    def test_pagination(self, client: TestClient, db: Session):
        make_user(db)
        for i in range(5):
            _make_nudge(db, message=f"nudge-{i}")
        resp = client.get("/nudges?page=1&limit=2")
        data = resp.json()
        assert len(data["nudges"]) == 2


class TestGetNudge:
    def test_get_existing(self, client: TestClient, db: Session):
        make_user(db)
        nid = _make_nudge(db)
        resp = client.get(f"/nudges/{nid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == nid

    def test_get_not_found(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get(f"/nudges/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestOpenNudge:
    def test_open_nudge(self, client: TestClient, db: Session):
        make_user(db)
        nid = _make_nudge(db)
        resp = client.post(f"/nudges/{nid}/open")
        assert resp.status_code == 200
        assert resp.json()["is_opened"] is True


class TestDismissNudge:
    def test_dismiss_nudge(self, client: TestClient, db: Session):
        make_user(db)
        nid = _make_nudge(db)
        resp = client.post(f"/nudges/{nid}/dismiss")
        assert resp.status_code == 200
        assert resp.json()["is_dismissed"] is True


class TestDeleteNudge:
    def test_delete_nudge(self, client: TestClient, db: Session):
        make_user(db)
        nid = _make_nudge(db)
        resp = client.delete(f"/nudges/{nid}")
        assert resp.status_code == 204


class TestMarkAllRead:
    def test_mark_all_read(self, client: TestClient, db: Session):
        make_user(db)
        _make_nudge(db)
        _make_nudge(db)
        resp = client.post("/nudges/mark-all-read")
        assert resp.status_code == 204
