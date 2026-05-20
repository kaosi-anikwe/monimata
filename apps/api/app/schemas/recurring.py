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
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

RecurringFrequencyLiteral = Literal["daily", "weekly", "biweekly", "monthly", "yearly", "custom"]


class RecurringTemplate(BaseModel):
    account_id: str
    amount: int  # kobo; negative = debit, positive = credit
    narration: str
    type: Literal["debit", "credit"]
    category_id: str | None = None
    memo: str | None = None


class RecurringRuleCreate(BaseModel):
    frequency: RecurringFrequencyLiteral
    interval: int = 1
    day_of_week: int | None = None  # 0=Mon … 6=Sun; weekly/biweekly
    day_of_month: int | None = None  # 1-31; 0=last day; monthly
    next_due: date
    ends_on: date | None = None
    template: RecurringTemplate
    # When the rule is created from an existing transaction, supply its ID so
    # the server can back-fill recurrence_id on that transaction.
    source_transaction_id: UUID | None = None

    @field_validator("interval")
    @classmethod
    def interval_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("interval must be >= 1")
        return v


class RecurringRuleUpdate(BaseModel):
    """All fields optional — only provided fields are updated."""

    is_active: bool | None = None
    ends_on: date | None = None
    next_due: date | None = None


class RecurringRuleResponse(BaseModel):
    id: UUID
    user_id: UUID
    frequency: RecurringFrequencyLiteral
    interval: int
    day_of_week: int | None
    day_of_month: int | None
    next_due: date
    ends_on: date | None
    is_active: bool
    template: RecurringTemplate
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
