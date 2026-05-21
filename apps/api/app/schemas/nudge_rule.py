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
Pydantic v2 schemas for nudge DSL rule CRUD.

Validation is enforced at the API boundary so that no structurally invalid
rule can ever reach the database or the Redis cache.

Key design decisions
────────────────────
• fact paths and event types are validated against explicit allow-lists
  (frozensets) rather than Literals so extending them requires only a
  one-line set update, not a new Literal variant.

• val type is checked via a single model_validator on RuleCondition —
  simpler than discriminated unions across 13 operators.

• count_where.val is parsed into a CountWhereConfig sub-model during
  validation; Pydantic serialises it back to a plain dict for JSONB storage.

• ConditionsBlock is recursive; model_rebuild() resolves the forward ref.

• Template placeholders are extracted with a regex and checked against a
  known context namespace so copy errors are caught at rule creation time.
"""

from __future__ import annotations

import re
from datetime import datetime as _dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ── Allow-lists ───────────────────────────────────────────────────────────────

VALID_EVTS: frozenset[str] = frozenset({"debit_cat", "debit_uncat", "credit_cat", "credit_uncat"})

# Facts valid for scalar / temporal comparison operators
SCALAR_FACTS: frozenset[str] = frozenset(
    {
        "tx.amt",
        "tx.type",
        "tx.dt",
        "tx.cid",
        "cat.spend_pct",
        "cat.spent",
        "cat.amt",
        "cat.rem",
        "cat.tx_pct",
        "cat.time_pct",
        "cat.type",
    }
)

# Facts that may only be used with the count_where operator
ARRAY_FACTS: frozenset[str] = frozenset({"hist.txs"})

VALID_FACTS: frozenset[str] = SCALAR_FACTS | ARRAY_FACTS

# Fields on individual history items valid inside a count_where filter
VALID_FILTER_FACTS: frozenset[str] = frozenset({"tx.cid", "tx.amt", "tx.type", "tx.dt"})

# Runtime macros resolvable inside count_where filter values
VALID_MACROS: frozenset[str] = frozenset({"curr.cid"})

# Scalar comparison operators (also used for count_where.cond)
SCALAR_OPS: frozenset[str] = frozenset({"eq", "neq", "gt", "lt", "gte", "lte"})

# All valid rule-level operators
ALL_OPS: frozenset[str] = SCALAR_OPS | frozenset(
    {"day_in", "dom_range", "date_range", "date_in", "hour_in", "hour_range", "count_where"}
)

VALID_DAYS: frozenset[str] = frozenset({"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"})

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Placeholder keys that may appear in action template strings.
# Dot-notation maps to the nested SimpleNamespace context produced by
# hydrate_context (e.g. {tx.time_display} resolves to context.tx.time_display).
VALID_TEMPLATE_KEYS: frozenset[str] = frozenset(
    {
        "tx",
        "tx.id",
        "tx.amt",
        "tx.type",
        "tx.cid",
        "tx.dt",
        "tx.time_display",
        "cat",
        "cat.id",
        "cat.name",
        "cat.type",
        "cat.amt",
        "cat.spent",
        "cat.rem",
        "cat.spend_pct",
        "cat.tx_pct",
        "cat.time_pct",
        "hist",
        "hist.txs",
        "hist.match_count",
    }
)

# Extracts {key} and {key.attr} placeholders; ignores format-spec suffixes like {val:.2f}
_PLACEHOLDER_RE = re.compile(r"\{(\w+(?:\.\w+)*)(?:[^}]*)?\}")

# Slug / gid identifier pattern: lowercase alphanumeric + underscores, 1–64 chars
_SLUG_PATTERN = r"^[a-z0-9_]{1,64}$"


# ── count_where sub-schemas ───────────────────────────────────────────────────


class CountWhereFilter(BaseModel):
    """Describes the per-item equality test applied to hist.txs entries."""

    model_config = ConfigDict(extra="forbid")

    fact: str
    op: str
    val: str | int | float | bool

    @field_validator("fact")
    @classmethod
    def _validate_fact(cls, v: str) -> str:
        if v not in VALID_FILTER_FACTS:
            raise ValueError(
                f"count_where filter fact {v!r} is not recognised. "
                f"Valid options: {sorted(VALID_FILTER_FACTS)}"
            )
        return v

    @field_validator("op")
    @classmethod
    def _validate_op(cls, v: str) -> str:
        if v not in SCALAR_OPS:
            raise ValueError(
                f"count_where filter op {v!r} must be a scalar operator. "
                f"Valid options: {sorted(SCALAR_OPS)}"
            )
        return v

    @model_validator(mode="after")
    def _validate_macro(self) -> CountWhereFilter:
        """'curr.cid' is allowed as a runtime macro; reject any unknown macro-like string."""
        if isinstance(self.val, str) and self.val.startswith("curr."):
            if self.val not in VALID_MACROS:
                raise ValueError(
                    f"Unknown macro {self.val!r}. Supported macros: {sorted(VALID_MACROS)}"
                )
        return self


class CountWhereScalarCond(BaseModel):
    """Scalar comparison applied to the matched-item count."""

    model_config = ConfigDict(extra="forbid")

    op: str
    val: int | float

    @field_validator("op")
    @classmethod
    def _validate_op(cls, v: str) -> str:
        if v not in SCALAR_OPS:
            raise ValueError(
                f"count_where cond op {v!r} must be a scalar operator. "
                f"Valid options: {sorted(SCALAR_OPS)}"
            )
        return v


class CountWhereConfig(BaseModel):
    """Full configuration object for the count_where operator."""

    model_config = ConfigDict(extra="forbid")

    filter: CountWhereFilter
    cond: CountWhereScalarCond


# ── Core rule condition ───────────────────────────────────────────────────────


class RuleCondition(BaseModel):
    """A single leaf condition — a (fact, op, val) triple."""

    model_config = ConfigDict(extra="forbid")

    fact: str
    op: str
    val: Any

    @field_validator("fact")
    @classmethod
    def _validate_fact(cls, v: str) -> str:
        if v not in VALID_FACTS:
            raise ValueError(f"fact {v!r} is not recognised. Valid options: {sorted(VALID_FACTS)}")
        return v

    @field_validator("op")
    @classmethod
    def _validate_op(cls, v: str) -> str:
        if v not in ALL_OPS:
            raise ValueError(f"op {v!r} is not recognised. Valid options: {sorted(ALL_OPS)}")
        return v

    @model_validator(mode="after")
    def _validate(self) -> RuleCondition:
        self._check_fact_op_compat()
        self._check_val()
        return self

    # ── helpers ───────────────────────────────────────────────────────────────

    def _check_fact_op_compat(self) -> None:
        if self.op == "count_where" and self.fact not in ARRAY_FACTS:
            raise ValueError(f"op='count_where' requires fact='hist.txs', got fact={self.fact!r}")
        if self.op != "count_where" and self.fact in ARRAY_FACTS:
            raise ValueError(
                f"fact='hist.txs' can only be used with op='count_where', got op={self.op!r}"
            )

    def _check_val(self) -> None:  # noqa: PLR0912 — many branches by design
        op, val = self.op, self.val

        if op in ("eq", "neq"):
            if not isinstance(val, str | int | float | bool):
                raise ValueError(
                    f"op={op!r} requires val to be str, int, float, or bool; "
                    f"got {type(val).__name__}"
                )

        elif op in ("gt", "lt", "gte", "lte"):
            if isinstance(val, bool) or not isinstance(val, int | float):
                raise ValueError(f"op={op!r} requires a numeric val; got {type(val).__name__}")

        elif op == "day_in":
            if not isinstance(val, list) or not val:
                raise ValueError("day_in requires a non-empty list of day abbreviations")
            invalid = {d for d in val if d not in VALID_DAYS}
            if invalid:
                raise ValueError(
                    f"day_in: unknown day(s) {sorted(invalid)}. Must be from {sorted(VALID_DAYS)}"
                )

        elif op == "dom_range":
            if not isinstance(val, list) or len(val) != 2:
                raise ValueError("dom_range requires a list of exactly 2 integers")
            if not all(isinstance(x, int) and not isinstance(x, bool) for x in val):
                raise ValueError("dom_range values must be integers")
            if not all(1 <= x <= 31 for x in val):
                raise ValueError("dom_range values must be in range 1–31")
            if val[0] > val[1]:
                raise ValueError("dom_range: start day must be ≤ end day")

        elif op == "date_range":
            if not isinstance(val, list) or len(val) != 2:
                raise ValueError("date_range requires a list of exactly 2 YYYY-MM-DD strings")
            _validate_date_strings(op, val)
            if val[0] > val[1]:
                raise ValueError("date_range: start date must be ≤ end date")

        elif op == "date_in":
            if not isinstance(val, list) or not val:
                raise ValueError("date_in requires a non-empty list of YYYY-MM-DD strings")
            _validate_date_strings(op, val)

        elif op == "hour_in":
            if not isinstance(val, list) or not val:
                raise ValueError("hour_in requires a non-empty list of integers (0–23)")
            if not all(isinstance(x, int) and not isinstance(x, bool) for x in val):
                raise ValueError("hour_in values must be integers")
            if not all(0 <= x <= 23 for x in val):
                raise ValueError("hour_in values must be in range 0–23")

        elif op == "hour_range":
            if not isinstance(val, list) or len(val) != 2:
                raise ValueError("hour_range requires a list of exactly 2 integers (0–23)")
            if not all(isinstance(x, int) and not isinstance(x, bool) for x in val):
                raise ValueError("hour_range values must be integers")
            if not all(0 <= x <= 23 for x in val):
                raise ValueError("hour_range values must be in range 0–23")
            # Intentionally allow start > end — that is a valid overnight wrap (e.g. [22, 4])

        elif op == "count_where":
            if isinstance(val, dict):
                try:
                    self.val = CountWhereConfig.model_validate(val)
                except Exception as exc:
                    raise ValueError(f"Invalid count_where config: {exc}") from exc
            elif not isinstance(val, CountWhereConfig):
                raise ValueError("count_where requires an object with 'filter' and 'cond' keys")


# ── Conditions block (recursive) ──────────────────────────────────────────────


class ConditionsBlock(BaseModel):
    """Root or nested logical block. Supports arbitrary nesting depth."""

    model_config = ConfigDict(extra="forbid")

    op: Literal["AND", "OR"]
    rules: list[RuleCondition | ConditionsBlock] = Field(min_length=1)


# Resolve the forward reference introduced by the recursive type annotation.
ConditionsBlock.model_rebuild()


# ── Action block ──────────────────────────────────────────────────────────────


class ActionBlock(BaseModel):
    """Output definition — a non-empty array of message template strings."""

    model_config = ConfigDict(extra="forbid")

    tmpls: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def _validate_placeholders(self) -> ActionBlock:
        for i, tmpl in enumerate(self.tmpls):
            keys = set(_PLACEHOLDER_RE.findall(tmpl))
            unknown = keys - VALID_TEMPLATE_KEYS
            if unknown:
                raise ValueError(
                    f"tmpls[{i}] contains unknown placeholder(s): {sorted(unknown)}. "
                    f"Valid keys: {sorted(VALID_TEMPLATE_KEYS)}"
                )
        return self


# ── API schemas ───────────────────────────────────────────────────────────────


def _check_title_placeholders(title: str) -> str:
    """Shared validator: reject unknown {placeholders} in a title string."""
    if not title:
        return title
    unknown = set(_PLACEHOLDER_RE.findall(title)) - VALID_TEMPLATE_KEYS
    if unknown:
        raise ValueError(
            f"title contains unknown placeholder(s): {sorted(unknown)}. "
            f"Valid keys: {sorted(VALID_TEMPLATE_KEYS)}"
        )
    return title


class NudgeRuleCreate(BaseModel):
    """Validated input for creating a new nudge rule."""

    model_config = ConfigDict(extra="forbid")

    slug: str = Field(
        pattern=_SLUG_PATTERN,
        description="Unique rule identifier, e.g. 'threshold_80'",
    )
    title: str = Field(default="", description="Push notification title (supports {placeholders})")
    gid: str = Field(pattern=_SLUG_PATTERN, description="Group ID for rate-limit bucketing")
    active: bool = True
    evts: list[str] = Field(min_length=1, description="Event types that trigger this rule")
    days_back: int = Field(0, ge=0, le=90, description="Historical look-back window in days")
    conds: ConditionsBlock
    action: ActionBlock

    @field_validator("title")
    @classmethod
    def _validate_title(cls, v: str) -> str:
        return _check_title_placeholders(v)

    @field_validator("evts")
    @classmethod
    def _validate_evts(cls, v: list[str]) -> list[str]:
        invalid = set(v) - VALID_EVTS
        if invalid:
            raise ValueError(
                f"Invalid event type(s): {sorted(invalid)}. Must be from: {sorted(VALID_EVTS)}"
            )
        # Deduplicate while preserving a canonical order
        seen: set[str] = set()
        return [x for x in v if not (x in seen or seen.add(x))]  # type: ignore[func-returns-value]


class NudgeRuleUpdate(BaseModel):
    """Validated input for a full rule replacement (PUT).  All fields optional."""

    model_config = ConfigDict(extra="forbid")

    slug: str | None = Field(None, pattern=_SLUG_PATTERN)
    title: str | None = None
    gid: str | None = Field(None, pattern=_SLUG_PATTERN)
    active: bool | None = None
    evts: list[str] | None = None
    days_back: int | None = Field(None, ge=0, le=90)
    conds: ConditionsBlock | None = None
    action: ActionBlock | None = None

    @field_validator("title")
    @classmethod
    def _validate_title(cls, v: str | None) -> str | None:
        return _check_title_placeholders(v) if v is not None else v

    @field_validator("evts")
    @classmethod
    def _validate_evts(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        invalid = set(v) - VALID_EVTS
        if invalid:
            raise ValueError(
                f"Invalid event type(s): {sorted(invalid)}. Must be from: {sorted(VALID_EVTS)}"
            )
        seen: set[str] = set()
        return [x for x in v if not (x in seen or seen.add(x))]  # type: ignore[func-returns-value]


class NudgeRuleResponse(BaseModel):
    """Serialised nudge rule returned from the API."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    title: str
    gid: str
    active: bool
    evts: list[str]
    days_back: int
    conds: dict[str, Any]
    action: dict[str, Any]
    created_at: _dt
    updated_at: _dt


class NudgeRuleListResponse(BaseModel):
    """Paginated list of nudge rules."""

    total: int
    page: int
    limit: int
    items: list[NudgeRuleResponse]


class NudgeRuleGroup(BaseModel):
    """Summary of a nudge rule group (GID)."""

    gid: str
    rule_count: int
    active_count: int


class NudgeRuleGroupList(BaseModel):
    """List of all nudge rule groups."""

    groups: list[NudgeRuleGroup]


class NudgeRuleGroupDetail(BaseModel):
    """All rules belonging to a single group."""

    gid: str
    rules: list[NudgeRuleResponse]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _validate_date_strings(op: str, values: list[Any]) -> None:
    """Raise ValueError if any item in values is not a valid YYYY-MM-DD string."""
    for s in values:
        if not isinstance(s, str) or not _DATE_RE.match(s):
            raise ValueError(f"{op}: {s!r} must be a YYYY-MM-DD string")
        try:
            _dt.strptime(s, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"{op}: {s!r} is not a valid calendar date")
