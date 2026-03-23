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
Categories router — groups and categories CRUD + category targets.

Registered in main.py as:
  app.include_router(categories.router,        prefix="/categories",      ...)
  app.include_router(categories.groups_router, prefix="/category-groups", ...)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, status

from app.models.user import User
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.target import CategoryTarget
from app.models.transaction import Transaction
from app.models.category import Category, CategoryGroup
from app.schemas.categories import (
    CategoryCreate,
    CategoryGroupCreate,
    CategoryGroupResponse,
    CategoryGroupUpdate,
    CategoryGroupWithCategories,
    CategoryResponse,
    CategoryTargetResponse,
    CategoryTargetUpsert,
    CategoryUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()  # /categories
groups_router = APIRouter()  # /category-groups


# ══════════════════════════════════════════════════════════════════════════════
# Category Groups
# ══════════════════════════════════════════════════════════════════════════════


def _get_group_or_404(db: Session, group_id: str, user_id: str) -> CategoryGroup:
    g = (
        db.query(CategoryGroup)
        .filter(CategoryGroup.id == group_id, CategoryGroup.user_id == user_id)
        .first()
    )
    if g is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category group not found"
        )
    return g


@groups_router.get("", response_model=list[CategoryGroupWithCategories])
def list_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CategoryGroup]:
    return (
        db.query(CategoryGroup)
        .filter(CategoryGroup.user_id == str(current_user.id))
        .order_by(CategoryGroup.sort_order)
        .all()
    )


@groups_router.post(
    "", response_model=CategoryGroupResponse, status_code=status.HTTP_201_CREATED
)
def create_group(
    body: CategoryGroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryGroup:
    # Default sort_order: append after existing groups
    if body.sort_order is None:
        max_order = (
            db.query(CategoryGroup)
            .filter(CategoryGroup.user_id == str(current_user.id))
            .count()
        )
        sort_order = max_order
    else:
        sort_order = body.sort_order

    group = CategoryGroup(
        user_id=str(current_user.id),
        name=body.name,
        sort_order=sort_order,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@groups_router.patch("/{group_id}", response_model=CategoryGroupResponse)
def update_group(
    group_id: UUID,
    body: CategoryGroupUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryGroup:
    group = _get_group_or_404(db, str(group_id), str(current_user.id))
    if body.name is not None:
        group.name = body.name
    if body.sort_order is not None:
        group.sort_order = body.sort_order
    if body.is_hidden is not None:
        group.is_hidden = body.is_hidden
    group.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(group)
    return group


@groups_router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """
    Delete a group only if it has no categories.
    If it has categories, archive it (is_hidden=True) instead.
    """
    group = _get_group_or_404(db, str(group_id), str(current_user.id))
    has_categories = (
        db.query(Category)
        .filter(
            Category.group_id == str(group_id), Category.user_id == str(current_user.id)
        )
        .first()
    ) is not None

    if has_categories:
        group.is_hidden = True
        group.updated_at = datetime.now(timezone.utc)
        db.commit()
        return

    db.delete(group)
    db.commit()


@groups_router.patch("/{group_id}/sort", response_model=CategoryGroupResponse)
def sort_group(
    group_id: UUID,
    sort_order: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryGroup:
    group = _get_group_or_404(db, str(group_id), str(current_user.id))
    group.sort_order = sort_order
    group.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(group)
    return group


# ══════════════════════════════════════════════════════════════════════════════
# Categories
# ══════════════════════════════════════════════════════════════════════════════


def _get_category_or_404(db: Session, category_id: str, user_id: str) -> Category:
    c = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user_id)
        .first()
    )
    if c is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )
    return c


@router.get("", response_model=list[CategoryGroupWithCategories])
def list_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CategoryGroup]:
    """Return all category groups with their nested categories."""
    return (
        db.query(CategoryGroup)
        .filter(CategoryGroup.user_id == str(current_user.id))
        .order_by(CategoryGroup.sort_order)
        .all()
    )


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    body: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Category:
    # Verify the group belongs to this user
    _get_group_or_404(db, str(body.group_id), str(current_user.id))

    if body.sort_order is None:
        existing_count = (
            db.query(Category)
            .filter(
                Category.group_id == str(body.group_id),
                Category.user_id == str(current_user.id),
            )
            .count()
        )
        sort_order = existing_count
    else:
        sort_order = body.sort_order

    cat = Category(
        user_id=str(current_user.id),
        group_id=str(body.group_id),
        name=body.name,
        sort_order=sort_order,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: UUID,
    body: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Category:
    cat = _get_category_or_404(db, str(category_id), str(current_user.id))
    if body.name is not None:
        cat.name = body.name
    if body.group_id is not None:
        _get_group_or_404(db, str(body.group_id), str(current_user.id))
        cat.group_id = str(body.group_id)
    if body.sort_order is not None:
        cat.sort_order = body.sort_order
    if body.is_hidden is not None:
        cat.is_hidden = body.is_hidden
    cat.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """
    Delete a category if it has no transactions. Otherwise hide it.
    """
    cat = _get_category_or_404(db, str(category_id), str(current_user.id))
    has_transactions = (
        db.query(Transaction)
        .filter(
            Transaction.category_id == str(category_id),
            Transaction.user_id == str(current_user.id),
        )
        .first()
    ) is not None

    if has_transactions:
        cat.is_hidden = True
        cat.updated_at = datetime.now(timezone.utc)
        db.commit()
        return

    db.delete(cat)
    db.commit()


@router.patch("/{category_id}/sort", response_model=CategoryResponse)
def sort_category(
    category_id: UUID,
    sort_order: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Category:
    cat = _get_category_or_404(db, str(category_id), str(current_user.id))
    cat.sort_order = sort_order
    cat.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cat)
    return cat


# ══════════════════════════════════════════════════════════════════════════════
# Category Targets
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/{category_id}/target", response_model=CategoryTargetResponse | None)
def get_target(
    category_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryTarget | None:
    _get_category_or_404(db, str(category_id), str(current_user.id))
    return (
        db.query(CategoryTarget)
        .filter(CategoryTarget.category_id == str(category_id))
        .first()
    )


@router.put("/{category_id}/target", response_model=CategoryTargetResponse)
def upsert_target(
    category_id: UUID,
    body: CategoryTargetUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CategoryTarget:
    _get_category_or_404(db, str(category_id), str(current_user.id))

    target = (
        db.query(CategoryTarget)
        .filter(CategoryTarget.category_id == str(category_id))
        .first()
    )
    if target is None:
        target = CategoryTarget(category_id=str(category_id))
        db.add(target)

    target.frequency = body.frequency
    target.behavior = body.behavior
    target.target_amount = body.target_amount
    target.day_of_week = body.day_of_week
    target.day_of_month = body.day_of_month
    target.target_date = body.target_date
    target.repeats = body.repeats

    db.commit()
    db.refresh(target)
    return target


@router.delete("/{category_id}/target", status_code=status.HTTP_204_NO_CONTENT)
def delete_target(
    category_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _get_category_or_404(db, str(category_id), str(current_user.id))
    target = (
        db.query(CategoryTarget)
        .filter(CategoryTarget.category_id == str(category_id))
        .first()
    )
    if target:
        db.delete(target)
        db.commit()
