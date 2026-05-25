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

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class CategorySummary(BaseModel):
    name: str
    slug: str


class AuthorSummary(BaseModel):
    name: str
    slug: str
    avatar: str | None = None


class PostSummary(BaseModel):
    """Lightweight post representation used in list responses."""

    id: str
    title: str
    slug: str
    excerpt: str | None = None
    published_at: str | None = None
    tags: list[str] | None = None
    cover_image: str | None = None
    category: CategorySummary | None = None
    author: AuthorSummary | None = None


class PostDetail(PostSummary):
    """Full post including Portable Text body."""

    body: list[Any] | None = None


class PostListResponse(BaseModel):
    total: int
    page: int
    limit: int
    items: list[PostSummary]
