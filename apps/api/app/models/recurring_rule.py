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
from typing import TYPE_CHECKING, Any
from datetime import date, datetime, timezone

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
)

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.transaction import Transaction


class RecurringRule(Base):
    """
    Template for auto-generating transactions on a schedule.

    Generation strategy: lazy — the server inspects ``next_due`` on every sync
    pull.  For each rule where ``next_due <= today`` we create a transaction
    instance, then advance ``next_due`` according to the frequency until it is
    in the future.  This means a user who hasn't synced in 3 months will see
    catch-up transactions generated in one pull.

    ``frequency`` options:
      - "daily"     — every day
      - "weekly"    — every N weeks on ``day_of_week``
      - "biweekly"  — every 2 weeks on ``day_of_week``
      - "monthly"   — every N months on ``day_of_month`` (0 = last day)
      - "yearly"    — every N years on the calendar date of ``next_due``
      - "custom"    — every ``interval`` days

    ``template`` (JSONB) contains the fields used to create each transaction
    instance:
      {
        "account_id": "<uuid>",
        "amount":     <kobo>,          # negative=debit, positive=credit
        "narration":  "<string>",
        "type":       "debit"|"credit",
        "category_id": "<uuid>"|null,
        "memo":       "<string>"|null
      }

    ``ends_on`` — optional hard stop date; null = repeats indefinitely.
    ``is_active`` — soft-pause without deleting the rule.
    """

    __tablename__ = "recurring_rules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    frequency: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # daily | weekly | biweekly | monthly | yearly | custom
    interval: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )  # every N units of frequency; 1 for most
    day_of_week: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 0=Mon … 6=Sun; weekly / biweekly only
    day_of_month: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 1-31; 0 = last day; monthly only
    next_due: Mapped[date] = mapped_column(
        Date, nullable=False
    )  # date of the next transaction to generate
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    template: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
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
    user: Mapped["User"] = relationship(back_populates="recurring_rules")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="recurring_rule"
    )
