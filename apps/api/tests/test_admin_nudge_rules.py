# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""
Unit tests for the admin nudge-rule CRUD API.

All database and Redis interactions are mocked; no real Postgres or Redis
connection is required.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.deps import get_current_admin, get_current_user
from app.main import app
from app.models.nudge_rule import NudgeRule
from app.models.user import User, UserRole

# ── Helpers ───────────────────────────────────────────────────────────────────

_VALID_CONDS = {"op": "AND", "rules": [{"fact": "tx.amt", "op": "gte", "val": 5_000_000}]}
_VALID_ACTION = {"tmpls": ["You spent {cat.spent} kobo in {cat.name}"]}


def _make_rule(**overrides: object) -> NudgeRule:
    """Build a minimal NudgeRule ORM stub."""
    now = datetime.now(UTC)
    rule = MagicMock(spec=NudgeRule)
    rule.id = overrides.get("id", str(uuid.uuid4()))
    rule.slug = overrides.get("slug", "test_rule")
    rule.title = overrides.get("title", "Test Rule")
    rule.gid = overrides.get("gid", "test_group")
    rule.active = overrides.get("active", True)
    rule.evts = overrides.get("evts", ["debit_cat"])
    rule.days_back = overrides.get("days_back", 0)
    rule.conds = overrides.get("conds", _VALID_CONDS)
    rule.action = overrides.get("action", _VALID_ACTION)
    rule.created_at = overrides.get("created_at", now)
    rule.updated_at = overrides.get("updated_at", now)
    return rule


def _make_admin() -> User:
    admin = MagicMock(spec=User)
    admin.id = str(uuid.uuid4())
    admin.role = UserRole.admin
    return admin


def _make_db() -> MagicMock:
    return MagicMock()


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def admin_client():
    """TestClient with get_current_user, get_current_admin, and get_db overridden."""
    admin = _make_admin()
    db = _make_db()

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_admin] = lambda: admin
    app.dependency_overrides[get_db] = lambda: db

    with TestClient(app, raise_server_exceptions=True) as client:
        yield client, db

    app.dependency_overrides.clear()


@pytest.fixture()
def anon_client():
    """TestClient with no auth overrides (no dependency override for get_current_admin)."""
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


# ── GET /admin/nudge-rules ────────────────────────────────────────────────────


class TestListNudgeRules:
    def test_returns_paginated_list(self, admin_client):
        client, db = admin_client
        rule = _make_rule()
        q_mock = db.query.return_value.filter.return_value
        q_mock.filter.return_value = q_mock  # chained .filter calls
        q_mock.count.return_value = 1
        q_mock.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [
            rule
        ]
        # No active/gid filter — only one filter call (none)
        qr = db.query.return_value
        qr.count.return_value = 1
        qr.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [rule]

        resp = client.get("/admin/nudge-rules")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["page"] == 1
        assert data["limit"] == 20
        assert len(data["items"]) == 1
        assert data["items"][0]["slug"] == "test_rule"

    def test_pagination_params(self, admin_client):
        client, db = admin_client
        qr = db.query.return_value
        qr.count.return_value = 0
        qr.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []

        resp = client.get("/admin/nudge-rules?page=2&limit=5")
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 2
        assert data["limit"] == 5

    def test_active_filter_applied(self, admin_client):
        client, db = admin_client
        filtered_q = MagicMock()
        filtered_q.count.return_value = 0
        fq_all = filtered_q.order_by.return_value.offset.return_value.limit.return_value.all
        fq_all.return_value = []
        db.query.return_value.filter.return_value = filtered_q

        resp = client.get("/admin/nudge-rules?active=true")
        assert resp.status_code == 200
        db.query.return_value.filter.assert_called_once()

    def test_gid_filter_applied(self, admin_client):
        client, db = admin_client
        filtered_q = MagicMock()
        filtered_q.count.return_value = 0
        fq_all = filtered_q.order_by.return_value.offset.return_value.limit.return_value.all
        fq_all.return_value = []
        db.query.return_value.filter.return_value = filtered_q

        resp = client.get("/admin/nudge-rules?gid=budget_pacing")
        assert resp.status_code == 200
        db.query.return_value.filter.assert_called_once()

    def test_title_search_filter_applied(self, admin_client):
        client, db = admin_client
        filtered_q = MagicMock()
        filtered_q.count.return_value = 0
        fq_all = filtered_q.order_by.return_value.offset.return_value.limit.return_value.all
        fq_all.return_value = []
        db.query.return_value.filter.return_value = filtered_q

        resp = client.get("/admin/nudge-rules?q=budget")
        assert resp.status_code == 200
        db.query.return_value.filter.assert_called_once()


