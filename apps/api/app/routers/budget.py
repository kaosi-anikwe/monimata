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
Budget router — assign, move money, TBB, full budget view, underfunded, auto-assign.
"""

from __future__ import annotations

import math
import uuid
import logging
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.user import User
from app.core.database import get_db
from app.models.budget import BudgetMonth
from app.core.deps import get_current_user
from app.models.target import CategoryTarget
from app.models.category import Category, CategoryGroup
from app.schemas.budget import (
    AssignRequest,
    AutoAssignResponse,
    AutoAssignStrategy,
    BudgetCategoryResponse,
    BudgetGroupResponse,
    BudgetResponse,
    MoveMoneyRequest,
    TBBResponse,
    UnderfundedCategoryResponse,
)
from app.services.budget_logic import (
    compute_available,
    compute_tbb,
    get_or_create_budget_month,
    required_this_month,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Default to the current month when month param is omitted.
_CURRENT_MONTH = date.today().strftime("%Y-%m")


def _prev_month(month: str) -> str:
    """Return the month immediately before *month* as 'YYYY-MM'."""
    y, m = int(month[:4]), int(month[5:7])
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def _month_param(month: Optional[str] = Query(None, description="YYYY-MM")) -> str:
    return month or _CURRENT_MONTH


# ── GET /budget?month= ────────────────────────────────────────────────────────


@router.get("", response_model=BudgetResponse)
def get_budget(
    month: str = Depends(_month_param),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetResponse:
    """
    Full budget view for a month:
    all groups → categories with assigned / activity / available / required_this_month,
    plus the global TBB.
    """
    today = date.today()
    user_id = str(current_user.id)

    groups = (
        db.query(CategoryGroup)
        .filter(CategoryGroup.user_id == user_id)
        .order_by(CategoryGroup.sort_order)
        .all()
    )

    tbb = compute_tbb(db, user_id, month)

    group_responses: list[BudgetGroupResponse] = []
    for group in groups:
        cats = (
            db.query(Category)
            .filter(Category.group_id == str(group.id), Category.user_id == user_id)
            .order_by(Category.sort_order)
            .all()
        )

        cat_responses: list[BudgetCategoryResponse] = []
        for cat in cats:
            bm = (
                db.query(BudgetMonth)
                .filter(
                    BudgetMonth.user_id == user_id,
                    BudgetMonth.category_id == str(cat.id),
                    BudgetMonth.month == month,
                )
                .first()
            )
            assigned = bm.assigned if bm else 0
            activity = bm.activity if bm else 0
            available = compute_available(db, user_id, str(cat.id), month)

            target = (
                db.query(CategoryTarget)
                .filter(CategoryTarget.category_id == str(cat.id))
                .first()
            )
            req = required_this_month(target, available, today)

            cat_responses.append(
                BudgetCategoryResponse(
                    id=uuid.UUID(cat.id),
                    name=cat.name,
                    sort_order=cat.sort_order,
                    is_hidden=cat.is_hidden,
                    assigned=assigned,
                    activity=activity,
                    available=available,
                    required_this_month=req,
                    target_amount=target.target_amount if target else None,
                    target_frequency=target.frequency if target else None,
                )
            )

        group_responses.append(
            BudgetGroupResponse(
                id=uuid.UUID(group.id),
                name=group.name,
                sort_order=group.sort_order,
                is_hidden=group.is_hidden,
                categories=cat_responses,
            )
        )

    return BudgetResponse(month=month, tbb=tbb, groups=group_responses)


# ── PATCH /budget/{category_id}?month= ───────────────────────────────────────


@router.patch("/{category_id}", response_model=BudgetCategoryResponse)
def set_assignment(
    category_id: uuid.UUID,
    body: AssignRequest,
    month: str = Depends(_month_param),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetCategoryResponse:
    """Set (replace) the assigned amount for a category in a month."""
    user_id = str(current_user.id)

    cat = (
        db.query(Category)
        .filter(Category.id == str(category_id), Category.user_id == user_id)
        .first()
    )
    if cat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )

    bm = get_or_create_budget_month(db, user_id, str(category_id), month)
    bm.assigned = body.assigned

    db.commit()
    db.refresh(bm)

    available = compute_available(db, user_id, str(category_id), month)
    target = (
        db.query(CategoryTarget)
        .filter(CategoryTarget.category_id == str(category_id))
        .first()
    )
    req = required_this_month(target, available, date.today())

    return BudgetCategoryResponse(
        id=uuid.UUID(cat.id),
        name=cat.name,
        sort_order=cat.sort_order,
        is_hidden=cat.is_hidden,
        assigned=bm.assigned,
        activity=bm.activity,
        available=available,
        required_this_month=req,
        target_amount=target.target_amount if target else None,
        target_frequency=target.frequency if target else None,
    )


# ── POST /budget/move ─────────────────────────────────────────────────────────


@router.post("/move", response_model=dict)
def move_money(
    body: MoveMoneyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Atomically move kobo from one category to another within the same month.
    Decrements assigned on source, increments on destination.
    """
    user_id = str(current_user.id)

    if str(body.from_category_id) == str(body.to_category_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Source and destination cannot be the same",
        )

    for cat_id in (body.from_category_id, body.to_category_id):
        cat = (
            db.query(Category)
            .filter(Category.id == str(cat_id), Category.user_id == user_id)
            .first()
        )
        if cat is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Category {cat_id} not found",
            )

    from_bm = get_or_create_budget_month(
        db, user_id, str(body.from_category_id), body.month
    )
    to_bm = get_or_create_budget_month(
        db, user_id, str(body.to_category_id), body.month
    )

    from_available = compute_available(
        db, user_id, str(body.from_category_id), body.month
    )
    if from_available < body.amount:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Insufficient available funds: {from_available} kobo available, {body.amount} kobo requested",
        )

    from_bm.assigned -= body.amount
    to_bm.assigned += body.amount

    db.commit()

    return {
        "from_category_id": str(body.from_category_id),
        "to_category_id": str(body.to_category_id),
        "amount": body.amount,
        "month": body.month,
    }


