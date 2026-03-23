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

from app.models.user import User
from app.models.category import Category
from app.models.bank_account import BankAccount

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text

if TYPE_CHECKING:
    from app.models.recurring_rule import RecurringRule

from app.core.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("bank_accounts.id"), nullable=False
    )
    mono_id: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    amount: Mapped[int] = mapped_column(
        BigInteger, nullable=False
    )  # kobo; negative=debit, positive=credit
    narration: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # "debit" | "credit"
    balance_after: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id"), nullable=True
    )
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_split: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="mono"
    )  # "mono" | "interswitch" | "manual"
    interswitch_ref: Mapped[str | None] = mapped_column(
        Text, unique=True, nullable=True
    )
    recurrence_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("recurring_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
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
    user: Mapped[User] = relationship(back_populates="transactions")
    account: Mapped[BankAccount] = relationship(back_populates="transactions")
    category: Mapped[Category | None] = relationship(back_populates="transactions")
    splits: Mapped[list[TransactionSplit]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )
    recurring_rule: Mapped["RecurringRule | None"] = relationship(
        back_populates="transactions"
    )


class TransactionSplit(Base):
    __tablename__ = "transaction_splits"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    transaction_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
    )
    category_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id"), nullable=False
    )
    amount: Mapped[int] = mapped_column(
        BigInteger, nullable=False
    )  # kobo; positive only
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    # relationships
    transaction: Mapped[Transaction] = relationship(back_populates="splits")
    category: Mapped[Category] = relationship()
