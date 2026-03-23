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
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class TransactionSplitResponse(BaseModel):
    id: UUID
    category_id: Optional[UUID]
    amount: int  # kobo
    memo: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class TransactionResponse(BaseModel):
    id: UUID
    account_id: UUID
    mono_id: Optional[str]
    date: datetime
    amount: int  # kobo — negative = debit, positive = credit
    narration: str
    type: str  # "debit" | "credit"
    balance_after: Optional[int]
    category_id: Optional[UUID]
    memo: Optional[str]
    is_split: bool
    is_manual: bool
    source: str
    recurrence_id: Optional[UUID]
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
    Patch a transaction.

    category_id and memo apply to all transactions.
    type / amount / narration / date / account_id only apply to manual
    transactions (silently ignored for Mono/Interswitch imports).
    """

    category_id: Optional[UUID] = None
    memo: Optional[str] = None
    # ── Manual transactions only ──────────────────────────────────────────────
    type: Optional[Literal["debit", "credit"]] = None
    amount: Optional[int] = None  # kobo, positive — sign derived from type
    narration: Optional[str] = None
    date: Optional[datetime] = None
    account_id: Optional[UUID] = None


class TransactionSplitItem(BaseModel):
    category_id: UUID
    amount: int  # kobo; must be > 0
    memo: Optional[str] = None

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
    def at_least_two_splits(
        cls, v: list[TransactionSplitItem]
    ) -> list[TransactionSplitItem]:
        if len(v) < 2:
            raise ValueError("A split requires at least 2 items")
        return v


class ManualTransactionRequest(BaseModel):
    account_id: UUID
    date: datetime
    amount: int  # kobo; negative = debit, positive = credit
    narration: str
    type: Literal["debit", "credit"]
    category_id: Optional[UUID] = None
    memo: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_nonzero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("Amount cannot be zero")
        return v
