"""
Business logic for user-initiated file uploads (receipts & statements).

Extracted from ``app.routers.uploads`` so the router only handles HTTP
concerns (auth, file reading, rate-limiting) and delegates here.
"""

from __future__ import annotations

import base64
import logging
from typing import cast

from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.models.bank_account import BankAccount
from app.models.user import User
from app.services.ingestion import derive_statement_password, identify_statement
from app.services.ingestion.registry import _BANKS, _STATEMENT_PARSERS

logger = logging.getLogger(__name__)


# ─── MIME detection ──────────────────────────────────────────────────────────


def detect_mime(content: bytes) -> str | None:
    """Return the MIME type inferred from *content* magic bytes, or ``None``.

    We do **not** trust the ``Content-Type`` header because mobile HTTP
    clients often set it from the file extension, which can be wrong or
    missing.  Checking the actual bytes is the only reliable approach.

    Recognised signatures
    ---------------------
    - ``FF D8 FF``               → image/jpeg
    - ``89 50 4E 47``            → image/png
    - ``52 49 46 46 … 57 45 42 50`` → image/webp  (RIFF…WEBP)
    - ``25 50 44 46``            → application/pdf (%PDF)
    """
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if content[:4] == b"\x89PNG":
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if content[:4] == b"%PDF":
        return "application/pdf"
    return None


# ─── Receipt processing ─────────────────────────────────────────────────────


def enqueue_receipt(content: bytes, user_id: str) -> None:
    """Base64-encode *content* and dispatch the ``process_receipt`` Celery task.

    Raises on enqueue failure so the caller can return an appropriate HTTP error.
    """
    image_b64 = base64.b64encode(content).decode()
    from app.worker.celery_app import CeleryTask
    from app.worker.tasks import process_receipt

    cast(CeleryTask, process_receipt).delay(image_b64, user_id)

    logger.info("enqueue_receipt: queued user=%s size=%d", user_id, len(content))


# ─── Statement processing ───────────────────────────────────────────────────


class StatementValidationError(Exception):
    """Raised when the bank_slug supplied by the client is invalid."""

    def __init__(self, detail: str, status_code: int = 422) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class StatementAccountNotFound(Exception):
    """Raised when no matching BankAccount can be found for the statement."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def validate_bank_slug(bank_slug: str) -> None:
    """Raise :class:`StatementValidationError` if *bank_slug* is unknown or
    has no statement parser registered."""
    if bank_slug not in _BANKS:
        raise StatementValidationError(f"Unknown bank: {bank_slug!r}.")
    if _STATEMENT_PARSERS.get(bank_slug) is None:
        raise StatementValidationError(
            f"{_BANKS[bank_slug].display_name!r} does not support statement uploads."
        )


def resolve_statement_directed(
    db: Session,
    content: bytes,
    bank_slug: str,
    user: User | CurrentUser,
) -> tuple[BankAccount, str]:
    """Directed flow: the client explicitly specified ``bank_slug``.

    Try every account the user has for this bank.  For banks that issue
    locked PDFs we derive the password from each account number in turn
    until one unlocks the PDF.

    Returns ``(account, pdf_password)``.
    Raises :class:`StatementAccountNotFound` if no account matches.
    """
    from app.core.security import decrypt_pii

    candidates = (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == str(user.id),
            BankAccount.bank_slug == bank_slug,
            BankAccount.deleted_at.is_(None),
        )
        .all()
    )

    parser = _STATEMENT_PARSERS[bank_slug]
    for candidate in candidates:
        if candidate.account_number is None:
            continue
        try:
            acct_num = decrypt_pii(candidate.account_number)
        except Exception:
            logger.warning(
                "resolve_statement_directed: could not decrypt account_number for account=%s",
                candidate.id,
            )
            continue

        candidate_password = derive_statement_password(bank_slug, acct_num)
        try:
            result = parser.identify(content, "", candidate_password)
        except Exception:
            continue

        if result is not None and result[0] == acct_num:
            return candidate, candidate_password

    logger.warning(
        "resolve_statement_directed: no %s account recognised the statement for user=%s",
        bank_slug,
        user.id,
    )
    raise StatementAccountNotFound(
        "No matching account found. Add the account in MoniMata before uploading its statement."
    )


def resolve_statement_auto(
    db: Session,
    content: bytes,
    user: User | CurrentUser,
) -> tuple[BankAccount, str, str]:
    """Auto-detect flow: no ``bank_slug`` supplied.

    Returns ``(account, resolved_bank_slug, pdf_password)``.
    Raises :class:`StatementValidationError` if the bank cannot be
    identified or :class:`StatementAccountNotFound` if no matching account
    is found.
    """
    from app.core.security import decrypt_pii

    result = identify_statement(content)
    if result is None:
        raise StatementValidationError(
            "Could not identify the bank from this statement. "
            "Select the bank manually or make sure it is an unmodified "
            "PDF statement from a supported bank."
        )

    account_number, resolved_bank_slug = result

    for candidate in (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == str(user.id),
            BankAccount.bank_slug == resolved_bank_slug,
            BankAccount.deleted_at.is_(None),
        )
        .all()
    ):
        if candidate.account_number is None:
            continue
        try:
            if decrypt_pii(candidate.account_number) == account_number:
                return candidate, resolved_bank_slug, ""
        except Exception:
            logger.warning(
                "resolve_statement_auto: could not decrypt account_number for account=%s",
                candidate.id,
            )

    logger.warning(
        "resolve_statement_auto: no %s account matching number=%s for user=%s",
        resolved_bank_slug,
        account_number[-4:] if account_number else "????",
        user.id,
    )
    raise StatementAccountNotFound(
        "No matching account found. Add the account in MoniMata before uploading its statement."
    )


def enqueue_statement(
    content: bytes,
    filename: str,
    bank_slug: str,
    account_id: str,
    user_id: str,
    pdf_password: str,
) -> None:
    """Base64-encode *content* and dispatch the ``process_bank_statement`` Celery task.

    Raises on enqueue failure so the caller can return an appropriate HTTP error.
    """
    pdf_b64 = base64.b64encode(content).decode()
    from app.worker.celery_app import CeleryTask
    from app.worker.tasks import process_bank_statement

    cast(CeleryTask, process_bank_statement).delay(
        pdf_b64, filename, bank_slug, account_id, user_id, pdf_password
    )

    logger.info(
        "enqueue_statement: queued bank=%s account=%s user=%s size=%d",
        bank_slug,
        account_id,
        user_id,
        len(content),
    )
