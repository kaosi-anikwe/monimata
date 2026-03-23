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
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.category import Category


class BudgetMonth(Base):
    """
    One row per (user, category, month).
    `available` is NEVER stored — always computed as assigned - activity.
    month is stored as 'YYYY-MM' string for simplicity.
    """

    __tablename__ = "budget_months"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "category_id", "month", name="uq_budget_months_user_cat_month"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id"), nullable=False
    )
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # "YYYY-MM"
    assigned: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # kobo
    activity: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0
    )  # kobo; sum of debits (negative)
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
    user: Mapped["User"] = relationship(back_populates="budget_months")
    category: Mapped["Category"] = relationship(back_populates="budget_months")
