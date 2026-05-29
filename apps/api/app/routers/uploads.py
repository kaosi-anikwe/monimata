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

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user
from app.core.limiter import limiter
from app.services.upload import (
    StatementAccountNotFound,
    StatementValidationError,
    detect_mime,
    enqueue_receipt,
    enqueue_statement,
    resolve_statement_auto,
    resolve_statement_directed,
    validate_bank_slug,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Maximum file size accepted (5 MB)
_MAX_FILE_BYTES = 5 * 1024 * 1024


@router.post("/receipt", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Upload a transaction receipt image or PDF for background import.

    Supported formats: JPEG, PNG, WebP, PDF (max 5 MB).
    Returns ``{"status": "accepted"}`` immediately.
    """
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

    if detect_mime(content) is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Accepted: JPEG, PNG, WebP, PDF.",
        )

    try:
        enqueue_receipt(content, str(current_user.id))
    except Exception:
        logger.exception("uploads.receipt: failed to enqueue process_receipt")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue receipt processing.",
        )

    return {"status": "accepted"}


@router.post("/statement", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def upload_statement(
    request: Request,
    file: UploadFile = File(...),
    bank_slug: str | None = Form(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Upload a bank statement PDF for background import.

    If *bank_slug* is provided the router routes directly to that bank's
    parser.  If omitted the bank is auto-detected from the PDF content.

    Accepted formats: PDF only (max 5 MB).
    Returns ``{"status": "accepted"}`` immediately.
    """
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

    if content[:4] != b"%PDF":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF bank statements are supported.",
        )

    # ── Validate explicit bank_slug when provided ────────────────────────────
    if bank_slug is not None:
        try:
            validate_bank_slug(bank_slug)
        except StatementValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.detail
            )

    # ── Resolve account ──────────────────────────────────────────────────────
    try:
        if bank_slug is not None:
            account, pdf_password = resolve_statement_directed(db, content, bank_slug, current_user)
            resolved_bank_slug = bank_slug
        else:
            account, resolved_bank_slug, pdf_password = resolve_statement_auto(
                db, content, current_user
            )
    except StatementValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except StatementAccountNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.detail)

    # ── Enqueue background processing ────────────────────────────────────────
    filename = file.filename or f"{resolved_bank_slug}_statement.pdf"
    try:
        enqueue_statement(
            content,
            filename,
            resolved_bank_slug,
            str(account.id),
            str(current_user.id),
            pdf_password,
        )
    except Exception:
        logger.exception("uploads.statement: failed to enqueue process_bank_statement")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue statement processing.",
        )

    return {"status": "accepted"}
