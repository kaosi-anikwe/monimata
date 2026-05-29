"""
Webhooks router — receives bank alert emails forwarded by the Cloudflare
email-worker.

CRITICAL: Always verify the shared secret before processing any payload.
"""

from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.user import User
from app.services.webhook import (
    handle_email_alert,
    handle_gmail_verification,
    handle_pdf_attachments,
    resolve_sender,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Endpoint ─────────────────────────────────────────────────────────────────


@router.post("/bank-alerts", status_code=status.HTTP_200_OK)
@limiter.limit("300/minute", key_func=get_remote_address)
async def bank_alert_webhook(
    request: Request,
    x_monimata_secret: str = Header(default="", alias="x-monimata-secret"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Receives parsed bank-alert emails forwarded by the Cloudflare email-worker.

    Payload shape (set by the email-worker):
        { "to": str, "from": str, "subject": str|null, "body": str|null, "html": str|null }
    """
    # ── Auth ──────────────────────────────────────────────────────────────────
    if not settings.BANK_ALERT_WEBHOOK_SECRET:
        logger.error("bank_alert_webhook: BANK_ALERT_WEBHOOK_SECRET is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Not configured"
        )

    if not secrets.compare_digest(x_monimata_secret, settings.BANK_ALERT_WEBHOOK_SECRET):
        logger.warning("bank_alert_webhook: invalid secret — rejected")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    # ── Parse payload ─────────────────────────────────────────────────────────
    data = await request.json()
    sender: str = (data.get("from") or "").strip()
    recipient: str = (data.get("to") or "").strip()
    body: str = data.get("body") or ""
    html: str = data.get("html") or ""

    attachments: list[dict] = data.get("attachments") or []
    pdf_attachments = [a for a in attachments if a.get("mimeType") == "application/pdf"]

    # ── Gmail forwarding-verification intercept ───────────────────────────────
    gmail_result = handle_gmail_verification(sender, recipient, body, html)
    if gmail_result is not None:
        return gmail_result

    # ── Resolve sender & recipient ────────────────────────────────────────────
    effective_sender = resolve_sender(sender, body)
    if effective_sender != sender:
        logger.info(
            "bank_alert_webhook: resolved forwarded sender %s → %s", sender, effective_sender
        )

    username = recipient.split("@")[0].lower() if "@" in recipient else ""
    if not username:
        logger.warning("bank_alert_webhook: unparseable recipient=%s", recipient)
        return {"status": "skipped", "reason": "invalid_recipient"}

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        logger.warning("bank_alert_webhook: no user for username=%s", username)
        return {"status": "skipped", "reason": "user_not_found"}

    # ── PDF bank statement attachments ────────────────────────────────────────
    if pdf_attachments:
        pdf_result = handle_pdf_attachments(db, pdf_attachments, user, effective_sender, body)
        if pdf_result is not None:
            return pdf_result

    # ── Email alert parsing ───────────────────────────────────────────────────
    return handle_email_alert(db, data, body, sender, effective_sender, recipient, user)
