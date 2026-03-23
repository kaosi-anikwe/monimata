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
from typing import TYPE_CHECKING
from datetime import date, datetime, timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Text

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.category import Category


class CategoryTarget(Base):
    """
    Target types:
      - "monthly_set_aside"  → assign X every month
      - "monthly_fill_up_to" → top up until available = X each month
      - "monthly_balance"    → keep at least X available at all times
      - "weekly_set_aside"   → assign X every week
      - "by_date"            → save X total by a specific date (sinking fund)
    """

    __tablename__ = "category_targets"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    category_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("categories.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)  # kobo
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    repeats: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    repeat_cadence: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # "monthly" | "quarterly" | "annually"
    on_refill: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # "set_aside_again" | "fill_up_to"
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

    # relationships
    category: Mapped["Category"] = relationship(back_populates="target")
