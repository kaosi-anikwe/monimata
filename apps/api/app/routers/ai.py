# MoniMata - zero-based budgeting for Nigerians
# Copyright (C) 2026  MoniMata Contributors
#
# SPDX-License-Identifier: AGPL-3.0-or-later

"""BYOK AI credential management endpoints.

GET    /ai/credentials        — list the user's stored providers (key never returned)
POST   /ai/credentials        — store an encrypted API key for a provider
DELETE /ai/credentials/{id}   — deactivate and delete a credential
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
from app.schemas.ai import AiCredentialCreate, AiCredentialResponse

logger = logging.getLogger(__name__)
router = APIRouter()


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
