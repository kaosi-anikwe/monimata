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
    NudgeRuleCreate,
    NudgeRuleUpdate,
    RuleCondition,
)

# ── Helpers ───────────────────────────────────────────────────────────────────


def _minimal_rule(**overrides) -> dict:
    """Return a minimal valid NudgeRuleCreate payload."""
    base = {
        "slug": "test_rule",
        "gid": "test_group",
        "evts": ["debit_cat"],
        "days_back": 0,
        "conds": {
            "op": "AND",
            "rules": [{"fact": "tx.amt", "op": "gt", "val": 1000}],
        },
        "action": {"tmpls": ["You spent ₦{cat.amt} on {cat.name}."]},
    }
    base.update(overrides)
    return base


# ── NudgeRuleCreate — happy paths ─────────────────────────────────────────────


class TestNudgeRuleCreateValid:
    def test_minimal_valid_rule(self):
        rule = NudgeRuleCreate.model_validate(_minimal_rule())
        assert rule.slug == "test_rule"
        assert rule.evts == ["debit_cat"]
        assert rule.days_back == 0
        assert rule.active is True

    def test_multiple_evts_deduplicated(self):
        rule = NudgeRuleCreate.model_validate(
            _minimal_rule(evts=["debit_cat", "debit_cat", "credit_cat"])
        )
        assert rule.evts == ["debit_cat", "credit_cat"]

    def test_all_event_types_accepted(self):
        rule = NudgeRuleCreate.model_validate(
            _minimal_rule(evts=["debit_cat", "debit_uncat", "credit_cat", "credit_uncat"])
        )
        assert len(rule.evts) == 4

    def test_days_back_boundary_values(self):
        NudgeRuleCreate.model_validate(_minimal_rule(days_back=0))
        NudgeRuleCreate.model_validate(_minimal_rule(days_back=90))

    def test_inactive_rule_accepted(self):
        rule = NudgeRuleCreate.model_validate(_minimal_rule(active=False))
        assert rule.active is False


# ── NudgeRuleCreate — slug / gid validation ───────────────────────────────────


class TestSlugGidValidation:
    @pytest.mark.parametrize("slug", ["threshold_80", "a", "a1_b2", "x" * 64])
    def test_valid_slugs(self, slug):
        NudgeRuleCreate.model_validate(_minimal_rule(slug=slug))

    @pytest.mark.parametrize("slug", ["", "Has_Upper", "has space", "has-hyphen", "x" * 65])
    def test_invalid_slugs(self, slug):
        with pytest.raises(ValidationError):
            NudgeRuleCreate.model_validate(_minimal_rule(slug=slug))

    def test_invalid_gid(self):
        with pytest.raises(ValidationError):
            NudgeRuleCreate.model_validate(_minimal_rule(gid="invalid GID"))


# ── evts validation ───────────────────────────────────────────────────────────


class TestEvtsValidation:
    def test_empty_evts_rejected(self):
        with pytest.raises(ValidationError):
            NudgeRuleCreate.model_validate(_minimal_rule(evts=[]))

    def test_unknown_evt_rejected(self):
        with pytest.raises(ValidationError):
            NudgeRuleCreate.model_validate(_minimal_rule(evts=["debit_cat", "unknown_event"]))

    def test_days_back_out_of_range(self):
        with pytest.raises(ValidationError):
            NudgeRuleCreate.model_validate(_minimal_rule(days_back=91))

        with pytest.raises(ValidationError):
            NudgeRuleCreate.model_validate(_minimal_rule(days_back=-1))


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
                                    {"fact": "cat.spend_ratio", "op": "gte", "val": 0.8},
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
                    "Your {cat.name} budget is {cat.spend_ratio_percentage} used.",
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


# ── NudgeRuleCreate — full integration ───────────────────────────────────────


class TestNudgeRuleCreateIntegration:
    def test_nightlife_rule_from_design_doc(self):
        """Validates the full example rule from nudges_design.md."""
        rule = NudgeRuleCreate.model_validate(
            {
                "slug": "midnight_weekend_pacing_check",
                "gid": "lifestyle_pacing",
                "active": True,
                "evts": ["debit_cat"],
                "days_back": 3,
                "conds": {
                    "op": "AND",
                    "rules": [
                        {"fact": "tx.dt", "op": "day_in", "val": ["FRI", "SAT", "SUN"]},
                        {"fact": "tx.dt", "op": "hour_range", "val": [22, 4]},
                        {"fact": "cat.spend_ratio", "op": "gt", "val": 0.80},
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
                "action": {
                    "tmpls": [
                        "It's {tx.time_display} on a weekend and your {cat.name} budget "
                        "is {cat.spend_ratio_percentage} gone. "
                        "You've hit this category {hist.match_count} times.",
                    ]
                },
            }
        )
        assert rule.slug == "midnight_weekend_pacing_check"
        assert rule.days_back == 3
        cw_rule = rule.conds.rules[3]
        assert isinstance(cw_rule, RuleCondition)
        assert isinstance(cw_rule.val, CountWhereConfig)
        assert cw_rule.val.filter.val == "curr.cid"

    def test_extra_top_level_field_rejected(self):
        payload = _minimal_rule()
        payload["unknown_field"] = "bad"
        with pytest.raises(ValidationError):
            NudgeRuleCreate.model_validate(payload)


# ── NudgeRuleUpdate ───────────────────────────────────────────────────────────


class TestNudgeRuleUpdate:
    def test_empty_update_valid(self):
        NudgeRuleUpdate.model_validate({})

    def test_partial_update_valid(self):
        update = NudgeRuleUpdate.model_validate({"active": False, "gid": "new_group"})
        assert update.active is False
        assert update.gid == "new_group"
        assert update.slug is None

    def test_invalid_evts_in_update_rejected(self):
        with pytest.raises(ValidationError):
            NudgeRuleUpdate.model_validate({"evts": ["bad_event"]})

    def test_valid_conds_in_update(self):
        update = NudgeRuleUpdate.model_validate(
            {
                "conds": {
                    "op": "OR",
                    "rules": [{"fact": "tx.amt", "op": "gte", "val": 500000}],
                }
            }
        )
        assert update.conds is not None
        assert update.conds.op == "OR"
