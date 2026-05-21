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
Admin nudge-rule CRUD endpoints.

Requires the authenticated user to have the `admin` role (enforced by
the ``get_current_admin`` dependency).

Endpoints:
  GET    /admin/nudge-rules                  — paginated list
  GET    /admin/nudge-rules/{rule_id}        — single rule
  POST   /admin/nudge-rules                  — create a rule
  PUT    /admin/nudge-rules/{rule_id}        — partial update
  PATCH  /admin/nudge-rules/{rule_id}/toggle — flip active flag
  DELETE /admin/nudge-rules/{rule_id}        — hard delete
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.redis_client import invalidate_and_rebuild
from app.models.nudge_rule import NudgeRule
from app.models.user import User
from app.schemas.nudge_metrics import RuleDailyStat, RuleDailyStatList, RuleSummary, RuleSummaryList
from app.schemas.nudge_rule import (
    NudgeRuleCreate,
    NudgeRuleGroupDetail,
    NudgeRuleGroupList,
    NudgeRuleListResponse,
    NudgeRuleResponse,
    NudgeRuleUpdate,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── List ──────────────────────────────────────────────────────────────────────


@router.get(
    "",
    response_model=NudgeRuleListResponse,
    summary="List nudge rules",
)
def list_nudge_rules(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    active: bool | None = Query(None),
    gid: str | None = Query(None),
    q: str | None = Query(None, description="Case-insensitive substring search on title"),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> NudgeRuleListResponse:
    query = db.query(NudgeRule)
    if active is not None:
        query = query.filter(NudgeRule.active.is_(active))
    if gid is not None:
        query = query.filter(NudgeRule.gid == gid)
    if q is not None:
        query = query.filter(NudgeRule.title.ilike(f"%{q}%"))

    total: int = query.count()
    rules = (
        query.order_by(NudgeRule.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    )
    return NudgeRuleListResponse(
        total=total,
        page=page,
        limit=limit,
        items=[NudgeRuleResponse.model_validate(r) for r in rules],
    )


# ── Groups ────────────────────────────────────────────────────────────────────


@router.get(
    "/groups",
    response_model=NudgeRuleGroupList,
    summary="List all rule groups (GIDs)",
)
def list_groups(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> NudgeRuleGroupList:
    from sqlalchemy import case, func

    rows = (
        db.query(
            NudgeRule.gid,
            func.count(NudgeRule.id).label("rule_count"),
            func.sum(case((NudgeRule.active.is_(True), 1), else_=0)).label("active_count"),
        )
        .group_by(NudgeRule.gid)
        .order_by(NudgeRule.gid)
        .all()
    )
    from app.schemas.nudge_rule import NudgeRuleGroup

    return NudgeRuleGroupList(
        groups=[
            NudgeRuleGroup(gid=r.gid, rule_count=r.rule_count, active_count=r.active_count)
            for r in rows
        ],
    )


@router.get(
    "/groups/{gid}",
    response_model=NudgeRuleGroupDetail,
    summary="List all rules in a group",
)
def get_group_rules(
    gid: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> NudgeRuleGroupDetail:
    rules = (
        db.query(NudgeRule).filter(NudgeRule.gid == gid).order_by(NudgeRule.created_at.desc()).all()
    )
    if not rules:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No rules found for group '{gid}'"
        )
    return NudgeRuleGroupDetail(
        gid=gid,
        rules=[NudgeRuleResponse.model_validate(r) for r in rules],
    )


# ── Stats ─────────────────────────────────────────────────────────────────────


@router.get(
    "/stats/summary",
    response_model=RuleSummaryList,
    summary="Aggregate stats for all rules over a period",
)
def get_stats_summary(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> RuleSummaryList:
    from app.services.nudge_metrics import get_rule_stats_summary

    rows = get_rule_stats_summary(db, days=days)
    return RuleSummaryList(
        rules=[RuleSummary(**r) for r in rows],
        period_days=days,
    )


# ── Single ────────────────────────────────────────────────────────────────────


@router.get(
    "/{rule_id}",
    response_model=NudgeRuleResponse,
    summary="Get a single nudge rule",
)
def get_nudge_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> NudgeRule:
    rule = db.get(NudgeRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nudge rule not found")
    return rule


# ── Create ────────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=NudgeRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a nudge rule",
)
def create_nudge_rule(
    body: NudgeRuleCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> NudgeRule:
    existing = db.query(NudgeRule).filter(NudgeRule.slug == body.slug).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A rule with slug '{body.slug}' already exists",
        )

    rule = NudgeRule(
        slug=body.slug,
        title=body.title,
        gid=body.gid,
        active=body.active,
        evts=body.evts,
        days_back=body.days_back,
        conds=body.conds.model_dump(mode="json"),
        action=body.action.model_dump(mode="json"),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    invalidate_and_rebuild(db, list(rule.evts))
    logger.info("Created nudge rule slug=%s id=%s", rule.slug, rule.id)
    return rule


# ── Update (partial) ──────────────────────────────────────────────────────────


@router.put(
    "/{rule_id}",
    response_model=NudgeRuleResponse,
    summary="Update a nudge rule",
)
def update_nudge_rule(
    rule_id: str,
    body: NudgeRuleUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> NudgeRule:
    rule = db.get(NudgeRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nudge rule not found")

    old_evts: list[str] = list(rule.evts)

    if body.slug is not None:
        if body.slug != rule.slug:
            clash = db.query(NudgeRule).filter(NudgeRule.slug == body.slug).first()
            if clash is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A rule with slug '{body.slug}' already exists",
                )
        rule.slug = body.slug
    if body.title is not None:
        rule.title = body.title
    if body.gid is not None:
        rule.gid = body.gid
    if body.active is not None:
        rule.active = body.active
    if body.evts is not None:
        rule.evts = body.evts
    if body.days_back is not None:
        rule.days_back = body.days_back
    if body.conds is not None:
        rule.conds = body.conds.model_dump(mode="json")
    if body.action is not None:
        rule.action = body.action.model_dump(mode="json")

    db.commit()
    db.refresh(rule)

    # Rebuild cache for both old and new evts — avoids stale buckets if evts changed.
    merged_evts = list(dict.fromkeys(old_evts + list(rule.evts)))
    invalidate_and_rebuild(db, merged_evts)
    logger.info("Updated nudge rule slug=%s id=%s", rule.slug, rule.id)
    return rule


# ── Toggle ────────────────────────────────────────────────────────────────────


@router.patch(
    "/{rule_id}/toggle",
    response_model=NudgeRuleResponse,
    summary="Toggle a nudge rule active/inactive",
)
def toggle_nudge_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> NudgeRule:
    rule = db.get(NudgeRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nudge rule not found")

    rule.active = not rule.active
    db.commit()
    db.refresh(rule)
    invalidate_and_rebuild(db, list(rule.evts))
    logger.info("Toggled nudge rule slug=%s active=%s id=%s", rule.slug, rule.active, rule.id)
    return rule


# ── Delete ────────────────────────────────────────────────────────────────────


@router.delete(
    "/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a nudge rule",
)
def delete_nudge_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> None:
    rule = db.get(NudgeRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nudge rule not found")

    evts: list[str] = list(rule.evts)
    db.delete(rule)
    db.commit()
    invalidate_and_rebuild(db, evts)
    logger.info("Deleted nudge rule id=%s", rule_id)


# ── Per-rule stats ────────────────────────────────────────────────────────────


@router.get(
    "/{rule_id}/stats",
    response_model=RuleDailyStatList,
    summary="Daily stats for a single rule",
)
def get_rule_stats_endpoint(
    rule_id: str,
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> RuleDailyStatList:
    from app.services.nudge_metrics import get_rule_stats

    rule = db.get(NudgeRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nudge rule not found")
    rows = get_rule_stats(db, rule_id=rule_id, days=days)
    return RuleDailyStatList(
        stats=[RuleDailyStat(**r) for r in rows],
        period_days=days,
    )
