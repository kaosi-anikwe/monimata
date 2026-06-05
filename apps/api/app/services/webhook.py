"""
Business logic for the bank-alert webhook.

Extracted from ``app.routers.webhooks`` so the router only handles HTTP
concerns (auth, payload parsing, rate-limiting) and delegates here.
"""

from __future__ import annotations

import base64
import logging
import re
from datetime import UTC, datetime
from typing import cast

import sentry_sdk
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.bank_account import BankAccount
from app.models.transaction import Transaction, TransactionSource
from app.models.user import User
from app.services.email import send_email
from app.services.ingestion import (
    UnsupportedBankError,
    identify_statement,
    parse_email_alert,
    probe_email_content,
)
from app.services.ingestion.registry import get_bank_by_email_domain
from app.ws_manager import notify_user

logger = logging.getLogger(__name__)

# ─── Compiled patterns ───────────────────────────────────────────────────────

# Matches the "From:" line inside a forwarded-message block, e.g.:
#   From: OPay <no-reply@opay-nigeria.com>
#   From: no-reply@opay-nigeria.com
FORWARDED_FROM_RE = re.compile(
    r"^From:\s+(?:[^<\n]*<)?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?\s*$",
    re.MULTILINE,
)

# Gmail sends a confirmation email to new forwarding addresses.  We detect it
# by looking for the accounts.google.com confirmation URL.
GMAIL_VERIFICATION_RE = re.compile(
    r"(https://mail\.google\.com/mail/vf-[^\s]+)",
    re.IGNORECASE,
)
# The requester address lives in the body: "anikwehenryasa@gmail.com has requested …"
GMAIL_REQUESTER_RE = re.compile(
    r"^([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\s+has requested",
    re.MULTILINE,
)


# ─── Sender resolution ───────────────────────────────────────────────────────


def resolve_sender(direct_sender: str, body: str, html: str = "") -> str:
    """
    Return the effective bank sender email.

    Four strategies, tried in order:

    1. Direct match — the webhook ``from`` field is already a known bank domain.
    2. Content probe — try all registered parsers against the body.
    3. Manual-forward scan — look for a ``From:`` header line inside a
       forwarded-message block.
    4. HTML domain scan — when body is empty/unhelpful (e.g. FirstBank
       statement emails that only have HTML content), extract email addresses
       from the HTML and check for known bank domains.
    """
    if get_bank_by_email_domain(direct_sender) is not None:
        return direct_sender

    result = probe_email_content(body)
    if result is not None:
        _, representative_domain = result
        synthetic = f"no-reply@{representative_domain}"
        logger.debug(
            "resolve_sender: content probe matched domain=%s for sender=%s",
            representative_domain,
            direct_sender,
        )
        return synthetic

    for m in FORWARDED_FROM_RE.finditer(body):
        candidate = m.group(1).lower()
        if get_bank_by_email_domain(candidate) is not None:
            logger.debug(
                "resolve_sender: resolved forwarded sender %s → %s",
                direct_sender,
                candidate,
            )
            return candidate

    # Fallback: scan HTML for known bank domains.  Covers emails like
    # FirstBank statements that have body=null and all content in HTML.
    # Bank domains may appear as email addresses (user@bank.com) or in URLs
    # (https://www.bank.com), so we check the raw HTML text directly against
    # every registered bank domain.
    if html:
        bank = get_bank_by_email_domain(html)
        if bank is not None:
            synthetic = f"no-reply@{next(iter(bank.email_domains), bank.slug)}"
            logger.debug(
                "resolve_sender: HTML domain scan matched bank=%s for sender=%s",
                bank.slug,
                direct_sender,
            )
            return synthetic

    return direct_sender


# ─── Account lookup ──────────────────────────────────────────────────────────


def find_account_by_number(
    db: Session, user_id: str, bank_slug: str, account_number: str
) -> BankAccount | None:
    """Match a decrypted account number to a BankAccount owned by the user."""
    from app.core.security import decrypt_pii

    for candidate in (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == user_id,
            BankAccount.bank_slug == bank_slug,
            BankAccount.deleted_at.is_(None),
        )
        .all()
    ):
        if candidate.account_number is None:
            continue
        try:
            if decrypt_pii(candidate.account_number) == account_number:
                return candidate
        except Exception:
            logger.warning(
                "find_account_by_number: could not decrypt account_number for account=%s",
                candidate.id,
            )
    return None


# ─── Gmail verification ──────────────────────────────────────────────────────


