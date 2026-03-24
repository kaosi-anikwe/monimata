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
Pydantic schemas for the /bills endpoints (Interswitch Quickteller).

Money is always in kobo.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# ── Discovery ─────────────────────────────────────────────────────────────────


class BillerCategory(BaseModel):
    """Biller category returned by GET /bills/categories."""

    id: str
    name: str
    description: str | None = None
    picture_id: str | None = None


class Biller(BaseModel):
    """A single biller returned by GET /bills/billers."""

    id: str
    name: str
    short_name: str | None = None
    category_id: str | None = None
    picture_id: str | None = None


class PaymentItem(BaseModel):
    """
    A payment item (service) for a biller, returned by GET /bills/billers/{id}/items.
    The payment_code is what the customer-validation and payment endpoints need.
    """

    id: str
    name: str
    payment_code: str
    is_amount_fixed: bool = False
    # kobo; None means the user can enter a free amount.
    fixed_amount: int | None = None
    currency_code: str = "NGN"


# ── Customer validation ───────────────────────────────────────────────────────


class ValidateCustomerRequest(BaseModel):
    payment_code: str
    customer_id: str


class CustomerValidationResponse(BaseModel):
    customer_id: str
    customer_name: str
    is_amount_fixed: bool = False
    # kobo; present only when the biller fixes the amount.
    fixed_amount: int | None = None
    biller_name: str | None = None
    response_code: str = "00"
    response_description: str = "Successful"


# ── Payment ───────────────────────────────────────────────────────────────────


class BillPayRequest(BaseModel):
    payment_code: str = Field(
        description="ISW PaymentCode for the selected biller service."
    )
    customer_id: str = Field(description="Customer's meter/smartcard/account number.")
    # Kobo.  Must match the fixed_amount from customer validation when the biller
    # uses a fixed amount, or be a positive user-entered value otherwise.
    amount: int = Field(gt=0, description="Amount in kobo.")
    account_id: str = Field(
        description="UUID of the user's linked bank account being debited."
    )
    customer_mobile: str | None = None
    customer_email: str | None = None
    # MoniMata budget category the payment should be charged to.
    category_id: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_kobo(cls, v: int) -> int:
        # Minimum ₦1 = 100 kobo to guard against accidentally passing Naira values.
        if v < 100:
            raise ValueError("amount must be at least 100 kobo (₦1)")
        return v


class BillPayResponse(BaseModel):
    """Returned on successful payment, representing the created Transaction."""

    id: str  # MoniMata transaction UUID
    reference: str  # ISW requestReference
    status: str  # "success" | "pending"
    amount: int  # kobo (negative — debit)
    narration: str
    date: datetime
    category_id: str | None = None
    account_id: str

    model_config = {"from_attributes": True}


class PaymentStatusResponse(BaseModel):
    reference: str
    status: str
    response_code: str
    response_description: str


class BillHistoryItem(BaseModel):
    """Single item in GET /bills/history."""

    id: str
    reference: str
    narration: str
    amount: int  # kobo (negative)
    date: datetime
    category_id: str | None = None
    account_id: str

    model_config = {"from_attributes": True}
