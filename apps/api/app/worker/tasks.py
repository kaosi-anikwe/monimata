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
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import cast

import app.worker.beat_schedule as _beat_schedule  # noqa: F401 — registers beat schedule
from app.core.database import SessionLocal
from app.models.transaction import Transaction
from app.services.budget_logic import get_or_create_budget_month
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
        unresolved_by_user: dict[str, list[str]] = {}
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
                else:
                    # Tier 1-3 all failed — queue for LLM fallback.
                    unresolved_by_user.setdefault(str(tx.user_id), []).append(tx_id)
            if tx:
                user_ids.add(str(tx.user_id))
        db.commit()

        # Enqueue LLM batch per user for any transactions still uncategorised.
        for uid, ids in unresolved_by_user.items():
            cast(CeleryTask, run_llm_categorization).delay(uid, ids)

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


# ── run_llm_categorization ───────────────────────────────────────────────────


@celery_app.task(
    name="app.worker.tasks.run_llm_categorization",
    bind=True,
    max_retries=3,
)
def run_llm_categorization(
    self, user_id: str, tx_ids: list[str], notify_on_completion: bool = False
) -> None:  # type: ignore[misc]
    """Batch-categorise transactions using the user's BYOK LLM credential.

    Called by categorize_transactions after Tiers 1-3 leave transactions
    uncategorised.  Errors are handled per-status:
      - 429 / 503 → exponential backoff retry
      - 401 / 402 → deactivate credential + send push nudge, no retry
      - Persistent failure → leave category_id=None, set category_confidence=0

    When ``notify_on_completion=True`` (manual trigger), a push nudge is sent
    on success with categorisation stats, and on final retry failure.
    """
    from app.core.security import decrypt_api_key
    from app.models.category import Category
    from app.models.transaction import Transaction
    from app.models.user_ai_credential import UserAiCredential
    from app.models.user_ai_usage_log import UserAiUsageLog
    from app.services.llm import LlmHttpError, call_llm
    from app.services.nudge_engine import create_nudge

    db = SessionLocal()
    try:
        # Find the user's active credential (prefer gemini for cost).
        credential = (
            db.query(UserAiCredential)
            .filter(
                UserAiCredential.user_id == user_id,
                UserAiCredential.is_active.is_(True),
            )
            .order_by(UserAiCredential.created_at.desc())
            .first()
        )
        if credential is None:
            logger.info("run_llm_categorization: no active credential for user=%s", user_id)
            return

        # Decrypt the API key in-memory — never log it.
        api_key = decrypt_api_key(credential.encrypted_api_key)

        # Load transactions that are still uncategorised.
        txs = (
            db.query(Transaction)
            .filter(
                Transaction.id.in_(tx_ids),
                Transaction.user_id == user_id,
                Transaction.category_id.is_(None),
            )
            .all()
        )
        if not txs:
            return

        # Load the user's visible categories.
        categories = (
            db.query(Category).filter(Category.user_id == user_id, ~Category.is_hidden).all()
        )
        category_names = [c.name for c in categories]
        category_by_name = {c.name.lower(): c for c in categories}

        tx_batch = [{"id": tx.id, "narration": tx.cleaned_narration or tx.narration} for tx in txs]

        try:
            results, prompt_tokens, completion_tokens = call_llm(
                provider=credential.provider,
                api_key=api_key,
                transactions=tx_batch,
                categories=category_names,
            )
        except LlmHttpError as exc:
            # Any 4xx except 429 is a permanent client error — do not retry.
            is_permanent = 400 <= exc.status_code < 500 and exc.status_code != 429
            if is_permanent:
                from app.models.user import User

                if exc.status_code in (401, 402, 403):
                    # Invalid / exhausted / forbidden key — deactivate.
                    credential.is_active = False
                    db.commit()
                    user_obj = db.get(User, user_id)
                    if user_obj:
                        create_nudge(
                            db=db,
                            user=user_obj,
                            trigger_type="ai_credential_invalid",
                            title="AI tracking paused",
                            message=(
                                "Your AI API key is invalid or has run out of credit."
                                "Tap to restore."
                            ),
                            context={},
                        )
                        db.commit()
                elif notify_on_completion:
                    # 400 / other 4xx — bad request (e.g. malformed key).
                    user_obj = db.get(User, user_id)
                    if user_obj:
                        create_nudge(
                            db=db,
                            user=user_obj,
                            trigger_type="llm_categorization_failed",
                            title="AI categorisation failed",
                            message=(
                                f"The AI provider rejected the request (HTTP {exc.status_code}). "
                                "Please check your API key."
                            ),
                            context={},
                        )
                        db.commit()
                logger.warning(
                    "run_llm_categorization: permanent error HTTP %s user=%s",
                    exc.status_code,
                    user_id,
                )
                return
            # 429 / 5xx — transient; retry with exponential backoff.
            countdown = 30 * (2**self.request.retries)
            raise self.retry(exc=exc, countdown=countdown)

        finally:
            # Best-effort: overwrite the local variable before GC.
            api_key = ""  # noqa: F841

        # Apply results to transactions and log usage.
        tx_by_id = {tx.id: tx for tx in txs}
        success_count = 0
        for item in results:
            tx_id = item.get("tx_id")
            cat_name = item.get("category")
            confidence = int(item.get("confidence", 0))
            tx = tx_by_id.get(str(tx_id))
            if tx is None:
                continue

            matched_cat = category_by_name.get(cat_name.lower()) if cat_name else None
            if matched_cat and confidence > 0:
                tx.category_id = matched_cat.id
                tx.categorization_source = "llm"
                tx.category_confidence = min(confidence, 100)
                _update_budget_activity(db, tx)
                success_count += 1
            else:
                tx.categorization_source = "llm"
                tx.category_confidence = 0

            db.add(
                UserAiUsageLog(
                    user_id=user_id,
                    transaction_id=tx.id,
                    provider=credential.provider,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
            )

        db.commit()
        logger.info(
            "run_llm_categorization: processed %d transactions for user=%s",
            len(txs),
            user_id,
        )

        # Success nudge for manual triggers.
        if notify_on_completion:
            from app.models.user import User
            from app.ws_manager import notify_user

            user_obj = db.get(User, user_id)
            if user_obj:
                failed_count = len(txs) - success_count
                body = (
                    f"Categorised {success_count} of {len(txs)} transactions "
                    f"using {credential.provider.title()}."
                )
                if failed_count:
                    body += f" {failed_count} could not be matched and remain in your review queue."
                create_nudge(
                    db=db,
                    user=user_obj,
                    trigger_type="llm_categorization_complete",
                    title="AI categorisation complete",
                    message=body,
                    context={
                        "success_count": success_count,
                        "failed_count": failed_count,
                        "total": len(txs),
                        "provider": credential.provider,
                    },
                )
                db.commit()
                notify_user(user_id, ["transactions", "nudges"])
    except Exception as exc:
        from celery.exceptions import Retry

        if isinstance(exc, Retry):
            # Already scheduled by the inner LlmHttpError handler — propagate
            # without double-processing or double-nudging.
            raise
        db.rollback()
        logger.exception("run_llm_categorization failed for user=%s", user_id)
        # On the final retry, send a failure nudge if manually triggered.
        if notify_on_completion and self.request.retries >= self.max_retries:
            try:
                from app.models.user import User
                from app.services.nudge_engine import create_nudge as _cn

                with SessionLocal() as nudge_db:
                    user_obj = nudge_db.get(User, user_id)
                    if user_obj:
                        _cn(
                            db=nudge_db,
                            user=user_obj,
                            trigger_type="llm_categorization_failed",
                            title="AI categorisation failed",
                            message=(
                                "Automated categorisation failed after multiple retries. "
                                "Transactions remain in your review queue."
                            ),
                            context={},
                        )
                        nudge_db.commit()
            except Exception:
                logger.exception("run_llm_categorization: failed to send failure nudge")
        raise self.retry(exc=exc, countdown=60 * (2**self.request.retries))
    finally:
        db.close()


# ── embed_category_rule ───────────────────────────────────────────────────────


@celery_app.task(
    name="app.worker.tasks.embed_category_rule",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="embeddings",
)
def embed_category_rule(self, rule_id: str) -> None:  # type: ignore[misc]
    """Generate and store a 384-dim embedding for a UserCategoryRule.

    Routed to the 'embeddings' queue whose worker must be started with
    --concurrency=1 to prevent concurrent PyTorch matrix operations.

    Enqueued automatically when a UserCategoryRule is created or its
    cleaned_narration is updated (see _upsert_narration_map in transactions.py).
    """
    from app.models.user_category_rule import UserCategoryRule
    from app.services.categorization.embeddings import encode

    db = SessionLocal()
    try:
        rule = db.get(UserCategoryRule, rule_id)
        if rule is None:
            logger.warning("embed_category_rule: rule %s not found — skipping", rule_id)
            return
        rule.embedding = encode(rule.cleaned_narration)
        db.commit()
        logger.info("embed_category_rule: embedded rule %s", rule_id)
    except Exception as exc:
        db.rollback()
        logger.exception("embed_category_rule failed for rule=%s", rule_id)
        raise self.retry(exc=exc)
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _update_budget_activity(db, tx) -> None:
    """Increment/decrement budget_months.activity for the transaction's category and month.

    Delegates to get_or_create_budget_month which calls ensure_budget_month_initialized
    first, so carried_over is always populated correctly before activity is written.
    """
    if tx.category_id is None:
        return

    month_str = tx.date.strftime("%Y-%m")
    bm = get_or_create_budget_month(db, tx.user_id, tx.category_id, month_str)
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
    from app.services.ingestion import (
        UnsupportedBankError,
        UnsupportedChannelError,
        parse_statement,
    )
    from app.services.nudge_engine import send_statement_failed_push, send_statement_processed_push
    from app.ws_manager import notify_user

    bank_display = bank_slug.replace("_", " ").title()

    db = SessionLocal()
    try:
        pdf_bytes = _base64.b64decode(pdf_b64)

        # Load user early so we can send a failure push if parsing blows up.
        user: User | None = db.get(User, user_id)
        account: BankAccount | None = db.get(BankAccount, account_id)
        if account is None or user is None:
            logger.warning(
                "process_bank_statement: account or user not found account=%s user=%s",
                account_id,
                user_id,
            )
            return

        try:
            parsed_txns = parse_statement(pdf_bytes, filename, bank_slug)
        except (UnsupportedBankError, UnsupportedChannelError, ValueError) as exc:
            logger.warning(
                "process_bank_statement: parse failed bank=%s account=%s: %s",
                bank_slug,
                account_id,
                exc,
            )
            try:
                send_statement_failed_push(db, user=user, bank_name=bank_display)
            except Exception:
                logger.exception("process_bank_statement: send_statement_failed_push failed")
            return

        if not parsed_txns:
            logger.info(
                "process_bank_statement: no transactions bank=%s account=%s",
                bank_slug,
                account_id,
            )
            send_statement_processed_push(
                db, user=user, bank_name=bank_display, imported=0, updated=0
            )
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

        from app.services.categorization import clean_narration

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
                existing.cleaned_narration = clean_narration(narration)
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
                manual_match.cleaned_narration = clean_narration(narration)
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
                cleaned_narration=clean_narration(narration),
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
            db,
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


# ── process_receipt ───────────────────────────────────────────────────────────


@celery_app.task(name="app.worker.tasks.process_receipt", bind=True)
def process_receipt(
    self,
    image_b64: str,
    user_id: str,
) -> None:
    """Identify the bank and account from a receipt image, then upsert the transaction.

    Parameters
    ----------
    image_b64:
        Base64-encoded raw image bytes (JPEG / PNG / WebP).
    user_id:
        UUID string of the ``User`` who uploaded the receipt.

    Flow
    ----
    1. Decode bytes and call ``identify_receipt()`` — tries every registered
       parser's ``identify()`` until one recognises the image and returns
       ``(bank_slug, account_suffix)``.
    2. Decrypt all the user's accounts for that bank, find the one whose
       account number ends with the suffix.
    3. Call ``parse_receipt(image_bytes, bank_slug, account_number)`` for the
       full parse.
    4. Dedup by ``external_ref``, upsert, categorize, notify.
    """
    import base64 as _base64

    from sqlalchemy.exc import IntegrityError

    from app.core.security import decrypt_pii
    from app.models.bank_account import BankAccount
    from app.models.transaction import Transaction, TransactionSource
    from app.models.user import User
    from app.services.ingestion import (
        UnsupportedBankError,
        UnsupportedChannelError,
        identify_receipt,
        parse_receipt,
    )
    from app.services.nudge_engine import (
        send_receipt_duplicate_push,
        send_receipt_failed_push,
        send_receipt_processed_push,
    )
    from app.ws_manager import notify_user

    db = SessionLocal()
    try:
        image_bytes = _base64.b64decode(image_b64)

        # Load user first so we can send failure notifications at any exit point.
        user: User | None = db.get(User, user_id)
        if user is None:
            logger.warning("process_receipt: user not found user=%s", user_id)
            return

        # ── Identify bank + account suffix ────────────────────────────────────
        try:
            identification = identify_receipt(image_bytes)
        except Exception as exc:
            logger.warning("process_receipt: identify_receipt failed user=%s: %s", user_id, exc)
            try:
                send_receipt_failed_push(db, user=user, reason="unrecognised")
            except Exception:
                logger.exception("process_receipt: send_receipt_failed_push failed")
            return

        if identification is None:
            logger.info("process_receipt: no parser recognised the receipt user=%s", user_id)
            try:
                send_receipt_failed_push(db, user=user, reason="unrecognised")
            except Exception:
                logger.exception("process_receipt: send_receipt_failed_push failed")
            return

        bank_slug, suffixes = identification
        bank_display = bank_slug.replace("_", " ").title()

        # ── Resolve account + parse in one pass ───────────────────────────────
        # `identify()` returns suffixes from ALL phones on the receipt (both
        # user and counterparty), so multiple accounts may match a suffix.
        # We call `parse()` on each candidate — the first successful parse
        # with a non-None result is the correct account/direction.
        candidates = (
            db.query(BankAccount)
            .filter(
                BankAccount.user_id == user_id,
                BankAccount.bank_slug == bank_slug,
                BankAccount.deleted_at.is_(None),
            )
            .all()
        )

        account: BankAccount | None = None
        account_id: str = ""
        parsed = None
        suffix_matched = False  # tracks whether any candidate's number matched a suffix

        for candidate in candidates:
            if candidate.account_number is None:
                continue
            try:
                decrypted = decrypt_pii(candidate.account_number)
            except Exception:
                continue
            if not any(decrypted.endswith(s) for s in suffixes):
                continue
            suffix_matched = True
            try:
                result = parse_receipt(image_bytes, bank_slug, decrypted)
            except (UnsupportedBankError, UnsupportedChannelError, ValueError) as exc:
                logger.warning(
                    "process_receipt: parse failed bank=%s account=%s: %s",
                    bank_slug,
                    candidate.id,
                    exc,
                )
                continue
            if result is not None:
                account = candidate
                account_id = str(candidate.id)
                parsed = result
                break

        if parsed is None or account is None:
            # Distinguish: did we find a matching account number but parsing failed,
            # or did no account number match the suffix at all?
            failure_reason = "parse_failed" if suffix_matched else "no_account"
            logger.warning(
                "process_receipt: could not resolve account or parse receipt "
                "bank=%s suffixes=%s user=%s reason=%s",
                bank_slug,
                suffixes,
                user_id,
                failure_reason,
            )
            try:
                send_receipt_failed_push(
                    db, user=user, reason=failure_reason, bank_name=bank_display
                )
            except Exception:
                logger.exception("process_receipt: send_receipt_failed_push failed")
            return

        # ── Dedup by external_ref ─────────────────────────────────────────────
        if parsed.transaction_ref:
            existing = (
                db.query(Transaction)
                .filter(
                    Transaction.account_id == account_id,
                    Transaction.external_ref == parsed.transaction_ref,
                )
                .first()
            )
            if existing is not None:
                logger.info(
                    "process_receipt: duplicate ref=%s account=%s — skipping",
                    parsed.transaction_ref,
                    account_id,
                )
                try:
                    send_receipt_duplicate_push(
                        db,
                        user=user,
                        bank_name=bank_display,
                        amount_kobo=abs(parsed.amount_kobo),
                        transaction_id=str(existing.id),
                    )
                except Exception:
                    logger.exception("process_receipt: send_receipt_duplicate_push failed")
                return

        # ── Build transaction ─────────────────────────────────────────────────
        signed_amount = (
            -parsed.amount_kobo if parsed.transaction_type == "debit" else parsed.amount_kobo
        )
        narration = parsed.narration or f"{bank_display} {parsed.transaction_type.capitalize()}"
        tx_date = parsed.transaction_date or datetime.now(UTC)

        from app.services.categorization import clean_narration

        tx = Transaction(
            user_id=user_id,
            account_id=account_id,
            date=tx_date,
            amount=signed_amount,
            narration=narration,
            cleaned_narration=clean_narration(narration),
            type=parsed.transaction_type,
            balance_after=parsed.balance_kobo,
            source=TransactionSource.receipt,
            external_ref=parsed.transaction_ref,
        )
        db.add(tx)
        account.last_synced_at = datetime.now(UTC)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.warning(
                "process_receipt: integrity error bank=%s account=%s",
                bank_slug,
                account_id,
            )
            return

        tx_id = str(tx.id)
        logger.info(
            "process_receipt: bank=%s account=%s tx=%s amount=%d",
            bank_slug,
            account_id,
            tx_id,
            signed_amount,
        )

        # ── Categorize & notify ───────────────────────────────────────────────
        try:
            cast(CeleryTask, categorize_transactions).delay([tx_id])
        except Exception:
            logger.exception("process_receipt: failed to enqueue categorize_transactions")

        notify_user(user_id, ["transactions", "budget", "accounts"])
        send_receipt_processed_push(
            db,
            user=user,
            bank_name=bank_display,
            amount_kobo=abs(signed_amount),
            direction=parsed.transaction_type,
            transaction_id=tx_id,
        )

    except Exception:
        db.rollback()
        logger.exception("process_receipt: unexpected error user=%s", user_id)
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
