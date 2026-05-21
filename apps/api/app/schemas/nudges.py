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

"""Pydantic schemas for the nudge endpoints."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class NudgeTriggerType(StrEnum):
    nudge = "nudge"
    transaction_received = "transaction_received"
    statement_received = "statement_received"
    statement_processed = "statement_processed"
    receipt_received = "receipt_received"
    receipt_processed = "receipt_processed"
    receipt_failed = "receipt_failed"
    receipt_duplicate = "receipt_duplicate"
    statement_failed = "statement_failed"


class NudgeScreen(StrEnum):
    """Valid navigation targets for nudge press actions."""

    transactions = "transactions"
    transaction = "transaction"
    budget = "budget"
    target = "target"
    nudges = "nudges"
    accounts = "accounts"


# ── Context models ────────────────────────────────────────────────────────────
# The context JSONB is persisted on the Nudge row AND sent in the push
# notification data payload.  The same shape is available via GET /nudges.


class DSLNudgeContext(BaseModel):
    """Context for DSL-driven behavioural nudges (trigger_type == "nudge")."""

    nudge_type: str = Field(description="Rule slug, e.g. 'high_spend_pct'")
    slug: str = Field(description="Same as nudge_type")
    gid: str = Field(description="Group ID for theming, e.g. 'spend_alerts'")
    evt_type: str = Field(description="Event bucket: debit_cat, credit_uncat, etc.")
    screen: NudgeScreen = Field(description="Navigation target on press")
    transaction_id: str = Field(description="Triggering transaction UUID")
    category_id: str | None = Field(None, description="Budget category UUID")
    category_name: str | None = Field(None, description="Human-readable category name")
    amount_kobo: int = Field(description="Transaction amount in kobo (negative for debits)")
    match_count: int = Field(0, description="Historical txs matching the rule's count_where")
    spend_pct: float | None = Field(None, description="Budget usage ratio 0.0–1.0+")
    budget_amount_kobo: int | None = Field(None, description="Total assigned for the month")
    budget_remaining_kobo: int | None = Field(None, description="Budget remaining")


class OperationalNudgeContext(BaseModel):
    """Base context for operational notifications."""

    nudge_type: str = Field(description="Same as trigger_type")
    screen: NudgeScreen = Field(description="Navigation target on press")
    bank_name: str | None = Field(None, description="Display name of the bank")
    # Optional fields present on specific trigger types
    transaction_id: str | None = Field(None, description="Related transaction UUID")
    amount_kobo: int | None = Field(None, description="Amount in kobo")
    amount_naira: str | None = Field(None, description="Formatted naira string")
    direction: str | None = Field(None, description="'credit' or 'debit'")
    imported: int | None = Field(None, description="Number of imported transactions")
    updated: int | None = Field(None, description="Number of updated transactions")
    reason: str | None = Field(
        None, description="Failure reason: 'unrecognised', 'no_account', 'parse_failed'"
    )


# ── Push data model ──────────────────────────────────────────────────────────
# The push data dict includes the full context plus canonical routing fields.


class NudgePushData(BaseModel):
    """Shape of the ``data`` dict inside the push notification payload.

    Includes the full nudge context plus canonical routing fields
    (``trigger_type``, ``nudge_id``, ``nudge_type``, ``screen``).
    The same context is available via ``GET /nudges``.
    """

    trigger_type: str = Field(description="'nudge' for DSL, or operational type")
    nudge_id: str = Field(description="UUID of the persisted Nudge row")
    nudge_type: str = Field(description="Rule slug (DSL) or trigger_type (operational)")
    screen: NudgeScreen = Field(description="Navigation target on press")
    category_id: str | None = Field(None, description="Present when nudge has a category")
    transaction_id: str | None = Field(None, description="Present for transaction-linked nudges")


class NudgeResponse(BaseModel):
    id: str
    trigger_type: NudgeTriggerType
    title: str | None
    message: str
    context: dict[str, Any] | None = None
    category_id: str | None = None
    is_opened: bool
    is_dismissed: bool
    delivered_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NudgeListResponse(BaseModel):
    nudges: list[NudgeResponse]
    total: int
    unread_count: int  # delivered + not opened + not dismissed


class NudgeSettingsUpdate(BaseModel):
    enabled: bool | None = None
    quiet_hours_start: str | None = Field(
        None,
        pattern=r"^\d{2}:\d{2}$",
        description="HH:MM format, e.g. '23:00'",
    )
    quiet_hours_end: str | None = Field(
        None,
        pattern=r"^\d{2}:\d{2}$",
        description="HH:MM format, e.g. '07:00'",
    )
    fatigue_limit: int | None = Field(None, ge=1, le=10)
    language: str | None = Field(None, pattern=r"^(pidgin|formal)$")


class NudgeSettingsResponse(BaseModel):
    enabled: bool
    quiet_hours_start: str
    quiet_hours_end: str
    fatigue_limit: int
    language: str


class RegisterDeviceRequest(BaseModel):
    token: str = Field(
        ...,
        min_length=1,
        description="Expo push token ('ExponentPushToken[...]')",
    )


class TestTriggerRequest(BaseModel):
    trigger_type: NudgeTriggerType
    category_id: str | None = None
