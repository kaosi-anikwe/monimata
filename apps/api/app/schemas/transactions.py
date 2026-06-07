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
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.transaction import TransactionSource


class TransactionTypeFilter(str, Enum):
    debit = "debit"
    credit = "credit"
    all = "all"


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
    # Categorisation telemetry — used by clients to surface manual-review prompts
    # for low-confidence assignments.
    categorization_source: (
        Literal["exact_match", "global_merchant", "keyword", "vector", "heuristic", "llm", "manual"]
        | None
    )
    category_confidence: int  # 0–100; 0 = unresolved / LLM failure

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


# ── Phase 6 — clustering & review queue ──────────────────────────────────────


class ClusterItem(BaseModel):
    key: str  # representative cleaned_narration (most frequent member)
    member_narrations: list[str]  # all narrations merged into this cluster
    count: int  # total transaction count across all members
    total_amount: int  # sum of ABS(amount) in kobo


class ClustersResponse(BaseModel):
    clusters: list[ClusterItem]
    total_uncategorised: int  # total uncategorised transaction count for progress display


class ClusterCategorizeRequest(BaseModel):
    cluster_key: str
    category_id: UUID


class ClusterCategorizeResponse(BaseModel):
    updated_count: int


class CategorySuggestion(BaseModel):
    category_id: UUID
    category_name: str
    confidence: int  # 0-100
    source: str  # "exact_match" | "global_merchant" | "keyword" | "heuristic"


class ReviewQueueItem(BaseModel):
    transaction: TransactionResponse
    suggestions: list[CategorySuggestion]
    remaining_count: int  # uncategorised transactions still in the queue


class ConfirmCategoryRequest(BaseModel):
    category_id: UUID | None = None  # required for debits; optional for credits
