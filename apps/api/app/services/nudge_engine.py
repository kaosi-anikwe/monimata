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
  bill_payment    — successful Interswitch bill payment (positive confirmation)

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

import random
import logging
from typing import TYPE_CHECKING, Optional
from datetime import datetime, time, timedelta, timezone

logger = logging.getLogger(__name__)

# West Africa Time — UTC+1, no daylight saving.
WAT = timezone(timedelta(hours=1))

# Minimum credit amount that triggers a pay_received nudge (₦50,000 in kobo).
PAY_RECEIVED_THRESHOLD = 5_000_000

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.nudge import Nudge
    from app.models.transaction import Transaction

# ── Message templates ─────────────────────────────────────────────────────────

TITLES: dict[str, str] = {
    "threshold_80": "⚠️ {category_name} don reach 80%",
    "threshold_100": "🚨 {category_name} budget don finish!",
    "large_single_tx": "Big spend on {category_name}",
    "pay_received": "Money don enter! 🎉",
    "bill_payment": "{biller_name} payment done ✅",
}

MESSAGES: dict[str, list[str]] = {
    "threshold_80": [
        "You don use {percentage}% of your {category_name} budget. "
        "Only ₦{remaining_naira} remain — use am wisely!",
        "{category_name} almost done o! ₦{remaining_naira} remain from your ₦{assigned_naira} plan.",
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
        "Money don enter — ₦{amount_naira}. Assign am to your budget categories before e disappear.",
    ],
    "bill_payment": [
        "Your {biller_name} payment of ₦{amount_naira} don go through. "
        "Your budget don update automatically.",
        "₦{amount_naira} for {biller_name} — payment successful and budget adjusted. Well done!",
    ],
}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _kobo_to_naira_str(kobo: int) -> str:
    """Format a kobo amount as a human-readable Naira string."""
    naira = abs(kobo) / 100
    if naira >= 1_000_000:
        return f"{naira / 1_000_000:.1f}m"
    if naira >= 1_000:
        return f"{naira / 1_000:.0f}k"
    return f"{naira:.0f}"


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
    return datetime(
        today_wat.year, today_wat.month, today_wat.day, 0, 0, 0, tzinfo=WAT
    ).astimezone(timezone.utc)


def _count_today_nudges(db, user_id: str) -> int:
    """Count nudges already created for this user today (WAT day)."""
    from app.models.nudge import Nudge
    from sqlalchemy import func

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
    db,
    user_id: str,
    trigger_type: str,
    category_id: Optional[str],
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
    db,
    user: "User",
    trigger_type: str,
    category_id: Optional[str] = None,
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
    db,
    user: "User",
    trigger_type: str,
    title: str,
    message: str,
    context: dict,
    category_id: Optional[str] = None,
    *,
    send_push: bool = True,
) -> "Nudge":
    """
    Persist a Nudge row and optionally dispatch a push notification.

    Quiet hours:
      Outside quiet hours → delivered_at = now, push sent.
      Inside quiet hours  → delivered_at = None (queued for 07:05 WAT delivery).

    The push send swallows errors — nudge row is always committed regardless.
    """
    from app.models.nudge import Nudge
    from app.services.push_service import send_push_notification

    now = datetime.now(timezone.utc)
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
        send_push_notification(
            token=user.expo_push_token,
            title=title,
            body=message,
            data={"nudge_id": nudge.id, "trigger_type": trigger_type},
        )

    logger.info(
        "Nudge created: type=%s user=%s category=%s queued=%s",
        trigger_type,
        user.id,
        category_id,
        quiet,
    )
    return nudge


# ── Trigger evaluators ────────────────────────────────────────────────────────


def evaluate_transaction_nudges(db, tx: "Transaction") -> None:
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
    from app.models.user import User
    from app.models.category import Category
    from app.services.budget_logic import get_or_create_budget_month

    user: Optional[User] = db.get(User, tx.user_id)
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
            message = random.choice(MESSAGES["pay_received"]).format(
                amount_naira=amount_str
            )
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

    cat: Optional[Category] = db.get(Category, tx.category_id)
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


def evaluate_bill_payment_nudge(
    db,
    user: "User",
    tx: "Transaction",
    biller_name: str,
    category_name: Optional[str] = None,
) -> None:
    """
    Create a bill_payment confirmation nudge after a successful Interswitch payment.

    Called from bills.py `_schedule_bill_nudge` background task.
    The caller is responsible for committing and closing the session.
    """
    if not can_send_nudge(db, user, "bill_payment"):
        return

    amount_str = _kobo_to_naira_str(abs(tx.amount))
    title = TITLES["bill_payment"].format(biller_name=biller_name)
    message = random.choice(MESSAGES["bill_payment"]).format(
        biller_name=biller_name,
        amount_naira=amount_str,
    )
    ctx: dict = {
        "biller_name": biller_name,
        "amount_kobo": tx.amount,
        "amount_naira": amount_str,
        "reference": tx.interswitch_ref,
    }
    if category_name:
        ctx["category_name"] = category_name

    create_nudge(
        db,
        user,
        "bill_payment",
        title,
        message,
        context=ctx,
        category_id=tx.category_id,
    )
