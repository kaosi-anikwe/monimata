# Nudge DSL — System Reference

The nudge engine is MoniMata's server-side "Account Officer" — it evaluates
user transactions against a set of JSON-defined rules and sends contextual,
localised push notifications. Rules are written in a custom DSL stored as
JSONB in PostgreSQL, cached in Redis, and evaluated inside Celery workers.

No AI or external APIs are involved — the entire pipeline runs locally.

---

## Architecture Overview

```
[Inbound Transaction]
        │
        ▼
[Categorization Engine]
        │  sets event type: debit_cat / debit_uncat / credit_cat / credit_uncat
        ▼
[Celery Task: categorize_transactions]
        │  calls evaluate_transaction_nudges(db, tx)
        ▼
[Load active rules from Redis]        ←── cache:nudge_rules:{evt_type}
        │
        ▼
[GID rate-limit filter]                ←── Redis: rl:nudge_gid:{user}:{gid}:{date}
        │  drops groups that already hit fatigue_limit today
        ▼
[Hydrate context]                      ←── Single DB lookup: tx + category + budget + history
        │
        ▼
[DSL Evaluation Engine]                ←── evaluate_rule() recursion
        │
        ▼ (matched rules)
[Render random template]               ←── str.format(**context)
        │
        ▼
[create_nudge()]                       ←── Persist row + send push (or queue for quiet hours)
```

### Key components

| Module                             | Responsibility                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `app/services/dsl_engine.py`       | Stateless core: operator registry, context hydration, recursive evaluator, GID rate-limit filter, batch runner |
| `app/services/nudge_engine.py`     | Orchestrator: loads rules from Redis, calls DSL engine, creates Nudge rows, sends push notifications           |
| `app/models/nudge_rule.py`         | SQLAlchemy model for `nudge_rules` table                                                                       |
| `app/schemas/nudge_rule.py`        | Pydantic validation for rule CRUD — rejects structurally invalid rules at the API boundary                     |
| `app/routers/admin_nudge_rules.py` | Admin CRUD endpoints for managing rules                                                                        |
| `app/core/redis_client.py`         | Rule cache: `load_rules_for_evt()`, `invalidate_and_rebuild()`, warm-up on startup                             |

---

## Rule Schema

Every rule is a single JSON object stored in the `nudge_rules` table:

```json
{
  "slug": "high_spend_pct",
  "title": "Budget Alert",
  "gid": "spend_alerts",
  "active": true,
  "evts": ["debit_cat"],
  "days_back": 7,
  "conds": { ... },
  "action": { ... }
}
```

### Top-level fields

