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
from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Text

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.category import Category


class CategoryTarget(Base):
    """
    One row per category — a category can have at most one target.

    ``frequency`` determines which UI tab created the target:
      - "weekly"   → assign/refill every week on a given day
      - "monthly"  → assign/refill every month by a given day
      - "yearly"   → assign/refill once per year by a given date
      - "custom"   → sinking-fund / one-off, optional repeat

    ``behavior`` describes what to do each period:
      - "set_aside" → assign the target_amount again (bills, subscriptions)
      - "refill"    → top up until available == target_amount (groceries, fun money)
      - "balance"   → ensure available never drops below target_amount

    Scheduling fields (only one is used per frequency):
      - day_of_week   0=Mon … 6=Sun          (weekly)
      - day_of_month  1-31, or 0 = last day  (monthly)
      - target_date   specific calendar date  (yearly / custom)

    ``repeats`` is only relevant for "custom" — weekly/monthly/yearly always repeat.
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
    # "weekly" | "monthly" | "yearly" | "custom"
    frequency: Mapped[str] = mapped_column(Text, nullable=False)
    # "set_aside" | "refill" | "balance"
    behavior: Mapped[str] = mapped_column(Text, nullable=False, default="set_aside")
    target_amount: Mapped[int] = mapped_column(BigInteger, nullable=False)  # kobo, > 0
    # Scheduling ─────────────────────────────────────────────────────────────
    day_of_week: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 0=Mon … 6=Sun; weekly only
    day_of_month: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 1-31; 0 = last day of month; monthly only
    target_date: Mapped[date | None] = mapped_column(
        Date, nullable=True
    )  # yearly / custom due date
    # Custom-only ─────────────────────────────────────────────────────────────
    repeats: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )  # custom frequency only; weekly/monthly/yearly always repeat
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
