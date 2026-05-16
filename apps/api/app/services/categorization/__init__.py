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

"""Transaction categorisation pipeline.

Tier execution order (fastest / cheapest first):
  1. UserCategoryRule exact match on cleaned_narration  -> source: exact_match    (100)
  2a. Global merchant JSON substring match              -> source: global_merchant  (90)
  2b. Regex keyword rules                               -> source: keyword          (75)
  3. (Phase 3) Heuristic scoring engine                 -> source: heuristic
  4. (Phase 5) BYOK LLM fallback                        -> source: llm
  5. Leave NULL -- surface for manual review
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# -- Narration cleaning pipeline ----------------------------------------------

_CLEAN_LEADING_RE = re.compile(
    r"^(?:TRF\s+(?:FROM\s+)?|TRANSFER\s+FROM\s+|NIP\s+(?:TRSF\s+FRM\s+)?|"
    r"POS\s+PURCHASE\s+(?:AT\s+)?|ATM\s+WITHDRAWAL\s+(?:AT\s+)?|"
    r"DEBIT\s+ALERT[:\s]*|CREDIT\s+ALERT[:\s]*|NIBSS\s+INSTANT\s+PMT\s*)",
    re.IGNORECASE,
)
_CLEAN_TRAILING_RE = re.compile(
    r"\s*(?:VIA\s+(?:USSD|INTERNET(?:\s+BANKING)?|MOBILE(?:\s+APP)?|APP|"
    r"[A-Z]{2,5}\s+(?:MOBILE|APP|INTERNET))|ON\s+\d[\d:/\-\s]+)$",
    re.IGNORECASE,
)
_CLEAN_REF_RE = re.compile(
    r"\b(?:REF|SESN|TRAN|TXN|RRN|STAN|FT|FTN)[:/\s][\w/\-]+",
    re.IGNORECASE,
)
_CLEAN_ACCT_INLINE_RE = re.compile(r"\b(?:TO|FROM)\s+\d{6,}\b", re.IGNORECASE)
_CLEAN_LONG_NUM_RE = re.compile(r"\b\d{7,}\b")
_CLEAN_DATE_RE = re.compile(r"\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b")
_CLEAN_SPECIAL_RE = re.compile(r"[^a-z0-9\s&'\-]", re.IGNORECASE)
_CLEAN_SPACE_RE = re.compile(r"\s+")

_MAX_CLEANED_LEN = 255


def clean_narration(narration: str) -> str:
    """Deterministic narration cleaning pipeline.

    Strips protocol tokens, reference codes, account-number fragments, and date
    strings, then returns a lowercase, whitespace-normalised string stored as
    Transaction.cleaned_narration at ingestion time.
    """
    if not narration:
        return ""
    s = narration
    s = _CLEAN_LEADING_RE.sub("", s)
    s = _CLEAN_REF_RE.sub("", s)
    s = _CLEAN_TRAILING_RE.sub("", s)
    s = _CLEAN_ACCT_INLINE_RE.sub("", s)
    s = _CLEAN_DATE_RE.sub("", s)
    s = _CLEAN_LONG_NUM_RE.sub("", s)
    s = _CLEAN_TRAILING_RE.sub("", s)
    s = _CLEAN_SPECIAL_RE.sub(" ", s)
    s = s.lower()
    s = _CLEAN_SPACE_RE.sub(" ", s).strip()
    return s[:_MAX_CLEANED_LEN]


# -- Global merchant registry (loaded once at import time) -------------------


def _load_merchant_tokens() -> dict[str, str]:
    path = Path(__file__).parent / "global_merchants.json"
    try:
        raw: dict[str, str] = json.loads(path.read_text(encoding="utf-8"))
        return {k.lower(): v for k, v in raw.items() if not k.startswith("_")}
    except Exception:
        logger.exception("Failed to load global_merchants.json -- merchant tier disabled")
        return {}


_MERCHANT_TOKENS: dict[str, str] = _load_merchant_tokens()


# -- Keyword / regex rules (Tier 2b) -----------------------------------------

KEYWORD_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"airtime|recharge|vtu|dnd", re.IGNORECASE), "Airtime & Data"),
    (re.compile(r"data\s+(?:subscription|plan|bundle)", re.IGNORECASE), "Airtime & Data"),
    (re.compile(r"salary|payroll|wages", re.IGNORECASE), "Income"),
    (re.compile(r"received\s+from", re.IGNORECASE), "Income"),
    (re.compile(r"cash\s+withdrawal|atm", re.IGNORECASE), "Cash"),
    (re.compile(r"rent|landlord|caution\s+fee", re.IGNORECASE), "Rent"),
    (re.compile(r"hospital|pharmacy|clinic|medical|health", re.IGNORECASE), "Healthcare"),
    (re.compile(r"school\s+fees|tuition|university|college", re.IGNORECASE), "Education"),
    (re.compile(r"fuel|petrol|gas\s+station", re.IGNORECASE), "Transport"),
]


# -- Helpers -----------------------------------------------------------------


def _find_category_by_name(db: Session, user_id: str, name: str) -> str | None:
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


# -- Main pipeline -----------------------------------------------------------


def categorize_transaction(db: Session, tx: Any) -> str | None:
    """Run the full categorisation pipeline for a single transaction.

    Returns the matched category_id (or None if uncategorised) and writes
    categorization_source + category_confidence back onto tx so the caller
    commits a single consistent snapshot.
    """
    from app.models.user_category_rule import UserCategoryRule

    key = tx.cleaned_narration or clean_narration(tx.narration)
    if not key:
        return None

    # Tier 1: UserCategoryRule exact match
    rule = (
        db.query(UserCategoryRule)
        .filter(
            UserCategoryRule.user_id == tx.user_id,
            UserCategoryRule.cleaned_narration == key,
        )
        .first()
    )
    if rule:
        rule.hit_count += 1
        rule.last_triggered = datetime.now(UTC)
        tx.categorization_source = "exact_match"
        tx.category_confidence = 100
        return str(rule.category_id)

    # Tier 2a: global merchant JSON substring match
    for token, category_name in _MERCHANT_TOKENS.items():
        if token in key:
            cat_id = _find_category_by_name(db, tx.user_id, category_name)
            if cat_id:
                tx.categorization_source = "global_merchant"
                tx.category_confidence = 90
                return cat_id

    # Tier 2b: regex keyword rules
    for pattern, category_name in KEYWORD_RULES:
        if pattern.search(key):
            cat_id = _find_category_by_name(db, tx.user_id, category_name)
            if cat_id:
                tx.categorization_source = "keyword"
                tx.category_confidence = 75
                return cat_id

    # Tier 3 (Phase 3): heuristic scoring engine -- not yet implemented.
    # Tier 4 (Phase 5): BYOK LLM fallback -- not yet implemented.
    return None
