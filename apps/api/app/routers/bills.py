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
Bills router — Interswitch Quickteller bill payment.

Flow for a single payment:
  1. GET  /bills/categories            → user picks a biller category
  2. GET  /bills/billers?category_id=  → user picks a biller
  3. GET  /bills/billers/{id}/items    → user picks a payment item (PaymentCode)
  4. POST /bills/validate              → validate customer ID, get name + fixed amount
  5. POST /bills/pay                   → execute payment; creates Transaction immediately
  6. GET  /bills/pay/{ref}/status      → poll ISW status for a pending payment
  7. GET  /bills/history               → user's past bill payments (source="interswitch")

Security:
  - All endpoints require a valid JWT (get_current_user).
  - POST /bills/pay additionally requires identity_verified (get_verified_user).
  - Row-level isolation: history queries always filter by user_id.

Budget integration:
  - On successful payment, budget_months.activity is decremented by the payment
    amount so that the user's category available balance drops in real time
    without waiting for Mono's 24-hour sync window.
  - When Mono eventually syncs the same bank debit, fetch_transactions already
    contains dedup logic (_find_duplicate) to prevent a double-entry.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.user import User
from app.core.database import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.bank_account import BankAccount
from app.core.deps import get_current_user, get_verified_user
from app.schemas.bills import (
    BillerCategory,
    Biller,
    BillHistoryItem,
    BillPayRequest,
    BillPayResponse,
    CustomerValidationResponse,
    PaymentItem,
    PaymentStatusResponse,
    ValidateCustomerRequest,
)
from app.services.interswitch_client import interswitch_client
from app.services.budget_logic import get_or_create_budget_month

logger = logging.getLogger(__name__)

router = APIRouter()

# ISW response codes that indicate a payment was accepted (synchronous success
# *or* queued for async processing).
_ISW_SUCCESS_CODES = {"00", "90000"}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _month_for(dt: datetime) -> str:
    """Return "YYYY-MM" string for the given datetime."""
    return dt.strftime("%Y-%m")


def _parse_biller_category(raw: dict) -> BillerCategory:
    return BillerCategory(
        id=str(raw.get("categoryId") or raw.get("id", "")),
        name=str(raw.get("categoryName") or raw.get("name", "")),
        description=raw.get("description"),
        picture_id=raw.get("pictureId"),
    )


def _parse_biller(raw: dict) -> Biller:
    return Biller(
        id=str(raw.get("id") or raw.get("billerId", "")),
        name=str(raw.get("name") or raw.get("billerName", "")),
        short_name=raw.get("shortName"),
        category_id=str(raw.get("categoryId", "")) or None,
        picture_id=raw.get("pictureId"),
    )


