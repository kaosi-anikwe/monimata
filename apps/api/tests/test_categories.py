"""Tests for the categories router."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import (
    TEST_USER_ID,
    make_account,
    make_category,
    make_group,
    make_transaction,
    make_user,
)

# ══════════════════════════════════════════════════════════════════════════════
# Category Groups
# ══════════════════════════════════════════════════════════════════════════════


class TestListGroups:
    def test_empty(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.get("/category-groups")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_groups(self, client: TestClient, db: Session):
        make_user(db)
        make_group(db, name="Needs")
        resp = client.get("/category-groups")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Needs"


class TestCreateGroup:
    def test_create_group(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post("/category-groups", json={"name": "Wants"})
        assert resp.status_code == 201
        assert resp.json()["name"] == "Wants"

    def test_auto_sort_order(self, client: TestClient, db: Session):
        make_user(db)
        client.post("/category-groups", json={"name": "First"})
        resp = client.post("/category-groups", json={"name": "Second"})
        assert resp.status_code == 201
        assert resp.json()["sort_order"] == 1


class TestUpdateGroup:
    def test_rename_group(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db, name="Old Name")
        resp = client.patch(f"/category-groups/{gid}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_hide_group(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        resp = client.patch(f"/category-groups/{gid}", json={"is_hidden": True})
        assert resp.status_code == 200
        assert resp.json()["is_hidden"] is True

    def test_update_not_found(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.patch(f"/category-groups/{uuid.uuid4()}", json={"name": "X"})
        assert resp.status_code == 404


class TestDeleteGroup:
    def test_delete_empty_group(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        resp = client.delete(f"/category-groups/{gid}")
        assert resp.status_code == 204

    def test_delete_group_with_categories_hides(self, client: TestClient, db: Session):
        from app.models.category import CategoryGroup

        make_user(db)
        gid = make_group(db)
        make_category(db, gid, name="Food")
        resp = client.delete(f"/category-groups/{gid}")
        assert resp.status_code == 204

        group = db.query(CategoryGroup).filter(CategoryGroup.id == gid).first()
        assert group is not None
        assert group.is_hidden is True


# ══════════════════════════════════════════════════════════════════════════════
# Categories
# ══════════════════════════════════════════════════════════════════════════════


class TestListCategories:
    def test_returns_groups_with_categories(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db, name="Needs")
        make_category(db, gid, name="Food")
        resp = client.get("/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Needs"
        assert len(data[0]["categories"]) == 1
        assert data[0]["categories"][0]["name"] == "Food"


class TestCreateCategory:
    def test_create_category(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        resp = client.post(
            "/categories",
            json={"group_id": gid, "name": "Groceries"},
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "Groceries"

    def test_invalid_group_rejected(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.post(
            "/categories",
            json={"group_id": str(uuid.uuid4()), "name": "X"},
        )
        assert resp.status_code == 404


class TestUpdateCategory:
    def test_rename_category(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid, name="Old")
        resp = client.patch(f"/categories/{cid}", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New"

    def test_move_to_another_group(self, client: TestClient, db: Session):
        make_user(db)
        gid1 = make_group(db, name="G1")
        gid2 = make_group(db, name="G2")
        cid = make_category(db, gid1)
        resp = client.patch(f"/categories/{cid}", json={"group_id": gid2})
        assert resp.status_code == 200
        assert resp.json()["group_id"] == gid2

    def test_update_not_found(self, client: TestClient, db: Session):
        make_user(db)
        resp = client.patch(f"/categories/{uuid.uuid4()}", json={"name": "X"})
        assert resp.status_code == 404


class TestDeleteCategory:
    def test_delete_unused_category(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        resp = client.delete(f"/categories/{cid}")
        assert resp.status_code == 204

    def test_delete_used_category_hides(self, client: TestClient, db: Session):
        from app.models.category import Category

        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        acct_id = make_account(db)
        make_transaction(db, TEST_USER_ID, acct_id, category_id=cid)

        resp = client.delete(f"/categories/{cid}")
        assert resp.status_code == 204

        cat = db.query(Category).filter(Category.id == cid).first()
        assert cat is not None
        assert cat.is_hidden is True


class TestSortCategory:
    def test_sort_category(self, client: TestClient, db: Session):
        make_user(db)
        gid = make_group(db)
        cid = make_category(db, gid)
        resp = client.patch(f"/categories/{cid}/sort?sort_order=5")
        assert resp.status_code == 200
        assert resp.json()["sort_order"] == 5
