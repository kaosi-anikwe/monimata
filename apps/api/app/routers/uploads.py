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
Uploads router — user-initiated file uploads for transaction import.

Endpoints
─────────
  POST /uploads/receipt     Import a single transaction from a receipt image or PDF.
  POST /uploads/statement   Import transactions from a bank statement PDF.

Both endpoints accept an authenticated file upload, validate the file via
magic bytes, and dispatch a Celery background task.  The client receives
``{"status": "accepted"}`` immediately; transactions appear once processing
completes.
"""

from __future__ import annotations

import base64
import logging
from typing import cast

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.limiter import limiter
from app.models.bank_account import BankAccount
from app.models.user import User
from app.services.ingestion.channels.statement import identify_statement

logger = logging.getLogger(__name__)
router = APIRouter()

# Maximum file size accepted (5 MB)
_MAX_FILE_BYTES = 5 * 1024 * 1024


def _detect_mime(content: bytes) -> str | None:
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


@router.post("/receipt", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Upload a transaction receipt image or PDF for background import.

    The bank and account are identified automatically from the file — the
    client does not need to specify either.  The file is processed in a
    Celery background task; the transaction appears once processing
    completes.

    Supported formats: JPEG, PNG, WebP, PDF (max 5 MB).
    Returns ``{"status": "accepted"}`` immediately.
    """
    # ── Read & size check ─────────────────────────────────────────────────────
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File must be smaller than 5 MB.",
        )

    # ── Magic-byte MIME guard ─────────────────────────────────────────────────
    # The Content-Type header from mobile clients is set by the HTTP library
    # (often from the file extension) and cannot be trusted.  Inspect the
    # actual bytes instead.
    mime = _detect_mime(content)
    if mime is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Accepted: JPEG, PNG, WebP, PDF.",
        )

    # ── Enqueue background task ───────────────────────────────────────────────
    # Bank + account identification happens inside the task (via identify_receipt)
    # so the client doesn't need to know which bank the receipt belongs to.
    image_b64 = base64.b64encode(content).decode()
    try:
        from app.worker.celery_app import CeleryTask
        from app.worker.tasks import process_receipt

        cast(CeleryTask, process_receipt).delay(image_b64, str(current_user.id))
    except Exception:
        logger.exception("uploads.receipt: failed to enqueue process_receipt")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue receipt processing.",
        )

    logger.info(
        "uploads.receipt: queued user=%s size=%d",
        current_user.id,
        len(content),
    )
    return {"status": "accepted"}


@router.post("/statement", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def upload_statement(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Upload a bank statement PDF for background import.

    The statement is parsed to extract all transactions it contains.
    The bank and account are identified from the PDF itself — the client
    does not need to specify either.  The account must already exist in
    MoniMata; if it is not found, a 404 is returned.

    Accepted formats: PDF only (max 5 MB).
    Returns ``{"status": "accepted"}`` immediately.
    """
    # ── Read & size check ─────────────────────────────────────────────────────
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File must be smaller than 5 MB.",
        )

    # ── PDF-only guard (magic bytes) ─────────────────────────────────────────
    if content[:4] != b"%PDF":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF bank statements are supported.",
        )

    # ── Identify bank from statement content ────────────────────────────────
    result = identify_statement(content)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Could not identify the bank from this statement. "
                "Make sure it is an unmodified PDF statement from a supported bank."
            ),
        )
    account_number, bank_slug = result

    # ── Verify ownership: find the matching account for this user ────────────
    # Decrypt stored account numbers and compare against the one extracted
    # from the statement.  Prevents importing another user's statement even
    # if both use the same bank.
    from app.core.security import decrypt_pii

    account = None
    for candidate in (
        db.query(BankAccount)
        .filter(
            BankAccount.user_id == str(current_user.id),
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
                "uploads.statement: could not decrypt account_number for account=%s",
                candidate.id,
            )

    if account is None:
        logger.warning(
            "uploads.statement: no %s account matching number=%s for user=%s",
            bank_slug,
            account_number[-4:],
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No matching account found. "
                "Add the account in MoniMata before uploading its statement."
            ),
        )

    # ── Enqueue background processing ─────────────────────────────────────
    filename = file.filename or f"{bank_slug}_statement.pdf"
    pdf_b64 = base64.b64encode(content).decode()
    try:
        from app.worker.celery_app import CeleryTask
        from app.worker.tasks import process_bank_statement

        cast(CeleryTask, process_bank_statement).delay(
            pdf_b64, filename, bank_slug, str(account.id), str(current_user.id)
        )
    except Exception:
        logger.exception("uploads.statement: failed to enqueue process_bank_statement")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue statement processing.",
        )

    logger.info(
        "uploads.statement: queued bank=%s account=%s user=%s size=%d",
        bank_slug,
        account.id,
        current_user.id,
        len(content),
    )
    return {"status": "accepted"}