def _parse_payment_item(raw: dict) -> PaymentItem:
    amount_str = raw.get("amount") or raw.get("itemFee")
    fixed_amount: int | None = None
    is_fixed = bool(raw.get("isAmountFixed") or raw.get("isFixed"))
    if is_fixed and amount_str:
        try:
            fixed_amount = int(amount_str)
        except (TypeError, ValueError):
            pass
    return PaymentItem(
        id=str(raw.get("id", "")),
        name=str(raw.get("paymentItemName") or raw.get("Name") or raw.get("name", "")),
        payment_code=str(raw.get("paymentCode") or raw.get("PaymentCode", "")),
        is_amount_fixed=is_fixed,
        fixed_amount=fixed_amount,
        currency_code=raw.get("currencyCode", "NGN"),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get(
    "/categories",
    response_model=list[BillerCategory],
    summary="List ISW biller categories",
)
async def list_biller_categories(
    _: User = Depends(get_current_user),
) -> list[BillerCategory]:
    """
    Returns all Quickteller biller categories (Electricity, Airtime, Cable TV, …).
    Results come directly from Interswitch and are not cached locally; the client
    should cache them for reasonable periods (e.g., 1 hour).
    """
    try:
        raw = await interswitch_client.get_biller_categories()
    except httpx.HTTPStatusError as exc:
        logger.error("ISW get_biller_categories failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch biller categories from payment provider.",
        )
    return [_parse_biller_category(r) for r in raw]


@router.get(
    "/billers",
    response_model=list[Biller],
    summary="List billers in a category",
)
async def list_billers(
    category_id: str = Query(
        ..., description="Biller category ID from /bills/categories"
    ),
    _: User = Depends(get_current_user),
) -> list[Biller]:
    """Returns the billers available under the given category."""
    try:
        raw = await interswitch_client.get_billers_by_category(category_id)
    except httpx.HTTPStatusError as exc:
        logger.error("ISW get_billers_by_category failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch billers from payment provider.",
        )
    return [_parse_biller(r) for r in raw]


@router.get(
    "/billers/{biller_id}/items",
    response_model=list[PaymentItem],
    summary="List payment items for a biller",
)
async def list_payment_items(
    biller_id: str,
    _: User = Depends(get_current_user),
) -> list[PaymentItem]:
    """
    Returns the payment items (services) for a given biller.
    Each item has a payment_code used in the validate and pay steps.
    Many billers have a single item; some (e.g. electricity) have Prepaid and
    Postpaid variants.
    """
    try:
        raw = await interswitch_client.get_biller_payment_items(biller_id)
    except httpx.HTTPStatusError as exc:
        logger.error("ISW get_biller_payment_items(%s) failed: %s", biller_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch payment items from payment provider.",
        )
    return [_parse_payment_item(r) for r in raw]


@router.post(
    "/validate",
    response_model=CustomerValidationResponse,
    summary="Validate a customer number",
)
async def validate_customer(
    body: ValidateCustomerRequest,
    _: User = Depends(get_current_user),
) -> CustomerValidationResponse:
    """
    Validates the customer's meter / smartcard / account number against
    Interswitch and returns the account holder's name and the fixed bill amount
    (where applicable).

    This is a read-only ISW call — no charge is made here.
    """
    try:
        result = await interswitch_client.validate_customer(
            body.payment_code, body.customer_id
        )
    except httpx.HTTPStatusError as exc:
        logger.error("ISW validate_customer failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Customer validation failed. Check the customer ID and try again.",
        )

    response_code: str = str(
        result.get("ResponseCode") or result.get("responseCode", "99")
    )
    if response_code not in _ISW_SUCCESS_CODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.get("ResponseDescription") or "Customer not found.",
        )

    amount_str = result.get("Amount") or result.get("amount")
    fixed_amount: int | None = None
    is_fixed = False
    if amount_str:
        try:
            fixed_amount = int(amount_str)
            is_fixed = fixed_amount > 0
        except (TypeError, ValueError):
            pass

    return CustomerValidationResponse(
        customer_id=str(result.get("CustomerId") or body.customer_id),
        customer_name=str(
            result.get("FullName")
            or result.get("CustomerName")
            or result.get("fullName")
            or "Customer"
        ),
        is_amount_fixed=is_fixed,
        fixed_amount=fixed_amount if is_fixed else None,
        biller_name=result.get("BillerName") or result.get("billerName"),
        response_code=response_code,
        response_description=str(
            result.get("ResponseDescription")
            or result.get("responseDescription", "Successful")
        ),
    )


