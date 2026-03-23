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
Recurring rules router — CRUD for RecurringRule.

GET    /recurring-rules        List all active rules for current user
GET    /recurring-rules/:id    Get a single rule
POST   /recurring-rules        Create a new rule
PATCH  /recurring-rules/:id    Update (deactivate, change ends_on, advance next_due)
DELETE /recurring-rules/:id    Hard-delete a rule
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.recurring_rule import RecurringRule
from app.models.user import User
from app.schemas.recurring import (
    RecurringRuleCreate,
    RecurringRuleResponse,
    RecurringRuleUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_rule_or_404(db: Session, rule_id: str, user_id: str) -> RecurringRule:
    rule = (
        db.query(RecurringRule)
        .filter(RecurringRule.id == rule_id, RecurringRule.user_id == user_id)
        .first()
    )
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recurring rule not found"
        )
    return rule


# ── GET /recurring-rules ──────────────────────────────────────────────────────


@router.get("", response_model=list[RecurringRuleResponse])
def list_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecurringRule]:
    """Return all active recurring rules for the current user."""
    return (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == str(current_user.id),
            RecurringRule.is_active.is_(True),
        )
        .order_by(RecurringRule.created_at.desc())
        .all()
    )


# ── GET /recurring-rules/:id ──────────────────────────────────────────────────


@router.get("/{rule_id}", response_model=RecurringRuleResponse)
def get_rule(
    rule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringRule:
    return _get_rule_or_404(db, str(rule_id), str(current_user.id))


# ── POST /recurring-rules ─────────────────────────────────────────────────────


@router.post(
    "", response_model=RecurringRuleResponse, status_code=status.HTTP_201_CREATED
)
def create_rule(
    body: RecurringRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringRule:
    """Create a new recurring rule. The first occurrence is generated lazily on the next sync."""
    rule = RecurringRule(
        user_id=str(current_user.id),
        frequency=body.frequency,
        interval=body.interval,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
        next_due=body.next_due,
        ends_on=body.ends_on,
        is_active=True,
        template=body.template,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


# ── PATCH /recurring-rules/:id ────────────────────────────────────────────────


@router.patch("/{rule_id}", response_model=RecurringRuleResponse)
def update_rule(
    rule_id: UUID,
    body: RecurringRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RecurringRule:
    """Update is_active, ends_on, or next_due. Set is_active=false to pause / stop the rule."""
    rule = _get_rule_or_404(db, str(rule_id), str(current_user.id))
    if body.is_active is not None:
        rule.is_active = body.is_active
    if body.ends_on is not None:
        rule.ends_on = body.ends_on
    if body.next_due is not None:
        rule.next_due = body.next_due
    rule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rule)
    return rule


# ── DELETE /recurring-rules/:id ───────────────────────────────────────────────


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Hard-delete a recurring rule. Past transactions generated by this rule are preserved."""
    rule = _get_rule_or_404(db, str(rule_id), str(current_user.id))
    db.delete(rule)
    db.commit()