def handle_gmail_verification(sender: str, recipient: str, body: str, html: str) -> dict | None:
    """
    Detect and handle Gmail forwarding-verification emails.

    Returns a response dict if handled, or None to continue normal processing.
    """
    is_google = "forwarding-noreply@google.com" in sender.lower()

    if is_google:
        logger.info(
            "gmail_verification: Gmail forwarding email from %s — checking for verification link",
            sender,
        )
        link_match = GMAIL_VERIFICATION_RE.search(body) or GMAIL_VERIFICATION_RE.search(html)
    else:
        link_match = GMAIL_VERIFICATION_RE.search(body)

    if link_match:
        verification_url = link_match.group(1)
        requester_match = GMAIL_REQUESTER_RE.search(body) or GMAIL_REQUESTER_RE.search(html)
        requester = requester_match.group(1) if requester_match else sender

        logger.info(
            "gmail_verification: Gmail forwarding verification for recipient=%s requester=%s",
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
                    "gmail_verification: failed to forward Gmail verification to %s", requester
                )

        return {"status": "ok", "reason": "gmail_verification_forwarded"}

    if is_google:
        logger.info(
            "gmail_verification: unrecognised Google system email from=%s — skipped", sender
        )
        return {"status": "skipped", "reason": "google_system_email"}

    return None


# ─── PDF statement handling ──────────────────────────────────────────────────


def try_unlock_protected_pdf(
    db: Session,
    pdf_bytes: bytes,
    body: str,
    user: User,
    effective_sender: str,
) -> tuple[tuple[str, str], str, BankAccount | None] | None:
    """
    Attempt to unlock a password-protected PDF statement by trialling the
    user's accounts' derived passwords.

    Returns (identify_result, password, account) on success, or None.
    """
    bank_hint = get_bank_by_email_domain(effective_sender)
    if bank_hint is None:
        return None

    from app.core.security import decrypt_pii
    from app.services.ingestion import derive_statement_password
    from app.services.ingestion.registry import _STATEMENT_PARSERS

    parser = _STATEMENT_PARSERS.get(bank_hint.slug)
    if parser is None:
        return None

    for cand in (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == str(user.id),
            BankAccount.bank_slug == bank_hint.slug,
            BankAccount.deleted_at.is_(None),
        )
        .all()
    ):
        if cand.account_number is None:
            continue
        try:
            acct_num = decrypt_pii(cand.account_number)
        except Exception:
            continue
        pw = derive_statement_password(bank_hint.slug, acct_num)
        if not pw:
            continue
        try:
            id_result = parser.identify(pdf_bytes, body, pw)
        except Exception:
            continue
        if id_result is not None and id_result[0] == acct_num:
            logger.info(
                "try_unlock_protected_pdf: unlocked PDF bank=%s account=%s",
                bank_hint.slug,
                cand.id,
            )
            return id_result, pw, cand

    return None


def handle_pdf_attachments(
    db: Session,
    pdf_attachments: list[dict],
    user: User,
    effective_sender: str,
    body: str,
) -> dict | None:
    """
    Process PDF bank-statement attachments.

    Returns a response dict if an attachment was handled, or None to fall
    through to the email-alert path.
    """
    for att in pdf_attachments:
        try:
            pdf_bytes = base64.b64decode(att["content"])
        except Exception:
            logger.warning("handle_pdf_attachments: could not decode PDF attachment")
            continue

        result = identify_statement(pdf_bytes, body)
        pdf_password = ""
        account: BankAccount | None = None

        # Fallback for password-protected PDFs.
        if result is None:
            unlocked = try_unlock_protected_pdf(db, pdf_bytes, body, user, effective_sender)
            if unlocked is not None:
                result, pdf_password, account = unlocked

        if result is None:
            continue

        account_number, bank_slug = result

        # Verify ownership (skip if already resolved by the fallback).
        if account is None:
            account = find_account_by_number(db, str(user.id), bank_slug, account_number)

        if account is None:
            logger.warning(
                "handle_pdf_attachments: no %s account matching number=%s for user=%s",
                bank_slug,
                account_number[-4:],
                user.id,
            )
            return {"status": "skipped", "reason": "account_not_found"}

        # Notify user that the statement arrived, then dispatch processing.
        try:
            from app.services.nudge_engine import send_statement_received_push

            send_statement_received_push(
                db, user=user, bank_name=bank_slug.replace("_", " ").title()
            )
        except Exception:
            logger.exception("handle_pdf_attachments: send_statement_received_push failed")

        filename = att.get("filename") or f"{bank_slug}_statement.pdf"
        pdf_b64 = base64.b64encode(pdf_bytes).decode()
        try:
            from app.worker.celery_app import CeleryTask
            from app.worker.tasks import process_bank_statement

            cast(CeleryTask, process_bank_statement).delay(
                pdf_b64, filename, bank_slug, str(account.id), str(user.id), pdf_password
            )
        except Exception:
            logger.exception("handle_pdf_attachments: failed to enqueue process_bank_statement")
            return {"status": "error", "reason": "task_enqueue_failed"}

        logger.info(
            "handle_pdf_attachments: statement queued bank=%s account=%s user=%s",
            bank_slug,
            account.id,
            user.id,
        )
        return {"status": "accepted"}

    return None


