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

"""
PendingBillPayment — tracks the 3-phase Interswitch bill payment lifecycle.

State machine:
  PENDING_CHECKOUT
      → CHECKOUT_VERIFIED   (Web Checkout confirmed server-side)
      → BILL_DISPATCHED     (SendBillPaymentAdvice accepted by ISW)
      → COMPLETED           (transaction created; budget updated)
      → FAILED              (all retries exhausted)
      → REFUNDED            (Web Checkout amount returned to payer)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Text

from app.core.database import Base


class PendingBillPayment(Base):
    __tablename__ = "pending_bill_payments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # ── Ownership ─────────────────────────────────────────────────────────────
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Idempotency / Web Checkout key ────────────────────────────────────────
    # This is the txn_ref sent to Interswitch Web Checkout.  Must be globally
    # unique.  Also serves as the polling handle on GET /bills/pay/{ref}/status.
    ref: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)

    # ── VAS biller details (needed for Phase 3 SendBillPaymentAdvice) ─────────
    payment_code: Mapped[str] = mapped_column(Text, nullable=False)
    customer_id: Mapped[str] = mapped_column(Text, nullable=False)
    customer_email: Mapped[str] = mapped_column(Text, nullable=False, default="")
    customer_mobile: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Human-readable biller name, used in transaction narration and nudges.
    biller_name: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Budget / account linkage ──────────────────────────────────────────────
    account_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("bank_accounts.id"), nullable=False
    )
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id"), nullable=True
    )

    # ── Payment amount ────────────────────────────────────────────────────────
    # Kobo; always positive (debit direction is implicit).
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # ── State machine ─────────────────────────────────────────────────────────
    state: Mapped[str] = mapped_column(
        Text, nullable=False, default="PENDING_CHECKOUT", index=True
    )
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Linked transaction (set when state=COMPLETED) ─────────────────────────
    transaction_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("transactions.id"), nullable=True
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
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
