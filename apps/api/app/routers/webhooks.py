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
Webhooks router — receives Mono account update events.
CRITICAL: Always verify the Mono HMAC-SHA512 signature before processing.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.services.mono_client import verify_mono_webhook
from app.worker.tasks import fetch_transactions

logger = logging.getLogger(__name__)
router = APIRouter()


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
    account_id: str = payload.get("data", {}).get("account", {}).get("id", "")

    if event == "mono.events.account_updated" and account_id:
        fetch_transactions.delay(account_id)
        logger.info("Enqueued fetch_transactions for mono_account_id=%s", account_id)
    else:
        logger.info("Mono webhook event=%s — no action taken", event)

    return {"received": True}
