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

"""Unit tests for the DSL engine."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.dsl_engine import (
    DSL_OPERATORS,
    _count_where,
    _date_in,
    _date_range,
    _day_in,
    _dom_range,
    _hour_in,
    _hour_range,
    evaluate_rule,
    filter_rules_by_gid_rate_limit,
    get_nested_value,
    hydrate_context,
    run_dsl_rules,
    set_gid_rate_limit,
)

WAT = timezone(timedelta(hours=1))

# ── Helpers ───────────────────────────────────────────────────────────────────


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _wat_dt(year=2026, month=5, day=22, hour=23, minute=45) -> str:
    """Build an ISO string for a WAT-localised datetime."""
    return _iso(datetime(year, month, day, hour, minute, tzinfo=WAT))


def _make_tx(**kwargs) -> MagicMock:
    """Return a mock Transaction with sensible defaults."""
    tx = MagicMock()
    tx.id = kwargs.get("id", "tx_test")
    tx.amount = kwargs.get("amount", -35_000_00)  # kobo
    tx.type = kwargs.get("type", "debit")
    tx.category_id = kwargs.get("category_id", "cat_test")
    # date is timezone-aware; default: Friday 2026-05-22 23:45 WAT
    tx.date = kwargs.get(
        "date",
        datetime(2026, 5, 22, 23, 45, tzinfo=WAT),
    )
    tx.narration = kwargs.get("narration", "Test narration")
    return tx


def _make_cat(**kwargs) -> MagicMock:
    cat = MagicMock()
    cat.id = kwargs.get("id", "cat_test")
    cat.name = kwargs.get("name", "Lifestyle")
    return cat


def _make_bm(**kwargs) -> MagicMock:
    from datetime import date

    bm = MagicMock()
    bm.assigned = kwargs.get("assigned", 100_000_00)  # kobo
    bm.activity = kwargs.get("activity", -68_000_00)  # negative = spending
    bm.month = kwargs.get("month", date(2026, 5, 1))  # first day of the budget month
    return bm


def _make_target(**kwargs) -> MagicMock:
    t = MagicMock()
    t.frequency = kwargs.get("frequency", "monthly")
    return t


def _minimal_context(
    tx_cid: str = "cat_test",
    tx_amt: int = -35_000_00,
    tx_type: str = "debit",
    tx_dt: str | None = None,
    spend_pct: float = 0.68,
    hist_txs: list | None = None,
) -> dict:
    """Build a minimal context dict without going through hydrate_context."""
    if tx_dt is None:
        tx_dt = _wat_dt()
    return {
        "tx": SimpleNamespace(
            id="tx_test",
            amt=tx_amt,
            type=tx_type,
            cid=tx_cid,
            dt=tx_dt,
            time_display="11:45 PM",
        ),
        "cat": SimpleNamespace(
            id="cat_test",
            name="Lifestyle",
            type=None,
            amt=100_000_00,
            spent=68_000_00,
            rem=32_000_00,
            spend_pct=spend_pct,
            tx_pct=0.35,
            time_pct=0.65,
        ),
        "hist": SimpleNamespace(
            txs=hist_txs or [],
            match_count=0,
        ),
    }


# ── Scalar operators (eq, neq, gt, lt, gte, lte) ─────────────────────────────


class TestScalarOperators:
    @pytest.mark.parametrize(
        "op,a,b,expected",
        [
            ("eq", 100, 100, True),
            ("eq", "debit", "debit", True),
            ("eq", "debit", "credit", False),
            ("neq", 1, 2, True),
            ("neq", 1, 1, False),
            ("gt", 200, 100, True),
            ("gt", 100, 200, False),
            ("lt", 50, 100, True),
            ("gte", 100, 100, True),
            ("gte", 101, 100, True),
            ("gte", 99, 100, False),
            ("lte", 99, 100, True),
            ("lte", 100, 100, True),
        ],
    )
    def test_scalar_op(self, op, a, b, expected):
        assert DSL_OPERATORS[op](a, b) == expected


# ── Temporal operators ────────────────────────────────────────────────────────


class TestTemporalOperators:
    # Friday 2026-05-22 23:45 WAT
    _fri_night = _wat_dt(2026, 5, 22, 23, 45)
    # Monday 2026-05-18 09:00 WAT
    _mon_morning = _wat_dt(2026, 5, 18, 9, 0)

    def test_day_in_match(self):
        assert _day_in(self._fri_night, ["FRI", "SAT", "SUN"]) is True

    def test_day_in_no_match(self):
        assert _day_in(self._mon_morning, ["FRI", "SAT", "SUN"]) is False

    def test_dom_range_in_bounds(self):
        assert _dom_range(self._fri_night, [20, 25]) is True

    def test_dom_range_out_of_bounds(self):
        assert _dom_range(self._fri_night, [1, 10]) is False

    def test_date_range_in(self):
        assert _date_range(self._fri_night, ["2026-05-01", "2026-05-31"]) is True

    def test_date_range_out(self):
        assert _date_range(self._fri_night, ["2026-06-01", "2026-06-30"]) is False

    def test_date_in_hit(self):
        assert _date_in(self._fri_night, ["2026-05-22", "2026-12-25"]) is True

    def test_date_in_miss(self):
        assert _date_in(self._fri_night, ["2026-12-25"]) is False

    def test_hour_in_match(self):
        # 23:45 → hour 23
        assert _hour_in(self._fri_night, [22, 23]) is True

    def test_hour_in_no_match(self):
        assert _hour_in(self._fri_night, [0, 1, 2]) is False

    def test_hour_range_normal(self):
        assert _hour_range(_wat_dt(hour=14), [9, 17]) is True
        assert _hour_range(_wat_dt(hour=8), [9, 17]) is False

    def test_hour_range_overnight_wrap_inside(self):
        # [22, 4] — 23:00 should match
        assert _hour_range(_wat_dt(hour=23), [22, 4]) is True

    def test_hour_range_overnight_wrap_early_morning(self):
        # [22, 4] — 02:00 should match
        assert _hour_range(_wat_dt(hour=2), [22, 4]) is True

    def test_hour_range_overnight_wrap_outside(self):
        # [22, 4] — 12:00 should NOT match
        assert _hour_range(_wat_dt(hour=12), [22, 4]) is False

    def test_z_suffix_handled(self):
        dt_z = "2026-05-22T22:45:00Z"  # UTC = 23:45 WAT
        assert _hour_in(dt_z, [22]) is True  # UTC hour = 22, not WAT 23
        # Note: operators work on the stored datetime string; callers must
        # ensure tx.dt is stored with the correct timezone offset.


# ── count_where operator ──────────────────────────────────────────────────────


class TestCountWhere:
    _txs = [
        {"cid": "cat_lifestyle", "amt": -12000, "type": "debit", "dt": "2026-05-21T20:10:00+01:00"},
        {"cid": "cat_lifestyle", "amt": -15000, "type": "debit", "dt": "2026-05-22T01:15:00+01:00"},
        {"cid": "cat_food", "amt": -4500, "type": "debit", "dt": "2026-05-22T14:30:00+01:00"},
    ]

    def _ctx(self, cid="cat_lifestyle"):
        return _minimal_context(tx_cid=cid, hist_txs=self._txs)

    def _cfg(self, filter_val="curr.cid", cond_op="gte", cond_val=2):
        return {
            "filter": {"fact": "tx.cid", "op": "eq", "val": filter_val},
            "cond": {"op": cond_op, "val": cond_val},
        }

    def test_curr_cid_macro_resolves_and_matches(self):
        ctx = self._ctx(cid="cat_lifestyle")
        result = _count_where(self._txs, self._cfg("curr.cid", "gte", 2), ctx)
        assert result is True
        assert ctx["hist"].match_count == 2

    def test_curr_cid_macro_resolves_and_no_match(self):
        ctx = self._ctx(cid="cat_lifestyle")
        result = _count_where(self._txs, self._cfg("curr.cid", "gte", 3), ctx)
        assert result is False
        assert ctx["hist"].match_count == 2

    def test_literal_category_filter(self):
        ctx = self._ctx()
        result = _count_where(self._txs, self._cfg("cat_food", "gte", 1), ctx)
        assert result is True
        assert ctx["hist"].match_count == 1

    def test_no_matches(self):
        ctx = self._ctx()
        result = _count_where(self._txs, self._cfg("cat_nonexistent", "gte", 1), ctx)
        assert result is False
        assert ctx["hist"].match_count == 0

    def test_eq_exact_count(self):
        ctx = self._ctx(cid="cat_lifestyle")
        result = _count_where(self._txs, self._cfg("curr.cid", "eq", 2), ctx)
        assert result is True

    def test_lt_count(self):
        ctx = self._ctx(cid="cat_lifestyle")
        result = _count_where(self._txs, self._cfg("curr.cid", "lt", 5), ctx)
        assert result is True


# ── get_nested_value ──────────────────────────────────────────────────────────


class TestGetNestedValue:
    def test_dict_top_level(self):
        assert get_nested_value({"a": 1}, "a") == 1

    def test_dict_missing_key(self):
        assert get_nested_value({"a": 1}, "b") is None

    def test_simplenamespace_attribute(self):
        ctx = {"tx": SimpleNamespace(amt=-5000, cid="cat_x")}
        assert get_nested_value(ctx, "tx.amt") == -5000
        assert get_nested_value(ctx, "tx.cid") == "cat_x"

    def test_missing_intermediate(self):
        ctx = {"tx": SimpleNamespace(amt=100)}
        assert get_nested_value(ctx, "cat.name") is None

    def test_hist_txs(self):
        ctx = {"hist": SimpleNamespace(txs=[1, 2, 3], match_count=0)}
        assert get_nested_value(ctx, "hist.txs") == [1, 2, 3]


# ── evaluate_rule — flat and nested ──────────────────────────────────────────


class TestEvaluateRule:
    def test_simple_and_passes(self):
        ctx = _minimal_context(tx_amt=-50_000_00, spend_pct=0.9)
        assert evaluate_rule(
            {
                "op": "AND",
                "rules": [
                    {"fact": "tx.amt", "op": "lt", "val": 0},
                    {"fact": "cat.spend_pct", "op": "gt", "val": 0.8},
                ],
            },
            ctx,
        )

    def test_simple_and_fails_one(self):
        ctx = _minimal_context(spend_pct=0.5)
        assert not evaluate_rule(
            {
                "op": "AND",
                "rules": [
                    {"fact": "tx.amt", "op": "lt", "val": 0},
                    {"fact": "cat.spend_pct", "op": "gt", "val": 0.8},
                ],
            },
            ctx,
        )

    def test_or_passes_if_one_true(self):
        ctx = _minimal_context(tx_dt=_wat_dt(hour=14), spend_pct=0.9)
        assert evaluate_rule(
            {
                "op": "OR",
                "rules": [
                    # This is false — 14:00 is not in [22, 4]
                    {"fact": "tx.dt", "op": "hour_range", "val": [22, 4]},
                    # This is true — spend_pct 0.9 > 0.8
                    {"fact": "cat.spend_pct", "op": "gt", "val": 0.8},
                ],
            },
            ctx,
        )

    def test_nested_and_or(self):
        ctx = _minimal_context(
            tx_dt=_wat_dt(2026, 5, 22, 23, 0),  # Friday 23:00 WAT
            spend_pct=0.85,
        )
        assert evaluate_rule(
            {
                "op": "AND",
                "rules": [
                    # Outer: spend_pct passes
                    {"fact": "cat.spend_pct", "op": "gte", "val": 0.8},
                    # Nested OR: either weekend OR late night
                    {
                        "op": "OR",
                        "rules": [
                            {"fact": "tx.dt", "op": "day_in", "val": ["FRI", "SAT", "SUN"]},
                            {"fact": "tx.dt", "op": "hour_range", "val": [0, 6]},
                        ],
                    },
                ],
            },
            ctx,
        )

    def test_three_level_nesting(self):
        ctx = _minimal_context(tx_amt=-100_000, spend_pct=0.95)
        assert evaluate_rule(
            {
                "op": "AND",
                "rules": [
                    {
                        "op": "OR",
                        "rules": [
                            {
                                "op": "AND",
                                "rules": [
                                    {"fact": "cat.spend_pct", "op": "gte", "val": 0.9},
                                    {"fact": "tx.amt", "op": "lt", "val": 0},
                                ],
                            }
                        ],
                    }
                ],
            },
            ctx,
        )

    def test_empty_rules_returns_false(self):
        ctx = _minimal_context()
        assert not evaluate_rule({"op": "AND", "rules": []}, ctx)

    def test_unknown_operator_is_false(self):
        ctx = _minimal_context()
        assert not evaluate_rule(
            {"op": "AND", "rules": [{"fact": "tx.amt", "op": "between", "val": [0, 100]}]},
            ctx,
        )

    def test_none_fact_is_false(self):
        ctx = _minimal_context()
        # cat.spend_pct is 0.68 but we check a None-producing path
        ctx["cat"].spend_pct = None
        assert not evaluate_rule(
            {"op": "AND", "rules": [{"fact": "cat.spend_pct", "op": "gt", "val": 0.0}]},
            ctx,
        )

    def test_nightlife_rule_from_design_doc(self):
        """Full rule from nudges_design.md — should match."""
        txs = [
            {"cid": "cat_lifestyle", "amt": -12000, "type": "debit", "dt": "2026-05-21T19:10:00Z"},
            {"cid": "cat_lifestyle", "amt": -15000, "type": "debit", "dt": "2026-05-22T00:15:00Z"},
            {"cid": "cat_food", "amt": -4500, "type": "debit", "dt": "2026-05-22T13:30:00Z"},
        ]
        ctx = _minimal_context(
            tx_cid="cat_lifestyle",
            tx_dt=_wat_dt(2026, 5, 22, 23, 45),  # Friday 23:45 WAT
            spend_pct=0.85,
            hist_txs=txs,
        )
        result = evaluate_rule(
            {
                "op": "AND",
                "rules": [
                    {"fact": "tx.dt", "op": "day_in", "val": ["FRI", "SAT", "SUN"]},
                    {"fact": "tx.dt", "op": "hour_range", "val": [22, 4]},
                    {"fact": "cat.spend_pct", "op": "gt", "val": 0.80},
                    {
                        "fact": "hist.txs",
                        "op": "count_where",
                        "val": {
                            "filter": {"fact": "tx.cid", "op": "eq", "val": "curr.cid"},
                            "cond": {"op": "gte", "val": 2},
                        },
                    },
                ],
            },
            ctx,
        )
        assert result is True
        assert ctx["hist"].match_count == 2


# ── hydrate_context ───────────────────────────────────────────────────────────


class TestHydrateContext:
    def test_full_context(self):
        tx = _make_tx(amount=-35_000_00)
        cat = _make_cat(name="Food & Drink")
        bm = _make_bm(assigned=100_000_00, activity=-68_000_00)
        ctx = hydrate_context(tx, cat, bm, [])

        assert ctx["tx"].type == "debit"
        assert ctx["tx"].amt == -35_000_00
        assert ctx["tx"].cid == "cat_test"
        assert ctx["cat"].name == "Food & Drink"
        assert ctx["cat"].amt == 100_000_00
        assert ctx["cat"].spent == 68_000_00
        assert ctx["cat"].rem == 32_000_00
        assert abs(ctx["cat"].spend_pct - 0.68) < 1e-9
        assert abs(ctx["cat"].tx_pct - 0.35) < 1e-9
        assert ctx["hist"].match_count == 0

    def test_time_display_format(self):
        tx = _make_tx(date=datetime(2026, 5, 22, 23, 45, tzinfo=WAT))
        ctx = hydrate_context(tx, None, None, [])
        assert ctx["tx"].time_display == "11:45 PM"

    def test_no_category(self):
        tx = _make_tx()
        ctx = hydrate_context(tx, None, None, [])
        assert ctx["cat"].name is None
        assert ctx["cat"].spend_pct is None
        assert ctx["cat"].tx_pct is None

    def test_category_but_no_budget(self):
        tx = _make_tx()
        cat = _make_cat()
        ctx = hydrate_context(tx, cat, None, [])
        assert ctx["cat"].name == "Lifestyle"
        assert ctx["cat"].amt is None  # no bm → no assigned

    def test_category_zero_assigned(self):
        tx = _make_tx()
        cat = _make_cat()
        bm = _make_bm(assigned=0, activity=0)
        ctx = hydrate_context(tx, cat, bm, [])
        # assigned=0 means no active budget — same code path as bm=None
        assert ctx["cat"].amt is None

    def test_history_items_keyed_correctly(self):
        tx = _make_tx()
        hist_tx = _make_tx(
            amount=-5000,
            type="debit",
            category_id="cat_food",
            date=datetime(2026, 5, 20, 12, 0, tzinfo=WAT),
        )
        ctx = hydrate_context(tx, None, None, [hist_tx])
        item = ctx["hist"].txs[0]
        assert item["cid"] == "cat_food"
        assert item["amt"] == -5000
        assert item["type"] == "debit"
        assert "dt" in item

    def test_time_ratio_monthly_from_bm_month(self):
        from datetime import date

        tx = _make_tx()
        cat = _make_cat()
        # month started 2026-05-01; today (WAT) is 2026-05-21 → 21/31 ≈ 0.677
        bm = _make_bm(assigned=100_000_00, activity=-50_000_00, month=date(2026, 5, 1))
        target = _make_target(frequency="monthly")
        ctx = hydrate_context(tx, cat, bm, [], target=target)
        assert ctx["cat"].time_pct is not None
        assert 0.0 < ctx["cat"].time_pct <= 1.0

    def test_time_ratio_monthly_fallback_no_bm(self):
        """Without a BudgetMonth, monthly time_ratio falls back to current calendar month."""
        tx = _make_tx()
        cat = _make_cat()
        target = _make_target(frequency="monthly")
        ctx = hydrate_context(tx, cat, None, [], target=target)
        assert ctx["cat"].time_pct is not None
        assert 0.0 < ctx["cat"].time_pct <= 1.0

    def test_time_ratio_weekly(self):
        """Weekly time_ratio = (weekday + 1) / 7, independent of bm."""
        from datetime import date

        tx = _make_tx()
        cat = _make_cat()
        bm = _make_bm(month=date(2026, 5, 1))
        target = _make_target(frequency="weekly")
        ctx = hydrate_context(tx, cat, bm, [], target=target)
        tr = ctx["cat"].time_pct
        assert tr is not None
        # Must be exactly one of the 7 valid daily fractions
        valid_ratios = [d / 7 for d in range(1, 8)]
        assert any(abs(tr - v) < 1e-9 for v in valid_ratios)

    def test_time_ratio_yearly(self):
        tx = _make_tx()
        cat = _make_cat()
        target = _make_target(frequency="yearly")
        ctx = hydrate_context(tx, cat, None, [], target=target)
        tr = ctx["cat"].time_pct
        assert tr is not None
        assert 0.0 < tr <= 1.0
        # Dynamic: compute expected from today's actual date
        today_wat = datetime.now(WAT).date()
        expected = today_wat.timetuple().tm_yday / 365
        assert abs(tr - expected) < 1e-6

    def test_time_ratio_custom_midpoint(self):
        """Custom goal: exactly halfway through the window → time_ratio == 0.5."""
        from datetime import UTC, timedelta

        tx = _make_tx()
        cat = _make_cat()
        target = _make_target(frequency="custom")
        today_utc = datetime.now(WAT).date()
        target.created_at = datetime(
            today_utc.year, today_utc.month, today_utc.day, tzinfo=UTC
        ) - timedelta(days=10)
        target.target_date = today_utc + timedelta(days=10)
        ctx = hydrate_context(tx, cat, None, [], target=target)
        assert abs(ctx["cat"].time_pct - 0.5) < 1e-9

    def test_time_ratio_custom_no_target_date_returns_none(self):
        tx = _make_tx()
        cat = _make_cat()
        target = _make_target(frequency="custom")
        target.target_date = None
        ctx = hydrate_context(tx, cat, None, [], target=target)
        assert ctx["cat"].time_pct is None

    def test_time_ratio_custom_clamped_to_one_when_overdue(self):
        """Past-due custom goal should not exceed 1.0."""
        from datetime import UTC, timedelta

        tx = _make_tx()
        cat = _make_cat()
        target = _make_target(frequency="custom")
        today_utc = datetime.now(WAT).date()
        target.created_at = datetime(
            today_utc.year, today_utc.month, today_utc.day, tzinfo=UTC
        ) - timedelta(days=30)
        target.target_date = today_utc - timedelta(days=5)  # deadline passed
        ctx = hydrate_context(tx, cat, None, [], target=target)
        assert ctx["cat"].time_pct == 1.0

    def test_cat_type_from_target_frequency(self):
        tx = _make_tx()
        cat = _make_cat()
        bm = _make_bm()
        target = _make_target(frequency="weekly")
        ctx = hydrate_context(tx, cat, bm, [], target=target)
        assert ctx["cat"].type == "weekly"

    def test_cat_type_none_without_target(self):
        tx = _make_tx()
        cat = _make_cat()
        bm = _make_bm()
        ctx = hydrate_context(tx, cat, bm, [])
        assert ctx["cat"].type is None

    def test_time_pct_none_when_no_cat(self):
        """time_pct is None for uncategorised transactions regardless of target."""
        tx = _make_tx()
        ctx = hydrate_context(tx, None, None, [])
        assert ctx["cat"].time_pct is None

    def test_template_formatting_with_context(self):
        """Demonstrate that str.format(**context) resolves dotted attrs."""
        tx = _make_tx(amount=-35_000_00)
        cat = _make_cat(name="Lifestyle")
        bm = _make_bm(assigned=100_000_00, activity=-85_000_00)
        ctx = hydrate_context(tx, cat, bm, [])
        ctx["hist"].match_count = 3

        tmpl = "Your {cat.name} budget is {cat.spend_pct:.0%} gone. Txs: {hist.match_count}."
        result = tmpl.format(**ctx)
        assert "Lifestyle" in result
        assert "85%" in result
        assert "3" in result


# ── run_dsl_rules ─────────────────────────────────────────────────────────────


class TestRunDslRules:
    def _rule(self, slug, gid="g1", cond_val=0.5, active=True):
        return {
            "slug": slug,
            "gid": gid,
            "active": active,
            "evts": ["debit_cat"],
            "days_back": 0,
            "conds": {
                "op": "AND",
                "rules": [{"fact": "cat.spend_pct", "op": "gt", "val": cond_val}],
            },
            "action": {"tmpls": ["Budget {cat.name} is {cat.spend_pct:.0%} spent."]},
        }

    def test_matching_rule_returned(self):
        ctx = _minimal_context(spend_pct=0.9)
        results = run_dsl_rules([self._rule("r1")], ctx)
        assert len(results) == 1
        assert results[0][0]["slug"] == "r1"

    def test_non_matching_rule_excluded(self):
        ctx = _minimal_context(spend_pct=0.3)
        results = run_dsl_rules([self._rule("r1")], ctx)
        assert results == []

    def test_multiple_rules_both_match(self):
        ctx = _minimal_context(spend_pct=0.95)
        results = run_dsl_rules(
            [self._rule("r1", cond_val=0.8), self._rule("r2", cond_val=0.9)], ctx
        )
        assert len(results) == 2

    def test_inactive_rule_skipped(self):
        ctx = _minimal_context(spend_pct=0.99)
        results = run_dsl_rules([self._rule("r1", active=False)], ctx)
        assert results == []

    def test_broken_rule_does_not_abort_others(self):
        ctx = _minimal_context(spend_pct=0.95)
        broken = {
            "slug": "broken",
            "gid": "g1",
            "active": True,
            "evts": ["debit_cat"],
            "days_back": 0,
            "conds": {"op": "AND", "rules": [{"fact": "tx.amt", "op": "unknown_op", "val": 0}]},
            "action": {"tmpls": ["msg"]},
        }
        good = self._rule("good")
        results = run_dsl_rules([broken, good], ctx)
        # broken fails silently; good should still match
        assert len(results) == 1
        assert results[0][0]["slug"] == "good"

    def test_match_count_is_rule_independent(self):
        """Each rule starts with match_count=0 — counts from different rules don't bleed."""
        txs = [
            {"cid": "cat_lifestyle", "amt": -12000, "type": "debit", "dt": "2026-05-22T00:15:00Z"},
            {"cid": "cat_lifestyle", "amt": -12000, "type": "debit", "dt": "2026-05-22T13:30:00Z"},
            {"cid": "cat_lifestyle", "amt": -12000, "type": "debit", "dt": "2026-05-22T11:00:00Z"},
        ]
        ctx = _minimal_context(tx_cid="cat_lifestyle", spend_pct=0.9, hist_txs=txs)

        r1 = {
            "slug": "r1",
            "gid": "g1",
            "active": True,
            "evts": ["debit_cat"],
            "days_back": 3,
            "conds": {
                "op": "AND",
                "rules": [
                    {
                        "fact": "hist.txs",
                        "op": "count_where",
                        "val": {
                            "filter": {"fact": "tx.cid", "op": "eq", "val": "curr.cid"},
                            "cond": {"op": "gte", "val": 2},
                        },
                    }
                ],
            },
            "action": {"tmpls": ["{hist.match_count} txs."]},
        }
        # r2 does not use count_where
        r2 = {
            "slug": "r2",
            "gid": "g2",
            "active": True,
            "evts": ["debit_cat"],
            "days_back": 0,
            "conds": {"op": "AND", "rules": [{"fact": "cat.spend_pct", "op": "gt", "val": 0.8}]},
            "action": {"tmpls": ["pct: {cat.spend_pct:.0%}."]},
        }

        results = run_dsl_rules([r1, r2], ctx)
        assert len(results) == 2
        r1_result, r1_count = results[0]
        r2_result, r2_count = results[1]
        assert r1_result["slug"] == "r1"
        assert r1_count == 3  # 3 lifestyle txs
        assert r2_result["slug"] == "r2"
        assert r2_count == 0  # reset for r2

    def test_template_rendering_uses_match_count(self):
        """Demonstrate the correct pattern for rendering after run_dsl_rules."""
        txs = [
            {"cid": "cat_test", "amt": -1000, "type": "debit", "dt": "2026-05-22T10:00:00+01:00"},
            {"cid": "cat_test", "amt": -1000, "type": "debit", "dt": "2026-05-22T11:00:00+01:00"},
        ]
        ctx = _minimal_context(spend_pct=0.9, hist_txs=txs)
        rule = {
            "slug": "r1",
            "gid": "g1",
            "active": True,
            "evts": ["debit_cat"],
            "days_back": 0,
            "conds": {
                "op": "AND",
                "rules": [
                    {
                        "fact": "hist.txs",
                        "op": "count_where",
                        "val": {
                            "filter": {"fact": "tx.cid", "op": "eq", "val": "curr.cid"},
                            "cond": {"op": "gte", "val": 1},
                        },
                    }
                ],
            },
            "action": {"tmpls": ["Hit this {hist.match_count} time(s)."]},
        }

        results = run_dsl_rules([rule], ctx)
        assert len(results) == 1
        matched_rule, match_count = results[0]

        # Restore match_count before rendering (as Phase 5 must do)
        ctx["hist"].match_count = match_count
        message = random.choice(matched_rule["action"]["tmpls"]).format(**ctx)
        assert "2 time(s)" in message


