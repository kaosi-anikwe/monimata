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
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator

RecurringFrequencyLiteral = Literal[
    "daily", "weekly", "biweekly", "monthly", "yearly", "custom"
]


class RecurringRuleCreate(BaseModel):
    frequency: RecurringFrequencyLiteral
    interval: int = 1
    day_of_week: Optional[int] = None  # 0=Mon … 6=Sun; weekly/biweekly
    day_of_month: Optional[int] = None  # 1-31; 0=last day; monthly
    next_due: date
    ends_on: Optional[date] = None
    template: dict[str, Any]  # see RecurringRule model docstring

    @field_validator("interval")
    @classmethod
    def interval_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("interval must be >= 1")
        return v


class RecurringRuleUpdate(BaseModel):
    """All fields optional — only provided fields are updated."""

    is_active: Optional[bool] = None
    ends_on: Optional[date] = None
    next_due: Optional[date] = None


class RecurringRuleResponse(BaseModel):
    id: UUID
    user_id: UUID
    frequency: str
    interval: int
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    next_due: date
    ends_on: Optional[date]
    is_active: bool
    template: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
