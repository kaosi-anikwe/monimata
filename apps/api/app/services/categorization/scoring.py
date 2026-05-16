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

"""Modular heuristic scoring engine (Phase 3 -- Tier 3 of the categorisation pipeline).

Architecture
------------
Each scoring rule is a self-contained ScoringComponent.  Components are
registered in HeuristicEngine.components and receive a ScoringContext plus a
CandidateCategory; they return a signed integer modifier.

To add a new rule: implement ScoringComponent and append an instance to the
components list in HeuristicEngine.__init__.  No changes required to models or
the main pipeline.

Public surface
--------------
    engine = HeuristicEngine()
    result = engine.run(db, tx, key)   # returns (category_id, confidence) | None

For unit tests, the pure scoring loop is also directly callable:
    winner = engine.evaluate(context, candidates)  # returns category_id | None
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

# Minimum rapidfuzz token_sort_ratio to be surfaced as a fuzzy candidate
_FUZZY_CANDIDATE_THRESHOLD: int = 60

# Minimum combined score for a winner to be committed
_CONFIDENCE_THRESHOLD: int = 75

# Category name fragments that are income-only (debit txs should never match)
_INCOME_FRAGMENTS: frozenset[str] = frozenset({"income", "salary", "dividend", "refund"})

# Category name fragments for recurring monthly expenses (temporal rule applies)
_RECURRING_FRAGMENTS: frozenset[str] = frozenset(
    {"rent", "insurance", "internet", "subscription", "streaming", "dues", "premium"}
)

# Amount bracket table: (category_fragment, min_kobo_inclusive, max_kobo_exclusive, modifier)
# Amounts stored in kobo (NGN 1 = 100 kobo).  First matching row wins.
_AMOUNT_BRACKETS: list[tuple[str, int, int, int]] = [
    ("airtime", 0, 1_000_000, +20),
    ("airtime", 1_000_000, 5_000_000, 0),
    ("airtime", 5_000_000, 2_147_483_647, -60),
    ("food", 0, 500_000, +15),
    ("food", 500_000, 5_000_000, 0),
    ("food", 5_000_000, 2_147_483_647, -30),
    ("transport", 0, 300_000, +15),
    ("transport", 300_000, 5_000_000, 0),
    ("transport", 5_000_000, 2_147_483_647, -20),
]


# ---------------------------------------------------------------------------
# Data contracts
# ---------------------------------------------------------------------------


class CandidateCategory(NamedTuple):
    """A category surfaced by fuzzy narration matching."""

    category_id: str
    category_name: str
    base_weight: int  # rapidfuzz score 0–100


class ScoringContext:
    """Read-only execution context passed to every ScoringComponent."""

    def __init__(self, tx: Any, history: list[Any]) -> None:
        self.tx = tx  # Active Transaction ORM object
        self.history = history  # User transactions from the last 45 days with a category


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class ScoringComponent(ABC):
    @abstractmethod
    def calculate_score(self, context: ScoringContext, candidate: CandidateCategory) -> int:
        """Return a signed integer modifier to adjust candidate confidence."""
        ...


# ---------------------------------------------------------------------------
# Concrete components
# ---------------------------------------------------------------------------


class TransactionTypeRule(ScoringComponent):
    """Penalise income-only categories when the transaction is a debit.

    A -100 modifier immediately pushes the candidate's total score below the
    confidence threshold, effectively eliminating it from contention.
    """

    def calculate_score(self, context: ScoringContext, candidate: CandidateCategory) -> int:
        if context.tx.type != "debit":
            return 0
        if any(frag in candidate.category_name.lower() for frag in _INCOME_FRAGMENTS):
            return -100
        return 0


class AmountBracketRule(ScoringComponent):
    """Adjust confidence based on whether the transaction amount is plausible for the category."""

    def calculate_score(self, context: ScoringContext, candidate: CandidateCategory) -> int:
        amount = abs(context.tx.amount)
        name_lower = candidate.category_name.lower()
        for fragment, lo, hi, modifier in _AMOUNT_BRACKETS:
            if fragment in name_lower and lo <= amount < hi:
                return modifier
        return 0


class TemporalPatternRule(ScoringComponent):
    """Boost recurring-expense categories when a matching amount appeared recently (28-32 days).

    Allows ±10 % amount variance to handle rounding differences across billing cycles.
    """

    def calculate_score(self, context: ScoringContext, candidate: CandidateCategory) -> int:
        if not any(frag in candidate.category_name.lower() for frag in _RECURRING_FRAGMENTS):
            return 0

        target = abs(context.tx.amount)
        lo = int(target * 0.90)
        hi = int(target * 1.10)
        cutoff = datetime.now(UTC) - timedelta(days=32)

        for h in context.history:
            if h.category_id != candidate.category_id:
                continue
            tx_date: datetime = h.date if h.date.tzinfo else h.date.replace(tzinfo=UTC)
            if tx_date < cutoff:
                continue
            if lo <= abs(h.amount) <= hi:
                return +40

        return 0


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class HeuristicEngine:
    """Assembles scoring components and drives the evaluation loop.

    The public interface has two levels:

    ``evaluate(context, candidates)``
        Pure scoring loop.  Requires pre-built context and candidates.
        Useful for unit tests that don't need a DB session.

    ``run(db, tx, key)``
        Full orchestration: fetches candidates and history from the DB,
        calls evaluate, then derives the confidence score for the winner.
    """

    def __init__(self) -> None:
        # Extend this list to add new scoring rules -- no other changes needed.
        self.components: list[ScoringComponent] = [
            TransactionTypeRule(),
            AmountBracketRule(),
            TemporalPatternRule(),
        ]

    # -- Pure scoring loop (testable without a DB) ---------------------------

    def evaluate(self, context: ScoringContext, candidates: list[CandidateCategory]) -> str | None:
        best_category: str | None = None
        highest_score = 0

        for candidate in candidates:
            total_score = candidate.base_weight
            for component in self.components:
                total_score += component.calculate_score(context, candidate)

            if total_score > highest_score and total_score >= _CONFIDENCE_THRESHOLD:
                highest_score = total_score
                best_category = candidate.category_id

        return best_category

    # -- DB-integrated orchestration -----------------------------------------

    def run(self, db: Session, tx: Any, key: str) -> tuple[str, int] | None:
        """Fetch candidates + history, run evaluate, return (category_id, confidence) or None."""
        candidates = self._get_candidates(db, tx.user_id, key)
        if not candidates:
            return None

        history = self._get_history(db, tx.user_id)
        context = ScoringContext(tx=tx, history=history)

        winner_id = self.evaluate(context, candidates)
        if winner_id is None:
            return None

        # Re-derive the winner's final score for the confidence telemetry field.
        winner = next(c for c in candidates if c.category_id == winner_id)
        confidence = winner.base_weight + sum(
            comp.calculate_score(context, winner) for comp in self.components
        )
        return winner_id, min(confidence, 100)

    # -- DB helpers ----------------------------------------------------------

    def _get_candidates(self, db: Session, user_id: str, key: str) -> list[CandidateCategory]:
        from rapidfuzz import fuzz as rfuzz

        from app.models.category import Category
        from app.models.user_category_rule import UserCategoryRule

        rows = (
            db.query(UserCategoryRule, Category)
            .join(Category, Category.id == UserCategoryRule.category_id)
            .filter(
                UserCategoryRule.user_id == user_id,
                ~Category.is_hidden,
            )
            .all()
        )

        # Deduplicate by category_id, keeping the highest fuzzy score.
        seen: dict[str, CandidateCategory] = {}
        for rule, cat in rows:
            score = int(rfuzz.token_sort_ratio(key, rule.cleaned_narration))
            if score < _FUZZY_CANDIDATE_THRESHOLD:
                continue
            cid = str(cat.id)
            if cid not in seen or score > seen[cid].base_weight:
                seen[cid] = CandidateCategory(
                    category_id=cid,
                    category_name=cat.name,
                    base_weight=score,
                )
        return list(seen.values())

    def _get_history(self, db: Session, user_id: str) -> list[Any]:
        from app.models.transaction import Transaction

        cutoff = datetime.now(UTC) - timedelta(days=45)
        return (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.date >= cutoff,
                Transaction.category_id.isnot(None),
            )
            .all()
        )
