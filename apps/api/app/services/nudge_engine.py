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
Nudge Engine — evaluates trigger conditions and creates Nudge rows.

Trigger types (MVP):
  threshold_80    — spending has reached 80%–99% of a category's assigned amount
  threshold_100   — spending has reached or exceeded 100% of assigned
  large_single_tx — a single debit transaction consumed ≥ 40% of a category's budget
  pay_received    — credit transaction ≥ PAY_RECEIVED_THRESHOLD kobo detected

Deduplication:
  Only one nudge per (user, trigger_type, category_id, WAT calendar day) is created.
  threshold_100 supersedes threshold_80 for the same category on the same day — once
  a category hits 100%, no further threshold_80 nudge will be created that day.

Quiet hours:
  Derived from user.nudge_settings.quiet_hours_start / quiet_hours_end (HH:MM, WAT).
  During quiet hours, nudge.delivered_at is set to None (queued).
  The `deliver_queued_nudges` beat task (07:05 WAT) dispatches all queued nudges.
  Outside quiet hours, nudge.delivered_at = created_at and a push is sent immediately.

Fatigue limits:
  user.nudge_settings.fatigue_limit (default 3) caps nudges per WAT calendar day.
  One nudge per category per day is also enforced independently.

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

# Minimum credit amount that triggers a pay_received nudge (₦50,000 in kobo).
PAY_RECEIVED_THRESHOLD = 5_000_000

if TYPE_CHECKING:
    from app.models.nudge import Nudge
    from app.models.transaction import Transaction
    from app.models.user import User

# ── Message templates ─────────────────────────────────────────────────────────

TITLES: dict[str, str] = {
    "threshold_80": "⚠️ {category_name} don reach 80%",
    "threshold_100": "🚨 {category_name} budget don finish!",
    "large_single_tx": "Big spend on {category_name}",
    "pay_received": "Money don enter! 🎉",
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
    "threshold_80": [
        "You don use {percentage}% of your {category_name} budget. "
        "Only ₦{remaining_naira} remain — use am wisely!",
        "{category_name} almost done o! ₦{remaining_naira} remain from your "
        "₦{assigned_naira} plan.",
        "Guy, you don reach {percentage}% for {category_name}. "
        "₦{remaining_naira} remain — no overdo am.",
    ],
    "threshold_100": [
        "You don cross your {category_name} budget by ₦{overage_naira}. "
        "Time to move money from another category.",
        "{category_name} don dry! You spend ₦{overage_naira} pass your plan. "
        "Readjust your budget now.",
        "E don do for {category_name}. You overrun by ₦{overage_naira} — control the situation.",
    ],
    "large_single_tx": [
        "One transaction of ₦{amount_naira} just take {percentage}% of your "
        "{category_name} budget. Check am.",
        "Chai! ₦{amount_naira} in {category_name} one time? "
        "That na {percentage}% of your monthly plan.",
    ],
    "pay_received": [
        "₦{amount_naira} credit don land! Time to give every kobo a job — "
        "assign am to your budget.",
        "Money don enter — ₦{amount_naira}. Assign am to your budget categories "
        "before e disappear.",
    ],
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
    "receipt_failed": "nudges",
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


def _today_wat_utc_start() -> datetime:
    """Return midnight WAT for the current WAT calendar day as a UTC-aware datetime."""
    today_wat = datetime.now(WAT).date()
    return datetime(today_wat.year, today_wat.month, today_wat.day, 0, 0, 0, tzinfo=WAT).astimezone(
        UTC
    )


def _count_today_nudges(db: Session, user_id: str) -> int:
    """Count nudges already created for this user today (WAT day)."""
    from sqlalchemy import func

    from app.models.nudge import Nudge

    return (
        db.query(func.count(Nudge.id))
        .filter(
            Nudge.user_id == user_id,
            Nudge.created_at >= _today_wat_utc_start(),
        )
        .scalar()
        or 0
    )


def _today_nudge_exists(
    db: Session,
    user_id: str,
    trigger_type: str,
    category_id: str | None,
) -> bool:
    """Return True if an identical nudge (same type + category) was already created today."""
    from app.models.nudge import Nudge

    q = db.query(Nudge).filter(
        Nudge.user_id == user_id,
        Nudge.trigger_type == trigger_type,
        Nudge.created_at >= _today_wat_utc_start(),
    )
    if category_id:
        q = q.filter(Nudge.category_id == category_id)
    else:
        q = q.filter(Nudge.category_id == None)  # noqa: E711
    return q.first() is not None


def can_send_nudge(
    db: Session,
    user: User,
    trigger_type: str,
    category_id: str | None = None,
) -> bool:
    """
    Return False if any of these guards prevent sending a nudge:
      - nudge_settings.enabled is False
      - daily fatigue limit already reached
      - identical nudge already sent today for this category
    """
    ns = user.nudge_settings or {}
    if not ns.get("enabled", True):
        return False
    limit = int(ns.get("fatigue_limit", 3))
    if _count_today_nudges(db, user.id) >= limit:
        return False
    if _today_nudge_exists(db, user.id, trigger_type, category_id):
        return False
    return True


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
        delivered_at=None if quiet else now,
    )
    db.add(nudge)
    db.flush()  # populate nudge.id without committing the outer transaction

    if send_push and not quiet and user.expo_push_token:
        nudge_type = nudge.context.get("nudge_type") or trigger_type if nudge.context else ""
        _push_data = {
            "trigger_type": trigger_type,
            "nudge_id": nudge.id,
            "nudge_type": nudge_type,
            "screen": PUSH_SCREEN.get(trigger_type, "nudges"),
        }
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
    if not can_send_nudge(db, user, "statement_received"):
        return
    create_nudge(
        db,
        user,
        "statement_received",
        TITLES["statement_received"],
        random.choice(MESSAGES["statement_received"]).format(bank_name=bank_name),
        context={"bank_name": bank_name},
    )
    db.commit()


