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

"""Content router — serves Sanity CMS data to the mobile app."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi_cache.decorator import cache  # type: ignore[import-untyped]

from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.models.user import User
from app.schemas.content import (
    AuthorSummary,
    CategorySummary,
    PostDetail,
    PostListResponse,
    PostSummary,
)
from app.services.sanity import groq_query

logger = logging.getLogger(__name__)
router = APIRouter()

# ── GROQ queries ──────────────────────────────────────────────────────────────

_MOBILE_POST_FILTER = (
    "_type == 'post' && defined(category) && category->showOnMobile == true && defined(publishedAt)"
)

_POST_PROJECTION = """
{
  "id": _id,
  "title": title,
  "slug": slug.current,
  "excerpt": excerpt,
  "publishedAt": publishedAt,
  "tags": tags,
  "coverImage": mainImage.asset->url,
  "category": category->{"name": name, "slug": slug.current},
  "author": author->{"name": name, "slug": slug.current, "avatar": avatar.asset->url}
}
""".strip()

_POST_DETAIL_PROJECTION = """
{
  "id": _id,
  "title": title,
  "slug": slug.current,
  "excerpt": excerpt,
  "publishedAt": publishedAt,
  "tags": tags,
  "coverImage": mainImage.asset->url,
  "category": category->{"name": name, "slug": slug.current},
  "author": author->{"name": name, "slug": slug.current, "avatar": avatar.asset->url},
  "body": body
}
""".strip()


def _map_post(raw: dict) -> PostSummary:
    cat = raw.get("category")
    auth = raw.get("author")
    return PostSummary(
        id=raw.get("id", ""),
        title=raw.get("title", ""),
        slug=raw.get("slug", ""),
        excerpt=raw.get("excerpt"),
        published_at=raw.get("publishedAt"),
        tags=raw.get("tags"),
        cover_image=raw.get("coverImage"),
        category=CategorySummary(**cat) if cat else None,
        author=AuthorSummary(**auth) if auth else None,
    )


# ── GET /content/posts ────────────────────────────────────────────────────────


@router.get("/posts", response_model=PostListResponse, operation_id="listPosts")
@cache(expire=3600)
@limiter.limit("60/minute")
async def list_posts(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: str | None = Query(None, description="Filter by category slug"),
    _: User = Depends(get_current_user),
) -> PostListResponse:
    """Return a paginated list of mobile-visible posts."""
    category_filter = f" && category->slug.current == '{category}'" if category else ""
    full_filter = f"{_MOBILE_POST_FILTER}{category_filter}"
    from_idx = (page - 1) * limit
    to_idx = from_idx + limit - 1

    count_query = f"count(*[{full_filter}])"
    list_query = (
        f"*[{full_filter}] | order(publishedAt desc) [{from_idx}...{to_idx + 1}] {_POST_PROJECTION}"
    )

    try:
        total, items_raw = await _run_two(count_query, list_query)
    except httpx.HTTPError as exc:
        logger.error("Sanity request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Content service unavailable",
        )

    return PostListResponse(
        total=int(total or 0),
        page=page,
        limit=limit,
        items=[_map_post(p) for p in (items_raw or [])],
    )


# ── GET /content/posts/{slug} ─────────────────────────────────────────────────


@router.get("/posts/{slug}", response_model=PostDetail, operation_id="getPost")
@cache(expire=3600)
@limiter.limit("120/minute")
async def get_post(
    request: Request,
    slug: str,
    _: User = Depends(get_current_user),
) -> PostDetail:
    """Return a single mobile-visible post by slug."""
    query = f"*[{_MOBILE_POST_FILTER} && slug.current == $slug][0] {_POST_DETAIL_PROJECTION}"
    try:
        raw = await groq_query(query, {"slug": slug})
    except httpx.HTTPError as exc:
        logger.error("Sanity request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Content service unavailable",
        )

    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    cat = raw.get("category")
    auth = raw.get("author")
    return PostDetail(
        id=raw.get("id", ""),
        title=raw.get("title", ""),
        slug=raw.get("slug", ""),
        excerpt=raw.get("excerpt"),
        published_at=raw.get("publishedAt"),
        tags=raw.get("tags"),
        cover_image=raw.get("coverImage"),
        category=CategorySummary(**cat) if cat else None,
        author=AuthorSummary(**auth) if auth else None,
        body=raw.get("body"),
    )


# ── helpers ───────────────────────────────────────────────────────────────────


async def _run_two(query_a: str, query_b: str):
    """Run two independent GROQ queries concurrently."""
    import asyncio

    return await asyncio.gather(groq_query(query_a), groq_query(query_b))