# ── filter_rules_by_gid_rate_limit ────────────────────────────────────────────


class TestGidRateLimit:
    def _rules(self, *gids):
        return [{"slug": f"r_{g}", "gid": g, "id": f"id_{g}", "active": True} for g in gids]

    @patch("app.core.redis_client.get_redis")
    def test_no_rate_limited_gids(self, mock_get_redis):
        mock_get_redis.return_value.mget.return_value = [None, None]
        rules = self._rules("g1", "g2")
        result = filter_rules_by_gid_rate_limit(rules, "user_x", 3)
        assert len(result) == 2

    @patch("app.core.redis_client.get_redis")
    def test_gid_under_limit_passes(self, mock_get_redis):
        # g1 fired twice, limit is 3 — still under limit
        mock_get_redis.return_value.mget.return_value = ["2", None]
        rules = self._rules("g1", "g2")
        result = filter_rules_by_gid_rate_limit(rules, "user_x", 3)
        assert len(result) == 2

    @patch("app.core.redis_client.get_redis")
    def test_gid_at_limit_blocked(self, mock_get_redis):
        # g1 fired 3 times, limit is 3 — blocked
        mock_get_redis.return_value.mget.return_value = ["3", None]
        rules = self._rules("g1", "g2")
        result = filter_rules_by_gid_rate_limit(rules, "user_x", 3)
        assert len(result) == 1
        assert result[0]["gid"] == "g2"

    @patch("app.core.redis_client.get_redis")
    def test_all_rate_limited(self, mock_get_redis):
        mock_get_redis.return_value.mget.return_value = ["3", "5"]
        rules = self._rules("g1", "g2")
        result = filter_rules_by_gid_rate_limit(rules, "user_x", 3)
        assert result == []

    def test_empty_rules(self):
        result = filter_rules_by_gid_rate_limit([], "user_x")
        assert result == []

    @patch("app.core.redis_client.get_redis")
    def test_deduplicates_gids_in_mget(self, mock_get_redis):
        """Two rules with the same gid should produce one MGET key."""
        mock_get_redis.return_value.mget.return_value = [None]
        rules = self._rules("g1", "g1")  # same gid twice
        result = filter_rules_by_gid_rate_limit(rules, "user_x")
        assert len(result) == 2  # both rules survive
        mock_get_redis.return_value.mget.assert_called_once()
        call_keys = mock_get_redis.return_value.mget.call_args[0][0]
        # Only one unique key despite two rules
        assert len(call_keys) == 1

    @patch("app.core.redis_client.get_redis")
    def test_custom_fatigue_limit(self, mock_get_redis):
        """User with fatigue_limit=1 blocks after one fire."""
        mock_get_redis.return_value.mget.return_value = ["1"]
        rules = self._rules("g1")
        result = filter_rules_by_gid_rate_limit(rules, "user_x", 1)
        assert result == []


# ── set_gid_rate_limit ────────────────────────────────────────────────────────


class TestSetGidRateLimit:
    @patch("app.core.redis_client.get_redis")
    def test_increments_key_with_ttl(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis

        set_gid_rate_limit("user_abc", "budget_pacing")

        mock_redis.incr.assert_called_once()
        key = mock_redis.incr.call_args[0][0]
        assert "user_abc" in key
        assert "budget_pacing" in key
        mock_redis.expire.assert_called_once()
        expire_key, ttl = mock_redis.expire.call_args[0]
        assert expire_key == key
        assert 1 <= ttl <= 86400
