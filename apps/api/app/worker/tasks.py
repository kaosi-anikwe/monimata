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
Celery tasks — all background jobs for MoniMata.

Transactions are created by the bank-alert webhook or manual entry; there is
no polling of external APIs.  Tasks here handle work that should be offloaded
from the request path or needs a scheduled trigger.

  categorize_transactions          — enqueued by bank-alert webhook after upsert
  evaluate_nudges_for_transactions — enqueued by POST /sync/push
  deliver_queued_nudges            — beat: 7:05 AM WAT
  reconcile_budget_activity        — beat: 4:00 AM WAT (drift safety net)
  weekly_review_nudges             — beat: Friday 5 PM WAT (Phase 2 LLM path)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import app.worker.beat_schedule as _beat_schedule  # noqa: F401 — registers beat schedule
from app.core.database import SessionLocal
from app.models.budget import BudgetMonth
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


# ── categorize_transactions ───────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.categorize_transactions", bind=True)
def categorize_transactions(self, transaction_ids: list[str]) -> None:
    """Run the categorization pipeline for a list of transaction IDs.

    Triggered by the bank-alert webhook after new transactions are inserted.
    """
    from app.services.categorization import categorize_transaction
    from app.services.nudge_engine import evaluate_transaction_nudges
    from app.ws_manager import notify_user

    db = SessionLocal()
    try:
        from app.models.transaction import Transaction

        user_ids: set[str] = set()
        for tx_id in transaction_ids:
            tx = db.get(Transaction, tx_id)
            if tx and tx.category_id is None:
                category_id = categorize_transaction(db, tx)
                if category_id:
                    tx.category_id = category_id
                    _update_budget_activity(db, tx)
                    db.flush()
                    try:
                        evaluate_transaction_nudges(db, tx)
                    except Exception:
                        logger.exception("evaluate_transaction_nudges failed for tx=%s", tx_id)
            if tx:
                user_ids.add(str(tx.user_id))
        db.commit()

        for uid in user_ids:
            notify_user(uid, ["transactions", "nudges"])
    except Exception:
        db.rollback()
        logger.exception("categorize_transactions failed")
        raise
    finally:
        db.close()


# ── evaluate_nudges_for_transactions ─────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.evaluate_nudges_for_transactions")
def evaluate_nudges_for_transactions(transaction_ids: list[str]) -> None:
    """Evaluate nudge triggers for transactions pushed by the client with a
    category already set (so categorize_transactions won't run for them).

    Called by POST /sync/push for categorised new/updated transactions.
    """
    from app.services.nudge_engine import evaluate_transaction_nudges
    from app.ws_manager import notify_user

    db = SessionLocal()
    try:
        from app.models.transaction import Transaction

        user_ids: set[str] = set()
        for tx_id in transaction_ids:
            tx = db.get(Transaction, tx_id)
            if tx:
                try:
                    evaluate_transaction_nudges(db, tx)
                except Exception:
                    logger.exception("evaluate_transaction_nudges failed for tx=%s", tx_id)
                user_ids.add(str(tx.user_id))
        db.commit()

        for uid in user_ids:
            notify_user(uid, ["nudges"])
    except Exception:
        db.rollback()
        logger.exception("evaluate_nudges_for_transactions failed")
        raise
    finally:
        db.close()


# ── deliver_queued_nudges ─────────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.deliver_queued_nudges")
def deliver_queued_nudges() -> None:
    """Deliver all nudges that were queued during quiet hours."""
    from app.models.nudge import Nudge
    from app.models.user import User
    from app.services.push_service import send_push_notification
    from app.ws_manager import notify_user

    db = SessionLocal()
    try:
        now = datetime.now(UTC)
        queued = (
            db.query(Nudge)
            .filter(
                Nudge.delivered_at == None,  # noqa: E711
                Nudge.created_at < now,
            )
            .all()
        )

        notified_users: set[str] = set()
        for nudge in queued:
            nudge.delivered_at = now
            user: User | None = db.get(User, nudge.user_id)
            if user and user.expo_push_token:
                send_push_notification(
                    token=user.expo_push_token,
                    title=nudge.title or "MoniMata",
                    body=nudge.message,
                    data={"nudge_id": nudge.id, "trigger_type": nudge.trigger_type},
                )
            notified_users.add(str(nudge.user_id))

        db.commit()
        logger.info("deliver_queued_nudges: delivered %d nudges", len(queued))

        for uid in notified_users:
            notify_user(uid, ["nudges"])
    finally:
        db.close()


# ── weekly_review_nudges ──────────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.weekly_review_nudges")
def weekly_review_nudges() -> None:
    """Generate weekly review nudges for all active users. (Phase 2 — LLM path)"""
    logger.info("weekly_review_nudges: skipped — LLM path not yet implemented")


# ── reconcile_budget_activity ─────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.reconcile_budget_activity")
def reconcile_budget_activity() -> None:
    """Recompute budget_months.activity from the canonical transactions table.

    Runs nightly at 4:00 AM WAT as a safety net against drift that can occur
    from edge cases (e.g. manual-transaction deletes that failed to update
    activity, category re-assignment race conditions).
    """
    from sqlalchemy import text

    db = SessionLocal()
    try:
        rows = db.execute(
            text("""
                SELECT
                    t.user_id,
                    t.category_id,
                    to_char(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month,
                    SUM(t.amount) AS correct_activity
                FROM transactions t
                WHERE t.category_id IS NOT NULL
                GROUP BY t.user_id, t.category_id, DATE_TRUNC('month', t.date)
                """)
        ).fetchall()

        corrected = 0
        for row in rows:
            user_id, category_id, month, correct_activity = row
            bm = (
                db.query(BudgetMonth)
                .filter(
                    BudgetMonth.user_id == str(user_id),
                    BudgetMonth.category_id == str(category_id),
                    BudgetMonth.month == month,
                )
                .first()
            )
            if bm is None:
                bm = BudgetMonth(
                    user_id=str(user_id),
                    category_id=str(category_id),
                    month=month,
                    assigned=0,
                    activity=int(correct_activity),
                )
                db.add(bm)
                corrected += 1
            elif bm.activity != int(correct_activity):
                bm.activity = int(correct_activity)
                bm.updated_at = datetime.now(UTC)
                corrected += 1

        db.commit()
        logger.info("reconcile_budget_activity: corrected %d budget_month rows", corrected)
    except Exception:
        db.rollback()
        logger.exception("reconcile_budget_activity failed")
        raise
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _update_budget_activity(db, tx) -> None:
    """Increment/decrement budget_months.activity for the transaction's category and month."""
    if tx.category_id is None:
        return

    month_str = tx.date.strftime("%Y-%m")
    bm = (
        db.query(BudgetMonth)
        .filter(
            BudgetMonth.user_id == tx.user_id,
            BudgetMonth.category_id == tx.category_id,
            BudgetMonth.month == month_str,
        )
        .first()
    )

    if not bm:
        bm = BudgetMonth(
            user_id=tx.user_id,
            category_id=tx.category_id,
            month=month_str,
            assigned=0,
            activity=0,
        )
        db.add(bm)

    bm.activity += tx.amount
