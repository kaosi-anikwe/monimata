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
Nudge Engine — evaluates DSL rules and creates Nudge rows.

All transaction-triggered nudges are fully DSL-driven with per-group
rate limiting via Redis counters (driven by the user's fatigue_limit).

Operational notifications (statements, receipts, transaction alerts) are
not rate-limited — they fire every time.

Quiet hours:
  Derived from user.nudge_settings.quiet_hours_start / quiet_hours_end (HH:MM, WAT).
  During quiet hours, nudge.delivered_at is set to None (queued).
  The `deliver_queued_nudges` beat task (07:05 WAT) dispatches all queued nudges.
  Outside quiet hours, nudge.delivered_at = created_at and a push is sent immediately.

Push delivery:
  Calls push_service.send_push_notification which handles both Expo push tokens.
  Failures are logged and swallowed — never affect the caller.
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime, time, timedelta, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# West Africa Time — UTC+1, no daylight saving.
WAT = timezone(timedelta(hours=1))

if TYPE_CHECKING:
    from app.models.nudge import Nudge
    from app.models.transaction import Transaction
    from app.models.user import User

TITLES: dict[str, str] = {
    "transaction_received": "{tx_type} Alert",
    "statement_received": "Statement received",
    "statement_processed": "Statement imported",
    "receipt_received": "Receipt received",
    "receipt_processed": "Receipt imported",
    "receipt_failed": "Receipt import failed",
    "receipt_duplicate": "Already recorded",
    "statement_failed": "Statement import failed",
}

MESSAGES: dict[str, list[str]] = {
    "transaction_received": [
        "{type_verb} ₦{amount_naira} — {narration}. Balance: ₦{balance_naira}.",
        "₦{amount_naira} {type_verb_past} your account. {narration}. Bal: ₦{balance_naira}.",
    ],
    "statement_received": [
        "Your {bank_name} statement don land. We dey process am now.",
        "{bank_name} statement received — importing your transactions in the background.",
    ],
    "statement_processed": [
        "{imported} new transactions imported from your {bank_name} statement."
        "{updated} existing updated.",
        "Done! {imported} new, {updated} updated from your {bank_name} statement.",
    ],
    "receipt_received": [
        "Your {bank_name} receipt don land. We dey process am now.",
        "{bank_name} receipt received — importing your transaction in the background.",
    ],
    "receipt_processed": [
        "Transaction of ₦{amount_naira} {direction} recorded from your {bank_name} receipt.",
        "Done! ₦{amount_naira} {direction} imported from your {bank_name} receipt.",
    ],
    "receipt_duplicate": [
        "That ₦{amount_naira} {bank_name} transaction is already in your records "
        "— no need to re-upload.",
        "This {bank_name} receipt looks like a duplicate."
        "The ₦{amount_naira} transaction is already saved.",
    ],
    "statement_failed": [
        "Couldn't import your {bank_name} statement. "
        "Download a fresh copy directly from your bank app and try again.",
        "Your {bank_name} statement couldn't be parsed. "
        "Make sure it's an unmodified PDF from your bank and re-upload.",
    ],
}

# Reason-keyed messages for receipt_failed — kept separate so MESSAGES stays list[str]-typed.
RECEIPT_FAILED_MESSAGES: dict[str, str] = {
    "unrecognised": (
        "We couldn't identify this receipt. "
        "Make sure it's a clear, unedited photo or PDF of your bank transaction receipt."
    ),
    "no_account": (
        "We recognised a {bank_name} receipt but your {bank_name} account isn't linked. "
        "Add the account in MoniMata and re-upload."
    ),
    "parse_failed": (
        "We found a {bank_name} receipt but couldn't read the transaction details. "
        "Try a clearer photo or export the receipt as a PDF."
    ),
}

# Maps operational trigger_type → navigation screen.
# Used only for statement/receipt/transaction notifications — not for nudges
# (those always go to the nudges screen via trigger_type="nudge").
# Valid screen values the app must handle:
#   "transactions"  – transaction list (account feed)
#   "transaction"   – single transaction detail (requires data.transaction_id)
#   "accounts"      – accounts / linked-banks screen
#   "nudges"        – in-app notifications list
PUSH_SCREEN: dict[str, str] = {
    "transaction_received": "transactions",
    "statement_received": "accounts",
    "statement_processed": "transactions",
    "statement_failed": "accounts",
    "receipt_received": "transactions",
    "receipt_processed": "transaction",
    "receipt_duplicate": "transaction",
    "receipt_failed": "transactions",
}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _kobo_to_naira_str(kobo: int) -> str:
    """Format a kobo amount as a human-readable Naira string. e.g. 100000 → 1,000.00"""
    naira = abs(kobo) / 100
    return f"{naira:,.2f}"


def _is_quiet_hours(nudge_settings: dict) -> bool:
    """Return True if the current WAT clock time is within the user's quiet period."""
    now_wat = datetime.now(WAT).time()
    qs: str = nudge_settings.get("quiet_hours_start", "23:00")
    qe: str = nudge_settings.get("quiet_hours_end", "07:00")
    try:
        sh, sm = map(int, qs.split(":"))
        eh, em = map(int, qe.split(":"))
    except (ValueError, AttributeError):
        return False
    start = time(sh, sm)
    end = time(eh, em)
    # Quiet window spans midnight if start > end (e.g. 23:00 → 07:00)
    if start > end:
        return now_wat >= start or now_wat < end
    return start <= now_wat < end


# ── Core creator ─────────────────────────────────────────────────────────────


def create_nudge(
    db: Session,
    user: User,
    trigger_type: str,
    title: str,
    message: str,
    context: dict,
    category_id: str | None = None,
    *,
    rule_id: str | None = None,
    send_push: bool = True,
    transaction_id: str | None = None,
    push_data: dict | None = None,
) -> Nudge:
    """
    Persist a Nudge row and optionally dispatch a push notification.

    Quiet hours:
      Outside quiet hours → delivered_at = now, push sent.
      Inside quiet hours  → delivered_at = None (queued for 07:05 WAT delivery).

    The push send swallows errors — nudge row is always committed regardless.
    """
    from app.models.nudge import Nudge
    from app.services.push_service import send_push_notification

    now = datetime.now(UTC)
    quiet = _is_quiet_hours(user.nudge_settings or {})

    nudge = Nudge(
        user_id=user.id,
        trigger_type=trigger_type,
        title=title,
        message=message,
        context=context,
        category_id=category_id,
        rule_id=rule_id,
        delivered_at=None if quiet else now,
    )
    db.add(nudge)
    db.flush()  # populate nudge.id without committing the outer transaction

    if send_push and not quiet and user.expo_push_token:
        ctx = nudge.context or {}
        # Start with the full context so the client has everything on arrival,
        # then overlay the canonical push fields to guarantee they're present.
        _push_data = {**ctx}
        _push_data["trigger_type"] = trigger_type
        _push_data["nudge_id"] = nudge.id
        _push_data["nudge_type"] = ctx.get("nudge_type") or trigger_type
        _push_data["screen"] = ctx.get("screen") or PUSH_SCREEN.get(trigger_type, "nudges")
        if nudge.category_id:
            _push_data["category_id"] = nudge.category_id
        if transaction_id:
            _push_data["transaction_id"] = transaction_id
        if push_data:
            _push_data.update(push_data)
        expired = send_push_notification(
            token=user.expo_push_token,
            title=title,
            body=message,
            data=_push_data,
        )
        if expired:
            user.expo_push_token = None
            db.flush()

    logger.info(
        "Nudge created: type=%s user=%s category=%s queued=%s",
        trigger_type,
        user.id,
        category_id,
        quiet,
    )
    if quiet:
        # Calculate the next delivery window using the user's own quiet_hours_end
        # (not a hardcoded time), so the log is accurate for custom schedules.
        ns_log = user.nudge_settings or {}
        qe_str: str = ns_log.get("quiet_hours_end", "07:00")
        try:
            eh, em = map(int, qe_str.split(":"))
        except (ValueError, AttributeError):
            eh, em = 7, 0
        now_wat = datetime.now(WAT)
        next_delivery = now_wat.replace(hour=eh, minute=em, second=0, microsecond=0)
        if now_wat >= next_delivery:
            next_delivery += timedelta(days=1)
        logger.info(
            "Nudge queued (quiet hours active): type=%s nudge_id=%s user=%s — "
            "will be delivered at %s WAT (quiet_hours_end=%s)",
            trigger_type,
            nudge.id,
            user.id,
            next_delivery.strftime("%Y-%m-%d %H:%M"),
            qe_str,
        )
    return nudge


# ── Trigger evaluators ────────────────────────────────────────────────────────


def send_transaction_received_push(
    user: User,
    db: Session,
    amount_kobo: int,
    transaction_type: str,
    narration: str,
    balance_kobo: int | None,
) -> None:
    """
    Send an immediate push notification when a bank alert transaction arrives.

    This is a lightweight fire-and-forget push — it does NOT create a Nudge
    row and does NOT respect fatigue limits, because it is a factual
    confirmation (not a behavioural nudge).  Quiet hours are still respected:
    the push is suppressed if the user is in their quiet window.

    Called synchronously from the bank-alert webhook handler, before the
    Celery categorization task runs.
    """
    from app.services.push_service import send_push_notification

    if not user.expo_push_token:
        return

    ns = user.nudge_settings or {}
    if _is_quiet_hours(ns):
        logger.info(
            "send_transaction_received_push: suppressed for user=%s — quiet hours active "
            "(push is not queued; transaction_received pushes are fire-and-forget)",
            user.id,
        )
        return

    amount_str = _kobo_to_naira_str(abs(amount_kobo))
    balance_str = _kobo_to_naira_str(balance_kobo) if balance_kobo is not None else "—"
    is_credit = transaction_type == "credit"

    tx_type = "Credit" if is_credit else "Debit"
    type_verb = "Credit" if is_credit else "Debit"
    type_verb_past = "credited to" if is_credit else "debited from"

    title = TITLES["transaction_received"].format(tx_type=tx_type)
    message = random.choice(MESSAGES["transaction_received"]).format(
        type_verb=type_verb,
        type_verb_past=type_verb_past,
        amount_naira=amount_str,
        narration=narration,
        balance_naira=balance_str,
    )

    expired = send_push_notification(
        token=user.expo_push_token,
        title=title,
        body=message,
        data={
            "trigger_type": "transaction_received",
            "screen": "transactions",
            "amount_kobo": abs(amount_kobo),
        },
    )
    if expired:
        user.expo_push_token = None
        db.flush()
    logger.debug(
        "send_transaction_received_push: sent to user=%s amount=%d type=%s",
        user.id,
        abs(amount_kobo),
        transaction_type,
    )


def send_statement_received_push(db: Session, user: User, bank_name: str) -> None:
    """Fire-and-forget push: statement received, processing in background."""
    create_nudge(
        db,
        user,
        "statement_received",
        TITLES["statement_received"],
        random.choice(MESSAGES["statement_received"]).format(bank_name=bank_name),
        context={
            "nudge_type": "statement_received",
            "screen": PUSH_SCREEN["statement_received"],
            "bank_name": bank_name,
        },
    )
    db.commit()


def send_statement_processed_push(
    db: Session, user: User, bank_name: str, imported: int, updated: int
) -> None:
    """Fire-and-forget push: statement fully imported."""
    create_nudge(
        db,
        user,
        "statement_processed",
        TITLES["statement_processed"],
        random.choice(MESSAGES["statement_processed"]).format(
            bank_name=bank_name, imported=imported, updated=updated
        ),
        context={
            "nudge_type": "statement_processed",
            "screen": PUSH_SCREEN["statement_processed"],
            "bank_name": bank_name,
            "imported": imported,
            "updated": updated,
        },
    )
    db.commit()


def send_receipt_received_push(db: Session, user: User, bank_name: str) -> None:
    """Fire-and-forget push: receipt image received, processing in background."""
    create_nudge(
        db,
        user,
        "receipt_received",
        TITLES["receipt_received"],
        random.choice(MESSAGES["receipt_received"]).format(bank_name=bank_name),
        context={
            "nudge_type": "receipt_received",
            "screen": PUSH_SCREEN["receipt_received"],
            "bank_name": bank_name,
        },
    )
    db.commit()


def send_receipt_processed_push(
    db: Session,
    user: User,
    bank_name: str,
    amount_kobo: int,
    direction: str,
    transaction_id: str,
) -> None:
    """Fire-and-forget push: receipt transaction fully imported.

    Parameters
    ----------
    amount_kobo:
        Absolute amount in kobo.
    direction:
        ``"credit"`` or ``"debit"``.
    transaction_id:
        ID of the imported transaction.
    """
    amount_naira = f"{abs(amount_kobo) / 100:,.2f}"
    create_nudge(
        db,
        user,
        "receipt_processed",
        TITLES["receipt_processed"],
        random.choice(MESSAGES["receipt_processed"]).format(
            bank_name=bank_name, amount_naira=amount_naira, direction=direction
        ),
        context={
            "nudge_type": "receipt_processed",
            "screen": PUSH_SCREEN["receipt_processed"],
            "bank_name": bank_name,
            "amount_kobo": amount_kobo,
            "amount_naira": amount_naira,
            "direction": direction,
            "transaction_id": transaction_id,
        },
        transaction_id=transaction_id,
    )
    db.commit()


def send_receipt_duplicate_push(
    db: Session,
    user: User,
    bank_name: str,
    amount_kobo: int,
    transaction_id: str,
) -> None:
    """Fire-and-forget push: receipt was a duplicate of an existing transaction."""
    amount_naira = f"{abs(amount_kobo) / 100:,.2f}"
    create_nudge(
        db,
        user,
        "receipt_duplicate",
        TITLES["receipt_duplicate"],
        random.choice(MESSAGES["receipt_duplicate"]).format(
            bank_name=bank_name, amount_naira=amount_naira
        ),
        context={
            "nudge_type": "receipt_duplicate",
            "screen": PUSH_SCREEN["receipt_duplicate"],
            "bank_name": bank_name,
            "amount_kobo": amount_kobo,
            "amount_naira": amount_naira,
            "transaction_id": transaction_id,
        },
        transaction_id=transaction_id,
    )
    db.commit()


def send_receipt_failed_push(
    db: Session,
    user: User,
    reason: str,
    bank_name: str = "",
) -> None:
    """Fire-and-forget push: receipt processing failed.

    Parameters
    ----------
    reason:
        One of ``"unrecognised"``, ``"no_account"``, or ``"parse_failed"``.
        Controls the message body so the user gets an actionable hint.
    bank_name:
        Display name of the identified bank, if known.  May be empty when
        the receipt could not be identified at all.
    """
    reasons = RECEIPT_FAILED_MESSAGES
    template: str = reasons.get(reason, reasons["unrecognised"])
    body = template.format(bank_name=bank_name) if bank_name else template.split(".")[0] + "."
    create_nudge(
        db,
        user,
        "receipt_failed",
        TITLES["receipt_failed"],
        body,
        context={
            "nudge_type": "receipt_failed",
            "screen": PUSH_SCREEN["receipt_failed"],
            "reason": reason,
            "bank_name": bank_name,
        },
    )
    db.commit()


def send_statement_failed_push(db: Session, user: User, bank_name: str) -> None:
    """Fire-and-forget push: statement processing failed.

    Sent when the statement PDF cannot be parsed (wrong format, corrupted,
    or unsupported bank variant).  Always includes the bank name so the
    user knows which file to re-download.
    """
    create_nudge(
        db,
        user,
        "statement_failed",
        TITLES["statement_failed"],
        random.choice(MESSAGES["statement_failed"]).format(bank_name=bank_name),
        context={
            "nudge_type": "statement_failed",
            "screen": PUSH_SCREEN["statement_failed"],
            "bank_name": bank_name,
        },
    )
    db.commit()


# ── DSL evaluation path ───────────────────────────────────────────────────────


def _get_event_type(tx: Transaction) -> str:
    """Map a Transaction to one of the four DSL event buckets."""
    if tx.type == "credit":
        return "credit_cat" if tx.category_id else "credit_uncat"
    return "debit_cat" if tx.category_id else "debit_uncat"


def _run_dsl_nudges(db: Session, user: User, tx: Transaction) -> None:
    """
    Evaluate all active DSL rules for the event type implied by `tx`.
    """
    from app.core.redis_client import load_rules_for_evt
    from app.models.category import Category
    from app.models.transaction import Transaction as TxModel
    from app.services.budget_logic import get_or_create_budget_month
    from app.services.dsl_engine import (
        filter_rules_by_gid_rate_limit,
        hydrate_context,
        record_rule_hit,
        run_dsl_rules,
        set_gid_rate_limit,
    )

    evt_type = _get_event_type(tx)
    rules = load_rules_for_evt(evt_type)
    if not rules:
        return

    ns = user.nudge_settings or {}
    fatigue_limit = int(ns.get("fatigue_limit", 3))
    rules = filter_rules_by_gid_rate_limit(rules, user.id, fatigue_limit)
    if not rules:
        return

    # One history query covers all surviving rules — use the largest window.
    max_days_back = max(r.get("days_back", 0) for r in rules)
    history: list[TxModel] = []
    if max_days_back > 0:
        cutoff = datetime.now(UTC) - timedelta(days=max_days_back)
        history = (
            db.query(TxModel)
            .filter(
                TxModel.user_id == tx.user_id,
                TxModel.date >= cutoff,
                TxModel.id != tx.id,
            )
            .order_by(TxModel.date.desc())
            .all()
        )

    cat: Category | None = db.get(Category, tx.category_id) if tx.category_id else None
    bm = None
    target = None
    if cat is not None and tx.category_id is not None:
        month_str = tx.date.strftime("%Y-%m")
        bm = get_or_create_budget_month(db, tx.user_id, tx.category_id, month_str)
        target = cat.target  # lazy-loads via the Category → CategoryTarget relationship

    context = hydrate_context(tx, cat, bm, history, target=target)

    # Categorised events bind the nudge to the category for dedup purposes.
    cid = tx.category_id if evt_type.endswith("_cat") else None
    matched = run_dsl_rules(rules, context)

    for rule, match_count in matched:
        slug = rule["slug"]

        # Restore the correct match_count snapshot before rendering the template.
        context["hist"].match_count = match_count
        try:
            message = random.choice(rule["action"]["tmpls"]).format(**context)
            raw_title = rule.get("title", "")
            title = raw_title.format(**context) if raw_title else slug.replace("_", " ").title()
        except (KeyError, AttributeError, IndexError):
            logger.warning(
                "DSL template render error: slug=%s evt=%s", slug, evt_type, exc_info=True
            )
            continue

        # Build enriched context for the nudge detail view and push payload.
        screen = rule.get("action", {}).get("screen", "nudges")
        nudge_context: dict = {
            "nudge_type": slug,
            "slug": slug,
            "gid": rule["gid"],
            "evt_type": evt_type,
            "screen": screen,
            "transaction_id": tx.id,
            "category_id": cid,
            "category_name": context["cat"].name if context["cat"].name else None,
            "amount_kobo": tx.amount,
            "match_count": match_count,
        }
        # Budget context (when available)
        if context["cat"].spend_pct is not None:
            nudge_context["spend_pct"] = round(context["cat"].spend_pct, 4)
        if context["cat"].amt is not None:
            nudge_context["budget_amount_kobo"] = int(context["cat"].amt)
        if context["cat"].rem is not None:
            nudge_context["budget_remaining_kobo"] = int(context["cat"].rem)

        create_nudge(
            db,
            user,
            "nudge",
            title,
            message,
            context=nudge_context,
            category_id=cid,
            rule_id=rule["id"],
            transaction_id=tx.id,
        )
        try:
            set_gid_rate_limit(user.id, rule["gid"])
            record_rule_hit(rule["id"], user_id=user.id)
        except Exception:
            logger.warning(
                "Failed to set GID rate limit: gid=%s user=%s",
                rule["gid"],
                user.id,
                exc_info=True,
            )


def evaluate_transaction_nudges(db: Session, tx: Transaction) -> None:
    """
    Evaluate all active DSL nudge rules for a newly categorized transaction
    and create any applicable Nudge rows.

    Called from the `categorize_transactions` Celery task after
    `_update_budget_activity`, and from `fetch_transactions` for credit
    transactions.
    """
    from app.models.user import User

    user: User | None = db.get(User, tx.user_id)
    if not user:
        return
    ns = user.nudge_settings or {}
    if not ns.get("enabled", True):
        return

    try:
        _run_dsl_nudges(db, user, tx)
    except Exception:
        logger.exception("_run_dsl_nudges failed for tx=%s", tx.id)