| Field       | Type       | Description                                                                                                                     |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `slug`      | `string`   | Unique identifier. Lowercase alphanumeric + underscores, 1–64 chars. Also used as `nudge_type` in the push payload.             |
| `title`     | `string`   | Push notification title. Supports `{placeholder}` syntax (see Templates). Empty string falls back to a humanised slug.          |
| `gid`       | `string`   | Group ID for rate-limit bucketing. Rules in the same group share a daily fire limit (controlled by the user's `fatigue_limit`). |
| `active`    | `bool`     | Toggle. Inactive rules are ignored by the engine and excluded from the Redis cache.                                             |
| `evts`      | `string[]` | Event types that trigger evaluation. One or more of: `debit_cat`, `debit_uncat`, `credit_cat`, `credit_uncat`.                  |
| `days_back` | `int`      | How many days of historical transactions to load for `count_where` conditions. `0` = current transaction only. Max `90`.        |
| `conds`     | `object`   | Root conditions block (see Conditions).                                                                                         |
| `action`    | `object`   | Output definition (see Action).                                                                                                 |

---

## Conditions Block

The `conds` field is a recursive logical tree of conditions:

```json
{
  "op": "AND",
  "rules": [
    { "fact": "tx.amt", "op": "gte", "val": 5000000 },
    { "fact": "cat.spend_pct", "op": "gt", "val": 0.8 },
    {
      "op": "OR",
      "rules": [
        { "fact": "tx.dt", "op": "day_in", "val": ["FRI", "SAT", "SUN"] },
        { "fact": "tx.dt", "op": "hour_range", "val": [22, 4] }
      ]
    }
  ]
}
```

### Logical operators

- `"AND"` — all child rules must match
- `"OR"` — at least one child rule must match

Blocks can be nested to arbitrary depth. A child element with a `"rules"` key is treated as a nested block; otherwise it's a leaf condition.

### Leaf condition format

```json
{ "fact": "<dot-path>", "op": "<operator>", "val": <value> }
```

---

## Context Facts

Facts are dot-notated paths into the runtime context built by `hydrate_context()`. The context is a tree of `SimpleNamespace` objects so that `{tx.time_display}` resolves via attribute access in templates.

### Transaction (`tx.*`)

| Fact              | Type                         | Description                                                               |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `tx.amt`          | `NairaAmount` (int subclass) | Amount in kobo. Negative for debits. Renders as `₦X,XXX.XX` in templates. |
| `tx.type`         | `string`                     | `"debit"` or `"credit"`                                                   |
| `tx.cid`          | `string \| None`             | Category ID (UUID)                                                        |
| `tx.dt`           | `string`                     | ISO 8601 datetime string (used by temporal operators)                     |
| `tx.time_display` | `string`                     | Human-readable WAT time, e.g. `"3:45 PM"`                                 |
| `tx.id`           | `string`                     | Transaction UUID                                                          |

### Category (`cat.*`)

All `None` when the transaction is uncategorised or has no active budget.

| Fact            | Type             | Description                                                       |
| --------------- | ---------------- | ----------------------------------------------------------------- |
| `cat.name`      | `string`         | Category name, e.g. `"Food & Drinks"`                             |
| `cat.type`      | `string \| None` | Target frequency: `"weekly"`, `"monthly"`, `"yearly"`, `"custom"` |
| `cat.amt`       | `NairaAmount`    | Budget assigned for the period (kobo)                             |
| `cat.spent`     | `NairaAmount`    | Absolute spending so far (kobo)                                   |
| `cat.rem`       | `NairaAmount`    | Budget remaining (kobo)                                           |
| `cat.spend_pct` | `float`          | Spend ratio `0.0–1.0+` (can exceed 1.0 when over budget)          |
| `cat.tx_pct`    | `float`          | This transaction as a fraction of the budget                      |
| `cat.time_pct`  | `float`          | Fraction of the budget period elapsed (frequency-aware)           |
| `cat.id`        | `string`         | Category UUID                                                     |

### History (`hist.*`)

| Fact               | Type         | Description                                                                                 |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------- |
| `hist.txs`         | `list[dict]` | Historical transactions within `days_back`. Each item has: `cid`, `amt`, `type`, `dt`       |
| `hist.match_count` | `int`        | Count of items matching a `count_where` filter. Written as a side effect during evaluation. |

---

## Operator Reference

### Scalar comparison

| Operator | Value type                 | Behaviour     |
| -------- | -------------------------- | ------------- |
| `eq`     | `string \| number \| bool` | `fact == val` |
| `neq`    | `string \| number \| bool` | `fact != val` |
| `gt`     | `number`                   | `fact > val`  |
| `lt`     | `number`                   | `fact < val`  |
| `gte`    | `number`                   | `fact >= val` |
| `lte`    | `number`                   | `fact <= val` |

### Temporal (operate on `tx.dt`)

| Operator     | Value type         | Behaviour                                                                      |
| ------------ | ------------------ | ------------------------------------------------------------------------------ |
| `day_in`     | `string[]`         | Weekday matches. Values: `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`       |
| `dom_range`  | `[int, int]`       | Day-of-month within inclusive range (1–31). Start ≤ end.                       |
| `date_range` | `[string, string]` | Date within `YYYY-MM-DD` range (inclusive).                                    |
| `date_in`    | `string[]`         | Date matches any of the listed `YYYY-MM-DD` values.                            |
| `hour_in`    | `int[]`            | Hour (0–23) matches any listed value.                                          |
| `hour_range` | `[int, int]`       | Hour within range. **Supports overnight wrap**: `[22, 4]` matches 22:00–04:59. |

### Aggregate

| Operator      | Value type | Behaviour                                                                    |
| ------------- | ---------- | ---------------------------------------------------------------------------- |
| `count_where` | `object`   | Filters `hist.txs`, counts matches, compares against a threshold. See below. |

#### `count_where` config

```json
{
  "fact": "hist.txs",
  "op": "count_where",
  "val": {
    "filter": { "fact": "tx.cid", "op": "eq", "val": "curr.cid" },
    "cond": { "op": "gte", "val": 3 }
  }
}
```

- `filter.fact` — field on each history item to test. Valid: `tx.cid`, `tx.amt`, `tx.type`, `tx.dt`
- `filter.val` — value to compare against. The macro `"curr.cid"` resolves to the current transaction's category ID at runtime.
- `cond` — scalar comparison applied to the matched count.
- **Side effect**: writes the count to `hist.match_count` for use in templates.

---

## Action Block

```json
{
  "tmpls": [
    "You've used {cat.spend_pct:.0%} of your {cat.name} budget. Only {cat.rem} left.",
    "Heads up — {cat.name} is at {cat.spend_pct:.0%}. {cat.rem} remaining this month."
  ],
  "screen": "budget"
}
```

| Field    | Type       | Default      | Description                                                                                     |
| -------- | ---------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `tmpls`  | `string[]` | _(required)_ | One or more Python format strings. A random template is chosen at delivery.                     |
| `screen` | `string`   | `"nudges"`   | Navigation target on press. One of: `transactions`, `transaction`, `budget`, `target`, `nudges` |

### Template syntax

Templates use Python's `str.format()` with the hydrated context. Any fact from the context tree is available:

```
{tx.amt}            →  ₦50,000.00  (NairaAmount auto-formats)
{tx.time_display}   →  3:45 PM
{cat.name}          →  Food & Drinks
{cat.spend_pct:.0%} →  82%
{cat.rem}           →  ₦18,000.00
{hist.match_count}  →  5
```

All `cat.*` amount fields (`amt`, `spent`, `rem`) are `NairaAmount` instances — they render as `₦X,XXX.XX` by default but support standard format specs when needed.

---

## GID Rate Limiting

Each user has a `fatigue_limit` (default 3, configurable 1–10) stored in `user.nudge_settings`. Rules sharing the same `gid` are rate-limited as a group per WAT calendar day.

**Redis keys**: `rl:nudge_gid:{user_id}:{gid}:{YYYY-MM-DD}`

- Incremented each time a rule in the group fires
- TTL: seconds-to-midnight WAT (self-expiring)
- Checked in a single `MGET` round trip across all unique GIDs before evaluation begins

When a group hits its limit, all remaining rules in that group are **suppressed** — skipped entirely. Suppressed hits are tracked in separate Redis counters for admin metrics.

### Suggested GID groupings

| GID                | Use case                 | Example rules                                      |
| ------------------ | ------------------------ | -------------------------------------------------- |
| `spend_alerts`     | Budget usage warnings    | `high_spend_pct`, `over_budget`, `large_single_tx` |
| `income`           | Credit notifications     | `salary_received`, `large_credit`                  |
| `lifestyle_pacing` | Spending pattern nudges  | `weekend_groove_check`, `late_night_spending`      |
| `streaks`          | Engagement encouragement | `no_spend_streak`, `savings_milestone`             |
| `budget_health`    | Budget tracking          | `category_underspend`, `month_end_review`          |

---

## Quiet Hours

Users configure quiet hours in `nudge_settings` (e.g. `"quiet_hours_start": "23:00"`, `"quiet_hours_end": "07:00"`, WAT). During quiet hours:

1. `create_nudge()` sets `delivered_at = NULL` (queued)
2. The `deliver_queued_nudges` Celery beat task runs every 10 minutes
3. It checks each user's quiet hours — if the window has ended, it delivers queued nudges
4. Delivery includes the full push notification with context

---

## Redis Caching

Rules are cached in Redis as JSON arrays keyed by event type:

```
cache:nudge_rules:debit_cat    → [{"id": "...", "slug": "high_spend_pct", ...}, ...]
cache:nudge_rules:debit_uncat  → [...]
cache:nudge_rules:credit_cat   → [...]
cache:nudge_rules:credit_uncat → [...]
```

- **No TTL** — keys live until explicitly rebuilt
- **Rebuilt on every admin write** (create, update, toggle, delete) via `invalidate_and_rebuild()`
- **Warmed on FastAPI startup** via `warm_nudge_rule_cache()`
- **Self-healing on cache miss** — `load_rules_for_evt()` rebuilds from DB if the key is missing

---

## Metrics

Two tiers of Redis counters track rule performance:

| Counter             | Key pattern                              | Purpose                         |
| ------------------- | ---------------------------------------- | ------------------------------- |
| Global hits         | `nudge:hits:{rule_id}:{date}`            | Total fires across all users    |
| Global suppressed   | `nudge:suppressed:{rule_id}:{date}`      | Fires blocked by GID rate limit |
| Per-user hits       | `nudge:uhits:{user_id}:{rule_id}:{date}` | User-level fire count           |
| Per-user suppressed | `nudge:usup:{user_id}:{rule_id}:{date}`  | User-level suppression count    |

All counters have a 48-hour TTL. The `roll_up_nudge_stats` beat task (00:15 WAT daily) persists them to the `nudge_stats` table for long-term querying.

---

## Admin API

All endpoints require the `admin` role. Base path: `/admin/nudge-rules`

| Method   | Path                | Description                                         |
| -------- | ------------------- | --------------------------------------------------- |
| `GET`    | `/`                 | Paginated list. Filters: `?active=`, `?gid=`, `?q=` |
| `GET`    | `/groups`           | List all GIDs with rule/active counts               |
| `GET`    | `/groups/{gid}`     | All rules in a group                                |
| `GET`    | `/stats/summary`    | Aggregated stats for all rules over N days          |
| `GET`    | `/{rule_id}`        | Single rule                                         |
| `POST`   | `/`                 | Create a rule                                       |
| `PUT`    | `/{rule_id}`        | Update a rule (partial)                             |
| `PATCH`  | `/{rule_id}/toggle` | Toggle active/inactive                              |
| `DELETE` | `/{rule_id}`        | Hard delete                                         |
| `GET`    | `/{rule_id}/stats`  | Daily stats for a single rule                       |

---

## Push Data Shape

When a DSL nudge fires, the push notification `data` payload contains the **full nudge context** plus canonical routing fields:

```json
{
  "trigger_type": "nudge",
  "nudge_id": "abc-123",
  "nudge_type": "high_spend_pct",
  "screen": "budget",
  "slug": "high_spend_pct",
  "gid": "spend_alerts",
  "evt_type": "debit_cat",
  "transaction_id": "tx-789",
  "category_id": "cat-456",
  "category_name": "Food & Drinks",
  "amount_kobo": -4500000,
  "match_count": 5,
  "spend_pct": 0.82,
  "budget_amount_kobo": 10000000,
  "budget_remaining_kobo": 1800000
}
```

The client can render a rich nudge card immediately from the push data — no follow-up `GET` required. The same context is also available via `GET /nudges` for the in-app list.

---

## Validation

All rule input is validated by Pydantic at the API boundary (`NudgeRuleCreate` / `NudgeRuleUpdate`). The validation catches:

- Unknown fact paths (must be in `VALID_FACTS`)
- Invalid operator/fact combinations (e.g. `count_where` only works with `hist.txs`)
- Wrong value types for each operator
- Unknown template placeholders (must be in `VALID_TEMPLATE_KEYS`)
- Invalid `count_where` config structure
- Invalid screen targets
- Malformed slug/gid identifiers

A structurally invalid rule cannot reach the database.

---

## Complete Examples

### Example 1: High spending alert

Fire when a categorised debit pushes budget usage past 80%:

```json
{
  "slug": "high_spend_pct",
  "title": "Budget Alert",
  "gid": "spend_alerts",
  "active": true,
  "evts": ["debit_cat"],
  "days_back": 0,
  "conds": {
    "op": "AND",
    "rules": [
      { "fact": "cat.spend_pct", "op": "gte", "val": 0.8 },
      { "fact": "cat.spend_pct", "op": "lt", "val": 1.0 }
    ]
  },
  "action": {
    "tmpls": [
      "You've used {cat.spend_pct:.0%} of your {cat.name} budget. Only {cat.rem} left this month.",
      "Heads up — {cat.name} is at {cat.spend_pct:.0%}. {cat.rem} remaining. Plan wisely!"
    ],
    "screen": "budget"
  }
}
```

### Example 2: Over-budget warning

Fire when spending exceeds the assigned budget:

```json
{
  "slug": "over_budget",
  "title": "Over Budget ⚠️",
  "gid": "spend_alerts",
  "active": true,
  "evts": ["debit_cat"],
  "days_back": 0,
  "conds": {
    "op": "AND",
    "rules": [{ "fact": "cat.spend_pct", "op": "gte", "val": 1.0 }]
  },
  "action": {
    "tmpls": [
      "Your {cat.name} budget is fully used up. You've spent {cat.spent} out of {cat.amt}.",
      "{cat.name} budget exceeded! {cat.spent} spent against {cat.amt} assigned."
    ],
    "screen": "budget"
  }
}
```

### Example 3: Large single transaction

Fire on any debit over ₦50,000:

```json
{
  "slug": "large_single_tx",
  "title": "Large Transaction",
  "gid": "spend_alerts",
  "active": true,
  "evts": ["debit_cat", "debit_uncat"],
  "days_back": 0,
  "conds": {
    "op": "AND",
    "rules": [{ "fact": "tx.amt", "op": "lte", "val": -5000000 }]
  },
  "action": {
    "tmpls": [
      "That's a big one — {tx.amt} just went out. Make sure it's planned for.",
      "{tx.amt} debit recorded. That's a significant expense — check your budget."
    ],
    "screen": "transactions"
  }
}
```

> **Note**: Debit amounts are negative in kobo, so `tx.amt lte -5000000` means "amount is ₦50,000 or more".

### Example 4: Weekend late-night spending with history

Fire on weekend nights (Fri–Sun, 10 PM–4 AM) when the user has already made 2+ transactions in the same category this week and the budget is over 80% used:

```json
{
  "slug": "weekend_groove_check",
  "title": "Weekend Check-In",
  "gid": "lifestyle_pacing",
  "active": true,
  "evts": ["debit_cat"],
  "days_back": 7,
  "conds": {
    "op": "AND",
    "rules": [
      { "fact": "tx.dt", "op": "day_in", "val": ["FRI", "SAT", "SUN"] },
      { "fact": "tx.dt", "op": "hour_range", "val": [22, 4] },
      { "fact": "cat.spend_pct", "op": "gt", "val": 0.8 },
      {
        "fact": "hist.txs",
        "op": "count_where",
        "val": {
          "filter": { "fact": "tx.cid", "op": "eq", "val": "curr.cid" },
          "cond": { "op": "gte", "val": 2 }
        }
      }
    ]
  },
  "action": {
    "tmpls": [
      "It's {tx.time_display} on a weekend and your {cat.name} budget is {cat.spend_pct:.0%} gone. {hist.match_count} transactions this week. Only {cat.rem} left.",
      "Chairman, {hist.match_count} swipes in {cat.name} this week and it's {tx.time_display}! {cat.rem} remaining. Sleep on it?"
    ],
    "screen": "budget"
  }
}
```

### Example 5: Salary received

Fire on a large credit (over ₦100,000) to a categorised account:

```json
{
  "slug": "salary_received",
  "title": "💰 Income Received",
  "gid": "income",
  "active": true,
  "evts": ["credit_cat"],
  "days_back": 0,
  "conds": {
    "op": "AND",
    "rules": [{ "fact": "tx.amt", "op": "gte", "val": 10000000 }]
  },
  "action": {
    "tmpls": [
      "{tx.amt} just landed! Time to assign it to your budget categories.",
      "Income alert: {tx.amt} received. Head to your budget to allocate it."
    ],
    "screen": "budget"
  }
}
```

### Example 6: End-of-month budget review

Fire on the last 3 days of the month when the time period is almost over:

```json
{
  "slug": "month_end_review",
  "title": "Month-End Review",
  "gid": "budget_health",
  "active": true,
  "evts": ["debit_cat"],
  "days_back": 0,
  "conds": {
    "op": "AND",
    "rules": [
      { "fact": "tx.dt", "op": "dom_range", "val": [28, 31] },
      { "fact": "cat.time_pct", "op": "gte", "val": 0.9 }
    ]
  },
  "action": {
    "tmpls": [
      "Month's almost over. You have {cat.rem} left in {cat.name}. How are you finishing?",
      "Only a few days left this month. {cat.name}: {cat.rem} remaining out of {cat.amt}."
    ],
    "screen": "budget"
  }
}
```

### Example 7: Transaction as a large chunk of budget

Fire when a single transaction uses more than 30% of the category's budget:

```json
{
  "slug": "big_chunk_tx",
  "title": "Big Spend",
  "gid": "spend_alerts",
  "active": true,
  "evts": ["debit_cat"],
  "days_back": 0,
  "conds": {
    "op": "AND",
    "rules": [{ "fact": "cat.tx_pct", "op": "gte", "val": 0.3 }]
  },
  "action": {
    "tmpls": [
      "That {tx.amt} transaction is {cat.tx_pct:.0%} of your entire {cat.name} budget in one go.",
      "One transaction, {cat.tx_pct:.0%} of your {cat.name} budget. {cat.rem} left after this."
    ],
    "screen": "budget"
  }
}
```

---

## Creating a Rule via the API

```bash
curl -X POST https://api.monimata.com/admin/nudge-rules \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "high_spend_pct",
    "title": "Budget Alert",
    "gid": "spend_alerts",
    "active": true,
    "evts": ["debit_cat"],
    "days_back": 0,
    "conds": {
      "op": "AND",
      "rules": [
        { "fact": "cat.spend_pct", "op": "gte", "val": 0.8 }
      ]
    },
    "action": {
      "tmpls": [
        "Your {cat.name} budget is at {cat.spend_pct:.0%}. Only {cat.rem} left."
      ],
      "screen": "budget"
    }
  }'
```

The rule is immediately validated, persisted, and cached in Redis. It starts evaluating on the next inbound transaction.

---

## Evaluation Flow in Detail

When `categorize_transactions` finishes processing a transaction:

1. **Event typing** — `_get_event_type(tx)` maps the transaction to one of four event buckets based on type (debit/credit) and whether it has a category.

2. **Rule loading** — `load_rules_for_evt(evt_type)` reads the pre-cached rule array from Redis. On a cache miss, it falls back to a DB query and rebuilds the cache.

3. **GID rate-limit filtering** — `filter_rules_by_gid_rate_limit(rules, user_id, fatigue_limit)` does a single `MGET` across all unique GIDs to check fire counts. Rules in groups that have hit the limit are dropped. Suppressed hits are recorded in Redis for metrics.

4. **History loading** — If any surviving rule needs historical context (`days_back > 0`), a single query fetches all transactions within the largest lookback window.

5. **Context hydration** — `hydrate_context(tx, cat, bm, history, target)` builds the runtime context tree with all computed fields (spend ratios, time ratios, NairaAmount formatting, etc.).

6. **Batch evaluation** — `run_dsl_rules(rules, context)` iterates each rule, resets `hist.match_count` per-rule, and calls `evaluate_rule()` recursively on the conditions tree.

7. **Template rendering** — For each matched rule, a random template from `action.tmpls` is chosen and rendered with `str.format(**context)`.

8. **Nudge creation** — `create_nudge()` persists the Nudge row with the enriched context, then either sends a push immediately or queues it for quiet-hour delivery.

9. **Rate-limit bookkeeping** — The GID counter is incremented and a rule-hit metric is recorded in Redis.
