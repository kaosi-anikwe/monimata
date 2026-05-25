"""Tests for the content router (Sanity CMS proxy)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.conftest import make_user


class TestListPosts:
    @patch("app.routers.content.get_async_redis")
    @patch("app.routers.content._run_two")
    def test_returns_posts(self, mock_run_two, mock_redis, client: TestClient, db: Session):
        make_user(db)
        mock_r = MagicMock()
        mock_r.get = AsyncMock(return_value=None)
        mock_r.set = AsyncMock()
        mock_redis.return_value = mock_r

        mock_run_two.return_value = (
            1,
            [
                {
                    "id": "abc",
                    "title": "Budgeting 101",
                    "slug": "budgeting-101",
                    "excerpt": "Learn to budget",
                    "publishedAt": None,
                    "tags": None,
                    "coverImage": None,
                    "category": None,
                    "author": None,
                }
            ],
        )
        resp = client.get("/content/posts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "Budgeting 101"


class TestGetPost:
    @patch("app.routers.content.get_async_redis")
    @patch("app.routers.content.groq_query")
    def test_returns_post_detail(self, mock_groq, mock_redis, client: TestClient, db: Session):
        make_user(db)
        mock_r = MagicMock()
        mock_r.get = AsyncMock(return_value=None)
        mock_r.set = AsyncMock()
        mock_redis.return_value = mock_r

        mock_groq.return_value = {
            "id": "abc",
            "title": "Budgeting 101",
            "slug": "budgeting-101",
            "excerpt": "Learn to budget",
            "publishedAt": None,
            "tags": None,
            "coverImage": None,
            "category": None,
            "author": None,
            "body": [{"_type": "block"}],
        }
        resp = client.get("/content/posts/budgeting-101")
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == "budgeting-101"

    @patch("app.routers.content.get_async_redis")
    @patch("app.routers.content.groq_query")
    def test_post_not_found(self, mock_groq, mock_redis, client: TestClient, db: Session):
        make_user(db)
        mock_r = MagicMock()
        mock_r.get = AsyncMock(return_value=None)
        mock_r.set = AsyncMock()
        mock_redis.return_value = mock_r

        mock_groq.return_value = None
        resp = client.get("/content/posts/nonexistent")
        assert resp.status_code == 404
