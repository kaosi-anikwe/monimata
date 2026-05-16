# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# SPDX-License-Identifier: AGPL-3.0-or-later

"""BYOK AI credential management endpoints.

GET    /ai/credentials        — list the user's stored providers (key never returned)
POST   /ai/credentials        — store an encrypted API key for a provider
DELETE /ai/credentials/{id}   — deactivate and delete a credential
GET    /ai/usage              — AI efficiency monitor panel (spec §8.3)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import encrypt_api_key
from app.models.user import User
from app.models.user_ai_credential import UserAiCredential
from app.schemas.ai import (
    AiCredentialCreate,
    AiCredentialResponse,
    AiUsageResponse,
    LlmCategorizeResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()
usage_router = APIRouter()


@router.get("", response_model=list[AiCredentialResponse])
def list_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[UserAiCredential]:
    return (
        db.query(UserAiCredential)
        .filter(
            UserAiCredential.user_id == current_user.id,
            UserAiCredential.is_active.is_(True),
        )
        .order_by(UserAiCredential.created_at.desc())
        .all()
    )


@router.post("", response_model=AiCredentialResponse, status_code=status.HTTP_201_CREATED)
def create_credential(
    body: AiCredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserAiCredential:
    # Deactivate any existing active credential for the same provider so there
    # is always at most one active key per provider per user.
    existing = (
        db.query(UserAiCredential)
        .filter(
            UserAiCredential.user_id == current_user.id,
            UserAiCredential.provider == body.provider,
            UserAiCredential.is_active.is_(True),
        )
        .first()
    )
    if existing:
        existing.is_active = False

    try:
        encrypted = encrypt_api_key(body.api_key)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    credential = UserAiCredential(
        user_id=current_user.id,
        provider=body.provider,
        encrypted_api_key=encrypted,
    )
    db.add(credential)
    db.commit()
    db.refresh(credential)
    logger.info("AI credential created: user=%s provider=%s", current_user.id, body.provider)
    return credential


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credential(
    credential_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    credential = (
        db.query(UserAiCredential)
        .filter(
            UserAiCredential.id == credential_id,
            UserAiCredential.user_id == current_user.id,
        )
        .first()
    )
    if credential is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    db.delete(credential)
    db.commit()
    logger.info("AI credential deleted: user=%s id=%s", current_user.id, credential_id)


# ── GET /ai/usage ───────────────────────────────────────────────────────────


# ── POST /ai/categorize ────────────────────────────────────────────────────


@usage_router.post(
    "/categorize", response_model=LlmCategorizeResponse, status_code=status.HTTP_202_ACCEPTED
)
def trigger_llm_categorization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LlmCategorizeResponse:
    """Manually trigger LLM categorisation for all uncategorised transactions.

    Requires an active BYOK credential.  Returns 202 immediately; a push
    notification is sent on completion (success or final failure).
    Returns ``queued: 0`` if there are no uncategorised transactions.
    """
    from typing import cast

    from app.models.transaction import Transaction
    from app.models.user_ai_credential import UserAiCredential
    from app.worker.celery_app import CeleryTask
    from app.worker.tasks import run_llm_categorization

    # Fail fast if no active credential — avoids silently queuing a no-op.
    credential = (
        db.query(UserAiCredential)
        .filter(
            UserAiCredential.user_id == current_user.id,
            UserAiCredential.is_active.is_(True),
        )
        .first()
    )
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No active AI credential configured. Add one at POST /ai/credentials.",
        )

    tx_ids: list[str] = [
        str(row.id)
        for row in db.query(Transaction.id)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.category_id.is_(None),
        )
        .all()
    ]

    if not tx_ids:
        return LlmCategorizeResponse(queued=0)

    cast(CeleryTask, run_llm_categorization).delay(
        str(current_user.id), tx_ids, notify_on_completion=True
    )
    logger.info(
        "trigger_llm_categorization: queued %d transactions for user=%s",
        len(tx_ids),
        current_user.id,
    )
    return LlmCategorizeResponse(queued=len(tx_ids))


@usage_router.get("/usage", response_model=AiUsageResponse)
def get_ai_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AiUsageResponse:
    """AI efficiency monitor panel — spec §8.3.

    Returns offline engine success rate, LLM-handled percentage, and
    current-month / lifetime token volumes from ``UserAiUsageLog``.
    """
    from datetime import date

    from sqlalchemy import extract, func

    from app.models.transaction import Transaction
    from app.models.user_ai_usage_log import UserAiUsageLog

    uid = str(current_user.id)
    today = date.today()

    # ── Categorisation counts ────────────────────────────────────────────────
    total_categorised: int = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.user_id == uid, Transaction.category_id.isnot(None))
        .scalar()
        or 0
    )
    llm_categorised: int = (
        db.query(func.count(Transaction.id))
        .filter(
            Transaction.user_id == uid,
            Transaction.category_id.isnot(None),
            Transaction.categorization_source == "llm",
        )
        .scalar()
        or 0
    )
    offline_categorised = total_categorised - llm_categorised

    offline_success_rate = (
        round(offline_categorised / total_categorised, 4) if total_categorised else 0.0
    )
    llm_handled_pct = round(llm_categorised / total_categorised, 4) if total_categorised else 0.0

    # ── Current-month token usage ────────────────────────────────────────────
    month_row = (
        db.query(
            func.count(UserAiUsageLog.id),
            func.coalesce(func.sum(UserAiUsageLog.prompt_tokens), 0),
            func.coalesce(func.sum(UserAiUsageLog.completion_tokens), 0),
        )
        .filter(
            UserAiUsageLog.user_id == uid,
            extract("year", UserAiUsageLog.timestamp) == today.year,
            extract("month", UserAiUsageLog.timestamp) == today.month,
        )
        .one()
    )
    current_month_calls = int(month_row[0])
    current_month_prompt = int(month_row[1])
    current_month_completion = int(month_row[2])

    # ── Lifetime token usage ─────────────────────────────────────────────────
    lifetime_row = (
        db.query(
            func.count(UserAiUsageLog.id),
            func.coalesce(func.sum(UserAiUsageLog.prompt_tokens), 0),
            func.coalesce(func.sum(UserAiUsageLog.completion_tokens), 0),
        )
        .filter(UserAiUsageLog.user_id == uid)
        .one()
    )
    lifetime_calls = int(lifetime_row[0])
    lifetime_prompt = int(lifetime_row[1])
    lifetime_completion = int(lifetime_row[2])

    return AiUsageResponse(
        total_categorised=total_categorised,
        offline_categorised=offline_categorised,
        llm_categorised=llm_categorised,
        offline_success_rate=offline_success_rate,
        llm_handled_pct=llm_handled_pct,
        current_month_calls=current_month_calls,
        current_month_prompt_tokens=current_month_prompt,
        current_month_completion_tokens=current_month_completion,
        current_month_total_tokens=current_month_prompt + current_month_completion,
        lifetime_calls=lifetime_calls,
        lifetime_prompt_tokens=lifetime_prompt,
        lifetime_completion_tokens=lifetime_completion,
        lifetime_total_tokens=lifetime_prompt + lifetime_completion,
    )
