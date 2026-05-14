"""
Webhooks router — receives bank alert emails forwarded by the Cloudflare
email-worker.

CRITICAL: Always verify the shared secret before processing any payload.
"""

from __future__ import annotations

import base64
import logging
import re
import secrets
from datetime import UTC, datetime
from typing import cast

import sentry_sdk
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.bank_account import BankAccount
from app.models.transaction import Transaction, TransactionSource
from app.models.user import User
from app.services.email_service import send_email
from app.services.ingestion import UnsupportedBankError, parse_email_alert
from app.services.ingestion.channels.email import probe_email_content
from app.services.ingestion.channels.statement import identify_statement
from app.services.ingestion.registry import get_bank_by_email_domain
from app.ws_manager import notify_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Matches the "From:" line inside a forwarded-message block, e.g.:
#   From: OPay <no-reply@opay-nigeria.com>
#   From: no-reply@opay-nigeria.com
_FORWARDED_FROM_RE = re.compile(
    r"^From:\s+(?:[^<\n]*<)?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?\s*$",
    re.MULTILINE,
)

# Gmail sends a confirmation email to new forwarding addresses.  We detect it
# by looking for the accounts.google.com confirmation URL.
_GMAIL_VERIFICATION_RE = re.compile(
    r"(https://mail\.google\.com/mail/vf-[^\s]+)",
    re.IGNORECASE,
)
# The requester address lives in the body: "anikwehenryasa@gmail.com has requested …"
_GMAIL_REQUESTER_RE = re.compile(
    r"^([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\s+has requested",
    re.MULTILINE,
)


def _resolve_sender(direct_sender: str, body: str) -> str:
    """
    Return the effective bank sender email.

    Three strategies, tried in order:

    1. Direct match — the webhook ``from`` field is already a known bank domain.
    2. Content probe — try all registered parsers against the body.  This is
       the primary path for auto-forwarded emails (Gmail CAF, Apple Mail
       forwarding, and any other service that rewrites the envelope sender),
       where the original bank domain is stripped from the outer From address.
       Only trusts a result when exactly one parser matches.
    3. Manual-forward scan — look for a ``From:`` header line inside a
       forwarded-message block (e.g. the Gmail
       "---------- Forwarded message ---------" block).  Handles users who
       manually forward alerts rather than setting up auto-forwarding.
    """
    # Strategy 1: direct match — the From address already belongs to a known bank.
    if get_bank_by_email_domain(direct_sender) is not None:
        return direct_sender

    # Strategy 2: content probe — try all registered parsers against the body.
    # Covers auto-forwarded emails where the outer From has been rewritten by
    # the forwarding service regardless of which email client was used.
    result = probe_email_content(body)
    if result is not None:
        _, representative_domain = result
        synthetic = f"no-reply@{representative_domain}"
        logger.debug(
            "_resolve_sender: content probe matched domain=%s for sender=%s",
            representative_domain,
            direct_sender,
        )
        return synthetic

    # Strategy 3: manual forward — look for a ``From:`` header inside a
    # forwarded-message block.
    for m in _FORWARDED_FROM_RE.finditer(body):
        candidate = m.group(1).lower()
        if get_bank_by_email_domain(candidate) is not None:
            logger.debug(
                "_resolve_sender: resolved forwarded sender %s → %s",
                direct_sender,
                candidate,
            )
            return candidate

    return direct_sender  # give up — caller will handle the mismatch


