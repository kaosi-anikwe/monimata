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
Transaction categorization pipeline.

Steps (in confidence order):
  1. Exact user-verified narration→category mapping (confidence = 1.0)
  2. Global merchant keyword dictionary
  3. Regex keyword rules
  4. Fuzzy match against user's historical pattern mappings
  5. (Phase 2) ML classifier
  6. Leave NULL — surface as uncategorized
"""

from __future__ import annotations

import re
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Global merchant dictionary ────────────────────────────────────────────────
# Key: uppercase token to look for in narration. Value: category name.
# This is a shared platform resource; curate it over time.
MERCHANT_DICT: dict[str, str] = {
    "CHOPNOW": "Food & Dining",
    "BOLT": "Transport",
    "UBER": "Transport",
    "INDRIVER": "Transport",
    "TAXIFY": "Transport",
    "JUMIA": "Shopping",
    "KONGA": "Shopping",
    "NETFLIX": "Entertainment",
    "SPOTIFY": "Entertainment",
    "DSTV": "Cable TV",
    "GOTV": "Cable TV",
    "STARTIMES": "Cable TV",
    "IKEDC": "Electricity",
    "EKEDC": "Electricity",
    "AEDC": "Electricity",
    "PHEDC": "Electricity",
    "MTN": "Airtime & Data",
    "AIRTEL": "Airtime & Data",
    "GLO": "Airtime & Data",
    "9MOBILE": "Airtime & Data",
    "ETISALAT": "Airtime & Data",
    "COWRYWISE": "Savings & Investment",
    "PIGGYVEST": "Savings & Investment",
    "BAMBOO": "Savings & Investment",
    "CHOWDECK": "Food & Dining",
    "GLOVO": "Food & Dining",
    "FOODCOURT": "Food & Dining",
}

# ── Keyword / regex rules ─────────────────────────────────────────────────────
KEYWORD_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"AIRTIME|RECHARGE|DND", re.IGNORECASE), "Airtime & Data"),
    (
        re.compile(r"DATA SUBSCRIPTION|DATA PLAN|DATA BUNDLE", re.IGNORECASE),
        "Airtime & Data",
    ),
    (re.compile(r"SALARY|PAYROLL|WAGES", re.IGNORECASE), "Income"),
    (re.compile(r"TRANSFER FROM|RECEIVED FROM", re.IGNORECASE), "Income"),
    (re.compile(r"ATM WITHDRAWAL|CASH WITHDRAWAL", re.IGNORECASE), "Cash"),
    (re.compile(r"RENT|LANDLORD|CAUTION FEE", re.IGNORECASE), "Rent"),
    (
        re.compile(r"HOSPITAL|PHARMACY|CLINIC|MEDICAL|HEALTH", re.IGNORECASE),
        "Healthcare",
    ),
    (re.compile(r"SCHOOL FEES|TUITION|UNIVERSITY|COLLEGE", re.IGNORECASE), "Education"),
    (re.compile(r"POS PURCHASE|POS PAYMENT", re.IGNORECASE), "Shopping"),
    (re.compile(r"FUEL|PETROL|GAS STATION", re.IGNORECASE), "Transport"),
]


def _normalize_narration(narration: str) -> str:
    """Strip noise and uppercase for consistent matching."""
    return re.sub(r"[^A-Z0-9 ]", " ", narration.upper()).strip()


def _find_category_by_name(db: Session, user_id: str, name: str) -> str | None:
    """Find a category by (approximate) name for this user. Returns category id or None."""
    from app.models.category import Category

    cat = (
        db.query(Category)
        .filter(
            Category.user_id == user_id,
            Category.name.ilike(f"%{name}%"),
            Category.is_hidden == False,
        )
        .first()
    )
    return cat.id if cat else None


def categorize_transaction(db: Session, tx) -> str | None:
    """
    Run the full categorization pipeline for a single transaction.
    Returns a category_id string, or None if uncategorized.
    """
    from app.models.narration_map import NarrationCategoryMap
    from thefuzz import fuzz

    narration_norm = _normalize_narration(tx.narration)

    # Step 1: Exact user-verified mapping ─────────────────────────────────────
    exact = (
        db.query(NarrationCategoryMap)
        .filter(
            NarrationCategoryMap.user_id == tx.user_id,
            NarrationCategoryMap.narration_key == narration_norm,
            NarrationCategoryMap.confidence == 1.0,
        )
        .first()
    )
    if exact:
        return exact.category_id

    # Step 2: Global merchant dictionary ──────────────────────────────────────
    for token, category_name in MERCHANT_DICT.items():
        if token in narration_norm:
            cat_id = _find_category_by_name(db, tx.user_id, category_name)
            if cat_id:
                return cat_id

    # Step 3: Regex keyword rules ─────────────────────────────────────────────
    for pattern, category_name in KEYWORD_RULES:
        if pattern.search(narration_norm):
            cat_id = _find_category_by_name(db, tx.user_id, category_name)
            if cat_id:
                return cat_id

    # Step 4: Fuzzy match against user's historical pattern ───────────────────
    user_maps = (
        db.query(NarrationCategoryMap)
        .filter(
            NarrationCategoryMap.user_id == tx.user_id,
        )
        .all()
    )

    best_score = 0
    best_category_id: str | None = None
    for mapping in user_maps:
        score = fuzz.token_sort_ratio(narration_norm, mapping.narration_key)
        if score > best_score:
            best_score = score
            best_category_id = mapping.category_id

    if best_score >= 80 and best_category_id:
        return best_category_id

    # Step 5 (Phase 2): ML classifier — not yet implemented
    # Step 6: Leave uncategorized
    return None
