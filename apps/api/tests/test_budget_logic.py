"""Tests for budget logic service."""

from __future__ import annotations

from datetime import date

from app.services.budget_logic import (
    month_date_range,
    prev_month_str,
    str_to_month_date,
)


class TestMonthHelpers:
    def test_str_to_month_date(self):
        assert str_to_month_date("2026-05") == date(2026, 5, 1)
        assert str_to_month_date("2026-01") == date(2026, 1, 1)
        assert str_to_month_date("2026-12") == date(2026, 12, 1)

    def test_prev_month_str(self):
        assert prev_month_str("2026-05") == "2026-04"
        assert prev_month_str("2026-01") == "2025-12"
        assert prev_month_str("2026-12") == "2026-11"

    def test_month_date_range(self):
        start, end = month_date_range("2026-05")
        assert start.day == 1
        assert start.month == 5
        assert end.day == 1
        assert end.month == 6

    def test_month_date_range_december(self):
        start, end = month_date_range("2026-12")
        assert start.month == 12
        assert end.year == 2027
        assert end.month == 1

    def test_month_date_range_february(self):
        start, end = month_date_range("2026-02")
        assert start.month == 2
        assert end.month == 3
        assert end.day == 1
