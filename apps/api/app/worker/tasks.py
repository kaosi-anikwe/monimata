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

Naming convention:
  - Tasks triggered by webhooks / API: fetch_transactions, categorize_transactions
  - Tasks triggered by beat: nightly_reconciliation, deliver_queued_nudges, weekly_review_nudges
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, cast
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select

from app.core.database import SessionLocal
from app.worker.celery_app import CeleryTask, celery_app
import app.worker.beat_schedule as _beat_schedule  # noqa: F401 — registers beat schedule

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a synchronous Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── fetch_transactions ────────────────────────────────────────────────────────


@celery_app.task(
    name="app.worker.tasks.fetch_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def fetch_transactions(self, mono_account_id: str) -> dict:
    """
    Fetch transactions from Mono for the given account.
    Upserts rows using mono_id as the deduplication key.
    Triggered by: Mono webhook, POST /accounts/{id}/sync, nightly reconciliation.
    """
    from app.models.bank_account import BankAccount
    from app.models.transaction import Transaction
    from app.services.mono_client import mono_client

    db = SessionLocal()
    try:
        account: BankAccount | None = (
            db.query(BankAccount)
            .filter(
                BankAccount.mono_account_id == mono_account_id,
                BankAccount.is_active == True,
            )
            .first()
        )

        if not account:
            logger.warning(
                "fetch_transactions: account not found for mono_id=%s", mono_account_id
            )
            return {"status": "skipped", "reason": "account_not_found"}

        # Fetch since last sync (or all available if never synced)
        is_initial_sync = account.last_synced_at is None
        start_date = account.last_synced_at
        raw_txns = _run_async(
            mono_client.get_transactions(
                mono_account_id, start=start_date, end=start_date
            )
        )

        # Also refresh account balance
        account_data = _run_async(mono_client.get_account(mono_account_id))
        if "account" in account_data:
            new_balance = account_data["account"].get("balance", account.balance)
            account.balance = int(new_balance)

        new_ids: list[str] = []
        for raw in raw_txns:
            mono_tx_id: str | None = raw.get("_id") or raw.get("id")
            if not mono_tx_id:
                continue

            existing = (
                db.query(Transaction).filter(Transaction.mono_id == mono_tx_id).first()
            )
            if existing:
                continue  # already imported — skip

            tx_amount = int(raw.get("amount", 0))
            tx_date_str = raw.get("date", "")
            tx_date = _parse_mono_date(tx_date_str)
            tx_type = raw.get("type", "debit").lower()
            signed_amount = tx_amount if tx_type == "credit" else -tx_amount

            # Check if an Interswitch transaction already covers this entry
            is_dupe = _find_duplicate(db, account.id, tx_date, tx_amount)
            if is_dupe:
                # Link mono_id to the existing Interswitch transaction instead
                is_dupe.mono_id = mono_tx_id
                db.add(is_dupe)
                logger.info(
                    "Linked mono_id=%s to existing Interswitch tx=%s",
                    mono_tx_id,
                    is_dupe.id,
                )
                continue

            # Check if the user already recorded this manually — if so, verify/clear
            # it by linking the Mono record instead of creating a duplicate row.
            manual_match = _find_manual_match(db, account.id, tx_date, signed_amount)
            if manual_match:
                manual_match.mono_id = mono_tx_id
                manual_match.narration = raw.get("narration") or manual_match.narration
                manual_match.balance_after = raw.get("balance")
                db.add(manual_match)
                logger.info(
                    "Cleared manual tx=%s with mono_id=%s",
                    manual_match.id,
                    mono_tx_id,
                )
                continue

            txn = Transaction(
                user_id=account.user_id,
                account_id=account.id,
                mono_id=mono_tx_id,
                date=tx_date,
                amount=signed_amount,
                narration=raw.get("narration", ""),
                type=tx_type,
                balance_after=raw.get("balance"),
                source="mono",
            )
            db.add(txn)
            new_ids.append(txn.id)

        account.requires_reauth = False
        account.last_synced_at = datetime.now(timezone.utc)

        # On the very first sync, anchor starting_balance so that:
        #   displayed_balance = starting_balance + SUM(transactions.amount)
        # equals Mono's reported balance at link time.
        if is_initial_sync:
            from sqlalchemy import func as sqlfunc

            tx_sum: int = (
                db.query(sqlfunc.sum(Transaction.amount))
                .filter(Transaction.account_id == account.id)
                .scalar()
                or 0
            )
            account.starting_balance = account.balance - tx_sum
            logger.info(
                "Set starting_balance=%d for account=%s (mono_balance=%d, tx_sum=%d)",
                account.starting_balance,
                account.id,
                account.balance,
                tx_sum,
            )

        db.commit()

        # Enqueue categorization for new transactions
        if new_ids:
            cast(CeleryTask, categorize_transactions).delay(new_ids)

        # Notify connected WebSocket clients
        _notify_sync_complete(account.user_id, account.id)

        return {"status": "ok", "new_transactions": len(new_ids)}

    except Exception as exc:
        db.rollback()
        logger.exception(
            "fetch_transactions failed for mono_account_id=%s", mono_account_id
        )
        raise self.retry(exc=exc)
    finally:
        db.close()


def _parse_mono_date(date_str: str) -> datetime:
    """Parse Mono date strings to a UTC-aware datetime.

    Mono may return:
      - full ISO datetime: "2025-03-10T14:30:00.000Z" / "2025-03-10T14:30:00Z"
      - date-only: "2025-03-10"

    Date-only strings are promoted to midnight UTC so all transactions have a
    consistent TIMESTAMPTZ representation in the database.
    """
    if not date_str:
        return datetime.now(timezone.utc)
    # Full datetime with milliseconds
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    # Date-only — promote to midnight UTC
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    return datetime.now(timezone.utc)


def _find_manual_match(db, account_id: str, tx_datetime: datetime, signed_amount: int):
    """Return an uncleared manual transaction that likely corresponds to this Mono
    entry.  Match criteria:
      - same account
      - amount within ±100 kobo
      - datetime within ±2 hours

    A 2-hour window handles network/posting delays while preventing false
    positives for users who make the same-amount purchase every day.
    """
    from app.models.transaction import Transaction
    from datetime import timedelta

    return (
        db.query(Transaction)
        .filter(
            Transaction.account_id == account_id,
            Transaction.source == "manual",
            Transaction.mono_id == None,  # noqa: E711 — not yet cleared
            Transaction.date.between(
                tx_datetime - timedelta(hours=2), tx_datetime + timedelta(hours=2)
            ),
            Transaction.amount.between(signed_amount - 100, signed_amount + 100),
        )
        .first()
    )


def _find_duplicate(db, account_id: str, tx_datetime: datetime, amount: int):
    """Return an existing Interswitch transaction that matches this Mono debit
    (within ±100 kobo, within ±1 day to handle posting-date lag)."""
    from app.models.transaction import Transaction
    from datetime import timedelta

    return (
        db.query(Transaction)
        .filter(
            Transaction.account_id == account_id,
            Transaction.source == "interswitch",
            Transaction.date.between(
                tx_datetime - timedelta(days=1), tx_datetime + timedelta(days=1)
            ),
            Transaction.amount.between(-amount - 100, -amount + 100),
        )
        .first()
    )


def _notify_sync_complete(user_id: str, account_id: str) -> None:
    """Publish a sync_complete event to the WebSocket channel (via Redis pub/sub)."""
    import json
    from app.core.redis_client import get_redis

    r = get_redis()
    r.publish(
        f"ws:{user_id}", json.dumps({"type": "sync_complete", "account_id": account_id})
    )


# ── categorize_transactions ───────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.categorize_transactions", bind=True)
def categorize_transactions(self, transaction_ids: List[str]) -> None:
    """Run the categorization pipeline for a list of transaction IDs."""
    from app.services.categorization import categorize_transaction
    from app.services.nudge_engine import evaluate_transaction_nudges

    db = SessionLocal()
    try:
        from app.models.transaction import Transaction

        for tx_id in transaction_ids:
            tx = db.get(Transaction, tx_id)
            if tx and tx.category_id is None:
                category_id = categorize_transaction(db, tx)
                if category_id:
                    tx.category_id = category_id
                    _update_budget_activity(db, tx)
                    # Evaluate nudge triggers now that we know the category + budget impact.
                    # flush first so budget month changes are visible within the session.
                    db.flush()
                    try:
                        evaluate_transaction_nudges(db, tx)
                    except Exception:
                        logger.exception(
                            "evaluate_transaction_nudges failed for tx=%s", tx_id
                        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("categorize_transactions failed")
        raise
    finally:
        db.close()


def _update_budget_activity(db, tx) -> None:
    """Increment/decrement budget_months.activity for the transaction's category and month."""
    from app.models.budget import BudgetMonth

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

    # activity tracks debit (negative) amounts — add tx.amount directly
    bm.activity += tx.amount


# ── nightly_reconciliation ────────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.nightly_reconciliation")
def nightly_reconciliation() -> None:
    """Re-sync all accounts that haven't been synced in the last 26 hours."""
    from app.models.bank_account import BankAccount

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=26)
        stale_accounts = (
            db.query(BankAccount)
            .filter(
                BankAccount.is_active == True,
                (BankAccount.last_synced_at == None)
                | (BankAccount.last_synced_at < cutoff),
            )
            .all()
        )

        for account in stale_accounts:
            cast(CeleryTask, fetch_transactions).delay(account.mono_account_id)

        logger.info("nightly_reconciliation: enqueued %d accounts", len(stale_accounts))
    finally:
        db.close()


# ── deliver_queued_nudges ─────────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.deliver_queued_nudges")
def deliver_queued_nudges() -> None:
    """Deliver all nudges that were queued during quiet hours."""
    from app.models.nudge import Nudge
    from app.models.user import User
    from app.services.push_service import send_push_notification

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        queued = (
            db.query(Nudge)
            .filter(
                Nudge.delivered_at == None,  # noqa: E711
                Nudge.created_at < now,
            )
            .all()
        )

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

        db.commit()
        logger.info("deliver_queued_nudges: delivered %d nudges", len(queued))
    finally:
        db.close()


# ── weekly_review_nudges ──────────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.weekly_review_nudges")
def weekly_review_nudges() -> None:
    """Generate and stagger weekly review nudges for all active users. (Phase 2 — LLM path)"""
    logger.info("weekly_review_nudges: skipped — LLM path not yet implemented")