@router.post("/bank-alerts", status_code=status.HTTP_200_OK)
async def bank_alert_webhook(
    request: Request,
    x_monimata_secret: str = Header(default="", alias="x-monimata-secret"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Receives parsed bank-alert emails forwarded by the Cloudflare email-worker.

    Security: constant-time comparison against BANK_ALERT_WEBHOOK_SECRET.
    The endpoint returns 403 (not 401) to avoid leaking auth scheme details.

    Payload shape (set by the email-worker):
        { "to": str, "from": str, "subject": str|null, "body": str|null, "html": str|null }

    Processing pipeline:
        1. Verify shared secret.
        2. Parse body → ParsedBankAlert.
        3. Resolve recipient username → User.
        4. Resolve institution → BankAccount.
        5. Deduplicate via external_ref.
        6. Insert Transaction row.
        7. Update BankAccount.last_synced_at.
        8. Enqueue categorize_transactions Celery task.
        9. Notify user via WebSocket.
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
    sender: str = (data.get("from") or "").strip()
    recipient: str = (data.get("to") or "").strip()
    body: str = data.get("body") or ""
    html: str = data.get("html") or ""

    attachments: list[dict] = data.get("attachments") or []
    pdf_attachments = [a for a in attachments if a.get("mimeType") == "application/pdf"]

    # ── Gmail forwarding-verification intercept ───────────────────────────────
    # When a user adds <username>@moni-mata.ng as a Gmail forwarding address,
    # Google sends a confirmation email to that address.  Our mailbox has no
    # inbox, so we detect the email, extract the verification link, and forward
    # it to the requester so they can complete the setup.
    #
    # Hard early-exit on the known sender so we don't fall through to the bank
    # parser even if the link regex doesn't match (e.g. format change).
    if "forwarding-noreply@google.com" in sender.lower():
        logger.info(
            "bank_alert_webhook: Gmail forwarding email from %s — checking for verification link",
            sender,
        )
        # Verification link may live in HTML only; check both parts.
        link_match = _GMAIL_VERIFICATION_RE.search(body) or _GMAIL_VERIFICATION_RE.search(html)
    else:
        # For all other senders, only check the plain-text body.
        link_match = _GMAIL_VERIFICATION_RE.search(body)

    if link_match:
        verification_url = link_match.group(1)
        # Requester address may appear in body or html.
        requester_match = _GMAIL_REQUESTER_RE.search(body) or _GMAIL_REQUESTER_RE.search(html)
        requester = requester_match.group(1) if requester_match else sender

        logger.info(
            "bank_alert_webhook: Gmail forwarding verification for recipient=%s requester=%s",
            recipient,
            requester,
        )

        if requester:
            email_body = (
                f"Hi,\n\n"
                f"To complete Gmail forwarding setup to {recipient}, click the link below:\n\n"
                f"{verification_url}\n\n"
                f"If you did not request this, you can safely ignore this email.\n\n"
                f"— MoniMata"
            )
            sent = send_email(
                to=requester,
                subject="Complete your Gmail forwarding setup for MoniMata",
                body=email_body,
            )
            if not sent:
                logger.error(
                    "bank_alert_webhook: failed to forward Gmail verification to %s", requester
                )

        return {"status": "ok", "reason": "gmail_verification_forwarded"}

    # If the sender is a known Google infrastructure address but we couldn't
    # find a verification link, it's an unrecognised Google system email —
    # skip silently rather than letting it fall through to the bank parser.
    if "forwarding-noreply@google.com" in sender.lower():
        logger.info(
            "bank_alert_webhook: unrecognised Google system email from=%s — skipped", sender
        )
        return {"status": "skipped", "reason": "google_system_email"}

    # When the email has been forwarded from a personal inbox (e.g. Gmail),
    # the direct sender is the user's address, not the bank's.  Extract the
    # original bank sender from the forwarded-message header in the body.
    effective_sender = _resolve_sender(sender, body)
    if effective_sender != sender:
        logger.info(
            "bank_alert_webhook: resolved forwarded sender %s → %s", sender, effective_sender
        )

    # ── PDF bank statement attachments ───────────────────────────────────────
    # Processed before the email-alert path.  If any attachment is recognised
    # as a bank statement, ownership is verified then the heavy lifting is
    # offloaded to the process_bank_statement Celery task so the webhook
    # returns immediately.
    if pdf_attachments:
        for att in pdf_attachments:
            try:
                pdf_bytes = base64.b64decode(att["content"])
            except Exception:
                logger.warning("bank_alert_webhook: could not decode PDF attachment")
                continue

            result = identify_statement(pdf_bytes, body)
            if result is None:
                continue  # not a recognised statement; try next attachment

            account_number, bank_slug = result

            # Resolve recipient → User
            username = recipient.split("@")[0].lower() if "@" in recipient else ""
            if not username:
                logger.warning("bank_alert_webhook: unparseable recipient=%s", recipient)
                return {"status": "skipped", "reason": "invalid_recipient"}

            user = db.query(User).filter(User.username == username).first()
            if user is None:
                logger.warning("bank_alert_webhook: no user for username=%s", username)
                return {"status": "skipped", "reason": "user_not_found"}

            # Verify ownership: find the bank account whose decrypted number matches
            # the statement.  Prevents importing another person's statement.
            from app.core.security import decrypt_pii

            account = None
            for candidate in (
                db.query(BankAccount)
                .filter(
                    BankAccount.user_id == str(user.id),
                    BankAccount.bank_slug == bank_slug,
                    BankAccount.deleted_at.is_(None),
                )
                .all()
            ):
                if candidate.account_number is None:
                    continue
                try:
                    if decrypt_pii(candidate.account_number) == account_number:
                        account = candidate
                        break
                except Exception:
                    logger.warning(
                        "bank_alert_webhook: could not decrypt account_number for account=%s",
                        candidate.id,
                    )

            if account is None:
                logger.warning(
                    "bank_alert_webhook: no %s account matching number=%s for user=%s",
                    bank_slug,
                    account_number[-4:],
                    user.id,
                )
                return {"status": "skipped", "reason": "account_not_found"}

            # Notify user that the statement arrived, then dispatch processing.
            try:
                from app.services.nudge_engine import send_statement_received_push

                send_statement_received_push(
                    user=user, bank_name=bank_slug.replace("_", " ").title()
                )
            except Exception:
                logger.exception("bank_alert_webhook: send_statement_received_push failed")

            filename = att.get("filename") or f"{bank_slug}_statement.pdf"
            pdf_b64 = base64.b64encode(pdf_bytes).decode()
            try:
                from app.worker.celery_app import CeleryTask
                from app.worker.tasks import process_bank_statement

                cast(CeleryTask, process_bank_statement).delay(
                    pdf_b64, filename, bank_slug, str(account.id), str(user.id)
                )
            except Exception:
                logger.exception("bank_alert_webhook: failed to enqueue process_bank_statement")
                return {"status": "error", "reason": "task_enqueue_failed"}

            logger.info(
                "bank_alert_webhook: statement queued bank=%s account=%s user=%s",
                bank_slug,
                account.id,
                user.id,
            )
            return {"status": "accepted"}

    # ── 1. Parse the email body ───────────────────────────────────────────────

    try:
        alert = parse_email_alert(body, sender=effective_sender)
    except UnsupportedBankError:
        logger.warning("bank_alert_webhook: unsupported bank sender=%s", effective_sender)
        return {"status": "skipped", "reason": "unsupported_bank"}
    except ValueError:
        sentry_sdk.set_context(
            "alert_details",
            {"subject": data.get("subject"), "sender": sender, "recipient": recipient},
        )
        sentry_sdk.capture_message("Email parser failed for bank alert", level="warning")
        logger.warning(
            "bank_alert_webhook: parsing failed — from=%s subject=%s",
            sender,
            data.get("subject"),
        )
        return {"status": "skipped", "reason": "parsing_failed"}
    logger.info(
        "bank_alert_webhook: parsed %s of %d kobo from=%s ref=%s",
        alert.transaction_type,
        alert.amount_kobo,
        sender,
        alert.transaction_ref,
    )

    # ── 2. Resolve recipient address → User ───────────────────────────────────

    # Expected format: <username>@moni-mata.ng
    username = recipient.split("@")[0].lower() if "@" in recipient else ""
    if not username:
        logger.warning("bank_alert_webhook: unparseable recipient=%s", recipient)
        return {"status": "skipped", "reason": "invalid_recipient"}

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        logger.warning("bank_alert_webhook: no user for username=%s", username)
        return {"status": "skipped", "reason": "user_not_found"}

    # ── 3. Resolve institution → BankAccount ──────────────────────────────────

    # Derive institution from the effective sender's registered domain.
    bank_info = get_bank_by_email_domain(effective_sender)
    if bank_info is None:
        logger.warning("bank_alert_webhook: unrecognised sender=%s", effective_sender)
        return {"status": "skipped", "reason": "unknown_sender"}

    account = (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == str(user.id),
            BankAccount.bank_slug == bank_info.slug,
            BankAccount.deleted_at.is_(None),
        )
        .first()
    )
    if account is None:
        logger.warning("bank_alert_webhook: no %s account for user=%s", bank_info.slug, user.id)
        return {"status": "skipped", "reason": "no_matching_account"}

    # ── 4. Deduplicate ────────────────────────────────────────────────────────

    if alert.transaction_ref:
        existing = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == str(account.id),
                Transaction.external_ref == alert.transaction_ref,
            )
            .first()
        )
        if existing:
            logger.info(
                "bank_alert_webhook: duplicate ref=%s account=%s — skipped",
                alert.transaction_ref,
                account.id,
            )
            return {"status": "skipped", "reason": "duplicate"}

    # ── 5. Insert Transaction ─────────────────────────────────────────────────

    tx_date = alert.transaction_date or datetime.now(UTC)
    # Amounts are signed: debits negative, credits positive (kobo)
    signed_amount = -alert.amount_kobo if alert.transaction_type == "debit" else alert.amount_kobo
    narration = alert.narration or f"{bank_info.display_name} {alert.transaction_type.capitalize()}"

    tx = Transaction(
        user_id=str(user.id),
        account_id=str(account.id),
        date=tx_date,
        amount=signed_amount,
        narration=narration,
        type=alert.transaction_type,
        balance_after=alert.balance_kobo,
        source=TransactionSource.bank_alert,
        external_ref=alert.transaction_ref,
    )
    db.add(tx)

    account.last_synced_at = datetime.now(UTC)

    try:
        db.commit()
    except IntegrityError:
        # Race condition: another request inserted the same external_ref
        # between our dedup check and this commit.
        db.rollback()
        logger.info(
            "bank_alert_webhook: concurrent duplicate ref=%s — skipped",
            alert.transaction_ref,
        )
        return {"status": "skipped", "reason": "duplicate"}

    db.refresh(tx)

    # ── 6. Send immediate transaction push ────────────────────────────────────

    try:
        from app.services.nudge_engine import send_transaction_received_push

        send_transaction_received_push(
            user=user,
            amount_kobo=alert.amount_kobo,
            transaction_type=alert.transaction_type,
            narration=narration,
            balance_kobo=alert.balance_kobo,
        )
    except Exception:
        logger.exception("bank_alert_webhook: send_transaction_received_push failed")

    # ── 7. Enqueue categorisation ─────────────────────────────────────────────

    try:
        from app.worker.tasks import categorize_transactions

        categorize_transactions.delay([tx.id])  # type: ignore[attr-defined]
    except Exception:
        # Celery may not be running in development; log and continue.
        logger.exception("bank_alert_webhook: failed to enqueue categorize_transactions")

    # ── 8. Push WebSocket invalidation ────────────────────────────────────────

    notify_user(str(user.id), ["transactions", "budget", "accounts"])

    logger.info(
        "bank_alert_webhook: created transaction=%s user=%s account=%s amount=%d",
        tx.id,
        user.id,
        account.id,
        signed_amount,
    )
    return {"status": "ok", "transaction_id": tx.id}
