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
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.bank_account import BankAccount
    from app.models.budget import BudgetMonth
    from app.models.category import Category, CategoryGroup
    from app.models.nudge import Nudge
    from app.models.recurring_rule import RecurringRule
    from app.models.transaction import Transaction

DEFAULT_NUDGE_SETTINGS = {
    "quiet_hours_start": "23:00",
    "quiet_hours_end": "07:00",
    "fatigue_limit": 3,
    "enabled": True,
    "language": "pidgin",
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    nudge_settings: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=DEFAULT_NUDGE_SETTINGS
    )
    onboarded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    expo_push_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_streak_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # relationships
    bank_accounts: Mapped[list[BankAccount]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    transactions: Mapped[list[Transaction]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    category_groups: Mapped[list[CategoryGroup]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    categories: Mapped[list[Category]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    budget_months: Mapped[list[BudgetMonth]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    nudges: Mapped[list[Nudge]] = relationship(back_populates="user", cascade="all, delete-orphan")
    recurring_rules: Mapped[list[RecurringRule]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
