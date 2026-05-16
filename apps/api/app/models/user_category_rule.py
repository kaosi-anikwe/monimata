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

"""UserCategoryRule — Tier 1 exact-match cache for the categorisation pipeline.

Each row records that a specific cleaned_narration string (per user) maps to a
category.  Hit count and last_triggered are updated on every cache hit so the
data can later drive confidence weighting and staleness detection.

The unique constraint on (user_id, cleaned_narration) doubles as the composite
B-Tree index, keeping Tier 1 lookups at O(1) as row counts grow over the years.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserCategoryRule(Base):
    __tablename__ = "user_category_rules"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "cleaned_narration",
            name="uq_user_category_rule_user_narration",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Cleaned, lowercase, max-255-char narration key produced by clean_narration().
    cleaned_narration: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    # Incremented on each Tier 1 cache hit; used to surface high-confidence rules.
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_triggered: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
