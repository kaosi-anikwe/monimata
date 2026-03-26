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
from typing import cast

import httpx

from sqlalchemy.orm import Session
from fastapi import (
    APIRouter,
    Depends,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import HTMLResponse

from app.models.user import User
from app.core.database import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.bank_account import BankAccount
from app.models.pending_bill_payment import PendingBillPayment
from app.core.deps import get_current_user, get_verified_user
from app.schemas.bills import (
    BillerCategory,
    Biller,
    BillHistoryItem,
    BillPayInitiateResponse,
    BillPayRequest,
    CustomerValidationResponse,
    PaymentItem,
    PaymentStatusResponse,
    ValidateCustomerRequest,
)
from app.services.interswitch_client import interswitch_client
from app.worker.celery_app import CeleryTask

logger = logging.getLogger(__name__)

router = APIRouter()

# ISW response codes that indicate a payment was accepted (synchronous success
# *or* queued for async processing).
_ISW_SUCCESS_CODES = {"00", "90000"}


def _enqueue_phase3(ref: str) -> None:
    """Enqueue the dispatch_bill_phase3 Celery task (lazy import avoids circulars)."""
    from app.worker.tasks import dispatch_bill_phase3

    cast(CeleryTask, dispatch_bill_phase3).delay(ref)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_biller_category(raw: dict) -> BillerCategory:
    return BillerCategory(
        id=str(raw.get("Id") or raw.get("id", "")),
        name=str(raw.get("Name") or raw.get("name", "")),
        description=raw.get("Description") or raw.get("description"),
        picture_id=raw.get("LogoUrl") or raw.get("pictureId"),
    )


def _parse_biller(raw: dict) -> Biller:
    return Biller(
        id=str(raw.get("Id") or raw.get("id", "")),
        name=str(raw.get("Name") or raw.get("name", "")),
        short_name=raw.get("ShortName") or raw.get("shortName"),
        category_id=str(raw.get("CategoryId") or raw.get("categoryId", "")) or None,
        picture_id=raw.get("LogoUrl") or raw.get("pictureId"),
    )


def _parse_payment_item(raw: dict) -> PaymentItem:
    amount_str = (
        raw.get("Amount")
        or raw.get("ItemFee")
        or raw.get("amount")
        or raw.get("itemFee")
    )
    fixed_amount: int | None = None
    is_fixed = bool(
        raw.get("IsAmountFixed") or raw.get("isAmountFixed") or raw.get("isFixed")
    )
    if is_fixed and amount_str:
        try:
            fixed_amount = int(amount_str)
        except (TypeError, ValueError):
            pass
    return PaymentItem(
        id=str(raw.get("Id") or raw.get("id", "")),
        name=str(raw.get("Name") or raw.get("name", "")),
        payment_code=str(raw.get("PaymentCode") or raw.get("paymentCode", "")),
        is_amount_fixed=is_fixed,
        fixed_amount=fixed_amount,
        currency_code=raw.get("CurrencyCode") or raw.get("currencyCode", "NGN"),
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
        # ISW customer validation does not return a customer name; leave as None.
        customer_name=None,
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
    response_model=BillPayInitiateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate a bill payment (Phase 1 → create pending record + checkout URL)",
)
async def pay_bill(
    body: BillPayRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_verified_user),
) -> BillPayInitiateResponse:
    """
    Phase 1 of the 3-phase Interswitch bill payment flow.

    Creates a PendingBillPayment record and returns a checkout_url that the
    client should open in an in-app WebView.  The actual payment collection and
    SendBillPaymentAdvice (Phase 3) happen asynchronously after the user
    completes the Web Checkout.

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

    ref = str(uuid.uuid4())

    pending = PendingBillPayment(
        user_id=current_user.id,
        ref=ref,
        payment_code=body.payment_code,
        customer_id=body.customer_id,
        customer_email=body.customer_email or "",
        customer_mobile=body.customer_mobile,
        biller_name=body.biller_name,
        account_id=body.account_id,
        category_id=body.category_id,
        amount=body.amount,
        state="PENDING_CHECKOUT",
    )
    db.add(pending)
    db.commit()

    checkout_url = str(request.url_for("checkout_redirect", ref=ref))
    return BillPayInitiateResponse(ref=ref, checkout_url=checkout_url)


@router.get(
    "/checkout/{ref}",
    response_class=HTMLResponse,
    include_in_schema=False,
)
def checkout_redirect(
    ref: str,
    request: Request,
    db: Session = Depends(get_db),
) -> HTMLResponse:
    """
    Serves an auto-submitting HTML form that POSTs the user's browser to the
    Interswitch Web Checkout page.

    Intentionally unauthenticated — the UUID ref (122 bits) acts as an opaque
    token.  Only works while state == PENDING_CHECKOUT to prevent replay.
    """
    pending: PendingBillPayment | None = (
        db.query(PendingBillPayment)
        .filter(
            PendingBillPayment.ref == ref,
            PendingBillPayment.state == "PENDING_CHECKOUT",
        )
        .first()
    )
    if pending is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment reference not found or already processed.",
        )

    callback_url = str(request.url_for("checkout_callback"))
    html = interswitch_client.build_checkout_html(
        ref=ref,
        amount_kobo=pending.amount,
        cust_email=pending.customer_email,
        site_redirect_url=callback_url,
    )
    return HTMLResponse(content=html)


@router.post(
    "/callback",
    include_in_schema=False,
)
async def checkout_callback(
    txnref: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> Response:
    """
    Interswitch Web Checkout redirect target.

    ISW POSTs the browser back here with `txnref` (or `txn_ref`) after payment.
    We enqueue Phase 3 dispatch and return a simple page so the user's browser
    (WebView) has something to display while the mobile app detects the URL
    change and transitions to the processing step.
    """
    ref = txnref
    if not ref:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    pending: PendingBillPayment | None = (
        db.query(PendingBillPayment).filter(PendingBillPayment.ref == ref).first()
    )
    if pending is None:
        logger.warning("checkout_callback: unknown ref=%s", ref)
        return Response(status_code=status.HTTP_200_OK)

    if pending.state == "PENDING_CHECKOUT":
        _enqueue_phase3(ref)
        logger.info("checkout_callback: enqueued phase3 for ref=%s", ref)

    return HTMLResponse(
        content="<!DOCTYPE html><html><head><meta charset='utf-8'></head>"
        "<body><p style='font-family:sans-serif;text-align:center;margin-top:40px;'>"
        "Payment received. Return to the app to check your status.</p></body></html>",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/verify/{ref}",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger Phase 3 dispatch after WebView checkout intercept",
)
def verify_payment(
    ref: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Called by the mobile app immediately after the WebView detects navigation
    to the callback URL.  Enqueues dispatch_bill_phase3 if not already running.

    Returns the current state of the pending payment.
    """
    pending: PendingBillPayment | None = (
        db.query(PendingBillPayment)
        .filter(
            PendingBillPayment.ref == ref,
            PendingBillPayment.user_id == current_user.id,
        )
        .first()
    )
    if pending is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment reference not found.",
        )

    if pending.state == "PENDING_CHECKOUT":
        _enqueue_phase3(ref)
        logger.info("verify_payment: enqueued phase3 for ref=%s", ref)

    return {"ref": ref, "state": pending.state}


@router.get(
    "/pay/{ref}/status",
    response_model=PaymentStatusResponse,
    summary="Poll payment state machine status",
)
def get_payment_status(
    ref: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaymentStatusResponse:
    """
    Returns the current state-machine status of a pending bill payment.

    Poll this endpoint until state is COMPLETED or FAILED.  When COMPLETED,
    the response also includes amount, narration, and date for the receipt.
    """
    pending: PendingBillPayment | None = (
        db.query(PendingBillPayment)
        .filter(
            PendingBillPayment.ref == ref,
            PendingBillPayment.user_id == current_user.id,
        )
        .first()
    )
    if pending is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment reference not found.",
        )

    resp = PaymentStatusResponse(ref=ref, state=pending.state)

    if pending.state == "COMPLETED" and pending.transaction_id:
        tx: Transaction | None = db.get(Transaction, pending.transaction_id)
        if tx:
            resp.amount = tx.amount
            resp.narration = tx.narration
            resp.date = tx.date

    return resp


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
