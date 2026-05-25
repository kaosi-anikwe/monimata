# MoniMata — Backend API

> **FastAPI service powering MoniMata's zero-based budgeting engine, transaction ingestion pipeline, and AI categorisation stack.**

For a product overview, architecture diagram, and monorepo setup instructions, see the [root README](../../README.md).

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Project Layout](#2-project-layout)
3. [Local Development](#3-local-development)
4. [Authentication & Security](#4-authentication--security)
5. [Transaction Ingestion](#5-transaction-ingestion)
6. [Categorisation Pipeline](#6-categorisation-pipeline)
7. [Zero-Based Budget Engine](#7-zero-based-budget-engine)
8. [Background Workers](#8-background-workers)
9. [Real-Time Events](#9-real-time-events)
10. [Nudge Engine](#10-nudge-engine)
11. [Adding a Bank](#11-adding-a-bank)
12. [Database Migrations](#12-database-migrations)
13. [Code Quality](#13-code-quality)

---

## 1. Service Overview

The backend is a single **FastAPI** application. It owns:

- The PostgreSQL financial ledger (source of truth for all transactions and budget state)
- Three transaction ingestion channels (email webhook, statement PDF upload, receipt image/PDF upload)
- A five-tier automated categorisation pipeline
- The full zero-based budgeting engine (TBB, carry-forward, targets, overspend mitigation, reconciliation)
- A Celery worker pool for all async heavy work (parsing, categorising, nudge delivery)
- A WebSocket endpoint for pushing real-time delta events to connected mobile clients

All money is stored as **kobo** (`BIGINT`). ₦150.00 → `15000`. Floats never touch the ledger.

---

## 2. Project Layout

```
apps/api/
├── alembic/
│   └── versions/           # Sequential Alembic migrations (0001_ … 0021_)
├── app/
│   ├── main.py             # FastAPI factory: router includes, middleware, Sentry, event listeners
│   ├── core/
│   │   ├── config.py       # Pydantic Settings — all env vars live here
│   │   ├── database.py     # SQLAlchemy engine + SessionLocal
│   │   ├── deps.py         # FastAPI dependency injectors (get_db, get_current_user)
│   │   ├── limiter.py      # SlowAPI rate-limit instance
│   │   ├── redis_client.py # Shared Redis connection helper
│   │   └── security.py     # RS256 JWT verification, AES-256-GCM PII encryption
│   ├── models/             # SQLAlchemy ORM models (one file per domain entity)
│   ├── routers/            # FastAPI routers (one file per URL prefix)
│   ├── schemas/            # Pydantic request/response schemas
│   ├── services/
│   │   ├── budget_logic.py         # TBB, carry-forward, required_this_month, category seeding
│   │   ├── budget_events.py        # SQLAlchemy event listeners — BudgetMonth.activity sync
│   │   ├── nudge_engine.py         # Nudge trigger evaluation, quiet hours, fatigue limits
│   │   ├── push_service.py         # Expo push notification delivery
│   │   ├── email_service.py        # Transactional email (registration, alerts)
│   │   ├── llm.py                  # BYOK LLM client for Tier 4 categorisation + nudge copy
│   │   ├── categorization/
│   │   │   ├── __init__.py         # clean_narration() + the full tiered categorisation pipeline
│   │   │   ├── embeddings.py       # all-MiniLM-L6-v2 vector embeddings helper
│   │   │   ├── clustering.py       # Levenshtein / substring batch clustering (onboarding)
│   │   │   ├── scoring.py          # Heuristic scoring engine (Tier 3)
│   │   │   └── global_merchants.json  # Community keyword → category mapping
│   │   └── ingestion/
│   │       ├── base.py             # ParsedTransaction + Parser Protocols
│   │       ├── registry.py         # Bank registry, iter_email_parsers() etc.
│   │       ├── _utils.py           # Shared helpers (amount parsing, date normalisation)
│   │       ├── channels/           # Per-channel dispatch (email, statement, receipt)
│   │       └── banks/              # Per-bank parser implementations
│   └── worker/
│       ├── celery_app.py       # Celery application instance + config
│       ├── beat_schedule.py    # Celery Beat periodic task schedule
│       └── tasks.py            # All Celery task definitions
├── keys/                   # RS256 PEM key files (never committed)
├── logs/                   # Rotating log output
├── alembic.ini
├── pyproject.toml          # Python dependencies (managed with uv)
└── dev-start.sh            # Convenience script: start API + worker + beat together
```

---

## 3. Local Development

### Prerequisites

- Python 3.11+
- PostgreSQL 16+ with the [pgvector](https://github.com/pgvector/pgvector) extension (`CREATE EXTENSION vector`)
- Redis 7+
- Tesseract 4+ (`sudo apt install tesseract-ocr`) — receipt image OCR

#### PostgreSQL setup

The API uses PostgreSQL-specific types (`JSONB`, `ARRAY`, `UUID`) and the `pgvector` extension for embedding-based transaction categorisation. SQLite is **not** supported.

```bash
# Install pgvector (Ubuntu/Debian)
sudo apt install postgresql-16-pgvector

# Or on macOS with Homebrew
brew install pgvector

# Enable the extension in your database
psql -d monimata -c "CREATE EXTENSION IF NOT EXISTS vector"
```

### Setup

```bash
cd apps/api

# Install dependencies and create .venv
uv sync

# Activate
source .venv/bin/activate

# Copy and populate environment variables
cp .env.example .env
# Required: DATABASE_URL, REDIS_URL, JWT_PUBLIC_KEY,
#           AES_ENCRYPTION_KEY, BANK_ALERT_WEBHOOK_SECRET

# Generate AES encryption key (copy into .env as AES_ENCRYPTION_KEY)
python -c "import secrets; print(secrets.token_hex(32))"

# Run migrations
alembic upgrade head

# Start all four processes (use dev-start.sh or separate terminals)
uvicorn app.main:app --reload --port 8000
celery -A app.worker.celery_app worker -Q default,celery --loglevel=info
celery -A app.worker.celery_app beat -l info
```

The interactive API docs are at `http://localhost:8000/docs`.

### Key environment variables

| Variable                    | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`              | `postgresql://user:pass@host/db`                                   |
| `REDIS_URL`                 | `redis://localhost:6379/0`                                         |
| `JWT_PUBLIC_KEY`            | RS256 public key PEM (verifies tokens minted by admin gateway)     |
| `AES_ENCRYPTION_KEY`        | 64-char hex string — encrypts bank account numbers at rest         |
| `BANK_ALERT_WEBHOOK_SECRET` | Shared secret matched against `X-MoniMata-Secret` on every webhook |
| `OPENAI_API_KEY`            | Optional — powers nudge copy generation when no BYOK key is set    |
| `SENTRY_DSN`                | Leave empty to disable Sentry in dev                               |

---

## 4. Authentication & Security

### Token flow

Access tokens are **RS256 JWTs** with a 15-minute lifetime minted by the admin gateway. This API verifies them using the corresponding **public key only**. Clients send tokens in the `Authorization: Bearer <token>` header. On expiry the client exchanges a 7-day **rotating refresh token** directly with the admin gateway for a new pair.

`app/core/security.py` owns the verification primitives:

- **JWT verification** — `python-jose`, RS256 public key only. An HS256 secret falls back for local dev when no PEM key is configured.
- **PII encryption** — AES-256-GCM via `cryptography`. Bank account numbers are encrypted at the service boundary before persisting and decrypted in-memory only when a parser needs to match a statement to an account. Only the last 4 digits are ever returned to the mobile client.

### Webhook authentication

The bank-alert webhook (`POST /webhooks/bank-alerts`) verifies `X-MoniMata-Secret` using `hmac.compare_digest` (constant-time) before any parsing occurs. Requests without a valid secret return 401 immediately.

---

## 5. Transaction Ingestion

### The three channels

Transactions enter MoniMata through three independent channels. All produce the same `ParsedTransaction` dataclass and then funnel through the same upsert + categorisation path.

| Channel                 | Endpoint                     | How it arrives                                                                  |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| **Email alert**         | `POST /webhooks/bank-alerts` | Bank alert email forwarded by Cloudflare Worker → postal-mime → HTTP POST       |
| **Statement PDF**       | `POST /uploads/statement`    | User uploads PDF in the app; dispatched to `process_bank_statement` Celery task |
| **Receipt image / PDF** | `POST /uploads/receipt`      | User uploads a receipt; dispatched to `process_receipt` Celery task             |

### The bank parser protocol

`app/services/ingestion/base.py` defines three protocols:

```
EmailBankParser       — parse(body: str) -> ParsedTransaction | None
StatementBankParser   — identify(content, email_body) -> (account_number, bank_slug) | None
                        parse(content, account_number) -> list[ParsedTransaction]
ReceiptBankParser     — identify(image_bytes) -> (bank_slug, account_suffix) | None
                        parse(image_bytes, bank_slug, account_number) -> ParsedTransaction | None
```

Each bank in `app/services/ingestion/banks/` implements whichever protocols are appropriate for that institution. The registry (`registry.py`) imports every bank package and builds lookup tables at startup. Channel dispatchers call `iter_email_parsers()`, `identify_statement()`, etc. — they never import bank packages directly.

### The narration cleaning pipeline

Raw bank narration strings are noisy — they contain reference tokens, account numbers, USSD routing strings, and date fragments that vary per transaction. Matching on raw narration would cause near-zero cache hit rates.

`clean_narration()` in `app/services/categorization/__init__.py` applies a deterministic multi-step regex pipeline:

1. Strip leading channel indicators (`TRF FROM`, `NIP TRSF FRM`, `POS PURCHASE AT`, etc.)
2. Remove reference codes (`REF:`, `SESN:`, `TRAN:`, `RRN:`, `FT…`)
3. Strip trailing routing strings (`VIA USSD`, `VIA INTERNET BANKING`, `ON DD/MM/YYYY`)
4. Remove inline account/phone number fragments (`TO 0023423423`, `FROM 0803…`)
5. Remove standalone long numbers (7+ digits)
6. Remove date-like patterns
7. Lower-case and collapse whitespace

Example:

```
Input:   "TRF FROM 0023423423 TO CHINEDU ENTERPRISES VIA USSD REF:71625372/IKEJA"
Output:  "chinedu enterprises"
```

The cleaned narration is stored once at insert time as `Transaction.cleaned_narration` and reused for all downstream lookups — no reprocessing needed on subsequent categorisation attempts.

### Deduplication

Every bank-issued reference (`external_ref`) is unique per transaction. During ingestion the worker attempts an `INSERT … ON CONFLICT (external_ref) DO NOTHING` — duplicate alerts from the same bank event are silently discarded at the database level.

### The "Clean Cut" onboarding protocol

When a user uploads their first statement, summing all historical credits to seed TBB would inject "ghost money" that has already been spent. MoniMata's **Clean Cut** approach instead:

1. Reads the **final row's `balance_after`** from the statement — the closing real-world balance.
2. Inserts a single synthetic `MONIMATA_STARTING_BALANCE` credit transaction with `category_id = None` (feeding TBB directly) for that amount.
3. Imports all historical statement rows normally for analytics, but marks them as categorised so they never feed TBB — they flow into category activity instead.

This means a user starts with exactly the cash they actually have available, and their historical spending is immediately visible in reports.

---

## 6. Categorisation Pipeline

Every transaction that arrives without a pre-assigned category is passed through a five-tier pipeline. The pipeline short-circuits as soon as any tier reaches a result, so most transactions never reach the expensive tiers.

```
Transaction arrives (cleaned_narration already set)
│
├─ Tier 1 ── UserCategoryRule exact match        → confidence 100, source: exact_match
│            (cleaned_narration indexed lookup)
│
├─ Tier 2a ─ Global merchant registry            → confidence 90,  source: global_merchant
│            (global_merchants.json substring match on cleaned_narration)
│
├─ Tier 2b ─ Keyword rules                       → confidence 75,  source: keyword
│
├─ Tier 2c ─ Vector similarity                   → confidence 70–95, source: vector
│            (all-MiniLM-L6-v2 cosine distance against user's past transaction embeddings)
│
├─ Tier 3 ── Heuristic scoring engine            → confidence variable, source: heuristic
│            (rapidfuzz fuzzy match + rule matrix)
│
└─ Tier 4 ── BYOK LLM fallback (opt-in)          → confidence variable, source: llm
             (user's own OpenAI / Gemini key, zero cost to MoniMata)

             If all tiers fail → category_id = NULL, flagged for manual review
```

### Tier 1 — UserCategoryRule exact match

When a user manually categorises a transaction (or confirms a suggestion), an atomic row is written to `user_category_rules (user_id, cleaned_narration, category_id)`. Future transactions from the same merchant hit this index with a single `O(1)` query and are categorised instantly with 100% confidence. `hit_count` and `last_triggered` track rule usage for analytics.

### Tier 2a — Global merchant registry

`global_merchants.json` is a version-controlled, community-maintained file mapping common Nigerian merchant patterns (regex or substring) to standard category names. It is loaded once at process startup. Entries cover high-frequency universals:

| Pattern                                 | Default category |
| --------------------------------------- | ---------------- |
| `MTN VTU` / `AIRTEL TOPUP` / `GLO COMS` | Airtime & Data   |
| `DSTV MULTICHOICE` / `GOTV`             | Subscriptions    |
| `IKEDC` / `EKEDC` / `AEDC_PREPAID`      | Electricity      |
| `UBERTRIP` / `BOLTRIDE` / `INDRIVE`     | Transport        |

### Tier 2c — Vector similarity

User transactions with a confirmed category are embedded using `all-MiniLM-L6-v2` (a lightweight sentence transformer) and stored as pgvector float arrays. When a new transaction passes through Tier 2b without a match, its `cleaned_narration` is embedded and compared against the user's stored vectors using cosine similarity. This catches spelling variants and abbreviations that substring rules miss — e.g., `CHICKEN REPUBLIK IJA` correctly matches past `CHICKEN REPUBLIC LEKKI` assignments.

### Tier 3 — Heuristic scoring engine

`app/services/categorization/scoring.py` implements a **modular strategy pattern**. Each scoring rule is an independent `ScoringComponent` class that returns a signed integer modifier. The engine:

1. Generates candidate categories via `rapidfuzz` `token_sort_ratio` (threshold 60) against the user's category names.
2. Runs every registered component against each candidate.
3. Commits the winner if the combined score crosses **75**.

The three built-in rules:

| Rule                  | Logic                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `TransactionTypeRule` | Debit transactions score −100 against income-bucket categories (Salary, Dividends, Refunds)                         |
| `AmountBracketRule`   | Validates amount scale against the category — airtime purchase of ₦350,000 scores −60                               |
| `TemporalPatternRule` | If a similar amount occurred in this category within the past 28–31 days, score +40 (recurring subscription anchor) |

Adding a new rule requires implementing `ScoringComponent.calculate_score()` and appending an instance to `HeuristicEngine.components`. No other files change.

### Tier 4 — BYOK LLM fallback

If the user has stored an API key under `/ai/credentials`, the pipeline decrypts it in-memory, batches any unresolved transactions, and sends them to the user's chosen provider (OpenAI, Gemini, or Anthropic). Because the key belongs to the user, MoniMata bears zero API cost and no data liability. After a successful LLM response, the result is written as a `UserCategoryRule` so future identical narrations never reach Tier 4.

---

## 7. Zero-Based Budget Engine

MoniMata implements a strict **YNAB-style Zero-Based Budget**: every Kobo that enters the system must be explicitly assigned to a category before it can be considered "planned." Money not assigned sits in the **TBB (To Be Budgeted / Ready to Assign)** pool.

### Core concepts

| Term             | Meaning                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| **TBB**          | Unallocated liquid cash available to budget this month                                    |
| **Assigned**     | How much the user has explicitly earmarked for a category this month                      |
| **Activity**     | Net transaction flow in the category this month (negative = spending, positive = refunds) |
| **Available**    | `carried_over + assigned + activity` — the live spendable balance                         |
| **Carried Over** | The closing Available from the prior month (clamped to zero if negative)                  |

### The Global Accounting Invariant

At any instant, the following equation must hold:

$$\sum \text{Null-category inflows} = \text{TBB} + \sum \text{Available across all categories}$$

A single-Kobo deviation means the ledger is corrupt.

### BudgetMonth — the snapshot model

`app/models/budget.py` holds one row per `(user_id, category_id, month)` where `month` is a `DATE` column normalised to the 1st of the month:

```python
class BudgetMonth(Base):
    user_id:      UUID
    category_id:  UUID
    month:        date          # always 1st of month (e.g. 2026-05-01)
    assigned:     int           # kobo — user-set allocation
    activity:     int           # kobo — computed by event listeners
    carried_over: int           # kobo — stamped at month rollover

    @property
    def available(self) -> int:
        return self.carried_over + self.assigned + self.activity
```

`available` is never persisted — it is always derived. This means the only write paths are `assigned` (user action), `activity` (event listener), and `carried_over` (month rollover), making the model easy to reason about.

### TBB formula

`compute_tbb()` in `budget_logic.py`:

$$\text{TBB}(M) = \text{NetNullFlow}(M) - \text{Assigned}(M) + \max(0,\ \text{TBB}(M-1))$$

Where **NetNullFlow** is the algebraic sum of all transactions with `category_id IS NULL` in month M — this includes:

- **Positive (credits):** Salary, dividends, cash deposits, `MONIMATA_STARTING_BALANCE` — they increase TBB.
- **Negative (system debits):** `MONIMATA_OVERSPEND_DEDUCTION`, negative reconciliation adjustments — they reduce TBB.

Categorised transactions (non-null `category_id`) are completely excluded from TBB — they belong to their category's `activity` instead.

Recursion is capped at 12 months and short-circuits at the first empty month, so a fresh user's TBB is computed in a single DB query in practice.

### Activity sync — SQLAlchemy event listeners

`app/services/budget_events.py` registers `after_insert`, `after_update`, and `after_delete` listeners on the `Transaction` mapper. These listeners fire atomically inside the same database connection as the transaction commit:

```
Transaction inserted (category_id = X, amount = −5000, month = 2026-05)
    ↓
after_insert fires
    ├── _upsert_budget_month_row(…)    — INSERT ON CONFLICT DO NOTHING (ensures row exists)
    └── _delta_activity(…, delta=−5000) — UPDATE budget_months SET activity = activity + delta
```

For `after_update`, the listener reverses the old contribution and applies the new one atomically. For `after_delete`, the old amount is reversed out. Because all mutations use SQLAlchemy Core `connection.execute()` calls rather than ORM-level session operations, there is no risk of re-entrant flushes or identity-map corruption.

Listeners are registered at process startup in both `app/main.py` (API process) and `app/worker/tasks.py` (Celery process) via:

```python
from app.services import budget_events as _budget_events  # noqa: F401
```

The import side-effect is sufficient — no explicit registration call is needed.

### Lazy month rollover

MoniMata deliberately avoids cron-job batch processing at midnight on the 1st (the "Midnight Stampede"). Instead, `ensure_budget_month_initialized()` lazily stamps the new month's `BudgetMonth` rows on first access:

```
User opens app on June 1st (or a worker processes a June transaction)
    ↓
ensure_budget_month_initialized(db, user_id, "2026-06") called
    ├── Check: any BudgetMonth row for user/2026-06 exists? → return (cache hit)
    └── No rows → load May's closing snapshots
              ↓
        For each category in May:
          new carried_over = max(0, may.available)   ← deficit clamped to 0
          INSERT BudgetMonth(month=2026-06, carried_over=…, assigned=0, activity=0)
              ↓
        Overspend deduction:
          total_deficit = sum(−may.available for categories where may.available < 0)
          if total_deficit > 0:
              INSERT Transaction(amount=−total_deficit, narration="MONIMATA_OVERSPEND_DEDUCTION",
                                 category_id=None, source=system)
              ← This negative null-category amount reduces TBB for June automatically
```

The overspend deduction ensures that liquid cash that physically left the system in May is also removed from June's TBB pool, preserving the Global Accounting Invariant.

### Inflow classification — Type A vs Type B

Not every credit should feed TBB:

| Type                    | Examples                            | `category_id` | Effect                                    |
| ----------------------- | ----------------------------------- | ------------- | ----------------------------------------- |
| **A — Absolute Income** | Salary, dividends, starting balance | `NULL`        | Increases TBB                             |
| **B — Reimbursements**  | Refunds, shared bill repayments     | Non-null      | Increases that category's `activity` only |

When a user manually enters or adjusts a credit, they choose which type it is. Automated ingestion defaults to Type A (null category) and lets the categorisation pipeline re-route it to Type B if it recognises the narration as a refund.

### Category targets

`required_this_month()` in `budget_logic.py` calculates how much still needs to be assigned to meet a `CategoryTarget`. Three behaviour models are supported:

| Behaviour   | Formula                                        | Use case                                                          |
| ----------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `set_aside` | `max(0, amount − assigned_t)`                  | Bills — must be funded fresh each month regardless of rollover    |
| `refill`    | `max(0, amount − carried_over_t − assigned_t)` | Groceries — existing rollover counts toward the goal              |
| `balance`   | `max(0, amount − available_t)`                 | Emergency fund — maintain the live balance at or above the target |

For **weekly** targets, the engine counts the exact number of occurrences of `target.day_of_week` in the active calendar month using `calendar.monthrange` — never an estimate. A weekly-Friday ₦5,000 target in a 5-Friday month costs ₦25,000.

For **yearly / custom** sinking funds, the shortfall is spread evenly over the months remaining until `target_date` using `ceil(needed / months_left)`.

### Retroactive cascade

When a user edits an assignment in a past month, all subsequent months' `carried_over` values are stale. The `set_assignment` endpoint detects past-month edits and enqueues `recalculate_carried_over_cascade`:

```python
# In routers/budget.py (set_assignment endpoint):
if month < date.today().strftime("%Y-%m"):
    recalculate_carried_over_cascade.delay(user_id, category_id, month)
```

The Celery task (`worker/tasks.py`) walks forward month-by-month from the edited month to today, recomputing `carried_over = max(0, prev.available)` for each subsequent row.

### Account reconciliation

`POST /accounts/{id}/reconcile` accepts a `true_actual_balance` (the user's verified real-world balance in kobo). The endpoint:

1. Computes the tracked balance: `account.starting_balance + SUM(transaction.amount)`.
2. Calculates `delta = true_actual_balance − tracked_balance`.
3. If `delta != 0`, inserts a `MONIMATA_RECONCILIATION` transaction with `category_id = None` and `source = system`.
4. Returns the delta and the new balance.

Because the reconciliation transaction has no `category_id`, the delta flows directly into TBB — a positive delta injects cash into the pool, a negative delta removes it, keeping the Global Accounting Invariant intact.

---

## 8. Background Workers

All async work runs in **Celery** workers. The Celery app (`worker/celery_app.py`) connects to Redis as its broker and result backend.

### Task inventory

| Task                               | Trigger                               | What it does                                                                                                               |
| ---------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `categorize_transactions`          | After any new transaction is inserted | Runs the five-tier categorisation pipeline; writes `UserCategoryRule` on success                                           |
| `process_bank_statement`           | `POST /uploads/statement`             | Parses the PDF, bulk-upserts transactions, inserts `MONIMATA_STARTING_BALANCE` on first import, anchors `starting_balance` |
| `process_receipt`                  | `POST /uploads/receipt`               | Identifies bank + account from OCR output, parses the receipt, upserts the transaction                                     |
| `evaluate_nudges`                  | After categorisation completes        | Evaluates threshold / large-tx / pay-received triggers; creates `Nudge` rows                                               |
| `deliver_queued_nudges`            | Beat — 7:05 AM WAT daily              | Sends push notifications for nudges held during quiet hours                                                                |
| `weekly_review_nudges`             | Beat — Friday 5:00 PM WAT             | Sends weekly spending summary nudges                                                                                       |
| `embed_category_rule`              | After a UserCategoryRule is created   | Generates and stores a vector embedding for Tier 2c                                                                        |
| `recalculate_carried_over_cascade` | After a past-month assignment edit    | Re-stamps `carried_over` forward to today for the affected category                                                        |

### Beat schedule

| Schedule                 | Task                    |
| ------------------------ | ----------------------- |
| Daily 7:05 AM WAT        | `deliver_queued_nudges` |
| Every Friday 5:00 PM WAT | `weekly_review_nudges`  |

---

## 9. Real-Time Events

`GET /ws/events` upgrades to a WebSocket connection. After authentication, the server pushes JSON delta events whenever data changes for the connected user. The mobile client uses these events to invalidate its TanStack Query caches and update the WatermelonDB local store without polling.

Event payload:

```json
{ "type": "delta", "resources": ["transactions", "budget", "accounts"] }
```

`notify_user(user_id, resources)` in `ws_manager.py` is called from any router or worker task that mutates data. All active WebSocket connections for that user receive the event.

---

## 10. Nudge Engine

`app/services/nudge_engine.py` evaluates four trigger types after every categorised transaction:

| Trigger           | Condition                                                      |
| ----------------- | -------------------------------------------------------------- |
| `threshold_80`    | Spending has consumed 80–99% of the category's assigned budget |
| `threshold_100`   | Spending has reached or exceeded 100% of assigned              |
| `large_single_tx` | A single debit consumed ≥ 40% of the category's budget         |
| `pay_received`    | A credit of ≥ ₦50,000 arrived (`category_id = NULL`)           |

**Deduplication:** Only one nudge per `(user, trigger_type, category_id, WAT calendar day)` is created. `threshold_100` supersedes `threshold_80` for the same category on the same day.

**Quiet hours:** Derived from `user.nudge_settings.quiet_hours_start/end` (stored as `HH:MM` WAT). During quiet hours, `nudge.delivered_at` is left `NULL` and the nudge is held for the 7:05 AM batch delivery.

**Fatigue limit:** `user.nudge_settings.fatigue_limit` (default 3) caps total nudges per WAT calendar day. One nudge per category per day is enforced independently.

Message templates use Pidgin English and are written in `nudge_engine.py`. Example: `"⚠️ {category_name} don reach 80%"`.

---

## 11. Adding a Bank

1. Create a directory under `app/services/ingestion/banks/<bank_slug>/`.
2. Create an `__init__.py` that imports and registers your parsers.
3. Implement whichever protocols apply (`EmailBankParser`, `StatementBankParser`, `ReceiptBankParser`) from `app/services/ingestion/base.py`.
4. Register the bank in `app/services/ingestion/registry.py` by adding it to the appropriate parser iterator.

No changes are needed to routers, channels, or worker tasks — the registry lookup handles dispatch automatically.

### Parser contract

`parse()` / `identify()` must be **pure functions** — no database access, no HTTP calls, no side effects. They receive raw bytes or a string and return a `ParsedTransaction` (or `None` on failure). All I/O happens in the channel dispatcher or Celery task.

Narration returned from `parse()` should be the raw bank narration string. `clean_narration()` is called automatically at the upsert layer — do not pre-clean inside the parser.

---

## 12. Database Migrations

Migrations live in `alembic/versions/` and are numbered sequentially (`0001_` … `0021_` as of v1.2.0).

```bash
# Apply all pending migrations
alembic upgrade head

# Create a new migration (auto-generate from model diff)
alembic revision --autogenerate -m "short_description"

# Check current state
alembic current

# Roll back one step
alembic downgrade -1
```

### Convention

- Migration filenames: `NNNN_short_snake_case_description.py`
- Always include a `downgrade()` function, even if it's a no-op with a comment explaining why rollback is destructive.
- Enum additions (`ALTER TYPE … ADD VALUE`) in PostgreSQL cannot be rolled back within a transaction — add a comment to `downgrade()` noting this.

---

## 13. Code Quality

### Type checking

```bash
# From apps/api with .venv activated
mypy app
```

All 87 source files must report 0 errors before merging. mypy is configured in `pyproject.toml`.

### Linting and formatting

```bash
# Install git hooks (one-time after cloning)
uv run pre-commit install

# Run manually
uv run pre-commit run --all-files
```

Two steps run on every commit:

| Step               | What it enforces                                                |
| ------------------ | --------------------------------------------------------------- |
| `ruff check --fix` | PEP 8, unused imports, upgrade patterns (E, F, I, UP rule sets) |
| `ruff format`      | Black-compatible formatting                                     |

### Money safety rules

- **Never use `float` for money.** All amounts are `int` (kobo).
- **Never store `available`.** Always derive it from `carried_over + assigned + activity`.
- **Never sum all credits for TBB.** Only `category_id IS NULL` transactions feed TBB.
- **All timestamps are UTC.** Convert to WAT only at the display layer or for nudge quiet-hour evaluation.
