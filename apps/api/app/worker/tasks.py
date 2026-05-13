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
from datetime import UTC, datetime, timedelta
from typing import cast

import app.worker.beat_schedule as _beat_schedule  # noqa: F401 — registers beat schedule
from app.core.database import SessionLocal
from app.models.budget import BudgetMonth
from app.models.transaction import Transaction
from app.worker.celery_app import CeleryTask, celery_app

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


# ── process_bank_statement ────────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.process_bank_statement", bind=True)
def process_bank_statement(
    self,
    pdf_b64: str,
    filename: str,
    bank_slug: str,
    account_id: str,
    user_id: str,
) -> None:
    """Parse a bank statement PDF and upsert its transactions.

    Offloaded from the webhook after account ownership is verified.  Sends
    push notifications when complete (success or empty statement).
    """
    import base64 as _base64

    from sqlalchemy.exc import IntegrityError

    from app.models.bank_account import BankAccount
    from app.models.transaction import Transaction, TransactionSource
    from app.models.user import User
    from app.services.ingestion import UnsupportedBankError
    from app.services.ingestion.channels.statement import UnsupportedChannelError, parse_statement
    from app.services.nudge_engine import send_statement_processed_push
    from app.ws_manager import notify_user

    bank_display = bank_slug.replace("_", " ").title()

    db = SessionLocal()
    try:
        pdf_bytes = _base64.b64decode(pdf_b64)

        try:
            parsed_txns = parse_statement(pdf_bytes, filename, bank_slug)
        except (UnsupportedBankError, UnsupportedChannelError, ValueError) as exc:
            logger.warning(
                "process_bank_statement: parse failed bank=%s account=%s: %s",
                bank_slug,
                account_id,
                exc,
            )
            return

        account: BankAccount | None = db.get(BankAccount, account_id)
        user: User | None = db.get(User, user_id)
        if account is None or user is None:
            logger.warning(
                "process_bank_statement: account or user not found account=%s user=%s",
                account_id,
                user_id,
            )
            return

        if not parsed_txns:
            logger.info(
                "process_bank_statement: no transactions bank=%s account=%s",
                bank_slug,
                account_id,
            )
            send_statement_processed_push(user=user, bank_name=bank_display, imported=0, updated=0)
            return

        # Build ref → transaction lookup for O(1) dedup.
        existing_by_ref: dict[str, Transaction] = {
            tx.external_ref: tx
            for tx in db.query(Transaction)
            .filter(
                Transaction.account_id == account_id,
                Transaction.external_ref.isnot(None),
            )
            .all()
            if tx.external_ref is not None
        }

        inserted_txs: list[Transaction] = []
        updated_ids: list[str] = []

        for txn in parsed_txns:
            signed_amount = -txn.amount_kobo if txn.transaction_type == "debit" else txn.amount_kobo
            narration = txn.narration or f"{bank_display} {txn.transaction_type.capitalize()}"
            tx_date = txn.transaction_date or datetime.now(UTC)

            # Case 1: ref already in DB → update in place (preserve category/memo/is_split)
            if txn.transaction_ref and txn.transaction_ref in existing_by_ref:
                existing = existing_by_ref[txn.transaction_ref]
                existing.date = tx_date
                existing.amount = signed_amount
                existing.narration = narration
                existing.type = txn.transaction_type
                existing.balance_after = txn.balance_kobo
                existing.source = TransactionSource.statement
                updated_ids.append(str(existing.id))
                continue

            # Case 2: matching unlinked manual entry → upgrade to statement
            manual_match = _find_manual_match(
                db, account_id, txn.transaction_type, signed_amount, tx_date
            )
            if manual_match is not None:
                manual_match.date = tx_date
                manual_match.narration = narration
                manual_match.balance_after = txn.balance_kobo
                manual_match.source = TransactionSource.statement
                manual_match.external_ref = txn.transaction_ref
                updated_ids.append(str(manual_match.id))
                if txn.transaction_ref:
                    existing_by_ref[txn.transaction_ref] = manual_match
                continue

            # Case 3: new transaction
            tx = Transaction(
                user_id=user_id,
                account_id=account_id,
                date=tx_date,
                amount=signed_amount,
                narration=narration,
                type=txn.transaction_type,
                balance_after=txn.balance_kobo,
                source=TransactionSource.statement,
                external_ref=txn.transaction_ref,
            )
            db.add(tx)
            if txn.transaction_ref:
                existing_by_ref[txn.transaction_ref] = tx
            inserted_txs.append(tx)

        account.last_synced_at = datetime.now(UTC)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.warning(
                "process_bank_statement: integrity error bank=%s account=%s",
                bank_slug,
                account_id,
            )
            return

        # IDs are available after commit.
        inserted_ids = [str(tx.id) for tx in inserted_txs]

        logger.info(
            "process_bank_statement: bank=%s account=%s inserted=%d updated=%d",
            bank_slug,
            account_id,
            len(inserted_ids),
            len(updated_ids),
        )

        # ── Anchor starting_balance to the bank's closing balance ─────────
        # Find the most recent transaction that carries a balance_after value;
        # that is the bank's authoritative closing balance for this account.
        # Recompute starting_balance so that:
        #   starting_balance + SUM(all transactions) == bank closing balance
        # This keeps computed_balance in perfect sync with the bank regardless
        # of how many historical transactions we hold.
        anchor_tx = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == account_id,
                Transaction.balance_after.isnot(None),
            )
            .order_by(Transaction.date.desc())
            .first()
        )
        if anchor_tx is not None and anchor_tx.balance_after is not None:
            from sqlalchemy import func as _func

            total_sum: int = (
                db.query(_func.sum(Transaction.amount))
                .filter(Transaction.account_id == account_id)
                .scalar()
                or 0
            )
            new_starting = anchor_tx.balance_after - total_sum
            if account.starting_balance != new_starting:
                logger.info(
                    "process_bank_statement: anchoring starting_balance old=%d new=%d account=%s",
                    account.starting_balance,
                    new_starting,
                    account_id,
                )
                account.starting_balance = new_starting
                db.commit()

        if inserted_ids:
            try:
                cast(CeleryTask, categorize_transactions).delay(inserted_ids)
            except Exception:
                logger.exception(
                    "process_bank_statement: failed to enqueue categorize_transactions"
                )

        notify_user(user_id, ["transactions", "budget", "accounts"])
        send_statement_processed_push(
            user=user,
            bank_name=bank_display,
            imported=len(inserted_ids),
            updated=len(updated_ids),
        )

    except Exception:
        db.rollback()
        logger.exception(
            "process_bank_statement: unexpected error bank=%s account=%s",
            bank_slug,
            account_id,
        )
        raise
    finally:
        db.close()


def _find_manual_match(
    db,
    account_id: str,
    txn_type: str,
    signed_amount: int,
    tx_date: datetime,
) -> Transaction | None:
    """Return the single unlinked manual transaction that matches a statement entry.

    Returns ``None`` when zero or more than one candidate is found so that
    ambiguous cases always produce a new insert rather than a wrong upgrade.
    """
    from app.models.transaction import Transaction, TransactionSource

    window_start = tx_date - timedelta(hours=6)
    window_end = tx_date + timedelta(hours=6)
    candidates = (
        db.query(Transaction)
        .filter(
            Transaction.account_id == account_id,
            Transaction.source == TransactionSource.manual,
            Transaction.external_ref.is_(None),
            Transaction.type == txn_type,
            Transaction.amount == signed_amount,
            Transaction.date.between(window_start, window_end),
        )
        .all()
    )
    return candidates[0] if len(candidates) == 1 else None
