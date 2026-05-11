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
Webhooks router — receives Mono account update events and bank alert emails
forwarded by the Cloudflare email-worker.

CRITICAL: Always verify signatures / shared secrets before processing.
"""

from __future__ import annotations

import logging
import secrets
from typing import cast

import sentry_sdk
from fastapi import APIRouter, Header, HTTPException, Request, status

from app.core.config import settings
from app.services.bank_alert_parser import ParsedBankAlert, parse_bank_alert
from app.services.interswitch_client import verify_interswitch_webhook
from app.services.mono_client import verify_mono_webhook
from app.worker.celery_app import CeleryTask
from app.worker.tasks import fetch_transactions

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/bank-alerts", status_code=status.HTTP_200_OK)
async def bank_alert_webhook(
    request: Request,
    x_monimata_secret: str = Header(default="", alias="x-monimata-secret"),
) -> dict:
    """
    Receives parsed bank-alert emails forwarded by the Cloudflare email-worker.

    Security: constant-time comparison against BANK_ALERT_WEBHOOK_SECRET.
    The endpoint returns 403 (not 401) to avoid leaking auth scheme details.

    Payload shape (set by the email-worker):
        { "to": str, "from": str, "subject": str|null, "body": str|null, "html": str|null }
    """
    if not settings.BANK_ALERT_WEBHOOK_SECRET:
        logger.error("bank_alert_webhook: BANK_ALERT_WEBHOOK_SECRET is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Not configured"
        )

    if not secrets.compare_digest(x_monimata_secret, settings.BANK_ALERT_WEBHOOK_SECRET):
        logger.warning("bank_alert_webhook: invalid secret — rejected")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    data = await request.json()
    sender: str = data.get("from") or ""
    recipient: str = data.get("to") or ""
    body: str = data.get("body") or ""

    alert: ParsedBankAlert | None = parse_bank_alert(body)

    if alert is None:
        sentry_sdk.set_context(
            "alert_details",
            {"subject": data.get("subject"), "sender": sender, "recipient": recipient},
        )
        sentry_sdk.capture_message("Regex parsing failed for bank alert email", level="warning")
        logger.warning(
            "bank_alert_webhook: parsing failed — from=%s subject=%s",
            sender,
            data.get("subject"),
        )
        return {"status": "skipped", "reason": "parsing_failed"}

    alert.sender_email = sender
    logger.info(
        "bank_alert_webhook: parsed %s of %d kobo from %s (acct last4=%s)",
        alert.transaction_type,
        alert.amount_kobo,
        sender,
        alert.account_last4,
    )

    # TODO: match alert to a BankAccount and create/update a Transaction record.

    return {"status": "ok"}


@router.post("/mono", status_code=status.HTTP_200_OK)
async def mono_webhook(
    request: Request,
    mono_webhook_secret: str = Header(..., alias="mono-webhook-secret"),
) -> dict:
    """
    Mono fires this when a connected account's data changes.
    We verify the signature and enqueue a fetch_transactions Celery task.
    """
    raw_body = await request.body()

    if not verify_mono_webhook(raw_body, mono_webhook_secret):
        logger.warning("Mono webhook received with invalid signature — rejected")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature"
        )

    payload = await request.json()
    event = payload.get("event", "")
    account_id: str = payload.get("data", {}).get("account", {}).get("_id", "")

    if event == "mono.events.account_updated" and account_id:
        cast(CeleryTask, fetch_transactions).delay(account_id)
        logger.info(f"webhook: Enqueued fetch_transactions for mono_account_id={account_id}")

    if event == "mono.events.reauthorisation_required" and account_id:
        # Set account.requires_reauth to True to reauthorize manually

        from app.core.database import SessionLocal
        from app.models.bank_account import BankAccount

        db = SessionLocal()
        try:
            account: BankAccount | None = (
                db.query(BankAccount)
                .filter(
                    BankAccount.mono_account_id == account_id,
                    BankAccount.is_active,
                )
                .first()
            )

            if not account:
                logger.warning(f"webhook: account not found for mono_id={account_id}")
            else:
                account.requires_reauth = True
                db.commit()
        except Exception:
            db.rollback()
            logger.exception("webhook: Failed to update account record")
        finally:
            db.close()

        logger.info(f"webhook: Reauthorization required for mono_account_id={account_id}")

    if event == "mono.events.account_unlinked" and account_id:
        # TODO: send push notification
        logger.info(f"webhook: Account unlinked for mono_account_id={account_id}")

    if event == "mono.events.account_connected":
        payload.get("data", {}).get("id", "")
        mono_account_id: str = payload.get("data", {}).get("id", "")
        # TODO: send push notification
        logger.info(f"webhook: Account connected, mono_account_id={mono_account_id}")

    else:
        logger.info(f"webhook: Mono webhook event={event} — no action taken")

    return {"received": True}


@router.post("/interswitch", status_code=status.HTTP_200_OK)
async def interswitch_webhook(
    request: Request,
    x_interswitch_signature: str = Header(default="", alias="x-interswitch-signature"),
) -> dict:
    """
    Receives Interswitch TRANSACTION.COMPLETED webhook notifications.

    Security: the payload is verified against the HMAC-SHA512 signature in the
    ``x-interswitch-signature`` header before any processing occurs.

    We use this as a backup trigger for Phase 3 dispatch — the primary trigger
    is POST /bills/verify/{ref} called by the mobile app after the WebView
    detects the callback redirect.

    Idempotency: dispatch_bill_phase3 checks the current state before acting,
    so duplicate events are safe.

    ISW payload shape (TRANSACTION.COMPLETED):
    {
      "event": "TRANSACTION.COMPLETED",
      "data": {
        "merchantReference": "<our txn_ref>",
        "responseCode": "00",
        "responseDescription": "Approved by Financial Institution",
        ...
      }
    }
    """
    raw_body = await request.body()

    if not verify_interswitch_webhook(raw_body, x_interswitch_signature):
        logger.warning("Interswitch webhook received with invalid signature — rejected")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    payload = await request.json()
    event: str = payload.get("event") or ""
    data: dict = payload.get("data") or {}

    # The merchant-assigned reference is in data.merchantReference.
    # This is what we passed as txn_ref when building the checkout form.
    txn_ref: str = data.get("merchantReference") or ""
    response_code: str = data.get("responseCode") or ""

    logger.info(
        "interswitch_webhook: event=%s merchantReference=%s responseCode=%s",
        event,
        txn_ref,
        response_code,
    )

    # Only dispatch Phase 3 for a confirmed successful payment.
    if event == "TRANSACTION.COMPLETED" and response_code == "00" and txn_ref:
        from app.core.database import SessionLocal
        from app.models.pending_bill_payment import PendingBillPayment
        from app.worker.tasks import dispatch_bill_phase3

        db = SessionLocal()
        try:
            pending = db.query(PendingBillPayment).filter(PendingBillPayment.ref == txn_ref).first()
            if pending and pending.state == "PENDING_CHECKOUT":
                cast(CeleryTask, dispatch_bill_phase3).delay(txn_ref)
                logger.info("interswitch_webhook: enqueued phase3 for ref=%s", txn_ref)
        finally:
            db.close()

    return {"received": True}
