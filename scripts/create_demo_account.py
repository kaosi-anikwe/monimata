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
Seeds demo/test data onto an already-existing MoniMata account.  The account
must exist in the auth system first; this script only touches the main
application database.

Usage
-----
    # From the repo root, with the venv activated:
    python scripts/create_demo_account.py \\
        --user-id 6f68cf17-0eea-4815-8e6c-e821e0823fe6 \\
        --display-name "Adaeze Johnson"

    # Or with a DATABASE_URL override:
    DATABASE_URL="postgresql://..." python scripts/create_demo_account.py ...

Options
-------
    --user-id       Required. UUID of the existing user in the main DB.
    --display-name  Optional. Used as the bank account holder name in seed
                    data. Default: "Adaeze Johnson"
    --reset         Drop all existing demo data for this user and re-seed.
                    Without this flag the script exits if data already exists.

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
        description="Seed demo data onto an existing MoniMata account."
    )
    parser.add_argument(
        "--user-id",
        required=True,
        dest="user_id",
        help="UUID of the existing user in the main application database",
    )
    parser.add_argument(
        "--display-name",
        default="Adaeze Johnson",
        dest="display_name",
        help="Name shown on seeded bank accounts (default: 'Adaeze Johnson')",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete all existing data for this user and re-seed from scratch",
    )
    args = parser.parse_args()

    # ── Import app modules (after path setup) ─────────────────────────────────
    from app.core.database import SessionLocal
    from app.models.user import User
    from app.models.bank_account import BankAccount
    from app.models.transaction import Transaction
    from app.models.budget import BudgetMonth
    from app.models.nudge import Nudge
    from app.models.category import Category
    from app.models.target import CategoryTarget
    from app.models.recurring_rule import RecurringRule

    db = SessionLocal()
    try:
        user: User | None = db.query(User).filter(User.id == args.user_id).first()

        if user is None:
            print(
                f"ERROR: No user with id '{args.user_id}' found in the main database.\n"
                "Make sure the account exists in the auth system and has been "
                "synced/registered in the main DB before running this script.",
                file=sys.stderr,
            )
            sys.exit(1)

        # Check for existing data
        existing_accounts = (
            db.query(BankAccount).filter(BankAccount.user_id == args.user_id).count()
        )
        if existing_accounts > 0:
            if not args.reset:
                print(
                    f"ERROR: User '{args.user_id}' already has data seeded.\n"
                    "Use --reset to delete and re-seed.",
                    file=sys.stderr,
                )
                sys.exit(1)

            print(f"--reset: clearing existing data for user {args.user_id} …")
            user_category_ids = [
                c.id
                for c in db.query(Category)
                .filter(Category.user_id == args.user_id)
                .all()
            ]
            if user_category_ids:
                db.query(CategoryTarget).filter(
                    CategoryTarget.category_id.in_(user_category_ids)
                ).delete(synchronize_session=False)
            for model in (
                Nudge,
                BudgetMonth,
                RecurringRule,
                Transaction,
                BankAccount,
            ):
                db.query(model).filter(model.user_id == args.user_id).delete()
            db.commit()

        # ── Load categories seeded by the auth system ────────────────────────
        categories = db.query(Category).filter(Category.user_id == args.user_id).all()
        if not categories:
            print(
                "ERROR: No categories found for this user. "
                "Categories should be seeded by the auth system on account creation.",
                file=sys.stderr,
            )
            sys.exit(1)
        cat_by_name: dict[str, Category] = {c.name: c for c in categories}

        def cid(name: str) -> str | None:
            return str(cat_by_name[name].id) if name in cat_by_name else None

        today = datetime.now(timezone.utc).date()
        this_month = today.replace(day=1)

        # ── Create a manual bank account ──────────────────────────────────────
        account = BankAccount(
            user_id=str(user.id),
            institution="GTBank",
            account_name=args.display_name,
            alias="GTBank Main",
            account_number=None,
            account_type="SAVINGS",
            balance=35_400_000,  # ₦354,000 in kobo
            currency="NGN",
        )
        db.add(account)

        # Second account — Kuda savings (demonstrates multi-account view)
        account2 = BankAccount(
            user_id=str(user.id),
            institution="Kuda",
            account_name=args.display_name,
            alias="Kuda Savings",
            account_number=None,
            account_type="SAVINGS",
            balance=8_500_000,  # ₦85,000 in kobo
            currency="NGN",
        )
        db.add(account2)
        db.flush()

        # ── Seed transactions ─────────────────────────────────────────────────
        def tx(
            narration: str,
            amount: int,  # kobo; positive = credit, negative = debit
            tx_type: str,  # "credit" | "debit"
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
                    source="manual",
                )
            )

        # Credits
        tx("SALARY CREDIT - TECHCORP LTD", 35_000_000, "credit", 28)  # ₦350,000
        tx("TRANSFER FROM KUDA", 2_500_000, "credit", 20)  # ₦25,000
        tx("FREELANCE PAYMENT - DESIGNWORK", 5_000_000, "credit", 5)  # ₦50,000

        # Debits — Food & Groceries (₦485 spend vs ₦580 budget = 83.6% → fires threshold_80)
        tx("SHOPRITE LEKKI", -18_000, "debit", 2, "Food & Groceries")
        tx("UBER EATS", -8_500, "debit", 7, "Food & Groceries")
        tx("GROCERY PALACE IKEJA", -22_000, "debit", 14, "Food & Groceries")

        # Debits — Transport (₦43 spend vs ₦30 budget = 143% → fires threshold_100)
        tx("BOLT RIDE", -2_500, "debit", 3, "Transport")
        tx("BOLT RIDE", -1_800, "debit", 12, "Transport")

        # Debits — other categories
        tx("MTN AIRTIME TOP-UP", -5_000, "debit", 4, "Airtime & Data")
        tx("DSTV SUBSCRIPTION", -29_000, "debit", 5, "Subscriptions")
        tx(
            "POS - EVERYDAY PHARMACY", -12_000, "debit", 8
        )  # uncategorised — appears in categorise queue
        tx("COWRYWISE INVESTMENT", -50_000, "debit", 9, "Investments")
        tx("RENTS - APRIL 2026", -9_000_000, "debit", 10, "Rent / Housing")
        tx("EKEDC POSTPAID", -15_000, "debit", 11, "Electricity")
        tx("NETFLIX DEBIT", -14_000, "debit", 15, "Subscriptions")
        tx("MTN DATA BUNDLE", -10_000, "debit", 16, "Airtime & Data")
        tx("ANCHOR SAVINGS TRANSFER", -100_000, "debit", 17, "Emergency Fund")

        # ── Prior-month transactions (2 months back) ──────────────────────────
        # Needed for Net Worth trend and Budget Performance charts in Reports.
        def tx_daysago(
            narration: str,
            amount: int,
            tx_type: str,
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
                    source="manual",
                )
            )

        # Month −1 (≈30-60 days ago)
        tx_daysago("SALARY CREDIT - TECHCORP LTD", 35_000_000, "credit", 58)
        tx_daysago("RENTS - MAY 2026", -9_000_000, "debit", 40, "Rent / Housing")
        tx_daysago("SHOPRITE LEKKI", -21_000, "debit", 38, "Food & Groceries")
        tx_daysago("BOLT RIDE", -3_200, "debit", 36, "Transport")
        tx_daysago("DSTV SUBSCRIPTION", -29_000, "debit", 35, "Subscriptions")
        tx_daysago("MTN DATA BUNDLE", -10_000, "debit", 34, "Airtime & Data")
        tx_daysago("COWRYWISE INVESTMENT", -50_000, "debit", 33, "Investments")
        tx_daysago("EKEDC POSTPAID", -15_000, "debit", 32, "Electricity")
        tx_daysago("NETFLIX DEBIT", -14_000, "debit", 31, "Subscriptions")

        # Month −2 (≈60-90 days ago)
        tx_daysago("SALARY CREDIT - TECHCORP LTD", 35_000_000, "credit", 88)
        tx_daysago("RENTS - APRIL 2026", -9_000_000, "debit", 70, "Rent / Housing")
        tx_daysago("SHOPRITE LEKKI", -19_500, "debit", 68, "Food & Groceries")
        tx_daysago("GROCERY PALACE IKEJA", -24_000, "debit", 65, "Food & Groceries")
        tx_daysago("BOLT RIDE", -2_800, "debit", 67, "Transport")
        tx_daysago("DSTV SUBSCRIPTION", -29_000, "debit", 65, "Subscriptions")
        tx_daysago("MTN AIRTIME TOP-UP", -5_000, "debit", 64, "Airtime & Data")
        tx_daysago("COWRYWISE INVESTMENT", -50_000, "debit", 63, "Investments")
        tx_daysago("EKEDC POSTPAID", -15_000, "debit", 62, "Electricity")
        tx_daysago("ANCHOR SAVINGS TRANSFER", -100_000, "debit", 61, "Emergency Fund")
        tx("MTN AIRTIME TOP-UP", -5_000, "debit", 4, "Airtime & Data")
        tx("DSTV SUBSCRIPTION", -29_000, "debit", 5, "Subscriptions")
        tx(
            "POS - EVERYDAY PHARMACY", -12_000, "debit", 8
        )  # uncategorised — appears in categorise queue
        tx("COWRYWISE INVESTMENT", -50_000, "debit", 9, "Investments")
        tx("RENTS - APRIL 2026", -9_000_000, "debit", 10, "Rent / Housing")
        tx("EKEDC POSTPAID", -15_000, "debit", 11, "Electricity")
        tx("NETFLIX DEBIT", -14_000, "debit", 15, "Subscriptions")
        tx("MTN DATA BUNDLE", -10_000, "debit", 16, "Airtime & Data")
        tx("ANCHOR SAVINGS TRANSFER", -100_000, "debit", 17, "Emergency Fund")

        # ── Seed budget allocations ───────────────────────────────────────────
        # Food budget is tight (₦580) so 83.6% spend triggers a real threshold_80 nudge.
        # Transport budget is very tight (₦30) so 143% spend triggers threshold_100.
        # Travel and Savings are allocated to show progress on home-screen Goals.
        _BUDGET: list[tuple[str, int, int]] = [
            # (category name, assigned_kobo, activity_kobo)
            ("Rent / Housing", 9_000_000, -9_000_000),
            ("Electricity", 50_000, -15_000),
            ("Internet", 30_000, 0),
            ("Food & Groceries", 58_000, -48_500),  # 83.6% spent
            ("Transport", 3_000, -4_300),  # 143% spent — over budget!
            ("Airtime & Data", 50_000, -15_000),
            ("Subscriptions", 60_000, -43_000),
            ("Investments", 200_000, -50_000),
            ("Emergency Fund", 150_000, -100_000),
            ("Savings", 300_000, 0),
            ("Travel", 150_000, 0),  # sinking fund for Christmas trip
        ]

        for cat_name, assigned, activity in _BUDGET:
            category = cat_by_name.get(cat_name)
            if not category:
                print(
                    f"  WARNING: category '{cat_name}' not found — skipping budget row."
                )
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

        # ── Prior-month budget rows (month −1 and −2) ─────────────────────────
        # Populate Budget Performance and Cash Flow charts in Reports.
        def prior_month(months_back: int) -> date:
            m = this_month.month - months_back
            y = this_month.year + (m - 1) // 12
            m = ((m - 1) % 12) + 1
            return date(y, m, 1)

        _BUDGET_HISTORY: list[tuple[str, int, int, int]] = [
            # (category, assigned_kobo, activity_kobo month_back)
            ("Rent / Housing", 9_000_000, -9_000_000, 1),
            ("Food & Groceries", 58_000, -54_500, 1),
            ("Transport", 30_000, -3_200, 1),
            ("Subscriptions", 60_000, -43_000, 1),
            ("Electricity", 50_000, -15_000, 1),
            ("Airtime & Data", 50_000, -10_000, 1),
            ("Investments", 200_000, -50_000, 1),
            ("Emergency Fund", 150_000, 0, 1),
            ("Savings", 300_000, 0, 1),
            ("Rent / Housing", 9_000_000, -9_000_000, 2),
            ("Food & Groceries", 58_000, -43_500, 2),
            ("Transport", 30_000, -2_800, 2),
            ("Subscriptions", 60_000, -29_000, 2),
            ("Electricity", 50_000, -15_000, 2),
            ("Airtime & Data", 50_000, -5_000, 2),
            ("Investments", 200_000, -50_000, 2),
            ("Emergency Fund", 150_000, -100_000, 2),
            ("Savings", 300_000, 0, 2),
        ]

        for cat_name, assigned, activity, mb in _BUDGET_HISTORY:
            category = cat_by_name.get(cat_name)
            if not category:
                continue
            db.add(
                BudgetMonth(
                    user_id=str(user.id),
                    category_id=str(category.id),
                    month=prior_month(mb),
                    assigned=assigned,
                    activity=activity,
                )
            )

        # ── Seed category targets ─────────────────────────────────────────────
        # Targets drive the "Cost to Be Me" card and the Goals section.
        # custom-frequency targets appear on the Home → Goals section.
        _TARGETS: list[
            tuple[str, str, str, int, int | None, int | None, date | None]
        ] = [
            # (category, frequency, behavior, target_amount, day_of_week, day_of_month, target_date)
            #
            # Monthly bills — show target labels in Budget tab
            ("Rent / Housing", "monthly", "set_aside", 9_000_000, None, 1, None),
            ("Subscriptions", "monthly", "set_aside", 60_000, None, 5, None),
            ("Airtime & Data", "monthly", "set_aside", 50_000, None, 28, None),
            #
            # Sinking funds — custom frequency → show on Home → Goals
            (
                "Travel",
                "custom",
                "set_aside",
                500_000,
                None,
                None,
                date(today.year, 12, 20),
            ),
            (
                "Savings",
                "custom",
                "balance",
                1_000_000,
                None,
                None,
                date(today.year + 1, 3, 1),
            ),
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
        next_month_10th = date(
            today.year if today.month < 12 else today.year + 1, today.month % 12 + 1, 10
        )
        next_month_5th = date(
            today.year if today.month < 12 else today.year + 1, today.month % 12 + 1, 5
        )
        # Next Monday
        days_to_monday = (7 - today.weekday()) % 7 or 7
        next_monday = today + timedelta(days=days_to_monday)

        _RULES: list[tuple[str, str, int, int | None, int | None, date, dict]] = [
            # (frequency, interval, day_of_week, day_of_month, next_due, template)
            (
                "monthly",
                1,
                None,
                10,
                next_month_10th,
                {
                    "account_id": str(account.id),
                    "amount": -15_000,
                    "narration": "EKEDC POSTPAID",
                    "type": "debit",
                    "category_id": cid("Electricity"),
                    "memo": "Auto-pay electricity bill",
                },
            ),
            (
                "monthly",
                1,
                None,
                5,
                next_month_5th,
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
                "weekly",
                1,
                0,
                None,
                next_monday,  # 0 = Monday
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

        # ── Seed nudges ───────────────────────────────────────────────────────
        # Two DSL behavioural nudges (trigger_type="nudge") and three operational
        # nudges covering transaction_received, statement_processed,
        # receipt_processed — one per visible nudge variant on the Nudges tab.
        food_cat = cat_by_name.get("Food & Groceries")
        transport_cat = cat_by_name.get("Transport")

        # Placeholder transaction UUIDs (match seeded tx narrations for realism)
        _SALARY_TX_ID = "00000000-0000-0000-0000-000000000001"
        _RENT_TX_ID = "00000000-0000-0000-0000-000000000002"
        _DSTV_TX_ID = "00000000-0000-0000-0000-000000000003"

        def nudge(
            trigger: str,
            title_str: str,
            msg: str,
            ctx: dict,
            cat: "Category | None" = None,
            hours_ago: int = 1,
        ) -> None:
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

        # DSL nudge — Food & Groceries at 84% of budget
        nudge(
            "nudge",
            "⚠️ Food & Groceries don reach 84%",
            (
                "You don use 84% of your Food & Groceries budget. "
                "Only ₦95 remain — use am wisely!"
            ),
            {
                "nudge_type": "high_spend_pct",
                "slug": "high_spend_pct",
                "gid": "spend_alerts",
                "evt_type": "debit_cat",
                "screen": "budget",
                "transaction_id": _RENT_TX_ID,
                "category_id": cid("Food & Groceries"),
                "category_name": "Food & Groceries",
                "amount_kobo": -18_000,
                "match_count": 3,
                "spend_pct": 0.84,
                "budget_amount_kobo": 58_000,
                "budget_remaining_kobo": 9_500,
            },
            cat=food_cat,
            hours_ago=6,
        )

        # DSL nudge — Transport over budget at 143%
        nudge(
            "nudge",
            "🚨 Transport budget don finish!",
            "E don do for Transport. You overrun by ₦13 — control the situation.",
            {
                "nudge_type": "high_spend_pct",
                "slug": "high_spend_pct",
                "gid": "spend_alerts",
                "evt_type": "debit_cat",
                "screen": "budget",
                "transaction_id": _DSTV_TX_ID,
                "category_id": cid("Transport"),
                "category_name": "Transport",
                "amount_kobo": -2_500,
                "match_count": 2,
                "spend_pct": 1.43,
                "budget_amount_kobo": 3_000,
                "budget_remaining_kobo": -1_300,
            },
            cat=transport_cat,
            hours_ago=3,
        )

        # Operational — credit received
        nudge(
            "transaction_received",
            "Money don enter! 🎉",
            (
                "₦350k credit don land from TECHCORP LTD! "
                "Time to give every kobo a job — assign am to your budget."
            ),
            {
                "nudge_type": "transaction_received",
                "screen": "budget",
                "bank_name": "GTBank",
                "transaction_id": _SALARY_TX_ID,
                "amount_kobo": 35_000_000,
                "amount_naira": "350k",
                "direction": "credit",
            },
            hours_ago=28 * 24,
        )

        # Operational — statement imported
        nudge(
            "statement_processed",
            "Statement don land ✅",
            "Your GTBank statement import don complete. 12 transactions added.",
            {
                "nudge_type": "statement_processed",
                "screen": "transactions",
                "bank_name": "GTBank",
                "imported": 12,
                "updated": 0,
            },
            hours_ago=5 * 24,
        )

        # Operational — receipt processed
        nudge(
            "receipt_processed",
            "Receipt scanned ✅",
            "Your DSTV receipt of ₦290 don process. Transaction added.",
            {
                "nudge_type": "receipt_processed",
                "screen": "transaction",
                "bank_name": "DSTV",
                "transaction_id": _DSTV_TX_ID,
                "amount_kobo": -29_000,
                "amount_naira": "290",
                "direction": "debit",
            },
            hours_ago=5 * 24,
        )

        db.commit()

        print(
            f"\n✓ Demo data seeded successfully!\n"
            f"  User ID      : {user.id}\n"
            f"  Display name : {args.display_name}\n"
            f"\nThe account is ready for store review. Share the credentials "
            f"(managed in the auth system) on the submission page."
        )

    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
