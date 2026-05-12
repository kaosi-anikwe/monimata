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
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.transaction import Transaction
    from app.models.user import User


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    institution: Mapped[str] = mapped_column(Text, nullable=False)
    account_name: Mapped[str] = mapped_column(Text, nullable=False)
    # User-defined display name — always editable, overrides account_name in the UI
    alias: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Full 10-digit NUBAN, stored AES-256-GCM encrypted
    account_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "SAVINGS" | "CURRENT"
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="NGN")
    balance: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # kobo
    # Balance before our earliest imported transaction (kobo).
    # displayed_balance = starting_balance + SUM(transactions.amount)
    starting_balance: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # Timestamp of the last manual balance update
    balance_as_of: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Append-only JSONB audit log: [{amount, note, changed_at}, …]
    balance_adjustments: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    # Timestamp of the last bank alert processed for this account
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # NULL = live; non-NULL = soft-deleted
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    # relationships
    user: Mapped["User"] = relationship(back_populates="bank_accounts")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
