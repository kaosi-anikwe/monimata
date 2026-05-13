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

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

# ── Category Groups ───────────────────────────────────────────────────────────


class CategoryGroupCreate(BaseModel):
    name: str
    sort_order: int | None = None


class CategoryGroupUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None
    is_hidden: bool | None = None


class CategoryGroupResponse(BaseModel):
    id: UUID
    name: str
    sort_order: int
    is_hidden: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Categories ────────────────────────────────────────────────────────────────


class CategoryCreate(BaseModel):
    group_id: UUID
    name: str
    sort_order: int | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    group_id: UUID | None = None
    sort_order: int | None = None
    is_hidden: bool | None = None


class CategoryResponse(BaseModel):
    id: UUID
    group_id: UUID
    name: str
    sort_order: int
    is_hidden: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategoryGroupWithCategories(BaseModel):
    """Category group with its nested categories — used in budget and category list responses."""

    id: UUID
    name: str
    sort_order: int
    is_hidden: bool
    categories: list[CategoryResponse]

    model_config = ConfigDict(from_attributes=True)


# ── Category Targets ──────────────────────────────────────────────────────────


class TargetFrequency(StrEnum):
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"
    custom = "custom"


class TargetBehavior(StrEnum):
    set_aside = "set_aside"
    refill = "refill"
    balance = "balance"


class CategoryTargetUpsert(BaseModel):
    frequency: TargetFrequency
    behavior: TargetBehavior = TargetBehavior.set_aside
    target_amount: int  # kobo, must be > 0
    day_of_week: int | None = None  # 0=Mon … 6=Sun; weekly only
    day_of_month: int | None = None  # 1-31; 0=last day; monthly only
    target_date: date | None = None  # yearly / custom due date
    repeats: bool = False  # custom only

    @field_validator("target_amount")
    @classmethod
    def amount_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("target_amount must be positive")
        return v


class CategoryTargetResponse(BaseModel):
    id: UUID
    category_id: UUID
    frequency: TargetFrequency
    behavior: TargetBehavior
    target_amount: int
    day_of_week: int | None
    day_of_month: int | None
    target_date: date | None
    repeats: bool
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