def send_statement_processed_push(
    db: Session, user: User, bank_name: str, imported: int, updated: int
) -> None:
    """Fire-and-forget push: statement fully imported."""
    if not can_send_nudge(db, user, "statement_processed"):
        return
    create_nudge(
        db,
        user,
        "statement_processed",
        TITLES["statement_processed"],
        random.choice(MESSAGES["statement_processed"]).format(
            bank_name=bank_name, imported=imported, updated=updated
        ),
        context={"bank_name": bank_name, "imported": imported, "updated": updated},
    )
    db.commit()


def send_receipt_received_push(db: Session, user: User, bank_name: str) -> None:
    """Fire-and-forget push: receipt image received, processing in background."""
    if not can_send_nudge(db, user, "receipt_received"):
        return
    create_nudge(
        db,
        user,
        "receipt_received",
        TITLES["receipt_received"],
        random.choice(MESSAGES["receipt_received"]).format(bank_name=bank_name),
        context={"bank_name": bank_name},
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
    if not can_send_nudge(db, user, "receipt_processed"):
        return
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
    if not can_send_nudge(db, user, "receipt_duplicate"):
        return
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
    if not can_send_nudge(db, user, "receipt_failed"):
        return
    reasons = RECEIPT_FAILED_MESSAGES
    template: str = reasons.get(reason, reasons["unrecognised"])
    body = template.format(bank_name=bank_name) if bank_name else template.split(".")[0] + "."
    create_nudge(
        db,
        user,
        "receipt_failed",
        TITLES["receipt_failed"],
        body,
        context={"reason": reason, "bank_name": bank_name},
    )
    db.commit()


def send_statement_failed_push(db: Session, user: User, bank_name: str) -> None:
    """Fire-and-forget push: statement processing failed.

    Sent when the statement PDF cannot be parsed (wrong format, corrupted,
    or unsupported bank variant).  Always includes the bank name so the
    user knows which file to re-download.
    """
    if not can_send_nudge(db, user, "statement_failed"):
        return
    create_nudge(
        db,
        user,
        "statement_failed",
        TITLES["statement_failed"],
        random.choice(MESSAGES["statement_failed"]).format(bank_name=bank_name),
        context={"bank_name": bank_name},
    )
    db.commit()


def evaluate_transaction_nudges(db: Session, tx: Transaction) -> None:
    """
    Evaluate all nudge triggers for a newly categorized transaction and create
    any applicable Nudge rows.

    Called from the `categorize_transactions` Celery task after `_update_budget_activity`.
    Also called from `fetch_transactions` for credit transactions (pay_received).

    Checks:
      - pay_received    if tx.type == "credit" and amount ≥ PAY_RECEIVED_THRESHOLD
      - large_single_tx if debit category tx
      - threshold_80    if debit category tx and budget month data exists
      - threshold_100   if debit category tx and budget month data exists
    """
    from app.models.category import Category
    from app.models.user import User
    from app.services.budget_logic import get_or_create_budget_month

    user: User | None = db.get(User, tx.user_id)
    if not user:
        return
    ns = user.nudge_settings or {}
    if not ns.get("enabled", True):
        return

    # ── pay_received ──────────────────────────────────────────────────────────
    if tx.type == "credit" and tx.amount >= PAY_RECEIVED_THRESHOLD:
        if can_send_nudge(db, user, "pay_received"):
            amount_str = _kobo_to_naira_str(tx.amount)
            title = TITLES["pay_received"]
            message = random.choice(MESSAGES["pay_received"]).format(amount_naira=amount_str)
            create_nudge(
                db,
                user,
                "pay_received",
                title,
                message,
                context={
                    "amount_kobo": tx.amount,
                    "amount_naira": amount_str,
                    "narration": tx.narration,
                    "account_id": tx.account_id,
                },
            )

    # Budget nudges only apply to categorized debit transactions
    if tx.type != "debit" or not tx.category_id or tx.amount >= 0:
        return

    cat: Category | None = db.get(Category, tx.category_id)
    if not cat:
        return

    month_str = tx.date.strftime("%Y-%m")
    bm = get_or_create_budget_month(db, tx.user_id, tx.category_id, month_str)

    if bm.assigned <= 0:
        return  # no active budget for this category — skip threshold nudges

    # spending = abs(activity); assigned is positive
    spent = abs(bm.activity)
    assigned = bm.assigned
    pct = spent / assigned

    # ── large_single_tx: one transaction took ≥ 40% of the budget ────────────
    tx_abs = abs(tx.amount)
    tx_pct = tx_abs / assigned
    if tx_pct >= 0.4 and can_send_nudge(db, user, "large_single_tx", tx.category_id):
        percentage = round(tx_pct * 100)
        amount_str = _kobo_to_naira_str(tx_abs)
        title = TITLES["large_single_tx"].format(category_name=cat.name)
        message = random.choice(MESSAGES["large_single_tx"]).format(
            amount_naira=amount_str,
            percentage=percentage,
            category_name=cat.name,
        )
        create_nudge(
            db,
            user,
            "large_single_tx",
            title,
            message,
            context={
                "category_name": cat.name,
                "tx_amount_kobo": tx.amount,
                "amount_naira": amount_str,
                "narration": tx.narration,
                "assigned_kobo": assigned,
                "percentage": percentage,
                "tx_id": tx.id,
            },
            category_id=tx.category_id,
            transaction_id=tx.id,
        )

    # ── threshold_100: budget exhausted / overspent ───────────────────────────
    if pct >= 1.0 and can_send_nudge(db, user, "threshold_100", tx.category_id):
        overage = spent - assigned
        overage_str = _kobo_to_naira_str(overage)
        title = TITLES["threshold_100"].format(category_name=cat.name)
        message = random.choice(MESSAGES["threshold_100"]).format(
            category_name=cat.name,
            overage_naira=overage_str,
        )
        create_nudge(
            db,
            user,
            "threshold_100",
            title,
            message,
            context={
                "category_name": cat.name,
                "month": month_str,
                "spent_kobo": spent,
                "assigned_kobo": assigned,
                "overage_kobo": max(0, overage),
                "overage_naira": overage_str,
                "percentage": round(pct * 100),
            },
            category_id=tx.category_id,
        )
        # threshold_100 supersedes threshold_80 for the same day
        return

    # ── threshold_80: 80–99% of budget used ──────────────────────────────────
    if 0.8 <= pct < 1.0 and can_send_nudge(db, user, "threshold_80", tx.category_id):
        remaining = assigned - spent
        remaining_str = _kobo_to_naira_str(remaining)
        assigned_str = _kobo_to_naira_str(assigned)
        percentage = round(pct * 100)
        title = TITLES["threshold_80"].format(category_name=cat.name)
        message = random.choice(MESSAGES["threshold_80"]).format(
            category_name=cat.name,
            percentage=percentage,
            remaining_naira=remaining_str,
            assigned_naira=assigned_str,
        )
        create_nudge(
            db,
            user,
            "threshold_80",
            title,
            message,
            context={
                "category_name": cat.name,
                "month": month_str,
                "spent_kobo": spent,
                "assigned_kobo": assigned,
                "remaining_kobo": remaining,
                "remaining_naira": remaining_str,
                "assigned_naira": assigned_str,
                "percentage": percentage,
            },
            category_id=tx.category_id,
        )
