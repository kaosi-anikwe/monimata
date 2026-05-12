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

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.transaction import TransactionSource


class TransactionSplitResponse(BaseModel):
    id: UUID
    category_id: UUID | None
    amount: int  # kobo
    memo: str | None

    model_config = ConfigDict(from_attributes=True)


class TransactionResponse(BaseModel):
    id: UUID
    account_id: UUID
    date: datetime
    amount: int  # kobo — negative = debit, positive = credit
    narration: str
    type: str  # "debit" | "credit"
    balance_after: int | None
    category_id: UUID | None
    memo: str | None
    is_split: bool
    source: TransactionSource
    recurrence_id: UUID | None
    splits: list[TransactionSplitResponse]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    limit: int

    model_config = ConfigDict(from_attributes=True)


class TransactionPatchRequest(BaseModel):
    """
    Patch a transaction.  All fields are editable regardless of source.
    """

    category_id: UUID | None = None
    memo: str | None = None
    type: Literal["debit", "credit"] | None = None
    amount: int | None = None  # kobo, positive — sign derived from type
    narration: str | None = None
    date: datetime | None = None
    account_id: UUID | None = None


class TransactionSplitItem(BaseModel):
    category_id: UUID
    amount: int  # kobo; must be > 0
    memo: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Split amount must be positive")
        return v


class TransactionSplitRequest(BaseModel):
    splits: list[TransactionSplitItem]

    @field_validator("splits")
    @classmethod
    def at_least_two_splits(cls, v: list[TransactionSplitItem]) -> list[TransactionSplitItem]:
        if len(v) < 2:
            raise ValueError("A split requires at least 2 items")
        return v


class ManualTransactionRequest(BaseModel):
    account_id: UUID
    date: datetime
    amount: int  # kobo; negative = debit, positive = credit
    narration: str
    type: Literal["debit", "credit"]
    category_id: UUID | None = None
    memo: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_nonzero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("Amount cannot be zero")
        return v
