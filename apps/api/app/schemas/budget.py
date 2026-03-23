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

from pydantic import BaseModel, field_validator


class BudgetCategoryResponse(BaseModel):
    id: UUID
    name: str
    sort_order: int
    is_hidden: bool
    assigned: int  # kobo
    activity: int  # kobo — negative for debits
    available: int  # kobo — assigned - activity (plus any carry-forward)
    required_this_month: Optional[int]  # kobo — None when no target set
    target_amount: Optional[int]  # kobo — None when no target set
    target_frequency: Optional[str]  # "weekly" | "monthly" | "yearly" | "custom" | None


class BudgetGroupResponse(BaseModel):
    id: UUID
    name: str
    sort_order: int
    is_hidden: bool
    categories: list[BudgetCategoryResponse]


class BudgetResponse(BaseModel):
    month: str  # "YYYY-MM"
    tbb: int  # kobo — To Be Budgeted
    groups: list[BudgetGroupResponse]


class AssignRequest(BaseModel):
    assigned: int  # kobo

    @field_validator("assigned")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("assigned cannot be negative")
        return v


class MoveMoneyRequest(BaseModel):
    from_category_id: UUID
    to_category_id: UUID
    amount: int  # kobo
    month: str  # "YYYY-MM"

    @field_validator("amount")
    @classmethod
    def positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v


class TBBResponse(BaseModel):
    month: str
    tbb: int  # kobo


class UnderfundedCategoryResponse(BaseModel):
    id: UUID
    name: str
    available: int  # kobo
    required_this_month: int  # kobo
    shortfall: int  # kobo — required_this_month - available


class AutoAssignResponse(BaseModel):
    month: str
    assignments_made: int
    total_assigned: int  # kobo
    still_underfunded: list[
        UUID
    ]  # categories that couldn't be fully funded (TBB ran out)