# ── GET /budget/tbb?month= ────────────────────────────────────────────────────


@router.get("/tbb", response_model=TBBResponse)
def get_tbb(
    month: str = Depends(_month_param),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TBBResponse:
    tbb = compute_tbb(db, str(current_user.id), month)
    return TBBResponse(month=month, tbb=tbb)


# ── GET /budget/underfunded?month= ────────────────────────────────────────────


@router.get("/underfunded", response_model=list[UnderfundedCategoryResponse])
def list_underfunded(
    month: str = Depends(_month_param),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UnderfundedCategoryResponse]:
    """Return categories where available < required_this_month."""
    user_id = str(current_user.id)
    today = date.today()

    cats = (
        db.query(Category)
        .filter(Category.user_id == user_id, Category.is_hidden.is_(False))
        .all()
    )

    result: list[UnderfundedCategoryResponse] = []
    for cat in cats:
        target = (
            db.query(CategoryTarget)
            .filter(CategoryTarget.category_id == str(cat.id))
            .first()
        )
        if target is None:
            continue

        available = compute_available(db, user_id, str(cat.id), month)
        req = required_this_month(target, available, today)
        if req is None or req <= 0:
            continue

        shortfall = req - available
        if shortfall > 0:
            result.append(
                UnderfundedCategoryResponse(
                    id=uuid.UUID(cat.id),
                    name=cat.name,
                    available=available,
                    required_this_month=req,
                    shortfall=shortfall,
                )
            )

    return result


# ── POST /budget/auto-assign?month= ──────────────────────────────────────────


@router.post("/auto-assign", response_model=AutoAssignResponse)
def auto_assign(
    strategy: AutoAssignStrategy = Query(
        AutoAssignStrategy.underfunded,
        description="Assignment strategy to apply",
    ),
    month: str = Depends(_month_param),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutoAssignResponse:
    """
    Bulk-assign categories for a month using one of five strategies:

    - **underfunded**          Fill categories behind their targets.
                               Respects target-type priority order and stops
                               when TBB reaches zero (TBB-capped).
    - **assigned_last_month**  Mirror each category's assigned amount from
                               the previous calendar month.
    - **spent_last_month**     Assign what was actually spent last month
                               (abs of activity).
    - **avg_assigned**         3-month average of past assigned amounts
                               (non-zero months only, ceiling-rounded).
    - **avg_spent**            3-month average of past spending amounts
                               (non-zero months only, ceiling-rounded).

    Historical strategies do **not** clamp to TBB; TBB may go negative.
    """
    user_id = str(current_user.id)
    today = date.today()

    cats = (
        db.query(Category)
        .filter(Category.user_id == user_id, Category.is_hidden.is_(False))
        .all()
    )

    assignments_made = 0
    total_assigned = 0  # kobo — net delta
    still_underfunded: list[uuid.UUID] = []

    if strategy == AutoAssignStrategy.underfunded:
        tbb = compute_tbb(db, user_id, month)

        if tbb <= 0:
            return AutoAssignResponse(
                month=month,
                strategy=strategy,
                assignments_made=0,
                total_assigned=0,
                still_underfunded=[],
            )

        # Collect underfunded candidates
        candidates: list[tuple[Category, CategoryTarget, int]] = []
        for cat in cats:
            target = (
                db.query(CategoryTarget)
                .filter(CategoryTarget.category_id == str(cat.id))
                .first()
            )
            if target is None:
                continue
            available = compute_available(db, user_id, str(cat.id), month)
            req = required_this_month(target, available, today)
            if req is None or req <= 0:
                continue
            shortfall = req - available
            if shortfall > 0:
                candidates.append((cat, target, shortfall))

        # Sort by priority:
        #   0: by_date (closest deadline first)
        #   1: monthly set_aside
        #   2: monthly refill / balance
        #   3: weekly
        #   4: everything else
        def priority_key(item: tuple) -> tuple:
            cat, target, shortfall = item
            freq = target.frequency
            behavior = target.behavior
            if freq in ("yearly", "custom") and target.target_date:
                try:
                    from datetime import datetime

                    d = datetime.strptime(str(target.target_date), "%Y-%m-%d").date()
                    days_away = (d - today).days
                except (ValueError, TypeError):
                    days_away = 9999
                return (0, days_away)
            elif freq == "monthly" and behavior == "set_aside":
                return (1, 0)
            elif freq == "monthly" and behavior in ("refill", "balance"):
                return (2, 0)
            elif freq == "weekly":
                return (3, 0)
            return (4, 0)

        candidates.sort(key=priority_key)

        for cat, target, shortfall in candidates:
            if tbb <= 0:
                still_underfunded.append(uuid.UUID(cat.id))
                continue

            to_assign = min(shortfall, tbb)
            bm = get_or_create_budget_month(db, user_id, str(cat.id), month)
            bm.assigned += to_assign
            tbb -= to_assign
            total_assigned += to_assign
            assignments_made += 1

            if to_assign < shortfall:
                still_underfunded.append(uuid.UUID(cat.id))

    else:
        # ── Historical strategies ───────────────────────────────────────────
        prev1 = _prev_month(month)
        prev2 = _prev_month(prev1)
        prev3 = _prev_month(prev2)
        hist_months = [prev1, prev2, prev3]

        hist_bms = (
            db.query(BudgetMonth)
            .filter(
                BudgetMonth.user_id == user_id,
                BudgetMonth.month.in_(hist_months),
            )
            .all()
        )

        # Index: category_id → month → BudgetMonth
        bm_index: dict[str, dict[str, BudgetMonth]] = {}
        for bm in hist_bms:
            if bm.category_id not in bm_index:
                bm_index[bm.category_id] = {}
            bm_index[bm.category_id][bm.month] = bm

        for cat in cats:
            cat_hist = bm_index.get(str(cat.id), {})
            current_bm = get_or_create_budget_month(db, user_id, str(cat.id), month)
            old_assigned = current_bm.assigned

            if strategy == AutoAssignStrategy.assigned_last_month:
                prev_bm = cat_hist.get(prev1)
                proposed = prev_bm.assigned if prev_bm else 0

            elif strategy == AutoAssignStrategy.spent_last_month:
                prev_bm = cat_hist.get(prev1)
                # activity is stored negative for debits; abs gives spend amount
                proposed = abs(prev_bm.activity) if prev_bm else 0

            elif strategy == AutoAssignStrategy.avg_assigned:
                vals = [
                    cat_hist[m].assigned
                    for m in hist_months
                    if m in cat_hist and cat_hist[m].assigned > 0
                ]
                proposed = math.ceil(sum(vals) / len(vals)) if vals else 0

            elif strategy == AutoAssignStrategy.avg_spent:
                vals = [
                    abs(cat_hist[m].activity)
                    for m in hist_months
                    if m in cat_hist and abs(cat_hist[m].activity) > 0
                ]
                proposed = math.ceil(sum(vals) / len(vals)) if vals else 0

            else:
                continue  # unreachable

            if proposed == old_assigned:
                continue

            current_bm.assigned = proposed
            total_assigned += proposed - old_assigned
            assignments_made += 1

    db.commit()

    return AutoAssignResponse(
        month=month,
        strategy=strategy,
        assignments_made=assignments_made,
        total_assigned=total_assigned,
        still_underfunded=still_underfunded,
    )
