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
Nudges router.

Endpoints:
  GET    /nudges                   — paginated list, unread first
  GET    /nudges/{id}              — single nudge with full context
  POST   /nudges/{id}/open         — mark opened
  POST   /nudges/{id}/dismiss      — mark dismissed
  DELETE /nudges/{id}              — delete a nudge
  POST   /nudges/mark-all-read     — mark all as opened
  GET    /nudges/settings          — get nudge_settings
  PATCH  /nudges/settings          — update nudge_settings
  POST   /nudges/register-device   — store Expo push token
  POST   /nudges/test-trigger      — create synthetic nudge for QA
"""

from __future__ import annotations

import logging
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.nudge import Nudge
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.nudges import (
    NudgeListResponse,
    NudgeResponse,
    NudgeSettingsResponse,
    NudgeSettingsUpdate,
    RegisterDeviceRequest,
    TestTriggerRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── List ─────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=NudgeListResponse,
    summary="List nudges",
)
def list_nudges(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    include_dismissed: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NudgeListResponse:
    """
    Returns the user's nudges sorted by creation time (newest first).
    Undismissed nudges always sort before dismissed ones.

    unread_count: delivered nudges not yet opened and not dismissed.
    """
    q = db.query(Nudge).filter(Nudge.user_id == current_user.id)

    if not include_dismissed:
        q = q.filter(Nudge.is_dismissed == False)  # noqa: E712

    total = q.count()

    unread_count = (
        db.query(Nudge)
        .filter(
            Nudge.user_id == current_user.id,
            Nudge.delivered_at != None,  # noqa: E711
            Nudge.is_opened == False,  # noqa: E712
            Nudge.is_dismissed == False,  # noqa: E712
        )
        .count()
    )

    nudges = (
        q.order_by(
            Nudge.is_dismissed.asc(),  # undismissed first
            Nudge.created_at.desc(),  # newest within each group
        )
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return NudgeListResponse(
        nudges=[NudgeResponse.model_validate(n) for n in nudges],
        total=total,
        unread_count=unread_count,
    )


# ── Settings ─────────────────────────────────────────────────────────────────
# Must be registered before /{nudge_id} so FastAPI doesn't treat "settings" as
# a path parameter.


@router.get(
    "/settings",
    response_model=NudgeSettingsResponse,
    summary="Get nudge settings",
)
def get_settings(
    current_user: User = Depends(get_current_user),
) -> NudgeSettingsResponse:
    ns = current_user.nudge_settings or {}
    return NudgeSettingsResponse(
        enabled=ns.get("enabled", True),
        quiet_hours_start=ns.get("quiet_hours_start", "23:00"),
        quiet_hours_end=ns.get("quiet_hours_end", "07:00"),
        fatigue_limit=int(ns.get("fatigue_limit", 3)),
    )


@router.patch(
    "/settings",
    response_model=NudgeSettingsResponse,
    summary="Update nudge settings",
)
def update_settings(
    body: NudgeSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NudgeSettingsResponse:
    ns: dict = dict(current_user.nudge_settings or {})
    if body.enabled is not None:
        ns["enabled"] = body.enabled
    if body.quiet_hours_start is not None:
        ns["quiet_hours_start"] = body.quiet_hours_start
    if body.quiet_hours_end is not None:
        ns["quiet_hours_end"] = body.quiet_hours_end
    if body.fatigue_limit is not None:
        ns["fatigue_limit"] = body.fatigue_limit

    current_user.nudge_settings = ns
    db.add(current_user)
    db.commit()
    return NudgeSettingsResponse(
        enabled=ns.get("enabled", True),
        quiet_hours_start=ns.get("quiet_hours_start", "23:00"),
        quiet_hours_end=ns.get("quiet_hours_end", "07:00"),
        fatigue_limit=int(ns.get("fatigue_limit", 3)),
    )


# ── Get single ───────────────────────────────────────────────────────────────


@router.get(
    "/{nudge_id}",
    response_model=NudgeResponse,
    summary="Get a single nudge",
)
def get_nudge(
    nudge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NudgeResponse:
    nudge = _get_owned_nudge(db, nudge_id, current_user.id)
    return NudgeResponse.model_validate(nudge)


# ── Open ─────────────────────────────────────────────────────────────────────


@router.post(
    "/{nudge_id}/open",
    response_model=NudgeResponse,
    summary="Mark nudge as opened",
)
def open_nudge(
    nudge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NudgeResponse:
    nudge = _get_owned_nudge(db, nudge_id, current_user.id)
    nudge.is_opened = True
    if nudge.delivered_at is None:
        nudge.delivered_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(nudge)
    return NudgeResponse.model_validate(nudge)


# ── Dismiss ──────────────────────────────────────────────────────────────────


@router.post(
    "/{nudge_id}/dismiss",
    response_model=NudgeResponse,
    summary="Dismiss a nudge",
)
def dismiss_nudge(
    nudge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NudgeResponse:
    nudge = _get_owned_nudge(db, nudge_id, current_user.id)
    nudge.is_dismissed = True
    nudge.is_opened = True
    if nudge.delivered_at is None:
        nudge.delivered_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(nudge)
    return NudgeResponse.model_validate(nudge)


# ── Delete ───────────────────────────────────────────────────────────────────


@router.delete(
    "/{nudge_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a nudge",
)
def delete_nudge(
    nudge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    nudge = _get_owned_nudge(db, nudge_id, current_user.id)
    db.delete(nudge)
    db.commit()


# ── Mark all read ────────────────────────────────────────────────────────────


@router.post(
    "/mark-all-read",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark all nudges as opened",
)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    now = datetime.now(timezone.utc)
    db.query(Nudge).filter(
        Nudge.user_id == current_user.id,
        Nudge.is_opened == False,  # noqa: E712
    ).update(
        {"is_opened": True, "delivered_at": now},
        synchronize_session=False,
    )
    db.commit()


# ── Device registration ──────────────────────────────────────────────────────


@router.post(
    "/register-device",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Register push notification token",
)
def register_device(
    body: RegisterDeviceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Store the device's push token so the backend can deliver push notifications.

    Accepts:
      - Expo push tokens: "ExponentPushToken[xxxxxx]"  (development + Expo Go)

    Idempotent — re-registering the same token is safe.
    """
    current_user.expo_push_token = body.token
    db.add(current_user)
    db.commit()
    logger.info(
        "Device registered for user=%s token_prefix=%s",
        current_user.id,
        body.token[:30],
    )


