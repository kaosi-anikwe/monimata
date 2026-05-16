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

import logging
import re

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Narration cleaning pipeline ───────────────────────────────────────────────
# Strips bank-specific protocol noise from raw narration strings so the
# residual merchant footprint can be indexed and matched deterministically.

# Leading protocol tokens (e.g. "TRF FROM", "NIP TRSF FRM", "POS PURCHASE AT")
_CLEAN_LEADING_RE = re.compile(
    r"^(?:TRF\s+(?:FROM\s+)?|TRANSFER\s+FROM\s+|NIP\s+(?:TRSF\s+FRM\s+)?|"
    r"POS\s+PURCHASE\s+(?:AT\s+)?|ATM\s+WITHDRAWAL\s+(?:AT\s+)?|"
    r"DEBIT\s+ALERT[:\s]*|CREDIT\s+ALERT[:\s]*|NIBSS\s+INSTANT\s+PMT\s*)",
    re.IGNORECASE,
)
# Trailing channel/session noise (e.g. "VIA USSD", "VIA GTB MOBILE", "ON 12/05/2026")
_CLEAN_TRAILING_RE = re.compile(
    r"\s*(?:VIA\s+(?:USSD|INTERNET(?:\s+BANKING)?|MOBILE(?:\s+APP)?|APP|"
    r"[A-Z]{2,5}\s+(?:MOBILE|APP|INTERNET))|ON\s+\d[\d:/\-\s]+)$",
    re.IGNORECASE,
)
# Reference/session markers and their values (e.g. "REF:71625372", "SESN/ABC123")
_CLEAN_REF_RE = re.compile(
    r"\b(?:REF|SESN|TRAN|TXN|RRN|STAN|FT|FTN)[:/\s][\w/\-]+",
    re.IGNORECASE,
)
# Inline "TO <digits>" and "FROM <digits>" account number fragments
_CLEAN_ACCT_INLINE_RE = re.compile(r"\b(?:TO|FROM)\s+\d{6,}\b", re.IGNORECASE)
# Long standalone numeric runs (≥7 digits) — account numbers, phone numbers, IDs
_CLEAN_LONG_NUM_RE = re.compile(r"\b\d{7,}\b")
# Date-like fragments (e.g. "12/05/26", "2026-05-12")
_CLEAN_DATE_RE = re.compile(r"\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b")
# Anything that is not alphanumeric, space, ampersand, hyphen, or apostrophe
_CLEAN_SPECIAL_RE = re.compile(r"[^a-z0-9\s&'\-]", re.IGNORECASE)
# Consecutive whitespace normaliser
_CLEAN_SPACE_RE = re.compile(r"\s+")

_MAX_CLEANED_LEN = 255


def clean_narration(narration: str) -> str:
    """Deterministic narration cleaning pipeline.

    Strips protocol tokens, reference codes, account-number fragments, and
    date strings from a raw bank narration, then returns a lowercase,
    whitespace-normalised string suitable for indexing and cache lookups.

    The output is stored as ``Transaction.cleaned_narration`` at ingestion
    time so downstream categorisation tiers never need to re-run this work.
    """
    if not narration:
        return ""

    s = narration
    # Strip leading protocol tokens first.
    s = _CLEAN_LEADING_RE.sub("", s)
    # Strip reference markers before checking trailing junk — this exposes
    # trailing channel tokens (e.g. "VIA USSD") that were buried before "REF:".
    s = _CLEAN_REF_RE.sub("", s)
    # Strip trailing channel/session noise (now at the true end of string).
    s = _CLEAN_TRAILING_RE.sub("", s)
    # Strip inline "TO/FROM <account_number>" fragments.
    s = _CLEAN_ACCT_INLINE_RE.sub("", s)
    # Strip date-like patterns and long numeric runs.
    s = _CLEAN_DATE_RE.sub("", s)
    s = _CLEAN_LONG_NUM_RE.sub("", s)
    # Second trailing pass catches residual tokens left after numeric removal
    # (e.g. a dangling "ON" or "VIA" that was adjacent to a stripped number).
    s = _CLEAN_TRAILING_RE.sub("", s)
    # Replace non-meaningful characters with spaces.
    s = _CLEAN_SPECIAL_RE.sub(" ", s)
    # Lowercase and collapse whitespace.
    s = s.lower()
    s = _CLEAN_SPACE_RE.sub(" ", s).strip()
    return s[:_MAX_CLEANED_LEN]


# ── Global merchant dictionary ────────────────────────────────────────────────
# Key: uppercase token to look for in narration. Value: category name.
# This is a shared platform resource; curate it over time.
MERCHANT_DICT: dict[str, str] = {
    "CHOPNOW": "Food & Dining",
    "CHEESYBITE": "Food & Dining",
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
            ~Category.is_hidden,
        )
        .first()
    )
    return cat.id if cat else None


def categorize_transaction(db: Session, tx) -> str | None:
    """
    Run the full categorization pipeline for a single transaction.
    Returns a category_id string, or None if uncategorized.
    """
    from thefuzz import fuzz

    from app.models.narration_map import NarrationCategoryMap

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
