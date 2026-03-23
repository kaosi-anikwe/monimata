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
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Nudge(Base):
    __tablename__ = "nudges"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    trigger_type: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # e.g. "threshold_80", "weekly_review"
    message: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id"), nullable=True
    )
    is_opened: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # NULL = queued
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # relationships
    user: Mapped["User"] = relationship(back_populates="nudges")
