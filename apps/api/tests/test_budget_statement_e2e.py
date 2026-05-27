"""E2E test: statement-imported transactions must NOT affect BudgetMonth.activity.

Simulates the full statement-import → categorisation pipeline:
  1. Create user, OPay account (9016456964), and budget categories.
  2. Insert transactions with source=statement (mimicking process_bank_statement).
  3. Insert a MONIMATA_STARTING_BALANCE credit (source=system, category_id=None).
  4. Categorise the statement transactions (mimicking categorize_transactions).
  5. Assert BudgetMonth.activity == 0 for every category.

This validates the fix in budget_events.py that guards event listeners
against source=statement transactions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

# Import budget_events at module level so event listeners are registered exactly
# once.  This MUST happen before any per-test fixture (especially _mock_celery's
# patch.dict on sys.modules) saves state — otherwise the module would be removed
# from sys.modules between tests and re-imported, causing duplicate listener
# registration.
import app.services.budget_events  # noqa: F401
from tests.conftest import (
    TEST_USER_ID,
    make_account,
    make_category,
    make_group,
    make_user,
)


def _insert_statement_transaction(
    db: Session,
    user_id: str,
    account_id: str,
    *,
    amount: int,
    tx_type: str,
    narration: str,
    date: datetime | None = None,
    balance_after: int | None = None,
    external_ref: str | None = None,
) -> str:
    """Insert a transaction with source=statement, category_id=None."""
    from app.models.transaction import Transaction, TransactionSource

    tx_id = str(uuid.uuid4())
    tx = Transaction(
        id=tx_id,
        user_id=user_id,
        account_id=account_id,
        date=date or datetime.now(UTC),
        amount=amount,
        narration=narration,
        cleaned_narration=narration.lower().strip(),
        type=tx_type,
        balance_after=balance_after,
        source=TransactionSource.statement,
        external_ref=external_ref,
        category_id=None,
    )
    db.add(tx)
    db.commit()
    return tx_id


def _insert_starting_balance(
    db: Session,
    user_id: str,
    account_id: str,
    closing_balance: int,
) -> str:
    """Insert the synthetic MONIMATA_STARTING_BALANCE credit (source=system)."""
    from app.models.transaction import Transaction, TransactionSource

    tx_id = str(uuid.uuid4())
    tx = Transaction(
        id=tx_id,
        user_id=user_id,
        account_id=account_id,
        date=datetime.now(UTC),
        amount=closing_balance,
        narration="Starting Balance",
        cleaned_narration="starting balance",
        type="credit",
        category_id=None,
        source=TransactionSource.system,
    )
    db.add(tx)
    db.commit()
    return tx_id


class TestStatementDoesNotAffectBudgetActivity:
    """Statement transactions must not touch BudgetMonth.activity —
    even after the categorisation pipeline assigns them a category.
    """

    def test_categorised_statement_debits_leave_activity_zero(self, db: Session):
        """Core scenario: debit transactions from a statement get categorised
        but BudgetMonth.activity for those categories must remain 0.
        """
        from app.models.transaction import Transaction
        from app.services.budget_logic import str_to_month_date

        make_user(db)
        account_id = make_account(
            db,
            institution="OPay",
            bank_slug="opay",
            balance=0,
        )

        # Create two category groups and categories (simulating user setup)
        gid = make_group(db, name="Essentials")
        food_cat_id = make_category(db, gid, name="Food & Dining")
        transport_cat_id = make_category(db, gid, name="Transport")

        gid2 = make_group(db, name="Entertainment")
        fun_cat_id = make_category(db, gid2, name="Fun Money")

        # ── Step 1: Simulate process_bank_statement ────────────────────────
        # Insert statement transactions (debits and credits) with no category.
        tx_date = datetime(2026, 5, 10, 14, 30, 0, tzinfo=UTC)

        tx1_id = _insert_statement_transaction(
            db,
            TEST_USER_ID,
            account_id,
            amount=-150_000,  # ₦1,500 debit
            tx_type="debit",
            narration="POS Transfer-CHICKEN REPUBLIC",
            date=tx_date,
            balance_after=350_000,
            external_ref="REF001",
        )
        tx2_id = _insert_statement_transaction(
            db,
            TEST_USER_ID,
            account_id,
            amount=-50_000,  # ₦500 debit
            tx_type="debit",
            narration="Transfer to BOLT",
            date=tx_date,
            balance_after=300_000,
            external_ref="REF002",
        )
        tx3_id = _insert_statement_transaction(  # noqa: F841
            db,
            TEST_USER_ID,
            account_id,
            amount=500_000,  # ₦5,000 credit
            tx_type="credit",
            narration="SALARY PAYMENT",
            date=tx_date,
            balance_after=800_000,
            external_ref="REF003",
        )
        tx4_id = _insert_statement_transaction(
            db,
            TEST_USER_ID,
            account_id,
            amount=-25_000,  # ₦250 debit
            tx_type="debit",
            narration="Netflix Subscription",
            date=tx_date,
            balance_after=275_000,
            external_ref="REF004",
        )

        # Insert MONIMATA_STARTING_BALANCE — closing balance from statement
        _insert_starting_balance(db, TEST_USER_ID, account_id, closing_balance=275_000)

        # ── Step 2: Simulate categorize_transactions ───────────────────────
        # Assign categories to the statement transactions (as the pipeline does).
        tx1 = db.get(Transaction, tx1_id)
        tx1.category_id = food_cat_id  # type: ignore[union-attr]
        db.flush()

        tx2 = db.get(Transaction, tx2_id)
        tx2.category_id = transport_cat_id  # type: ignore[union-attr]
        db.flush()

        # tx3 is a credit — leave uncategorised (feeds TBB via null category)

        tx4 = db.get(Transaction, tx4_id)
        tx4.category_id = fun_cat_id  # type: ignore[union-attr]
        db.flush()

        db.commit()

        # ── Step 3: Assert BudgetMonth rows exist with activity == 0 ──────
        # The event listeners create BudgetMonth rows via _upsert_budget_month_row
        # but must NOT apply any activity delta for statement transactions.
        # Query via raw SQL to bypass ORM savepoint caching.
        from sqlalchemy import text

        month_date = str_to_month_date("2026-05")

        for cat_id, cat_name in [
            (food_cat_id, "Food & Dining"),
            (transport_cat_id, "Transport"),
            (fun_cat_id, "Fun Money"),
        ]:
            row = db.execute(
                text(
                    "SELECT activity FROM budget_months "
                    "WHERE user_id = :uid AND category_id = :cid AND month = :m"
                ),
                {"uid": TEST_USER_ID, "cid": cat_id, "m": month_date},
            ).fetchone()
            # The budget row must NOT exist — statement transactions must not
            # create BudgetMonth rows or touch activity at all.
            assert row is None, (
                f"BudgetMonth row for {cat_name} should not exist for statement-only "
                f"transactions, but found activity={row[0]}"
            )

    def test_manual_debit_still_affects_activity(self, db: Session):
        """Sanity check: a manually-entered debit SHOULD affect activity.

        The budget_events.py event listener uses connection.execute() (Core SQL)
        which runs inside the same transaction but outside ORM identity-map
        tracking.  We verify the DB state via raw SQL on the same connection
        to avoid ORM caching issues in the test-fixture savepoint context.
        """
        from app.models.transaction import Transaction, TransactionSource
        from app.services.budget_logic import str_to_month_date

        make_user(db)
        account_id = make_account(db, institution="OPay", bank_slug="opay")
        gid = make_group(db, name="Bills")
        rent_cat_id = make_category(db, gid, name="Rent")

        # Insert a manual debit with a category — should touch activity
        tx = Transaction(
            id=str(uuid.uuid4()),
            user_id=TEST_USER_ID,
            account_id=account_id,
            date=datetime(2026, 5, 15, 10, 0, 0, tzinfo=UTC),
            amount=-100_000,  # ₦1,000 debit
            narration="Rent payment",
            cleaned_narration="rent payment",
            type="debit",
            category_id=rent_cat_id,
            source=TransactionSource.manual,
        )
        db.add(tx)
        db.flush()

        # The event listener writes via connection.execute() on the same
        # underlying connection.  Query with raw SQL to bypass ORM caching.
        from sqlalchemy import text

        month_date = str_to_month_date("2026-05")
        row = db.execute(
            text(
                "SELECT activity FROM budget_months "
                "WHERE user_id = :uid AND category_id = :cid AND month = :m"
            ),
            {"uid": TEST_USER_ID, "cid": rent_cat_id, "m": month_date},
        ).fetchone()
        assert row is not None, "BudgetMonth row should be created for manual debit"
        assert row[0] == -100_000, f"Manual debit should set activity to -100000, got {row[0]}"

    def test_statement_then_recategorise_still_zero(self, db: Session):
        """Re-categorising a statement transaction from one category to another
        must not affect activity on either category.
        """
        from app.models.budget import BudgetMonth
        from app.models.transaction import Transaction
        from app.services.budget_logic import str_to_month_date

        make_user(db)
        account_id = make_account(db, institution="OPay", bank_slug="opay")
        gid = make_group(db, name="Needs")
        cat_a_id = make_category(db, gid, name="Category A")
        cat_b_id = make_category(db, gid, name="Category B")

        # Insert a statement debit
        tx_id = _insert_statement_transaction(
            db,
            TEST_USER_ID,
            account_id,
            amount=-200_000,
            tx_type="debit",
            narration="Some purchase",
            date=datetime(2026, 5, 12, tzinfo=UTC),
            external_ref="REF-RECAT",
        )

        # Categorise into Category A
        tx = db.get(Transaction, tx_id)
        tx.category_id = cat_a_id  # type: ignore[union-attr]
        db.commit()

        # Re-categorise into Category B
        tx = db.get(Transaction, tx_id)
        tx.category_id = cat_b_id  # type: ignore[union-attr]
        db.commit()

        month_date = str_to_month_date("2026-05")

        for cat_id, label in [(cat_a_id, "Category A"), (cat_b_id, "Category B")]:
            bm = (
                db.query(BudgetMonth)
                .filter_by(
                    user_id=TEST_USER_ID,
                    category_id=cat_id,
                    month=month_date,
                )
                .first()
            )
            if bm is not None:
                assert bm.activity == 0, (
                    f"BudgetMonth.activity for {label} should be 0 after re-categorising "
                    f"a statement transaction, but got {bm.activity}"
                )
