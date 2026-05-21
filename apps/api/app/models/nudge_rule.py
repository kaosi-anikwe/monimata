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

import uuid
from datetime import UTC, datetime

from sqlalchemy import ARRAY, Boolean, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NudgeRule(Base):
    __tablename__ = "nudge_rules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # Human-readable slug; also doubles as the DSL "id" field (unique).
    slug: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    # Push notification title. Empty string = caller falls back to the slug.
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Group / family ID used for group-level rate limiting.
    gid: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Event types that trigger this rule e.g. ["debit_cat", "credit_cat"].
    evts: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    # How many days of historical transactions to look back for context hydration.
    days_back: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Root DSL conditions block: {"op": "AND"|"OR", "rules": [...]}
    conds: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Output definition: {"tmpls": ["template string 1", ...]}  (title lives in its own column)
    action: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
