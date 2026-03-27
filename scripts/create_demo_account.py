#!/usr/bin/env python
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
scripts/create_demo_account.py
──────────────────────────────
One-shot helper that creates a fully seeded demo/test account on any MoniMata
instance.  Run this once before submitting then share the credentials on the
submission page.

Usage
-----
    # From the repo root, with the venv activated:
    python scripts/create_demo_account.py \\
        --email demo@monimata.app \\
        --password "SuperSecret2026!" \\
        --first-name Adaeze \\
        --last-name Johnson

    # Or with a DATABASE_URL override:
    DATABASE_URL="postgresql://..." python scripts/create_demo_account.py ...

Options
-------
    --email       Required. Email for the demo account.
    --password    Required. Plaintext password (min 8 chars).
    --first-name  Optional. Default: "Adaeze"
    --last-name   Optional. Default: "Johnson"
    --reset       If the email already exists, drop all its data and re-seed.
                  Without this flag the script exits if the email is taken.

Exit codes: 0 = success, 1 = error.
"""

from __future__ import annotations

import argparse
import sys
import os
from datetime import date, datetime, timedelta, timezone

# ── Bootstrap path so the script can import from apps/api/app ────────────────
# Works when run from repo root:  python scripts/create_demo_account.py ...
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.join(_SCRIPT_DIR, "..", "apps", "api")
sys.path.insert(0, _API_DIR)

# Load .env from apps/api so DATABASE_URL etc. are available
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(_API_DIR, ".env"))
except ImportError:
    pass  # python-dotenv not installed — rely on env vars being set externally


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a seeded demo/test account for MoniMata."
    )
    parser.add_argument("--email", required=True, help="Email address for the demo account")
    parser.add_argument("--password", required=True, help="Password (plaintext, min 8 chars)")
    parser.add_argument("--first-name", default="Adaeze", dest="first_name")
    parser.add_argument("--last-name", default="Johnson", dest="last_name")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete all existing data for this email and re-seed from scratch",
    )
    args = parser.parse_args()

    if len(args.password) < 8:
        print("ERROR: password must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    # ── Import app modules (after path setup) ─────────────────────────────────
    from app.core.database import SessionLocal
    from app.core.security import hash_password
    from app.models.user import User
    from app.models.bank_account import BankAccount
    from app.models.transaction import Transaction
    from app.models.budget import BudgetMonth
    from app.models.nudge import Nudge
    from app.models.category import Category
    from app.models.target import CategoryTarget
    from app.models.recurring_rule import RecurringRule
    from app.services.budget_logic import (
        seed_default_categories,
    )

    db = SessionLocal()
    try:
        existing: User | None = db.query(User).filter(User.email == args.email.lower()).first()

        if existing is not None:
            if not args.reset:
                print(
                    f"ERROR: An account with email '{args.email}' already exists.\n"
                    "Use --reset to delete and re-seed it.",
                    file=sys.stderr,
                )
                sys.exit(1)

            print(f"--reset: deleting existing account {existing.id} …")
            db.delete(existing)
            db.commit()
            existing = None

        # ── Create user ───────────────────────────────────────────────────────
        user = User(
            email=args.email.lower(),
            password_hash=hash_password(args.password),
            first_name=args.first_name,
            last_name=args.last_name,
            onboarded=True,
            identity_verified=True,
        )
        db.add(user)
        db.flush()

        # ── Seed default categories ───────────────────────────────────────────
        seed_default_categories(db, user)
        db.flush()

        # ── Build lookup after flush so IDs are populated ─────────────────────
        categories = db.query(Category).filter(Category.user_id == str(user.id)).all()
        cat_by_name: dict[str, Category] = {c.name: c for c in categories}

        def cid(name: str) -> str | None:
            return str(cat_by_name[name].id) if name in cat_by_name else None

        today = datetime.now(timezone.utc).date()
        this_month = today.strftime("%Y-%m")

        # ── Create a manual bank account ──────────────────────────────────────
        account = BankAccount(
            user_id=str(user.id),
            institution="GTBank",
            account_name=f"{args.first_name} {args.last_name}",
            alias="GTBank Main",
            account_number=None,
            account_type="SAVINGS",
            balance=35_400_000,  # ₦354,000 in kobo
            is_manual=True,
            currency="NGN",
        )
        db.add(account)

        # Second account — Kuda savings (demonstrates multi-account view)
        account2 = BankAccount(
            user_id=str(user.id),
            institution="Kuda",
            account_name=f"{args.first_name} {args.last_name}",
            alias="Kuda Savings",
            account_number=None,
            account_type="SAVINGS",
            balance=8_500_000,  # ₦85,000 in kobo
            is_manual=True,
            currency="NGN",
        )
        db.add(account2)
        db.flush()

        # ── Seed transactions ─────────────────────────────────────────────────
        def tx(
            narration: str,
            amount: int,    # kobo; positive = credit, negative = debit
            tx_type: str,   # "credit" | "debit"
            days_ago: int,
            cat: str | None = None,
        ) -> None:
            dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
            db.add(
                Transaction(
                    user_id=str(user.id),
                    account_id=str(account.id),
                    date=dt,
                    amount=amount,
                    narration=narration,
                    type=tx_type,
                    category_id=cid(cat) if cat else None,
                    is_manual=True,
                    source="manual",
                )
            )

        # Credits
        tx("SALARY CREDIT - TECHCORP LTD",    35_000_000, "credit", 28)  # ₦350,000
        tx("TRANSFER FROM KUDA",               2_500_000,  "credit", 20)  # ₦25,000
        tx("FREELANCE PAYMENT - DESIGNWORK",   5_000_000,  "credit",  5)  # ₦50,000

        # Debits — Food & Groceries (₦485 spend vs ₦580 budget = 83.6% → fires threshold_80)
        tx("SHOPRITE LEKKI",             -18_000,  "debit",  2, "Food & Groceries")
        tx("UBER EATS",                   -8_500,  "debit",  7, "Food & Groceries")
        tx("GROCERY PALACE IKEJA",       -22_000,  "debit", 14, "Food & Groceries")

        # Debits — Transport (₦43 spend vs ₦30 budget = 143% → fires threshold_100)
        tx("BOLT RIDE",                   -2_500,  "debit",  3, "Transport")
        tx("BOLT RIDE",                   -1_800,  "debit", 12, "Transport")

        # Debits — other categories
        tx("MTN AIRTIME TOP-UP",          -5_000,  "debit",  4, "Airtime & Data")
        tx("DSTV SUBSCRIPTION",          -29_000,  "debit",  5, "Subscriptions")
        tx("POS - EVERYDAY PHARMACY",    -12_000,  "debit",  8, "Health & Pharmacy")
        tx("COWRYWISE INVESTMENT",        -50_000,  "debit",  9, "Investments")
        tx("RENTS - APRIL 2026",       -9_000_000,  "debit", 10, "Rent / Housing")
        tx("EKEDC POSTPAID",             -15_000,  "debit", 11, "Electricity (NEPA)")
        tx("NETFLIX DEBIT",              -14_000,  "debit", 15, "Subscriptions")
        tx("MTN DATA BUNDLE",            -10_000,  "debit", 16, "Airtime & Data")
        tx("ANCHOR SAVINGS TRANSFER",   -100_000,  "debit", 17, "Emergency Fund")

        # ── Seed budget allocations ───────────────────────────────────────────
        # Food budget is tight (₦580) so 83.6% spend triggers a real threshold_80 nudge.
        # Transport budget is very tight (₦30) so 143% spend triggers threshold_100.
        # Travel and Savings are allocated to show progress on home-screen Goals.
        _BUDGET: list[tuple[str, int, int]] = [
            # (category name, assigned_kobo, activity_kobo)
            ("Rent / Housing",      9_000_000, -9_000_000),
            ("Electricity (NEPA)",     50_000,    -15_000),
            ("Internet",               30_000,          0),
            ("Food & Groceries",       58_000,    -48_500),  # 83.6% spent
            ("Transport",               3_000,     -4_300),  # 143% spent — over budget!
            ("Airtime & Data",         50_000,    -15_000),
            ("Subscriptions",          60_000,    -43_000),
            ("Health & Pharmacy",      30_000,    -12_000),
            ("Investments",           200_000,    -50_000),
            ("Emergency Fund",        150_000,   -100_000),
            ("Savings",               300_000,          0),
            ("Travel",                150_000,          0),  # sinking fund for Christmas trip
        ]

        for cat_name, assigned, activity in _BUDGET:
            category = cat_by_name.get(cat_name)
            if not category:
                print(f"  WARNING: category '{cat_name}' not found — skipping budget row.")
                continue
            db.add(
                BudgetMonth(
                    user_id=str(user.id),
                    category_id=str(category.id),
                    month=this_month,
                    assigned=assigned,
                    activity=activity,
                )
            )

        # ── Seed category targets ─────────────────────────────────────────────
        # Targets drive the "Cost to Be Me" card and the Goals section.
        # custom-frequency targets appear on the Home → Goals section.
        _TARGETS: list[tuple[str, str, str, int, int | None, int | None, date | None]] = [
            # (category, frequency, behavior, target_amount, day_of_week, day_of_month, target_date)
            #
            # Monthly bills — show target labels in Budget tab
            ("Rent / Housing",  "monthly", "set_aside", 9_000_000, None, 1,    None),
            ("Subscriptions",   "monthly", "set_aside",    60_000, None, 5,    None),
            ("Airtime & Data",  "monthly", "set_aside",    50_000, None, 28,   None),
            #
            # Sinking funds — custom frequency → show on Home → Goals
            ("Travel",    "custom", "set_aside", 500_000, None, None, date(today.year, 12, 20)),
            ("Savings",   "custom", "balance",   1_000_000, None, None, date(today.year + 1, 3, 1)),
        ]

        for cat_name, freq, behavior, amt, dow, dom, tdate in _TARGETS:
            category = cat_by_name.get(cat_name)
            if not category:
                print(f"  WARNING: category '{cat_name}' not found — skipping target.")
                continue
            db.add(
                CategoryTarget(
                    category_id=str(category.id),
                    frequency=freq,
                    behavior=behavior,
                    target_amount=amt,
                    day_of_week=dow,
                    day_of_month=dom,
                    target_date=tdate,
                    repeats=(freq != "custom"),
                )
            )

        # ── Seed recurring rules ──────────────────────────────────────────────
        # These demonstrate the Recurring Transactions feature.
        # The Celery task generates actual transaction instances on each sync.
        next_month_10th = date(today.year if today.month < 12 else today.year + 1,
                               today.month % 12 + 1, 10)
        next_month_5th  = date(today.year if today.month < 12 else today.year + 1,
                               today.month % 12 + 1, 5)
        # Next Monday
        days_to_monday = (7 - today.weekday()) % 7 or 7
        next_monday = today + timedelta(days=days_to_monday)

        _RULES: list[tuple[str, str, int, int | None, int | None, date, dict]] = [
            # (frequency, interval, day_of_week, day_of_month, next_due, template)
            (
                "monthly", 1, None, 10, next_month_10th,
                {
                    "account_id": str(account.id),
                    "amount": -15_000,
                    "narration": "EKEDC POSTPAID",
                    "type": "debit",
                    "category_id": cid("Electricity (NEPA)"),
                    "memo": "Auto-pay electricity bill",
                },
            ),
            (
                "monthly", 1, None, 5, next_month_5th,
                {
                    "account_id": str(account.id),
                    "amount": -29_000,
                    "narration": "DSTV COMPACT PLUS",
                    "type": "debit",
                    "category_id": cid("Subscriptions"),
                    "memo": "DStv monthly subscription",
                },
            ),
            (
                "weekly", 1, 0, None, next_monday,  # 0 = Monday
                {
                    "account_id": str(account.id),
                    "amount": -2_500,
                    "narration": "BOLT RIDE",
                    "type": "debit",
                    "category_id": cid("Transport"),
                    "memo": "Weekly Bolt rides budget",
                },
            ),
        ]

        for freq, interval, dow, dom, next_due, template in _RULES:
            db.add(
                RecurringRule(
                    user_id=str(user.id),
                    frequency=freq,
                    interval=interval,
                    day_of_week=dow,
                    day_of_month=dom,
                    next_due=next_due,
                    ends_on=None,
                    is_active=True,
                    template=template,
                )
            )

        # ── Seed nudges (one per trigger type) ───────────────────────────────
        # Pre-seed all five nudge variants so judges can explore the Nudges tab
        # without waiting for real transactions to cross thresholds.
        food_cat = cat_by_name.get("Food & Groceries")
        transport_cat = cat_by_name.get("Transport")
        rent_cat = cat_by_name.get("Rent / Housing")

        def nudge(trigger: str, title_str: str, msg: str, ctx: dict,
                  cat: "Category | None" = None, hours_ago: int = 1) -> None:
            delivered = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
            db.add(
                Nudge(
                    user_id=str(user.id),
                    trigger_type=trigger,
                    title=title_str,
                    message=msg,
                    context=ctx,
                    category_id=str(cat.id) if cat else None,
                    is_opened=False,
                    is_dismissed=False,
                    delivered_at=delivered,
                )
            )

        nudge(
            "threshold_80",
            "⚠️ Food & Groceries don reach 84%",
            (
                "You don use 84% of your Food & Groceries budget. "
                "Only ₦95 remain — use am wisely!"
            ),
            {
                "category_name": "Food & Groceries",
                "month": this_month,
                "spent_kobo": 48_500,
                "assigned_kobo": 58_000,
                "remaining_kobo": 9_500,
                "remaining_naira": "95",
                "assigned_naira": "580",
                "percentage": 84,
            },
            cat=food_cat,
            hours_ago=6,
        )

        nudge(
            "threshold_100",
            "🚨 Transport budget don finish!",
            (
                "E don do for Transport. You overrun by ₦13 — control the situation."
            ),
            {
                "category_name": "Transport",
                "month": this_month,
                "spent_kobo": 4_300,
                "assigned_kobo": 3_000,
                "overage_kobo": 1_300,
                "overage_naira": "13",
                "percentage": 143,
            },
            cat=transport_cat,
            hours_ago=3,
        )

        nudge(
            "large_single_tx",
            "Big spend on Rent / Housing",
            (
                "Chai! ₦90k in Rent / Housing one time? "
                "That na 100% of your monthly plan."
            ),
            {
                "category_name": "Rent / Housing",
                "tx_amount_kobo": -9_000_000,
                "amount_naira": "90k",
                "narration": "RENTS - APRIL 2026",
                "assigned_kobo": 9_000_000,
                "percentage": 100,
                "tx_id": "00000000-0000-0000-0000-000000000001",
            },
            cat=rent_cat,
            hours_ago=10,
        )

        nudge(
            "pay_received",
            "Money don enter! 🎉",
            (
                "₦350k credit don land! Time to give every kobo a job — "
                "assign am to your budget."
            ),
            {
                "amount_kobo": 35_000_000,
                "amount_naira": "350k",
                "narration": "SALARY CREDIT - TECHCORP LTD",
                "account_id": str(account.id),
            },
            hours_ago=28 * 24,  # matches the salary tx seeded 28 days ago
        )

        nudge(
            "bill_payment",
            "DSTV payment done ✅",
            (
                "Your DSTV payment of ₦290 don go through. "
                "Your budget don update automatically."
            ),
            {
                "biller_name": "DSTV",
                "amount_kobo": -29_000,
                "amount_naira": "290",
                "reference": "DEMO-DSTV-001",
                "category_name": "Subscriptions",
            },
            hours_ago=5 * 24,
        )

        db.commit()

        print(
            f"\n✓ Demo account created successfully!\n"
            f"  Email    : {args.email}\n"
            f"  Password : {args.password}\n"
            f"  User ID  : {user.id}\n"
            f"\nShare these credentials on the submission page."
        )

    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