@router.post(
    "/pay",
    response_model=BillPayResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute a bill payment",
)
async def pay_bill(
    body: BillPayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> BillPayResponse:
    """
    Initiates a bill payment via Interswitch Quickteller.

    On success:
    - A Transaction record is created immediately (source="interswitch") so the
      budget reflects the payment without waiting for Mono's 24-hour sync.
    - If category_id is provided, budget_months.activity is updated so the
      category's available balance drops in real time.

    Idempotency: the requestReference is a UUID generated server-side.  If the
    network drops after ISW accepts the request but before we respond, the client
    should use GET /bills/pay/{ref}/status with the reference from any partial
    response, or retry via GET /bills/history.

    Requires BVN identity_verified = true.
    """
    # Verify the requested account belongs to the caller.
    account: BankAccount | None = (
        db.query(BankAccount)
        .filter(
            BankAccount.id == body.account_id,
            BankAccount.user_id == current_user.id,
            BankAccount.is_active == True,
        )
        .first()
    )
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bank account not found or does not belong to you.",
        )

    # Verify the optional category belongs to the caller.
    if body.category_id:
        cat: Category | None = (
            db.query(Category)
            .filter(
                Category.id == body.category_id,
                Category.user_id == current_user.id,
            )
            .first()
        )
        if cat is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found or does not belong to you.",
            )

    request_reference = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    try:
        isw_result = await interswitch_client.initiate_payment(
            request_reference=request_reference,
            payment_code=body.payment_code,
            customer_id=body.customer_id,
            amount=body.amount,
            customer_mobile=body.customer_mobile or "",
            customer_email=body.customer_email or "",
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            "ISW initiate_payment failed (ref=%s, user=%s): %s",
            request_reference,
            current_user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment could not be processed by the payment provider. Please try again.",
        )

    response_code: str = str(
        isw_result.get("ResponseCode") or isw_result.get("responseCode") or "99"
    )
    if response_code not in _ISW_SUCCESS_CODES:
        logger.warning(
            "ISW payment rejected (ref=%s, code=%s): %s",
            request_reference,
            response_code,
            isw_result.get("ResponseDescription"),
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=isw_result.get("ResponseDescription")
            or "Payment was declined by the payment provider.",
        )

    # Build a human-readable narration from what we know.
    narration = f"Bill payment via Interswitch"

    # Create a Transaction record immediately — source="interswitch", debit.
    tx = Transaction(
        user_id=current_user.id,
        account_id=body.account_id,
        date=now,
        # Debits are stored as negative kobo values.
        amount=-body.amount,
        narration=narration,
        type="debit",
        source="interswitch",
        interswitch_ref=request_reference,
        category_id=body.category_id,
        is_manual=False,
    )
    db.add(tx)
    db.flush()  # get tx.id without committing

    # Update budget activity if a category was provided.
    if body.category_id:
        month_str = _month_for(now)
        bm = get_or_create_budget_month(
            db, current_user.id, body.category_id, month_str
        )
        # tx.amount is already negative, so adding it decreases available balance.
        bm.activity += tx.amount
        db.flush()

    db.commit()
    db.refresh(tx)

    payment_status = "pending" if response_code == "90000" else "success"

    return BillPayResponse(
        id=tx.id,
        reference=request_reference,
        status=payment_status,
        amount=tx.amount,
        narration=narration,
        date=tx.date,
        category_id=tx.category_id,
        account_id=tx.account_id,
    )


@router.get(
    "/pay/{reference}/status",
    response_model=PaymentStatusResponse,
    summary="Check payment status",
)
async def get_payment_status(
    reference: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaymentStatusResponse:
    """
    Queries Interswitch for the current status of a payment.  Use this to poll
    for payments that returned status="pending" from POST /bills/pay.

    Ownership check: the reference must correspond to a transaction that belongs
    to the calling user.
    """
    tx: Transaction | None = (
        db.query(Transaction)
        .filter(
            Transaction.interswitch_ref == reference,
            Transaction.user_id == current_user.id,
        )
        .first()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment reference not found.",
        )

    try:
        result = await interswitch_client.query_payment_status(reference)
    except httpx.HTTPStatusError as exc:
        logger.error("ISW query_payment_status(%s) failed: %s", reference, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not retrieve payment status from provider.",
        )

    response_code = str(
        result.get("ResponseCode") or result.get("responseCode") or "99"
    )
    human_status = "success" if response_code in _ISW_SUCCESS_CODES else "failed"

    return PaymentStatusResponse(
        reference=reference,
        status=human_status,
        response_code=response_code,
        response_description=str(
            result.get("ResponseDescription") or result.get("responseDescription") or ""
        ),
    )


@router.get(
    "/history",
    response_model=list[BillHistoryItem],
    summary="User's bill payment history",
)
def get_bill_history(
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BillHistoryItem]:
    """
    Returns the user's Interswitch bill payments, ordered by newest first.
    Only transactions with source="interswitch" are included.
    """
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.source == "interswitch",
        )
        .order_by(Transaction.date.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return [
        BillHistoryItem(
            id=tx.id,
            reference=tx.interswitch_ref or "",
            narration=tx.narration,
            amount=tx.amount,
            date=tx.date,
            category_id=tx.category_id,
            account_id=tx.account_id,
        )
        for tx in txs
    ]