# ── GET /admin/nudge-rules/{rule_id} ─────────────────────────────────────────


class TestGetNudgeRule:
    def test_returns_rule(self, admin_client):
        client, db = admin_client
        rule = _make_rule()
        db.get.return_value = rule

        resp = client.get(f"/admin/nudge-rules/{rule.id}")
        assert resp.status_code == 200
        assert resp.json()["slug"] == "test_rule"

    def test_404_when_not_found(self, admin_client):
        client, db = admin_client
        db.get.return_value = None

        resp = client.get("/admin/nudge-rules/does-not-exist")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# ── POST /admin/nudge-rules ───────────────────────────────────────────────────


_CREATE_BODY = {
    "slug": "new_rule",
    "title": "New rule",
    "gid": "test_group",
    "evts": ["debit_cat"],
    "days_back": 0,
    "conds": _VALID_CONDS,
    "action": _VALID_ACTION,
}


class TestCreateNudgeRule:
    def test_creates_rule_and_returns_201(self, admin_client):
        client, db = admin_client
        db.query.return_value.filter.return_value.first.return_value = None  # no slug clash
        created_rule = _make_rule(slug="new_rule", title="New rule")
        db.refresh.side_effect = lambda obj: None

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild"):
            with patch("app.routers.admin_nudge_rules.NudgeRule", return_value=created_rule):
                resp = client.post("/admin/nudge-rules", json=_CREATE_BODY)

        assert resp.status_code == 201
        db.add.assert_called_once()
        db.commit.assert_called_once()

    def test_409_on_duplicate_slug(self, admin_client):
        client, db = admin_client
        db.query.return_value.filter.return_value.first.return_value = _make_rule()

        resp = client.post("/admin/nudge-rules", json=_CREATE_BODY)
        assert resp.status_code == 409
        assert "already exists" in resp.json()["detail"]

    def test_422_on_invalid_evts(self, admin_client):
        client, _ = admin_client
        body = {**_CREATE_BODY, "evts": ["bad_event"]}
        resp = client.post("/admin/nudge-rules", json=body)
        assert resp.status_code == 422

    def test_422_on_invalid_fact(self, admin_client):
        client, _ = admin_client
        body = {
            **_CREATE_BODY,
            "conds": {"op": "AND", "rules": [{"fact": "unknown.fact", "op": "eq", "val": 1}]},
        }
        resp = client.post("/admin/nudge-rules", json=body)
        assert resp.status_code == 422

    def test_422_on_unknown_template_placeholder(self, admin_client):
        client, _ = admin_client
        body = {**_CREATE_BODY, "action": {"tmpls": ["Hello {unknown.key}"]}}
        resp = client.post("/admin/nudge-rules", json=body)
        assert resp.status_code == 422

    def test_422_when_days_back_out_of_range(self, admin_client):
        client, _ = admin_client
        body = {**_CREATE_BODY, "days_back": 999}
        resp = client.post("/admin/nudge-rules", json=body)
        assert resp.status_code == 422

    def test_cache_rebuilt_after_create(self, admin_client):
        client, db = admin_client
        db.query.return_value.filter.return_value.first.return_value = None
        created_rule = _make_rule(slug="new_rule")

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild") as mock_rebuild:
            with patch("app.routers.admin_nudge_rules.NudgeRule", return_value=created_rule):
                client.post("/admin/nudge-rules", json=_CREATE_BODY)
            mock_rebuild.assert_called_once_with(db, list(created_rule.evts))


# ── PUT /admin/nudge-rules/{rule_id} ─────────────────────────────────────────


