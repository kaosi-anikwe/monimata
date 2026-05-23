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

"""Unit tests for the DSL Pydantic validator."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.nudge_rule import (
    ActionBlock,
    ConditionsBlock,
    CountWhereConfig,
    CountWhereFilter,
    CountWhereScalarCond,
    RuleCondition,
)

# ── RuleCondition — scalar operators ─────────────────────────────────────────


class TestScalarOperators:
    @pytest.mark.parametrize(
        "op,val",
        [
            ("eq", "food"),
            ("eq", 42),
            ("eq", 3.14),
            ("eq", True),
            ("neq", "debit"),
            ("gt", 1000),
            ("gt", 1000.5),
            ("lt", 0),
            ("gte", 0),
            ("lte", 99.9),
        ],
    )
    def test_valid_scalar_conditions(self, op, val):
        RuleCondition.model_validate({"fact": "tx.amt", "op": op, "val": val})

    def test_gt_rejects_bool(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.amt", "op": "gt", "val": True})

    def test_gt_rejects_string(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.amt", "op": "gt", "val": "100"})

    def test_eq_rejects_list(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.amt", "op": "eq", "val": [1, 2]})


# ── RuleCondition — temporal operators ────────────────────────────────────────


class TestTemporalOperators:
    def test_day_in_valid(self):
        rc = RuleCondition.model_validate(
            {"fact": "tx.dt", "op": "day_in", "val": ["MON", "FRI", "SAT"]}
        )
        assert rc.val == ["MON", "FRI", "SAT"]

    def test_day_in_rejects_unknown_day(self):
        with pytest.raises(ValidationError, match="unknown day"):
            RuleCondition.model_validate(
                {"fact": "tx.dt", "op": "day_in", "val": ["MON", "MONDAY"]}
            )

    def test_day_in_rejects_empty(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.dt", "op": "day_in", "val": []})

    def test_dom_range_valid(self):
        RuleCondition.model_validate({"fact": "tx.dt", "op": "dom_range", "val": [1, 15]})

    def test_dom_range_invalid_length(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.dt", "op": "dom_range", "val": [1]})

    def test_dom_range_out_of_bounds(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.dt", "op": "dom_range", "val": [0, 15]})

    def test_dom_range_start_after_end(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.dt", "op": "dom_range", "val": [20, 5]})

    def test_date_range_valid(self):
        RuleCondition.model_validate(
            {"fact": "tx.dt", "op": "date_range", "val": ["2026-01-01", "2026-12-31"]}
        )

    def test_date_range_rejects_invalid_format(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate(
                {"fact": "tx.dt", "op": "date_range", "val": ["01-01-2026", "31-12-2026"]}
            )

    def test_date_range_rejects_invalid_calendar_date(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate(
                {"fact": "tx.dt", "op": "date_range", "val": ["2026-02-30", "2026-03-01"]}
            )

    def test_date_range_start_after_end(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate(
                {"fact": "tx.dt", "op": "date_range", "val": ["2026-12-01", "2026-01-01"]}
            )

    def test_date_in_valid(self):
        RuleCondition.model_validate(
            {"fact": "tx.dt", "op": "date_in", "val": ["2026-12-25", "2026-01-01"]}
        )

    def test_hour_in_valid(self):
        RuleCondition.model_validate({"fact": "tx.dt", "op": "hour_in", "val": [0, 1, 22, 23]})

    def test_hour_in_out_of_range(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.dt", "op": "hour_in", "val": [24]})

    def test_hour_range_valid_normal(self):
        RuleCondition.model_validate({"fact": "tx.dt", "op": "hour_range", "val": [9, 17]})

    def test_hour_range_valid_overnight_wrap(self):
        # [22, 4] is explicitly valid — start > end means overnight
        RuleCondition.model_validate({"fact": "tx.dt", "op": "hour_range", "val": [22, 4]})

    def test_hour_range_invalid_length(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.dt", "op": "hour_range", "val": [22, 23, 0]})


# ── RuleCondition — fact / op compatibility ────────────────────────────────────


class TestFactOpCompatibility:
    def test_hist_txs_requires_count_where(self):
        with pytest.raises(ValidationError, match="count_where"):
            RuleCondition.model_validate({"fact": "hist.txs", "op": "gt", "val": 5})

    def test_count_where_requires_hist_txs(self):
        count_where_val = {
            "filter": {"fact": "tx.cid", "op": "eq", "val": "curr.cid"},
            "cond": {"op": "gte", "val": 2},
        }
        with pytest.raises(ValidationError, match="hist.txs"):
            RuleCondition.model_validate(
                {"fact": "tx.amt", "op": "count_where", "val": count_where_val}
            )

    def test_unknown_fact_rejected(self):
        with pytest.raises(ValidationError, match="not recognised"):
            RuleCondition.model_validate({"fact": "user.name", "op": "eq", "val": "test"})

    def test_unknown_op_rejected(self):
        with pytest.raises(ValidationError, match="not recognised"):
            RuleCondition.model_validate({"fact": "tx.amt", "op": "between", "val": 100})

    def test_extra_fields_rejected(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate({"fact": "tx.amt", "op": "gt", "val": 100, "extra": "bad"})


# ── count_where operator ──────────────────────────────────────────────────────


class TestCountWhere:
    def _valid_payload(self, filter_val="curr.cid", cond_op="gte", cond_val=2) -> dict:
        return {
            "fact": "hist.txs",
            "op": "count_where",
            "val": {
                "filter": {"fact": "tx.cid", "op": "eq", "val": filter_val},
                "cond": {"op": cond_op, "val": cond_val},
            },
        }

    def test_valid_with_curr_cid_macro(self):
        rc = RuleCondition.model_validate(self._valid_payload())
        assert isinstance(rc.val, CountWhereConfig)

    def test_valid_with_literal_string_val(self):
        rc = RuleCondition.model_validate(self._valid_payload(filter_val="cat_food"))
        assert isinstance(rc.val, CountWhereConfig)

    def test_valid_all_scalar_cond_ops(self):
        for op in ("eq", "neq", "gt", "lt", "gte", "lte"):
            RuleCondition.model_validate(self._valid_payload(cond_op=op))

    def test_invalid_macro_rejected(self):
        with pytest.raises(ValidationError, match="Unknown macro"):
            RuleCondition.model_validate(self._valid_payload(filter_val="curr.unknown"))

    def test_invalid_filter_fact_rejected(self):
        payload = self._valid_payload()
        payload["val"]["filter"]["fact"] = "user.id"
        with pytest.raises(ValidationError):
            RuleCondition.model_validate(payload)

    def test_invalid_filter_op_rejected(self):
        payload = self._valid_payload()
        payload["val"]["filter"]["op"] = "day_in"
        with pytest.raises(ValidationError):
            RuleCondition.model_validate(payload)

    def test_non_scalar_cond_op_rejected(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate(self._valid_payload(cond_op="day_in"))

    def test_missing_cond_rejected(self):
        with pytest.raises(ValidationError):
            RuleCondition.model_validate(
                {
                    "fact": "hist.txs",
                    "op": "count_where",
                    "val": {"filter": {"fact": "tx.cid", "op": "eq", "val": "curr.cid"}},
                }
            )

    def test_val_as_plain_dict_is_parsed(self):
        """count_where val supplied as a dict (e.g. from JSON) must be auto-parsed."""
        rc = RuleCondition.model_validate(self._valid_payload())
        assert isinstance(rc.val, CountWhereConfig)
        assert isinstance(rc.val.filter, CountWhereFilter)
        assert isinstance(rc.val.cond, CountWhereScalarCond)


# ── ConditionsBlock — recursive nesting ──────────────────────────────────────


class TestConditionsBlock:
    def test_simple_and_block(self):
        ConditionsBlock.model_validate(
            {
                "op": "AND",
                "rules": [
                    {"fact": "tx.amt", "op": "gt", "val": 1000},
                    {"fact": "tx.type", "op": "eq", "val": "debit"},
                ],
            }
        )

    def test_nested_and_or(self):
        ConditionsBlock.model_validate(
            {
                "op": "AND",
                "rules": [
                    {"fact": "tx.amt", "op": "gt", "val": 5000},
                    {
                        "op": "OR",
                        "rules": [
                            {"fact": "tx.dt", "op": "day_in", "val": ["SAT", "SUN"]},
                            {"fact": "tx.dt", "op": "hour_range", "val": [22, 4]},
                        ],
                    },
                ],
            }
        )

    def test_three_level_nesting(self):
        ConditionsBlock.model_validate(
            {
                "op": "AND",
                "rules": [
                    {
                        "op": "OR",
                        "rules": [
                            {
                                "op": "AND",
                                "rules": [
                                    {"fact": "cat.spend_pct", "op": "gte", "val": 0.8},
                                    {"fact": "tx.amt", "op": "gt", "val": 0},
                                ],
                            }
                        ],
                    }
                ],
            }
        )

    def test_invalid_logical_op_rejected(self):
        with pytest.raises(ValidationError):
            ConditionsBlock.model_validate(
                {"op": "NOT", "rules": [{"fact": "tx.amt", "op": "gt", "val": 0}]}
            )

    def test_empty_rules_rejected(self):
        with pytest.raises(ValidationError):
            ConditionsBlock.model_validate({"op": "AND", "rules": []})

    def test_invalid_leaf_inside_block_rejected(self):
        with pytest.raises(ValidationError):
            ConditionsBlock.model_validate(
                {
                    "op": "AND",
                    "rules": [
                        {"fact": "tx.amt", "op": "between", "val": [100, 500]},
                    ],
                }
            )


# ── ActionBlock — template placeholder validation ─────────────────────────────


class TestActionBlock:
    def test_valid_templates(self):
        ActionBlock.model_validate(
            {
                "tmpls": [
                    "You spent {cat.amt} on {cat.name}.",
                    "Your {cat.name} budget is {cat.spend_pct:.0%} used.",
                    "{hist.match_count} transactions at {tx.time_display}.",
                ]
            }
        )

    def test_no_placeholders_valid(self):
        ActionBlock.model_validate({"tmpls": ["Simple message with no placeholders."]})

    def test_empty_tmpls_rejected(self):
        with pytest.raises(ValidationError):
            ActionBlock.model_validate({"tmpls": []})

    def test_unknown_placeholder_rejected(self):
        with pytest.raises(ValidationError, match="unknown placeholder"):
            ActionBlock.model_validate({"tmpls": ["{user.email} did something."]})

    def test_partially_invalid_rejected(self):
        with pytest.raises(ValidationError):
            ActionBlock.model_validate(
                {"tmpls": ["Valid: {cat.name}.", "Invalid: {server.secret}."]}
            )
