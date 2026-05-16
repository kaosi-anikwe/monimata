# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AiCredentialCreate(BaseModel):
    provider: Literal["gemini", "openai"]
    api_key: str = Field(..., min_length=10, description="Plaintext API key — encrypted at rest")


class AiCredentialResponse(BaseModel):
    id: str
    provider: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