class TestUpdateNudgeRule:
    def test_updates_title(self, admin_client):
        client, db = admin_client
        rule = _make_rule()
        db.get.return_value = rule

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild"):
            resp = client.put(f"/admin/nudge-rules/{rule.id}", json={"title": "Updated Title"})

        assert resp.status_code == 200
        assert rule.title == "Updated Title"
        db.commit.assert_called_once()

    def test_updates_evts_and_rebuilds_merged_cache(self, admin_client):
        client, db = admin_client
        rule = _make_rule(evts=["debit_cat"])
        db.get.return_value = rule

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild") as mock_rebuild:
            resp = client.put(f"/admin/nudge-rules/{rule.id}", json={"evts": ["credit_cat"]})

        assert resp.status_code == 200
        # Both old ("debit_cat") and new ("credit_cat") evts must be in the rebuild call
        call_evts = mock_rebuild.call_args[0][1]
        assert "debit_cat" in call_evts
        assert "credit_cat" in call_evts

    def test_404_when_rule_missing(self, admin_client):
        client, db = admin_client
        db.get.return_value = None

        resp = client.put("/admin/nudge-rules/no-such-id", json={"title": "x"})
        assert resp.status_code == 404

    def test_409_on_slug_conflict(self, admin_client):
        client, db = admin_client
        rule = _make_rule(slug="original_slug")
        db.get.return_value = rule
        clashing = _make_rule(slug="existing_slug")
        db.query.return_value.filter.return_value.first.return_value = clashing

        resp = client.put(f"/admin/nudge-rules/{rule.id}", json={"slug": "existing_slug"})
        assert resp.status_code == 409

    def test_no_change_when_body_empty(self, admin_client):
        client, db = admin_client
        rule = _make_rule()
        db.get.return_value = rule
        original_slug = rule.slug

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild"):
            resp = client.put(f"/admin/nudge-rules/{rule.id}", json={})

        assert resp.status_code == 200
        assert rule.slug == original_slug  # unchanged


# ── PATCH /admin/nudge-rules/{rule_id}/toggle ────────────────────────────────


class TestToggleNudgeRule:
    def test_flips_active_to_false(self, admin_client):
        client, db = admin_client
        rule = _make_rule(active=True)
        db.get.return_value = rule

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild"):
            resp = client.patch(f"/admin/nudge-rules/{rule.id}/toggle")

        assert resp.status_code == 200
        assert rule.active is False
        db.commit.assert_called_once()

    def test_flips_active_to_true(self, admin_client):
        client, db = admin_client
        rule = _make_rule(active=False)
        db.get.return_value = rule

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild"):
            resp = client.patch(f"/admin/nudge-rules/{rule.id}/toggle")

        assert resp.status_code == 200
        assert rule.active is True

    def test_404_when_rule_missing(self, admin_client):
        client, db = admin_client
        db.get.return_value = None

        resp = client.patch("/admin/nudge-rules/no-such-id/toggle")
        assert resp.status_code == 404

    def test_cache_rebuilt_after_toggle(self, admin_client):
        client, db = admin_client
        rule = _make_rule()
        db.get.return_value = rule

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild") as mock_rebuild:
            client.patch(f"/admin/nudge-rules/{rule.id}/toggle")

        mock_rebuild.assert_called_once_with(db, list(rule.evts))


# ── DELETE /admin/nudge-rules/{rule_id} ───────────────────────────────────────


class TestDeleteNudgeRule:
    def test_deletes_and_returns_204(self, admin_client):
        client, db = admin_client
        rule = _make_rule()
        db.get.return_value = rule

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild"):
            resp = client.delete(f"/admin/nudge-rules/{rule.id}")

        assert resp.status_code == 204
        db.delete.assert_called_once_with(rule)
        db.commit.assert_called_once()

    def test_404_when_rule_missing(self, admin_client):
        client, db = admin_client
        db.get.return_value = None

        resp = client.delete("/admin/nudge-rules/no-such-id")
        assert resp.status_code == 404

    def test_cache_rebuilt_with_old_evts(self, admin_client):
        client, db = admin_client
        rule = _make_rule(evts=["debit_cat", "credit_cat"])
        db.get.return_value = rule

        with patch("app.routers.admin_nudge_rules.invalidate_and_rebuild") as mock_rebuild:
            client.delete(f"/admin/nudge-rules/{rule.id}")

        mock_rebuild.assert_called_once_with(db, ["debit_cat", "credit_cat"])
