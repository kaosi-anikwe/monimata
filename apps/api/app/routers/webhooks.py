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
Webhooks router — receives bank alert emails forwarded by the Cloudflare
email-worker.

CRITICAL: Always verify the shared secret before processing any payload.
"""

from __future__ import annotations

import logging
import secrets

import sentry_sdk
from fastapi import APIRouter, Header, HTTPException, Request, status

from app.core.config import settings
from app.services.bank_alert_parser import ParsedBankAlert, parse_bank_alert

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

    # TODO: match alert to a BankAccount and create/update a Transaction record,
    #       update BankAccount.last_synced_at, enqueue categorize_transactions,
    #       and notify the user via WebSocket.

    return {"status": "ok"}
