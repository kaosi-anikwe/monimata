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

import uuid
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import DateTime, Float, ForeignKey, Text, UniqueConstraint

from app.core.database import Base


class NarrationCategoryMap(Base):
    """
    User-verified mappings: narration pattern → category.
    Upserted every time a user re-categorizes a transaction.
    confidence=1.0 for explicit user assignments; <1.0 for ML predictions.
    """

    __tablename__ = "narration_category_map"
    __table_args__ = (
        UniqueConstraint("user_id", "narration_key", name="uq_narration_map_user_key"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    narration_key: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # normalized narration token
    category_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False,
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