# ─── Email-alert handling ────────────────────────────────────────────────────


def handle_email_alert(
    db: Session,
    data: dict,
    body: str,
    sender: str,
    effective_sender: str,
    recipient: str,
    user: User,
) -> dict:
    """Parse an email-alert body, deduplicate, insert a transaction, and enqueue categorisation."""
    try:
        alert = parse_email_alert(body, sender=effective_sender)
    except UnsupportedBankError:
        logger.warning("handle_email_alert: unsupported bank sender=%s", effective_sender)
        return {"status": "skipped", "reason": "unsupported_bank"}
    except ValueError:
        sentry_sdk.set_context(
            "alert_details",
            {"subject": data.get("subject"), "sender": sender, "recipient": recipient},
        )
        sentry_sdk.capture_message("Email parser failed for bank alert", level="warning")
        logger.warning(
            "handle_email_alert: parsing failed — from=%s subject=%s",
            sender,
            data.get("subject"),
        )
        return {"status": "skipped", "reason": "parsing_failed"}

    logger.info(
        "handle_email_alert: parsed %s of %d kobo from=%s ref=%s",
        alert.transaction_type,
        alert.amount_kobo,
        sender,
        alert.transaction_ref,
    )

    # Resolve institution → BankAccount.
    bank_info = get_bank_by_email_domain(effective_sender)
    if bank_info is None:
        logger.warning("handle_email_alert: unrecognised sender=%s", effective_sender)
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
        logger.warning("handle_email_alert: no %s account for user=%s", bank_info.slug, user.id)
        return {"status": "skipped", "reason": "no_matching_account"}

    # Deduplicate via external_ref.
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
                "handle_email_alert: duplicate ref=%s account=%s — skipped",
                alert.transaction_ref,
                account.id,
            )
            return {"status": "skipped", "reason": "duplicate"}

    # Insert Transaction.
    tx_date = alert.transaction_date or datetime.now(UTC)
    signed_amount = -alert.amount_kobo if alert.transaction_type == "debit" else alert.amount_kobo
    narration = alert.narration or f"{bank_info.display_name} {alert.transaction_type.capitalize()}"

    from app.services.categorization import clean_narration  # avoid circular at module level

    tx = Transaction(
        user_id=str(user.id),
        account_id=str(account.id),
        date=tx_date,
        amount=signed_amount,
        narration=narration,
        cleaned_narration=clean_narration(narration),
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
        db.rollback()
        logger.info(
            "handle_email_alert: concurrent duplicate ref=%s — skipped",
            alert.transaction_ref,
        )
        return {"status": "skipped", "reason": "duplicate"}

    db.refresh(tx)

    # Send immediate transaction push.
    try:
        from app.services.nudge_engine import send_transaction_received_push

        send_transaction_received_push(
            user=user,
            db=db,
            amount_kobo=alert.amount_kobo,
            transaction_type=alert.transaction_type,
            narration=narration,
            balance_kobo=alert.balance_kobo,
        )
    except Exception:
        logger.exception("handle_email_alert: send_transaction_received_push failed")

    # Enqueue categorisation.
    try:
        from app.worker.tasks import categorize_transactions

        categorize_transactions.delay([tx.id])  # type: ignore[attr-defined]
    except Exception:
        logger.exception("handle_email_alert: failed to enqueue categorize_transactions")

    # Push WebSocket invalidation.
    notify_user(str(user.id), ["transactions", "budget", "accounts"])

    logger.info(
        "handle_email_alert: created transaction=%s user=%s account=%s amount=%d",
        tx.id,
        user.id,
        account.id,
        signed_amount,
    )
    return {"status": "ok", "transaction_id": tx.id}
