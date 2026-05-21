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

"""Tests for nudge metrics: Redis tracking, rollup, and query helpers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services.dsl_engine import (
    _METRICS_HIT_PREFIX,
    _METRICS_USER_HIT_PREFIX,
    _METRICS_USER_SUPPRESSED_PREFIX,
    _record_suppressed_hits,
    get_rule_metrics_from_redis,
    get_user_rule_metrics_from_redis,
    record_rule_hit,
)

# ── record_rule_hit ──────────────────────────────────────────────────────────


class TestRecordRuleHit:
    @patch("app.core.redis_client.get_redis")
    def test_increments_global_hit_counter(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_get_redis.return_value = mock_redis

        record_rule_hit("rule-abc", today="2026-05-20")

        incr_keys = [call[0][0] for call in mock_pipe.incr.call_args_list]
        assert f"{_METRICS_HIT_PREFIX}rule-abc:2026-05-20" in incr_keys
        mock_pipe.execute.assert_called_once()

    @patch("app.core.redis_client.get_redis")
    def test_increments_per_user_counter_when_user_id_given(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_get_redis.return_value = mock_redis

        record_rule_hit("rule-abc", user_id="user-1", today="2026-05-20")

        incr_keys = [call[0][0] for call in mock_pipe.incr.call_args_list]
        assert f"{_METRICS_HIT_PREFIX}rule-abc:2026-05-20" in incr_keys
        assert f"{_METRICS_USER_HIT_PREFIX}user-1:rule-abc:2026-05-20" in incr_keys
        assert mock_pipe.incr.call_count == 2
        assert mock_pipe.expire.call_count == 2

    @patch("app.core.redis_client.get_redis")
    def test_no_user_counter_without_user_id(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_get_redis.return_value = mock_redis

        record_rule_hit("rule-abc", today="2026-05-20")

        assert mock_pipe.incr.call_count == 1
        incr_keys = [call[0][0] for call in mock_pipe.incr.call_args_list]
        assert not any(_METRICS_USER_HIT_PREFIX in k for k in incr_keys)


# ── _record_suppressed_hits ──────────────────────────────────────────────────


class TestRecordSuppressedHits:
    @patch("app.core.redis_client.get_redis")
    def test_increments_global_suppressed_counters(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_get_redis.return_value = mock_redis

        _record_suppressed_hits(["r1", "r2"], "2026-05-20")

        assert mock_pipe.incr.call_count == 2
        assert mock_pipe.expire.call_count == 2
        mock_pipe.execute.assert_called_once()

    @patch("app.core.redis_client.get_redis")
    def test_increments_per_user_suppressed_counters(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_get_redis.return_value = mock_redis

        _record_suppressed_hits(["r1"], "2026-05-20", user_id="user-1")

        incr_keys = [call[0][0] for call in mock_pipe.incr.call_args_list]
        assert any(_METRICS_USER_SUPPRESSED_PREFIX in k for k in incr_keys)
        # 1 global + 1 per-user = 2
        assert mock_pipe.incr.call_count == 2

    @patch("app.core.redis_client.get_redis")
    def test_empty_list_is_noop(self, mock_get_redis):
        _record_suppressed_hits([], "2026-05-20")
        mock_get_redis.assert_not_called()


# ── get_rule_metrics_from_redis ──────────────────────────────────────────────


class TestGetRuleMetricsFromRedis:
    @patch("app.core.redis_client.get_redis")
    def test_returns_hits_and_suppressed(self, mock_get_redis):
        mock_redis = MagicMock()
        # Simulate 2 rules: r1 has 5 hits / 2 suppressed, r2 has None / 1
        mock_redis.mget.return_value = ["5", None, "2", "1"]
        mock_get_redis.return_value = mock_redis

        result = get_rule_metrics_from_redis(["r1", "r2"], "2026-05-20")

        assert result == {
            "r1": {"hits": 5, "suppressed": 2},
            "r2": {"hits": 0, "suppressed": 1},
        }

    def test_empty_rule_ids(self):
        assert get_rule_metrics_from_redis([], "2026-05-20") == {}

    @patch("app.core.redis_client.get_redis")
    def test_all_none_values(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_redis.mget.return_value = [None, None]
        mock_get_redis.return_value = mock_redis

        result = get_rule_metrics_from_redis(["r1"], "2026-05-20")
        assert result == {"r1": {"hits": 0, "suppressed": 0}}


# ── get_user_rule_metrics_from_redis ─────────────────────────────────────────


class TestGetUserRuleMetricsFromRedis:
    @patch("app.core.redis_client.get_redis")
    def test_returns_per_user_hits_and_suppressed(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_redis.mget.return_value = ["3", None, "1", None]
        mock_get_redis.return_value = mock_redis

        result = get_user_rule_metrics_from_redis("user-1", ["r1", "r2"], "2026-05-20")

        assert result == {
            "r1": {"hits": 3, "suppressed": 1},
            # r2 has 0/0 → omitted from result
        }

    def test_empty_rule_ids(self):
        assert get_user_rule_metrics_from_redis("user-1", [], "2026-05-20") == {}


# ── filter_rules_by_gid_rate_limit tracks suppression ────────────────────────


class TestGidRateLimitTracking:
    @patch("app.core.redis_client.get_redis")
    def test_suppressed_rules_are_tracked(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.mget.return_value = ["5"]  # over default limit of 3
        mock_get_redis.return_value = mock_redis

        from app.services.dsl_engine import filter_rules_by_gid_rate_limit

        rules = [{"slug": "r1", "gid": "g1", "id": "id-1", "active": True}]
        result = filter_rules_by_gid_rate_limit(rules, "user_x", 3)

        assert result == []
        # Verify suppression was tracked via pipeline (1 global + 1 per-user)
        mock_redis.pipeline.assert_called_once()
        assert mock_pipe.incr.call_count == 2
        assert mock_pipe.execute.call_count == 1

    @patch("app.core.redis_client.get_redis")
    def test_passing_rules_not_tracked_as_suppressed(self, mock_get_redis):
        mock_redis = MagicMock()
        mock_redis.mget.return_value = [None]
        mock_get_redis.return_value = mock_redis

        from app.services.dsl_engine import filter_rules_by_gid_rate_limit

        rules = [{"slug": "r1", "gid": "g1", "id": "id-1", "active": True}]
        result = filter_rules_by_gid_rate_limit(rules, "user_x", 3)

        assert len(result) == 1
        # No pipeline call — nothing was suppressed
        mock_redis.pipeline.assert_not_called()
