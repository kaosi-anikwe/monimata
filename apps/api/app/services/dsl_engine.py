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
DSL Engine — stateless evaluation core for dynamic nudge rules.

Responsibilities:
  1. Operator registry      — 13 operators
  2. Context hydration      — builds a SimpleNamespace context dict from ORM
                              objects (Transaction, Category, BudgetMonth)
  3. Recursive evaluator    — evaluate_rule() walks conds blocks (plain dicts
                              as loaded from Redis)
  4. GID rate-limit filter  — prunes rules whose group already fired today
  5. Batch runner           — run_dsl_rules() iterates survivors and returns
                              (matched_rule, match_count) pairs
"""

from __future__ import annotations

import calendar
import logging
import operator
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.budget import BudgetMonth
    from app.models.category import Category
    from app.models.target import CategoryTarget
    from app.models.transaction import Transaction

logger = logging.getLogger(__name__)

# West Africa Time — UTC+1, no DST.
WAT = timezone(timedelta(hours=1))


# =====================================================================
# 1. OPERATOR REGISTRY
# =====================================================================


def _parse_dt(dt_str: str) -> datetime:
    """Parse a possibly-Z-suffixed ISO datetime string into a timezone-aware datetime."""
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))


def _day_in(dt_str: str, allowed_days: list[str]) -> bool:
    mapping = {0: "MON", 1: "TUE", 2: "WED", 3: "THU", 4: "FRI", 5: "SAT", 6: "SUN"}
    return mapping[_parse_dt(dt_str).weekday()] in allowed_days


def _dom_range(dt_str: str, bounds: list[int]) -> bool:
    return bounds[0] <= _parse_dt(dt_str).day <= bounds[1]


def _date_range(dt_str: str, date_bounds: list[str]) -> bool:
    tx_date = _parse_dt(dt_str).date()
    start = datetime.strptime(date_bounds[0], "%Y-%m-%d").date()
    end = datetime.strptime(date_bounds[1], "%Y-%m-%d").date()
    return start <= tx_date <= end


def _date_in(dt_str: str, specific_dates: list[str]) -> bool:
    return _parse_dt(dt_str).strftime("%Y-%m-%d") in specific_dates


def _hour_in(dt_str: str, allowed_hours: list[int]) -> bool:
    return _parse_dt(dt_str).hour in allowed_hours


def _hour_range(dt_str: str, bounds: list[int]) -> bool:
    hour = _parse_dt(dt_str).hour
    start, end = bounds[0], bounds[1]
    if start <= end:
        return start <= hour <= end
    # Overnight wrap — e.g. [22, 4] covers 22:00 → 04:59
    return hour >= start or hour <= end


def _count_where(
    transactions_list: list[dict],
    config: dict,
    context: dict,
) -> bool:
    """
    Filter hist.txs entries against config["filter"], compare the count
    against config["cond"], and write the result into context["hist"].match_count
    so it is available to the action template renderer.

    The "curr.cid" macro in filter.val is resolved to the current
    transaction's category_id at evaluation time.
    """
    flt = config["filter"]
    cond = config["cond"]

    target_val: Any = flt["val"]
    if target_val == "curr.cid":
        target_val = get_nested_value(context, "tx.cid")

    # "tx.cid" → "cid" — extract the leaf field name used in each hist item dict
    fact_key = flt["fact"].split(".")[-1]
    matched_count = sum(1 for item in transactions_list if item.get(fact_key) == target_val)

    # Side effect: expose count for template rendering (reset to 0 in run_dsl_rules)
    context["hist"].match_count = matched_count

    op_func = DSL_OPERATORS.get(cond["op"])
    if op_func is None:
        return False
    return bool(op_func(matched_count, cond["val"]))


DSL_OPERATORS: dict[str, Any] = {
    "eq": operator.eq,
    "neq": operator.ne,
    "gt": operator.gt,
    "lt": operator.lt,
    "gte": operator.ge,
    "lte": operator.le,
    "day_in": _day_in,
    "dom_range": _dom_range,
    "date_range": _date_range,
    "date_in": _date_in,
    "hour_in": _hour_in,
    "hour_range": _hour_range,
    "count_where": _count_where,
}


# =====================================================================
# 2. CONTEXT RESOLVER
# =====================================================================


def get_nested_value(data: object, map_path: str) -> Any:
    """
    Traverse a dot-notated path through a mixed dict / SimpleNamespace tree.

    Returns None if any segment is missing rather than raising an exception.
    """
    current: object = data
    for part in map_path.split("."):
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
    return current


# =====================================================================
# 3. RECURSIVE EVALUATOR
# =====================================================================


def evaluate_rule(conds_block: dict, context: dict) -> bool:
    """
    Recursively evaluate a conds block loaded from the DSL schema.

    conds_block is a plain dict (as deserialized from Redis JSON).
    A nested conds block is distinguished from a leaf rule by the presence
    of both "op" and "rules" keys.

    Operator exceptions for individual leaf rules are caught and treated
    as non-matches — a broken leaf never aborts sibling evaluation.
    """
    logical_op: str = conds_block.get("op", "AND")
    results: list[bool] = []

    for rule in conds_block.get("rules", []):
        # Nested block — recurse
        if "rules" in rule:
            results.append(evaluate_rule(rule, context))
            continue

        fact_value = get_nested_value(context, rule["fact"])
        target_val = rule["val"]
        op_name: str = rule["op"]
        op_func = DSL_OPERATORS.get(op_name)

        if op_func is None:
            logger.warning("Unknown DSL operator: %r — treating as False", op_name)
            results.append(False)
            continue

        if fact_value is None:
            results.append(False)
            continue

        try:
            if op_name == "count_where":
                results.append(op_func(fact_value, target_val, context))
            else:
                results.append(bool(op_func(fact_value, target_val)))
        except Exception:
            logger.warning(
                "Operator %r raised on fact=%r val=%r — treating as False",
                op_name,
                fact_value,
                target_val,
                exc_info=True,
            )
            results.append(False)

    if not results:
        return False
    if logical_op == "AND":
        return all(results)
    return any(results)  # OR


# =====================================================================
# 4. CONTEXT HYDRATION
# =====================================================================


def _budget_time_ratio(
    bm: BudgetMonth | None,
    target: CategoryTarget | None,
) -> float | None:
    """
    Fraction of the current budget *period* that has elapsed (WAT calendar day).

    Dispatch by target.frequency:
      weekly  — Mon=1/7 … Sun=7/7  (no DB fields needed)
      monthly — today.day / days_in_month, anchored to bm.month if available
      yearly  — day_of_year / days_in_year
      custom  — (today − target.created_at.date()) /
                (target.target_date − target.created_at.date()), clamped [0, 1];
                returns None when target_date is not set or the span is zero
      None    — falls back to monthly using bm.month (or current calendar month)
    """
    today_wat = datetime.now(WAT).date()
    freq = target.frequency if target is not None else None

    if freq == "weekly":
        return (today_wat.weekday() + 1) / 7  # Mon=1/7 … Sun=7/7

    if freq == "yearly":
        days_in_year = 366 if calendar.isleap(today_wat.year) else 365
        return today_wat.timetuple().tm_yday / days_in_year

    if freq == "custom":
        if target is None or target.target_date is None:
            return None
        start = target.created_at.date()
        total_days = (target.target_date - start).days
        if total_days <= 0:
            return None
        elapsed = (today_wat - start).days
        return max(0.0, min(1.0, elapsed / total_days))

    # "monthly" or no target — anchor to bm.month, fall back to current month
    month_start = bm.month if bm is not None else today_wat.replace(day=1)
    days_in_month = calendar.monthrange(month_start.year, month_start.month)[1]
    days_elapsed = min((today_wat - month_start).days + 1, days_in_month)
    return max(0.0, days_elapsed / days_in_month)


def hydrate_context(
    tx: Transaction,
    cat: Category | None,
    bm: BudgetMonth | None,
    history: list[Transaction],
    target: CategoryTarget | None = None,
) -> dict:
    """
    Build the runtime context dict from ORM objects.

    Nested values are SimpleNamespace instances so that Python's
    ``str.format(**context)`` resolves ``{tx.time_display}``, ``{cat.name}``
    etc. via attribute access.

    ``cat`` and ``bm`` may be None for uncategorised transactions — all
    cat.* fields are set to None in that case.

    ``history`` is a list of Transaction rows from the look-back window.
    Each item is stored as a plain dict keyed by DSL fact leaf names so that
    count_where filter resolution works without further transformation.
    """
    # Localise to WAT for time_display — strip leading zero for a clean "3:45 PM"
    dt_wat = tx.date.astimezone(WAT)
    time_display = dt_wat.strftime("%I:%M %p").lstrip("0") or "12:00 AM"

    tx_ns = SimpleNamespace(
        id=tx.id,
        amt=tx.amount,  # kobo; negative for debits
        type=tx.type,  # "debit" | "credit"
        cid=tx.category_id,
        dt=tx.date.isoformat(),
        time_display=time_display,
    )

    cat_type = target.frequency if target is not None else None
    # time_ratio is frequency-scoped; computable even without an active budget month
    time_ratio = _budget_time_ratio(bm, target) if cat is not None else None
    time_ratio_pct = f"{int(time_ratio * 100)}%" if time_ratio is not None else None

    if cat is not None and bm is not None and bm.assigned > 0:
        spent = abs(bm.activity)  # bm.activity is negative for net spending
        assigned = bm.assigned
        spend_ratio = spent / assigned
        tx_abs = abs(tx.amount)
        cat_ns = SimpleNamespace(
            id=cat.id,
            name=cat.name,
            type=cat_type,
            amt=assigned,
            spent=spent,
            rem=assigned - spent,
            spend_ratio=spend_ratio,
            spend_ratio_percentage=f"{int(spend_ratio * 100)}%",
            tx_ratio=tx_abs / assigned,
            time_ratio=time_ratio,
            time_ratio_percentage=time_ratio_pct,
        )
    elif cat is not None:
        cat_ns = SimpleNamespace(
            id=cat.id,
            name=cat.name,
            type=cat_type,
            amt=None,
            spent=None,
            rem=None,
            spend_ratio=None,
            spend_ratio_percentage=None,
            tx_ratio=None,
            time_ratio=time_ratio,
            time_ratio_percentage=time_ratio_pct,
        )
    else:
        cat_ns = SimpleNamespace(
            id=None,
            name=None,
            type=None,
            amt=None,
            spent=None,
            rem=None,
            spend_ratio=None,
            spend_ratio_percentage=None,
            tx_ratio=None,
            time_ratio=None,
            time_ratio_percentage=None,
        )

    hist_ns = SimpleNamespace(
        txs=[
            {
                "cid": t.category_id,
                "amt": t.amount,
                "type": t.type,
                "dt": t.date.isoformat(),
            }
            for t in history
        ],
        match_count=0,  # written as a side effect by _count_where
    )

    return {"tx": tx_ns, "cat": cat_ns, "hist": hist_ns}


# =====================================================================
# 5. GID RATE-LIMIT SHORT-CIRCUIT
# =====================================================================


def _today_wat_str() -> str:
    return datetime.now(WAT).strftime("%Y-%m-%d")


def filter_rules_by_gid_rate_limit(rules: list[dict], user_id: str) -> list[dict]:
    """
    Remove rules whose gid has already fired today (WAT calendar day) for this user.

    Uses a single Redis MGET across all unique gids — one round trip regardless
    of how many rules are in the bucket.
    """
    if not rules:
        return rules

    from app.core.redis_client import get_redis

    today = _today_wat_str()
    gids = list(dict.fromkeys(r["gid"] for r in rules))  # ordered, deduped
    keys = [f"rl:nudge_gid:{user_id}:{gid}:{today}" for gid in gids]

    values: list[str | None] = get_redis().mget(keys)  # type: ignore[assignment]
    skip_gids = {gid for gid, v in zip(gids, values) if v is not None}

    if skip_gids:
        logger.debug(
            "GID rate-limit: skipping %d rule(s) for user=%s gids=%s",
            sum(1 for r in rules if r["gid"] in skip_gids),
            user_id,
            skip_gids,
        )

    return [r for r in rules if r["gid"] not in skip_gids]


def set_gid_rate_limit(user_id: str, gid: str) -> None:
    """
    Mark a gid as fired for this user for the current WAT calendar day.

    TTL is seconds-to-midnight WAT so the key self-expires without a
    cleanup job.  Minimum TTL is 1 second to avoid a zero-TTL SETEX error.
    """
    from app.core.redis_client import get_redis

    now_wat = datetime.now(WAT)
    today = now_wat.strftime("%Y-%m-%d")
    key = f"rl:nudge_gid:{user_id}:{gid}:{today}"

    midnight = (now_wat + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    ttl_seconds = max(1, int((midnight - now_wat).total_seconds()))
    get_redis().setex(key, ttl_seconds, "1")


# =====================================================================
# 6. BATCH RUNNER
# =====================================================================


def run_dsl_rules(
    rules: list[dict],
    context: dict,
) -> list[tuple[dict, int]]:
    """
    Evaluate each rule in *rules* against the shared *context*.

    Returns a list of ``(matched_rule, match_count)`` pairs.

    ``match_count`` is the value written into ``context["hist"].match_count``
    by the ``count_where`` operator during that rule's evaluation (0 if
    ``count_where`` was not used).  Each rule starts with ``match_count = 0``
    so results are independent — the caller can restore the correct value
    before formatting each template::

        for rule, match_count in run_dsl_rules(rules, context):
            context["hist"].match_count = match_count
            message = random.choice(rule["action"]["tmpls"]).format(**context)

    Per-rule exceptions are caught and logged at WARNING level so a bad rule
    never blocks the evaluation of subsequent rules.
    """
    results: list[tuple[dict, int]] = []
    for rule in rules:
        if not rule.get("active", True):
            continue
        context["hist"].match_count = 0  # reset per-rule side effects
        try:
            if evaluate_rule(rule["conds"], context):
                results.append((rule, context["hist"].match_count))
        except Exception:
            logger.warning(
                "DSL evaluation failed for rule=%s — skipping",
                rule.get("slug", rule.get("id", "?")),
                exc_info=True,
            )
    return results
