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

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.nudge import Nudge
    from app.models.budget import BudgetMonth
    from app.models.transaction import Transaction
    from app.models.bank_account import BankAccount
    from app.models.category import Category, CategoryGroup

DEFAULT_NUDGE_SETTINGS = {
    "quiet_hours_start": "23:00",
    "quiet_hours_end": "07:00",
    "fatigue_limit": 3,
    "enabled": True,
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    first_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    last_login: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    nudge_settings: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=DEFAULT_NUDGE_SETTINGS
    )
    onboarded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    identity_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # relationships
    bank_accounts: Mapped[list["BankAccount"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    category_groups: Mapped[list["CategoryGroup"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    categories: Mapped[list["Category"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    budget_months: Mapped[list["BudgetMonth"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    nudges: Mapped[list["Nudge"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
