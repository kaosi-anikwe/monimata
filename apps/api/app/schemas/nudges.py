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
from typing import Any

from pydantic import BaseModel, Field


class NudgeResponse(BaseModel):
    id: str
    trigger_type: str
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
    trigger_type: str = Field(
        ...,
        description=(
            "One of: threshold_80, threshold_100, large_single_tx, pay_received, bill_payment"
        ),
    )
    category_id: str | None = None
