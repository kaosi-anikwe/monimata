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

from uuid import UUID
from typing import Optional
from datetime import datetime, date

from pydantic import BaseModel, ConfigDict, field_validator

# ── Category Groups ───────────────────────────────────────────────────────────


class CategoryGroupCreate(BaseModel):
    name: str
    sort_order: Optional[int] = None


class CategoryGroupUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    is_hidden: Optional[bool] = None


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
    sort_order: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    group_id: Optional[UUID] = None
    sort_order: Optional[int] = None
    is_hidden: Optional[bool] = None


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


class CategoryTargetUpsert(BaseModel):
    frequency: str  # weekly | monthly | yearly | custom
    behavior: str = "set_aside"  # set_aside | refill | balance
    target_amount: int  # kobo, must be > 0
    day_of_week: Optional[int] = None  # 0=Mon … 6=Sun; weekly only
    day_of_month: Optional[int] = None  # 1-31; 0=last day; monthly only
    target_date: Optional[date] = None  # yearly / custom due date
    repeats: bool = False  # custom only

    @field_validator("frequency")
    @classmethod
    def valid_frequency(cls, v: str) -> str:
        allowed = {"weekly", "monthly", "yearly", "custom"}
        if v not in allowed:
            raise ValueError(f"frequency must be one of {allowed}")
        return v

    @field_validator("behavior")
    @classmethod
    def valid_behavior(cls, v: str) -> str:
        allowed = {"set_aside", "refill", "balance"}
        if v not in allowed:
            raise ValueError(f"behavior must be one of {allowed}")
        return v

    @field_validator("target_amount")
    @classmethod
    def amount_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("target_amount must be positive")
        return v


class CategoryTargetResponse(BaseModel):
    id: UUID
    category_id: UUID
    frequency: str
    behavior: str
    target_amount: int
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    target_date: Optional[date]
    repeats: bool
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
