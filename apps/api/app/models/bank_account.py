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
from typing import TYPE_CHECKING, Any
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.transaction import Transaction


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Nullable — manual accounts have no Mono ID.
    # Uniqueness is enforced by a partial index (see migration 0008).
    mono_account_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    institution: Mapped[str] = mapped_column(Text, nullable=False)
    account_name: Mapped[str] = mapped_column(Text, nullable=False)
    # User-defined display name — always editable, overrides account_name in the UI
    alias: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Full 10-digit NUBAN, stored AES-256-GCM encrypted
    account_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    bank_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "SAVINGS" | "CURRENT"
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="NGN")
    balance: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # kobo
    # Balance before our earliest imported transaction (kobo).
    # displayed_balance = starting_balance + SUM(transactions.amount)
    starting_balance: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # Timestamp of the last manual balance update (manual accounts only)
    balance_as_of: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Append-only JSONB audit log: [{amount, note, changed_at}, …]
    balance_adjustments: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # True when a live Mono account_id is attached
    is_mono_linked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    unlinked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Preserved from last unlink; used for re-link recognition
    previous_mono_account_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    requires_reauth: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # NULL = live; non-NULL = soft-deleted
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # relationships
    user: Mapped["User"] = relationship(back_populates="bank_accounts")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