# ── Test trigger (QA / dev) ──────────────────────────────────────────────────


@router.post(
    "/test-trigger",
    response_model=NudgeResponse,
    summary="Create a synthetic nudge for testing",
    description=(
        "Creates a realistic synthetic nudge for the given trigger_type. "
        "Bypasses fatigue and dedup checks. Safe in all environments."
    ),
)
def test_trigger(
    body: TestTriggerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NudgeResponse:
    """
    Inject a test nudge directly.  Supported trigger_types:
      threshold_80, threshold_100, large_single_tx, pay_received, bill_payment
    """
    from app.services.nudge_engine import MESSAGES, TITLES, create_nudge
    import random

    SAMPLE_CONTEXTS: dict = {
        "threshold_80": {
            "category_name": "Food & Drinks",
            "month": datetime.now(timezone.utc).strftime("%Y-%m"),
            "spent_kobo": 1_600_000,
            "assigned_kobo": 2_000_000,
            "remaining_kobo": 400_000,
            "remaining_naira": "4k",
            "assigned_naira": "20k",
            "percentage": 80,
        },
        "threshold_100": {
            "category_name": "Transport",
            "month": datetime.now(timezone.utc).strftime("%Y-%m"),
            "spent_kobo": 2_500_000,
            "assigned_kobo": 2_000_000,
            "overage_kobo": 500_000,
            "overage_naira": "5k",
            "percentage": 125,
        },
        "large_single_tx": {
            "category_name": "Entertainment",
            "tx_amount_kobo": -1_200_000,
            "amount_naira": "12k",
            "narration": "NETFLIX SUBSCRIPTION",
            "assigned_kobo": 3_000_000,
            "percentage": 40,
            "tx_id": "00000000-0000-0000-0000-000000000001",
        },
        "pay_received": {
            "amount_kobo": 50_000_000,
            "amount_naira": "500k",
            "narration": "SALARY PAYMENT",
            "account_id": "00000000-0000-0000-0000-000000000002",
        },
        "bill_payment": {
            "biller_name": "DSTV",
            "amount_kobo": -2_600_000,
            "amount_naira": "26k",
            "reference": "TEST-REF-001",
        },
    }

    ttype = body.trigger_type
    if ttype not in TITLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown trigger_type '{ttype}'. Valid: {list(TITLES.keys())}",
        )

    ctx = SAMPLE_CONTEXTS.get(ttype, {})
    category_name = ctx.get("category_name", "Bills")
    biller_name = ctx.get("biller_name", "Biller")

    title = TITLES[ttype].format(category_name=category_name, biller_name=biller_name)
    try:
        message = random.choice(MESSAGES[ttype]).format(**ctx)
    except KeyError:
        message = random.choice(MESSAGES[ttype])

    nudge = create_nudge(
        db,
        current_user,
        ttype,
        title,
        message,
        context={**ctx, "_synthetic": True},
        category_id=body.category_id,
        send_push=True,
    )
    db.commit()
    db.refresh(nudge)
    return NudgeResponse.model_validate(nudge)


# ── Internal helper ──────────────────────────────────────────────────────────


def _get_owned_nudge(db: Session, nudge_id: str, user_id: str) -> Nudge:
    """Fetch a nudge by ID, verifying it belongs to the calling user."""
    nudge: Optional[Nudge] = (
        db.query(Nudge).filter(Nudge.id == nudge_id, Nudge.user_id == user_id).first()
    )
    if nudge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nudge not found.",
        )
    return nudge
