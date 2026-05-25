"""Tests for Pydantic schema validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError


class TestAccountSchemas:
    def test_valid_manual_account(self):
        from app.schemas.accounts import AddManualAccountRequest

        req = AddManualAccountRequest(
            institution="GTBank",
            bank_slug="gtbank",
            account_number="0123456789",
            alias="My GTB",
        )
        assert req.account_number == "0123456789"

    def test_short_account_number_rejected(self):
        from app.schemas.accounts import AddManualAccountRequest

        with pytest.raises(ValidationError):
            AddManualAccountRequest(
                institution="GTBank",
                bank_slug="gtbank",
                account_number="123",
                alias="Bad",
            )

    def test_non_digit_account_number_rejected(self):
        from app.schemas.accounts import AddManualAccountRequest

        with pytest.raises(ValidationError):
            AddManualAccountRequest(
                institution="GTBank",
                bank_slug="gtbank",
                account_number="012345678A",
                alias="Bad",
            )

    def test_negative_balance_rejected(self):
        from app.schemas.accounts import UpdateManualBalanceRequest

        with pytest.raises(ValidationError):
            UpdateManualBalanceRequest(balance=-1)


class TestTransactionSchemas:
    def test_zero_amount_rejected(self):
        from app.schemas.transactions import ManualTransactionRequest

        with pytest.raises(ValidationError, match="zero"):
            ManualTransactionRequest(
                account_id="00000000-0000-0000-0000-000000000001",
                date="2026-05-20T12:00:00Z",
                amount=0,
                narration="Test",
                type="debit",
            )

    def test_split_less_than_two_rejected(self):
        from app.schemas.transactions import TransactionSplitRequest

        with pytest.raises(ValidationError, match="2 items"):
            TransactionSplitRequest(
                splits=[{"category_id": "00000000-0000-0000-0000-000000000001", "amount": 1000}]
            )

    def test_negative_split_amount_rejected(self):
        from app.schemas.transactions import TransactionSplitItem

        with pytest.raises(ValidationError, match="positive"):
            TransactionSplitItem(
                category_id="00000000-0000-0000-0000-000000000001",
                amount=-100,
            )


class TestBudgetSchemas:
    def test_negative_assignment_rejected(self):
        from app.schemas.budget import AssignRequest

        with pytest.raises(ValidationError, match="negative"):
            AssignRequest(assigned=-1)

    def test_zero_move_amount_rejected(self):
        from app.schemas.budget import MoveMoneyRequest

        with pytest.raises(ValidationError, match="positive"):
            MoveMoneyRequest(
                from_category_id="00000000-0000-0000-0000-000000000001",
                to_category_id="00000000-0000-0000-0000-000000000002",
                amount=0,
                month="2026-05",
            )

    def test_auto_assign_strategy_values(self):
        from app.schemas.budget import AutoAssignStrategy

        assert AutoAssignStrategy.underfunded == "underfunded"
        assert AutoAssignStrategy.avg_spent == "avg_spent"


class TestCategorySchemas:
    def test_target_zero_amount_rejected(self):
        from app.schemas.categories import CategoryTargetUpsert

        with pytest.raises(ValidationError, match="positive"):
            CategoryTargetUpsert(
                frequency="monthly",
                target_amount=0,
            )

    def test_valid_target(self):
        from app.schemas.categories import CategoryTargetUpsert

        t = CategoryTargetUpsert(
            frequency="monthly",
            behavior="set_aside",
            target_amount=50000,
        )
        assert t.target_amount == 50000


class TestRecurringSchemas:
    def test_invalid_interval(self):
        from app.schemas.recurring import RecurringRuleCreate

        with pytest.raises(ValidationError, match="interval"):
            RecurringRuleCreate(
                frequency="monthly",
                interval=0,
                next_due="2026-06-01",
                template={
                    "account_id": "x",
                    "amount": -5000,
                    "narration": "Test",
                    "type": "debit",
                },
            )


class TestNudgeSchemas:
    def test_register_device_empty_token(self):
        from app.schemas.nudges import RegisterDeviceRequest

        with pytest.raises(ValidationError):
            RegisterDeviceRequest(token="")

    def test_nudge_settings_invalid_pattern(self):
        from app.schemas.nudges import NudgeSettingsUpdate

        with pytest.raises(ValidationError):
            NudgeSettingsUpdate(quiet_hours_start="25:00")

    def test_nudge_settings_valid(self):
        from app.schemas.nudges import NudgeSettingsUpdate

        s = NudgeSettingsUpdate(
            enabled=True,
            quiet_hours_start="23:00",
            quiet_hours_end="07:00",
            fatigue_limit=5,
            language="formal",
        )
        assert s.fatigue_limit == 5


class TestAiSchemas:
    def test_invalid_provider(self):
        from app.schemas.ai import AiCredentialCreate

        with pytest.raises(ValidationError):
            AiCredentialCreate(provider="invalid", api_key="sk-test-key-1234567890")

    def test_valid_providers(self):
        from app.schemas.ai import AiCredentialCreate

        for provider in ("gemini", "openai", "anthropic"):
            c = AiCredentialCreate(provider=provider, api_key="sk-test-key-1234567890")
            assert c.provider == provider


class TestReportSchemas:
    def test_granularity_enum(self):
        from app.schemas.reports import Granularity

        assert Granularity.daily == "daily"
        assert Granularity.weekly == "weekly"
        assert Granularity.monthly == "monthly"

    def test_monthly_summary_response(self):
        from app.schemas.reports import MonthComparison, MonthlySummaryResponse

        resp = MonthlySummaryResponse(
            month="2026-05",
            total_income=100000,
            total_expenses=50000,
            net_savings=50000,
            savings_rate=50.0,
            credit_count=1,
            debit_count=2,
            avg_daily_expense=1667,
            top_categories=[],
            comparison=MonthComparison(
                income_change_pct=None,
                expense_change_pct=None,
                savings_change_pct=None,
            ),
        )
        assert resp.savings_rate == 50.0
