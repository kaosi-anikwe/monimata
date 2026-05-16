# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AiCredentialCreate(BaseModel):
    provider: Literal["gemini", "openai", "anthropic"]
    api_key: str = Field(..., min_length=10, description="Plaintext API key — encrypted at rest")


class AiCredentialResponse(BaseModel):
    id: str
    provider: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AiUsageResponse(BaseModel):
    """AI efficiency monitor panel data (spec §8.3)."""

    # Categorisation breakdown
    total_categorised: int
    offline_categorised: int
    llm_categorised: int
    offline_success_rate: float  # 0.0-1.0
    llm_handled_pct: float  # 0.0-1.0

    # Current-month token usage
    current_month_calls: int
    current_month_prompt_tokens: int
    current_month_completion_tokens: int
    current_month_total_tokens: int

    # Lifetime token usage
    lifetime_calls: int
    lifetime_prompt_tokens: int
    lifetime_completion_tokens: int
    lifetime_total_tokens: int
