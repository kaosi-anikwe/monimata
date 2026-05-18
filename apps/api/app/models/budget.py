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
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.user import User


class BudgetMonth(Base):
    """
    One row per (user, category, month).
    month is stored as the first day of the month (Date) for B-Tree range performance.
    carried_over holds the closing available from the previous month (pre-computed).
    available is a derived property: carried_over + assigned + activity.
    """

    __tablename__ = "budget_months"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "month", name="uq_budget_months_user_cat_month"),
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
    month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    assigned: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # kobo
    activity: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0
    )  # kobo; signed — negative for net spending
    carried_over: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # kobo
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

    # relationships
    user: Mapped["User"] = relationship(back_populates="budget_months")
    category: Mapped["Category"] = relationship(back_populates="budget_months")

    @property
    def available(self) -> int:
        """Live available balance: carried_over + assigned + activity."""
        return self.carried_over + self.assigned + self.activity
