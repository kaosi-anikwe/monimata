# MoniMata — Full System Architecture & Technical Blueprint

> **Living document.** Update this as the system evolves. Every architectural decision here
> was made deliberately — the "why" is documented alongside the "what."

---

## Table of Contents

1. [Project Mission & Core Problem](#1-project-mission--core-problem)
2. [Feature Scope](#2-feature-scope)
3. [The Fundamental Architecture Decision](#3-the-fundamental-architecture-decision)
4. [System Overview Diagram](#4-system-overview-diagram)
5. [Database Schema — PostgreSQL](#5-database-schema--postgresql)
6. [Mono Integration — Bank Sync](#6-mono-integration--bank-sync)
7. [Interswitch Integration — Bill Payment & Identity](#7-interswitch-integration--bill-payment--identity)
8. [Backend — FastAPI Endpoints](#8-backend--fastapi-endpoints)
9. [Background Jobs — Celery](#9-background-jobs--celery)
10. [Transaction Categorization Pipeline](#10-transaction-categorization-pipeline)
11. [AI Nudge Engine](#11-ai-nudge-engine)
12. [Budget Logic — The YNAB Model](#12-budget-logic--the-ynab-model)
13. [Frontend Architecture — React Native](#13-frontend-architecture--react-native)
14. [Offline-First Sync](#14-offline-first-sync)
15. [Security Architecture](#15-security-architecture)
16. [Infrastructure & Deployment](#16-infrastructure--deployment)
17. [Monorepo Structure (Nx)](#17-monorepo-structure-nx)
18. [Implementation Phases](#18-implementation-phases)
19. [Key Decisions Reference](#19-key-decisions-reference)

---

## 1. Project Mission & Core Problem

**MoniMata** (Pidgin: "Money Matters") is a zero-based budgeting app for Nigerians,
modelled after YNAB, enhanced with automatic transaction syncing via Mono and
AI-driven nudges delivered in Pidgin English.

**Tagline:** Every Kobo, Accounted For.

### The Three Problems Being Solved

**Fragmentation** — Nigerians routinely use 3–5 bank/fintech accounts (GTBank, Kuda,
Zenith, OPay). Knowing your "total balance" at any moment is a manual, error-prone
exercise.

**Friction** — Manual-entry budgeting apps fail because users forget to log small-ticket
daily spending (airtime top-ups, food transfers, transport). If the data isn't there,
the budget is fiction.

**Knowledge Gap** — Users can see what they spent, but the app doesn't tell them how to
change their behaviour. Data without guidance doesn't break cycles.

---

## 2. Feature Scope

| Feature                         | Description                                                                                                                                 | Priority       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Unified Bank Sync               | Automated daily fetching of transactions from Nigerian banks via Mono                                                                       | P0             |
| Zero-Based Budgeting            | "Give every Naira a job." All income assigned to categories before spending                                                                 | P0             |
| Category Targets                | Per-category monthly/weekly/date-based assignment targets (YNAB model)                                                                      | P0             |
| In-App Bill Payment             | Pay electricity, cable TV, airtime, data inside the app via Interswitch Quickteller. Budget updates in real time on success — no Mono delay | P0 (Hackathon) |
| BVN Identity Verification       | Verify user identity via Interswitch Passport during onboarding. Required for CBN sandbox compliance                                        | P0 (Hackathon) |
| Nudge Engine (AI)               | Personalized, Pidgin-infused spending alerts triggered by sync events                                                                       | P1             |
| Transaction Auto-Categorization | Python rules + ML to auto-label bank narrations                                                                                             | P1             |
| Offline-First UI                | Budget readable and usable without network                                                                                                  | P1             |
| Financial Literacy Hub          | Bite-sized "Wisdom Nuggets" and articles on saving/investing                                                                                | P1             |
| Auto-Assign                     | One-tap filling of underfunded categories from To Be Budgeted                                                                               | P2             |
| Spending Reports                | Trends, net worth, income vs. expense breakdowns                                                                                            | P2             |

---

## 3. The Fundamental Architecture Decision

### Cloud-Primary, Device-Cached

Financial records live in **PostgreSQL on the server**. The device holds a
**read-optimized local cache** (WatermelonDB) of recent data. This is non-negotiable
for the following reasons:

- Mono webhooks fire at your server, not the user's phone
- The nudge engine requires server-side analysis across transaction history
- Users switch phones (phone theft and upgrades are very common in Nigeria)
- NDPA data export and erasure rights require a server-side authoritative record
- Multi-device access must stay consistent

The device is never the source of truth. It is a fast, offline-capable read cache
that also queues writes (manual transactions, category assignments) for server sync.

### Money Representation

**Always store money in kobo (integer), never Naira floats.**

- ₦150.00 is stored as `15000` (kobo)
- Division to Naira happens only at the UI display layer
- Floating point arithmetic on money introduces rounding bugs that compound over time
- All amounts in the API, database, and business logic use kobo integers

---

## 4. System Overview Diagram

```
[GTBank / Kuda / Zenith / OPay]
          ↕  (Mono Connect — OAuth-style, no credentials stored)
      [Mono API]                          [Interswitch API]
          |                                       |
          |  webhook: mono.events.account_updated |  (called on-demand: bill pay, BVN verify)
          ↓                                       ↓
  [FastAPI Backend] ──────────────────────────────┤
          |                                       |
          ├──→ Verify HMAC-SHA512 webhook sig     ├──→ Quickteller: POST /api/v2/quickteller/payments
          ├──→ Enqueue Celery: fetch_transactions  ├──→ Passport:    GET  /api/v2/identity/bvn/{bvn}
          |                                       |
          ├──→ [PostgreSQL]         ← source of financial truth
          ├──→ [Redis]              ← Celery broker + task queue + session cache
          └──→ [Celery Workers]
                  ├── fetch_transactions
                  ├── categorize_transactions
                  ├── evaluate_nudges
                  ├── generate_nudge (template or LLM path)
                  └── nightly_reconciliation (Celery Beat, 3am WAT)
                          |
                          ↓
          [REST API + WebSocket server]
                          ↕
              [React Native App]
                  ├── Budget Screen
                  ├── Transactions Screen
                  ├── Accounts Screen
                  ├── Pay Bill Screen  ← Interswitch Quickteller UI
                  └── [WatermelonDB]   ← local cache: last 90 days of data
                          ↕
              [Device Keychain]    ← encryption key for SQLCipher
```

---

## 5. Database Schema — PostgreSQL

### Design Rules

- All primary keys are UUIDs (not auto-increment integers — avoids enumeration attacks)
- All timestamps are `TIMESTAMPTZ` (timezone-aware, stored as UTC)
- Money columns are `BIGINT` in kobo
- Sensitive columns (account numbers) are AES-256 encrypted at the application layer
  before storage
- `available` is never stored — always computed as `assigned - activity`

---

### `users`

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT,
  first_name      TEXT,
  password_hash   TEXT NOT NULL,          -- bcrypt, min cost 12
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login      TIMESTAMPTZ,
  nudge_settings  JSONB NOT NULL DEFAULT '{
    "quiet_hours_start": "23:00",
    "quiet_hours_end":   "07:00",
    "fatigue_limit":     3,
    "enabled":           true
  }',
  onboarded            BOOLEAN NOT NULL DEFAULT false,
  identity_verified    BOOLEAN NOT NULL DEFAULT false  -- set true after Interswitch BVN check
);
```

---

### `bank_accounts`

```sql
CREATE TABLE bank_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mono_account_id   TEXT UNIQUE NOT NULL,   -- Mono's opaque account reference
  institution       TEXT NOT NULL,          -- "GTBank", "Kuda", "OPay"
  account_name      TEXT NOT NULL,
  account_number    TEXT,                   -- last 4 digits only, AES-256 encrypted
  account_type      TEXT NOT NULL,          -- "SAVINGS" | "CURRENT"
  currency          TEXT NOT NULL DEFAULT 'NGN',
  balance           BIGINT NOT NULL DEFAULT 0,  -- kobo, updated on each sync
  last_synced_at    TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_accounts_user_id ON bank_accounts(user_id);
```

---

### `transactions`

```sql
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES bank_accounts(id),
  mono_id         TEXT UNIQUE,              -- Mono's transaction ID; NULL for manual entries
  date            DATE NOT NULL,
  amount          BIGINT NOT NULL,          -- kobo; negative = debit, positive = credit
  narration       TEXT NOT NULL,            -- raw bank description e.g. "TRANSFER TO CHOPNOW"
  type            TEXT NOT NULL,            -- "debit" | "credit"
  balance_after   BIGINT,                   -- account balance after this transaction (from Mono)
  category_id     UUID REFERENCES categories(id),  -- NULL until categorized
  memo            TEXT,                     -- user-written note
  is_split        BOOLEAN NOT NULL DEFAULT false,
  is_manual       BOOLEAN NOT NULL DEFAULT false,
  source          TEXT NOT NULL DEFAULT 'mono',
  -- "mono"         → ingested from Mono bank sync
  -- "interswitch"  → initiated via in-app Interswitch bill payment (recorded immediately)
  -- "manual"       → user-entered cash transaction
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transactions_user_id_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_account_id   ON transactions(account_id);
CREATE INDEX idx_transactions_category_id  ON transactions(category_id);
CREATE INDEX idx_transactions_mono_id      ON transactions(mono_id) WHERE mono_id IS NOT NULL;
```

---

### `transaction_splits`

When a single transaction covers multiple categories (e.g., a ₦5,000 Jumia order that
is partly Groceries, partly Household), it is split into sub-records. The amounts must
sum exactly to the parent transaction's amount.

```sql
CREATE TABLE transaction_splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES categories(id),
  amount          BIGINT NOT NULL,    -- kobo; must be positive
  memo            TEXT
);
-- Constraint: SUM(amount) of all splits for a transaction_id must equal ABS(transactions.amount)
-- Enforced at application layer in a DB transaction
```

---

### `category_groups`

```sql
CREATE TABLE category_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,          -- "Monthly Bills", "Lifestyle", "Savings"
  sort_order  INT NOT NULL DEFAULT 0,
  is_hidden   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `categories`

```sql
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES category_groups(id),
  name            TEXT NOT NULL,      -- "Rent", "Chow", "Airtime", "Emergency Fund"
  sort_order      INT NOT NULL DEFAULT 0,
  is_hidden       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_user_id   ON categories(user_id);
CREATE INDEX idx_categories_group_id  ON categories(group_id);
```

---

### `category_targets`

This is the YNAB "plan" concept. A target is an optional property of a category.
It defines how much the budget engine expects to assign to that category and on what
cadence. There are no standalone "goals" — the target lives on the category itself.

```sql
CREATE TABLE category_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID UNIQUE NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

  -- Target type drives how required_this_month is computed
  target_type     TEXT NOT NULL,
  -- Valid values:
  --   "monthly_set_aside"  → assign X every month regardless of current balance
  --   "monthly_fill_up_to" → top up until available = X each month
  --   "monthly_balance"    → keep at least X available at all times
  --   "weekly_set_aside"   → assign X every week (backend converts to monthly equiv)
  --   "by_date"            → save X total by a specific date (sinking fund)

  target_amount   BIGINT NOT NULL,    -- kobo

  -- Only for "by_date" type
  target_date     DATE,

  -- Repeating configuration (for "by_date" that recurs, e.g. annual rent)
  repeats           BOOLEAN NOT NULL DEFAULT false,
  repeat_cadence    TEXT,             -- "monthly" | "quarterly" | "annually"
  -- What happens the period AFTER hitting the target?
  on_refill         TEXT,
  -- "set_aside_again" → start accumulating from zero next period
  -- "fill_up_to"      → only top up if spent down from target

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`required_this_month` Logic (per target type):**

```python
from math import ceil
from datetime import date

def required_this_month(target, current_available: int, today: date) -> int:
    """Returns the kobo amount that should be assigned this month."""
    match target.target_type:
        case "monthly_set_aside":
            return target.target_amount

        case "monthly_fill_up_to" | "monthly_balance":
            shortfall = target.target_amount - current_available
            return max(0, shortfall)

        case "weekly_set_aside":
            weeks_remaining = weeks_left_in_month(today)  # count partial weeks
            return target.target_amount * weeks_remaining

        case "by_date":
            months_remaining = months_until(target.target_date, today)
            if months_remaining <= 0:
                return max(0, target.target_amount - current_available)
            still_needed = max(0, target.target_amount - current_available)
            return ceil(still_needed / months_remaining)

        case _:
            return 0
```

---

### `budget_months`

One row per (user, category, month). Records how much was assigned to that category
in that budget month. `activity` is the sum of transactions against that category
in the month. `available` is always derived: `assigned - activity`.

```sql
CREATE TABLE budget_months (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  month       DATE NOT NULL,          -- always the 1st of the month: 2026-03-01
  assigned    BIGINT NOT NULL DEFAULT 0,   -- kobo assigned by user
  activity    BIGINT NOT NULL DEFAULT 0,   -- kobo spent (sum of debits; updated on tx categorization)
  -- available = assigned - activity (computed, never stored)
  UNIQUE (user_id, category_id, month)
);
CREATE INDEX idx_budget_months_user_month ON budget_months(user_id, month);
```

**To Be Budgeted (TBB):** This is the most important derived value in the product.
It is never stored. It is always computed on demand:

```
TBB = SUM(credit transactions for the month)
      - SUM(budget_months.assigned for the month)
      + (previous month's TBB, if positive)
```

If TBB is negative, the user has over-assigned — they need to move money back out of
categories. The API always returns TBB as part of every budget response.

---

### `narration_category_map`

User-verified mappings of narration patterns to categories. This is the learning signal
that improves auto-categorization over time. Every time a user re-categorizes a
transaction, a row is upserted here.

```sql
CREATE TABLE narration_category_map (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  narration_key TEXT NOT NULL,      -- normalized narration fragment, e.g. "CHOPNOW"
  category_id   UUID NOT NULL REFERENCES categories(id),
  confidence    FLOAT NOT NULL DEFAULT 1.0,  -- 1.0 = user-confirmed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, narration_key)
);
```

---

### `nudges`

```sql
CREATE TABLE nudges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type  TEXT NOT NULL,
  -- "threshold_80" | "threshold_100" | "large_single_tx" | "anomaly_week"
  -- "pay_received" | "underfunded_goal" | "weekly_review" | "month_end_summary"
  category_id   UUID REFERENCES categories(id),   -- nullable; not all nudges are category-specific
  message       TEXT NOT NULL,                     -- the final Pidgin message shown to user
  delivered_at  TIMESTAMPTZ,                       -- null = queued, not yet delivered
  opened_at     TIMESTAMPTZ,
  dismissed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_nudges_user_id ON nudges(user_id, created_at DESC);
```

---

### `articles`

```sql
CREATE TABLE articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  body          TEXT NOT NULL,           -- Markdown
  tags          TEXT[] NOT NULL DEFAULT '{}',
  is_nugget     BOOLEAN NOT NULL DEFAULT false,  -- short-form nugget vs. long read
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_articles_slug ON articles(slug);
CREATE INDEX idx_articles_tags ON articles USING GIN(tags);
```

---

## 6. Mono Integration — Bank Sync

Mono is the bank data infrastructure. It handles connecting to Nigerian banks via their
internet banking portals and fetching transactions on your behalf.
**MoniMata never handles or stores bank login credentials.**

### Account Linking (One-Time)

```
1. App opens Mono Connect SDK (embedded webview)
2. User selects their bank, enters internet banking credentials
   → This flows directly through Mono's secure interface, not your servers
3. Mono Connect SDK returns a one-time auth_code to your React Native app
4. App sends: POST /accounts/connect  { "code": "<auth_code>" }
5. Backend calls Mono: POST https://api.withmono.com/account/auth
   Body: { "code": "<auth_code>" }
   Headers: { "mono-sec-key": "<MONO_SECRET_KEY>" }
6. Mono returns: { "id": "mono_account_id", ... }
7. You store bank_account row with this mono_account_id
8. Immediately trigger initial backfill: fetch all available transaction history
```

### Ongoing Sync — The 24-Hour Cycle

Mono re-syncs with the connected bank every ~24 hours. When sync completes, Mono fires
a webhook to your registered endpoint.

**Webhook event:** `mono.events.account_updated`

```json
{
  "event": "mono.events.account_updated",
  "data": {
    "account": {
      "id": "5f9d3e2b...",
      "_id": "5f9d3e2b..."
    }
  }
}
```

**CRITICAL: Always verify the Mono webhook signature before processing.**

```python
import hmac, hashlib

def verify_mono_webhook(request_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(
        key=secret.encode(),
        msg=request_body,
        digestmod=hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)

# In the endpoint:
# if not verify_mono_webhook(raw_body, request.headers["mono-webhook-secret"], MONO_WEBHOOK_SECRET):
#     raise HTTPException(status_code=401, detail="Invalid webhook signature")
```

Reject any webhook request that fails this check. Without this, an attacker can forge
fake transaction events.

**After verification:**

```
Webhook received → verify HMAC → enqueue Celery task: fetch_transactions(mono_account_id)
Celery worker → GET https://api.withmono.com/accounts/{id}/transactions?paginate=true
             → upsert transactions using mono_id as deduplication key (INSERT ... ON CONFLICT DO NOTHING)
             → update bank_accounts.balance and last_synced_at
             → enqueue categorize_transactions(new_transaction_ids)
```

### Manual Sync (User-Triggered)

When the user opens the app or manually pulls to refresh, the app calls:
`POST /accounts/{id}/sync`

This calls Mono's reauthorize/sync endpoint to trigger an immediate fetch rather than
waiting for the 24-hour window. Mono typically takes 30–120 seconds. Your server
returns `202 Accepted` immediately and uses a WebSocket event to notify the client
when new data is available.

**App-open is the primary sync trigger.** This is by design — it makes the sync feel
reactive to the user's intent rather than a mechanical background process.

### Nightly Reconciliation (Safety Net)

A Celery Beat job runs at 3:00 AM WAT daily. It checks all active bank accounts where
`last_synced_at` is older than 26 hours and re-triggers a fetch. This catches any
webhooks that were dropped due to server downtime.

### Why 24-Hour Delay Is Not a Problem for Nudges

The key insight: **you do not know a transaction happened until the next sync.**
The nudge engine must be designed around sync events, not transaction timestamps.

The nudge fires when the sync delivers new transactions — which could be the same
evening (app-open sync) or the next morning (Mono's 24hr auto-sync). This is
acceptable because:

1. The best nudges are pattern-based, not single-transaction alerts. A nudge saying
   "You've spent ₦45k on food the past 3 weeks and you're in that pattern again" is
   more valuable than "you spent ₦8k just now." The 24-hour accumulation helps.

2. App-open syncs can deliver nudges within minutes of transactions if the user opens
   the app that day. For active users, latency is low.

3. For scheduled nudges (weekly review, month-end summary), timing is deliberate and
   independent of individual transactions.

**Delivery gating:** If a nudge is generated at 3am by the nightly reconciliation,
queue it and deliver at 7:05am (user's quiet hours gate). Users get the nudge at
wake-up time, which feels purposeful, not mechanical.

---

## 7. Interswitch Integration — Bill Payment & Identity

Interswitch is the payment infrastructure layer. It provides two capabilities used
in MoniMata:

1. **Quickteller (Bill Payment)** — Pay electricity, cable TV, airtime, data, and
   other Nigerian billers from inside the app, debiting a linked bank account directly.
2. **Passport (Identity / BVN Verification)** — Verify a user's BVN during onboarding
   for KYC and CBN sandbox compliance.

### Why Interswitch Solves a Real Problem

The biggest operational friction in MoniMata is Mono's 24-hour sync delay. For any
transaction that happens outside the app, MoniMata only learns about it at the next
sync. For bills paid **inside** the app via Interswitch, MoniMata initiates the
payment itself — so it can record the transaction and update the budget **immediately**,
with zero delay. This is the only scenario in the product where budget reflection is
truly real-time.

### The Closed-Loop Bill Payment Flow

```
User has a "DSTV" category
  → target_type: "monthly_set_aside", target_amount: ₦15,000
  → assigned: ₦15,000, available: ₦15,000

User taps "Pay Bill" on the DSTV category
  → Opens bill payment bottom sheet
  → App calls GET /bills/billers?category=cable-tv to populate biller list
  → User selects "DStv", enters SmartCard number, confirms ₦15,000

App calls: POST /bills/pay
  → Backend calls Interswitch Quickteller API to initiate payment
  → Interswitch debits user's linked bank account
  → On success (HTTP 200 from Interswitch):
      1. Backend creates a transactions row immediately
         (source = "interswitch", category_id = DSTV category, amount = -1500000 kobo)
      2. budget_months.activity updated for that category + month
      3. WebSocket event "budget_updated" pushed to client
      4. Client WatermelonDB sync triggered

User sees DSTV available drop from ₦15,000 → ₦0 in real time.
No waiting for Mono's next 24-hour cycle.
```

### The Critical Deduplication Problem

When Mono eventually syncs and sees the same DSTV debit on the bank statement, you
must not create a duplicate transaction. Handle this by:

1. When an Interswitch payment succeeds, store the Interswitch transaction reference
   in a `interswitch_ref` column on the transaction row.
2. When Mono brings in a transaction, before upserting, check if a transaction already
   exists for that account, same date, same amount (±₦1), and `source = "interswitch"`.
3. If match found: update the existing row's `mono_id` instead of creating a new row.
4. Log the merge so it can be audited.

```python
def find_interswitch_duplicate(
    account_id: str, date: date, amount: int
) -> Transaction | None:
    """Check if an Interswitch-originated transaction already covers this Mono entry."""
    return db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.source == "interswitch",
        Transaction.date == date,
        Transaction.amount.between(amount - 100, amount + 100),  # ±₦1 tolerance
        Transaction.mono_id == None,  # not yet matched
    ).first()
```

### Schema Addition for Interswitch Transactions

```sql
-- Add to transactions table
ALTER TABLE transactions
  ADD COLUMN interswitch_ref TEXT UNIQUE;  -- Interswitch payment reference; NULL for non-IS transactions
```

### BVN Verification — Onboarding Flow

```
1. User completes registration (email + password)
2. Before linking any bank account, app prompts for BVN
3. App calls: POST /auth/verify-bvn  { "bvn": "12345678901" }
4. Backend calls Interswitch Passport API:
     GET https://passport.interswitchng.com/passport/oauth/token  (get access token)
     GET https://api.interswitchng.com/identity/api/v1/customers/{bvn}
5. Response includes first_name, last_name, date_of_birth
6. Backend compares name against registration name (fuzzy match, >70% similarity)
7. On match: sets users.identity_verified = true
8. On mismatch: returns 422 with "Name on BVN does not match your registration"
9. Users with identity_verified = false cannot link bank accounts
```

This ensures every MoniMata user is KYC-verified before they connect a bank —
a requirement for operating under the CBN Regulatory Sandbox.

### Interswitch API Reference

| Operation                | Method | Endpoint                                                                   |
| ------------------------ | ------ | -------------------------------------------------------------------------- |
| Get OAuth token          | POST   | `https://passport.interswitchng.com/passport/oauth/token`                  |
| Get biller categories    | GET    | `https://api.interswitchng.com/quickteller/api/v5/services/`               |
| Get billers in category  | GET    | `https://api.interswitchng.com/quickteller/api/v5/services/{categoryId}`   |
| Validate customer number | POST   | `https://api.interswitchng.com/quickteller/api/v5/services/customers`      |
| Initiate payment         | POST   | `https://api.interswitchng.com/quickteller/api/v5/payments/requests`       |
| Query payment status     | GET    | `https://api.interswitchng.com/quickteller/api/v5/payments/requests/{ref}` |
| BVN lookup               | GET    | `https://api.interswitchng.com/identity/api/v1/customers/{bvn}`            |

**Auth:** All Interswitch API calls use OAuth 2.0 client credentials flow
(`grant_type=client_credentials`) with your `client_id` and `client_secret`.
Cache the access token in Redis (it expires in 3600 seconds — always check expiry
before using and re-fetch if stale).

```python
class InterswitchClient:
    TOKEN_CACHE_KEY = "interswitch:access_token"

    async def get_token(self) -> str:
        cached = redis.get(self.TOKEN_CACHE_KEY)
        if cached:
            return cached.decode()
        response = await http.post(
            "https://passport.interswitchng.com/passport/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": settings.INTERSWITCH_CLIENT_ID,
                "client_secret": settings.INTERSWITCH_CLIENT_SECRET,
            }
        )
        token = response.json()["access_token"]
        redis.setex(self.TOKEN_CACHE_KEY, 3500, token)  # 3500s — slightly before expiry
        return token

    async def pay_bill(self, payload: dict) -> dict:
        token = await self.get_token()
        response = await http.post(
            "https://api.interswitchng.com/quickteller/api/v5/payments/requests",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        response.raise_for_status()
        return response.json()
```

### Idempotency for Bill Payments

Bill payments must be idempotent. If the app retries due to a network timeout, you
must not charge the user twice. Always generate a unique `requestReference` before
calling Interswitch and store it in the DB before making the API call:

```python
async def initiate_bill_payment(user_id: str, payload: BillPayRequest) -> BillPayResult:
    # 1. Generate idempotency key and persist BEFORE calling Interswitch
    ref = f"MM-{uuid4().hex[:16].upper()}"
    pending = create_pending_payment(user_id=user_id, ref=ref, payload=payload)

    try:
        result = await interswitch_client.pay_bill({**payload.dict(), "requestReference": ref})
    except Exception:
        mark_payment_failed(pending.id)
        raise

    # 2. Only record transaction after confirmed success
    record_interswitch_transaction(user_id, pending, result)
    update_budget_activity(user_id, payload.category_id, payload.amount)
    push_websocket_event(user_id, "budget_updated")
    return result
```

---

## 8. Backend — FastAPI Endpoints

### Auth

```
POST   /auth/register
POST   /auth/login              → returns { access_token, refresh_token }
POST   /auth/refresh            → body: { refresh_token } → returns new access_token
POST   /auth/logout             → invalidates refresh token in Redis
POST   /auth/request-otp        → phone-based OTP (for passwordless login option)
POST   /auth/verify-otp
POST   /auth/verify-bvn         → body: { bvn } → calls Interswitch Passport; sets identity_verified
```

**Token strategy:**

- Access token: JWT, 15-minute expiry, signed with RS256
- Refresh token: opaque random string, 7-day expiry, stored in Redis keyed by user_id
- On mobile: store access token in memory; store refresh token in device Keychain

---

### Bank Accounts

```
POST   /accounts/connect                  → exchange Mono auth_code for account
GET    /accounts                          → list all linked accounts + current balances
DELETE /accounts/{id}                     → unlink account
POST   /accounts/{id}/sync               → trigger manual sync (returns 202)
GET    /accounts/{id}/sync-status        → { syncing: bool, last_synced_at: timestamp }
```

---

### Transactions

```
GET    /transactions                      → paginated list
       query params: page, limit, account_id, category_id, start_date, end_date, uncategorized
GET    /transactions/{id}
PATCH  /transactions/{id}                 → update category_id, memo
POST   /transactions/{id}/split           → body: [{ category_id, amount, memo }]
DELETE /transactions/{id}/split           → remove split, revert to single category
POST   /transactions/manual               → create cash/manual transaction
DELETE /transactions/{id}                 → only allowed if is_manual = true
```

---

### Budget

```
GET    /budget?month=YYYY-MM              → full budget: all groups → categories → assigned/activity/available
                                          → also returns tbb (To Be Budgeted)
                                          → also returns required_this_month per category (from targets)
PATCH  /budget/{category_id}?month=       → body: { assigned: <kobo> } — set assignment
POST   /budget/move                       → body: { from_category_id, to_category_id, amount }
GET    /budget/tbb?month=                 → just the To Be Budgeted number
GET    /budget/underfunded?month=         → list of categories where available < required_this_month
POST   /budget/auto-assign?month=         → fill underfunded categories from TBB (sorted by urgency)
```

**Auto-assign sort order:**

1. `by_date` targets sorted by closest `target_date` first
2. `monthly_set_aside` categories
3. `monthly_fill_up_to` / `monthly_balance` categories
4. `weekly_set_aside` categories

Each category receives `required_this_month - current_available` from TBB.
Stops when TBB hits zero. Returns list of still-underfunded categories.
All assignments happen in a single atomic DB transaction.

---

### Category Groups

```
GET    /category-groups
POST   /category-groups
PATCH  /category-groups/{id}
DELETE /category-groups/{id}              → only if empty; otherwise archive
PATCH  /category-groups/{id}/sort
```

---

### Categories

```
GET    /categories                        → all categories, nested under groups
POST   /categories
PATCH  /categories/{id}
DELETE /categories/{id}                   → only if no uncleared transactions; else hide
PATCH  /categories/{id}/sort
GET    /categories/{id}/target
PUT    /categories/{id}/target            → create or replace target (upsert)
DELETE /categories/{id}/target            → remove target (category becomes target-less)
```

---

### Reports (Read-only)

```
GET    /reports/spending-by-category?month=
GET    /reports/spending-trend?category_id=&months=N
GET    /reports/income-vs-expense?month=
GET    /reports/net-worth                 → sum of all account balances
```

---

### Nudges

```
GET    /nudges                            → recent nudges, paginated
POST   /nudges/{id}/open                 → mark opened (used for fatigue tracking)
POST   /nudges/{id}/dismiss
PATCH  /nudges/settings                  → update quiet_hours, fatigue_limit, enabled
```

---

### Sync (Delta Sync for WatermelonDB)

```
GET    /sync/pull?last_pulled_at=<timestamp>   → returns { changes, timestamp }
POST   /sync/push                              → body: { changes } — sends local writes
```

These two endpoints are the backbone of the offline-first sync system.
See Section 14 for full detail.

---

### Knowledge Hub

```
GET    /content/articles?tag=&is_nugget=
GET    /content/articles/{slug}
GET    /content/nuggets                   → short-form nuggets only
```

---

### WebSocket

```
WS     /ws                                → authenticated via ?token=<access_token>
```

Server-sent events:

```json
{ "type": "sync_complete", "account_id": "..." }
{ "type": "nudge",  "nudge_id": "...", "message": "..." }
{ "type": "budget_updated" }
```

---

### Webhooks (Internal — Not for App Clients)

```
POST   /webhooks/mono                     → Mono account update events (HMAC-verified)
```

---

### Bill Payment (Interswitch Quickteller)

```
GET    /bills/categories                  → list Interswitch biller categories
                                           (Electricity, Cable TV, Airtime, Data, Water, etc.)
GET    /bills/billers?category=<id>       → list billers within a category
POST   /bills/validate                    → validate a customer/meter/smartcard number
                                           body: { biller_id, customer_id }
                                           returns: { customer_name, amount_due? }
POST   /bills/pay                         → initiate payment via Interswitch
                                           body: { biller_id, customer_id, amount, account_id, category_id }
                                           returns: { ref, status, transaction_id }
                                           On success: records transaction (source="interswitch"),
                                           updates budget_months.activity immediately
GET    /bills/pay/{ref}/status            → query Interswitch for payment status (for retries/polling)
GET    /bills/history                     → user's in-app bill payment history (source="interswitch" filter)
```

**Important:** `POST /bills/pay` requires `identity_verified = true` on the user.
Users who have not completed BVN verification cannot initiate payments.

---

### NDPA Compliance

```
GET    /user/data-export                  → returns a signed S3/R2 URL for full data download
DELETE /user/account                      → full cascading hard delete (30-day recovery window)
```

---

## 9. Background Jobs — Celery

Broker and result backend: **Redis**
Scheduler: **Celery Beat**

### Task Definitions

**`fetch_transactions(mono_account_id: str)`**

- Triggered by: Mono webhook, POST /accounts/{id}/sync, nightly reconciliation
- Calls Mono `GET /accounts/{mono_account_id}/transactions?paginate=true`
- Fetches all pages since `last_synced_at`
- Upserts rows using `mono_id` as conflict key (`INSERT ... ON CONFLICT (mono_id) DO NOTHING`)
- Updates `bank_accounts.balance` and `last_synced_at`
- Enqueues `categorize_transactions(new_transaction_ids)`
- Sends WebSocket event `sync_complete` to the user

**`categorize_transactions(transaction_ids: List[str])`**

- Triggered by: end of `fetch_transactions`
- Runs categorization pipeline (see Section 10) for each transaction
- Updates `transactions.category_id`
- Updates `budget_months.activity` for affected category/month combinations
- Enqueues `evaluate_nudges(user_id, transaction_id)` for each transaction

**`evaluate_nudges(user_id: str, transaction_id: str)`**

- Checks all nudge trigger rules for this transaction
- Checks fatigue limits (max 3/day, max 1/day per category)
- If rule fires and fatigue allows: enqueues `generate_nudge(...)`

**`generate_nudge(user_id: str, trigger_type: str, context: dict)`**

- Template path (80% of cases): selects template, fills variables, stores in `nudges` table
- LLM path (20% of cases — weekly reviews, anomaly nudges): calls LLM API with
  sanitized aggregated context (see Section 11)
- Checks quiet hours: if within quiet window, sets `delivered_at = NULL` (queued)
- Delivers via FCM push notification when `delivered_at` is set
- Sends WebSocket event `nudge` if user is currently online

**`deliver_queued_nudges()`** — Celery Beat: every day at 7:05 AM WAT

- Finds all nudges where `delivered_at IS NULL` and `created_at < today 07:00`
- Delivers them via FCM

**`weekly_review_nudges()`** — Celery Beat: every Friday, 5:00 PM WAT

- Fetches all active users
- For each user, generates a weekly summary nudge (LLM path)
- Staggers delivery over a 90-minute window: `delivery_time = base + random(0, 5400) seconds`
- This prevents all users receiving identical messages at identical times

**`month_end_summary()`** — Celery Beat: last day of month, 8:00 PM WAT

- Same staggered delivery approach as weekly review

**`nightly_reconciliation()`** — Celery Beat: every day at 3:00 AM WAT

- Finds all accounts where `last_synced_at < now() - interval '26 hours'`
- Enqueues `fetch_transactions` for each stale account

---

## 10. Transaction Categorization Pipeline

Raw bank narrations are opaque strings like `"TRANSFER TO CHOPNOW 07032026"` or
`"POS PURCHASE ACCESS BANK LEKKI 000234"`. The pipeline converts these to category
assignments in order of confidence.

```
Step 1: Exact deduplication
  → Check narration_category_map for this user
  → If found with confidence = 1.0: assign and stop

Step 2: Global merchant dictionary
  → Maintain a server-side lookup: { "CHOPNOW": "Food/Delivery", "BOLT": "Transport", ... }
  → Match substring of normalized narration (uppercase, no punctuation)
  → If matched: assign with confidence 0.9

Step 3: Keyword/regex rules
  → "AIRTIME" | "RECHARGE" | "DND"     → "Airtime & Data"
  → "UBER" | "BOLT" | "TAXIFY"         → "Transport"
  → "NETFLIX" | "SPOTIFY" | "SHOWMAX"  → "Subscriptions"
  → "SALARY" | "PAYROLL"               → matches income (credit transactions only)
  → etc.

Step 4: User's historical pattern
  → Has this user previously assigned transactions with similar narrations?
  → Fuzzy match against narration_category_map (confidence < 1.0 rows)

Step 5: ML classifier (Phase 2 — not launch requirement)
  → A small fine-tuned text classifier on Nigerian bank narrations
  → Can be a scikit-learn model, not a heavy LLM — fast and cheap
  → Assign with confidence 0.7

Step 6: Uncategorized
  → Leave category_id NULL
  → Increment a counter: "N transactions need your attention"
  → Surface in app as an action item
```

Every time a user manually assigns or re-assigns a category:

1. Update `transactions.category_id`
2. Upsert into `narration_category_map` (confidence = 1.0)
3. Retroactively apply to uncategorized transactions with the same narration key
4. Recalculate `budget_months.activity` for affected months

The merchant dictionary is a shared, platform-wide resource that improves for all users
as you curate it. The `narration_category_map` is per-user and captures personal patterns.

---

## 11. AI Nudge Engine

### Trigger Taxonomy

| Trigger              | When                                                                                  | Data Required                    |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `threshold_80`       | Category reaches 80% of assigned (activity/assigned ≥ 0.8)                            | category, spent, remaining       |
| `threshold_100`      | Category fully exhausted                                                              | category, overage amount         |
| `large_single_tx`    | One transaction > 40% of category's assigned amount                                   | transaction, category            |
| `anomaly_week`       | This week's spending in a category is 2× the average of the same week in prior months | category, this week, avg week    |
| `pay_received`       | Credit transaction > ₦50k, or > user's estimated monthly income                       | amount, account                  |
| `underfunded_target` | 7 days before month-end, a `by_date` target is behind expected pace                   | category, target_date, shortfall |
| `weekly_review`      | Every Friday — not transaction-triggered                                              | Full week summary                |
| `month_end_summary`  | Last day of month                                                                     | Full month summary               |

### Fatigue Prevention Rules

```python
MAX_NUDGES_PER_DAY = 3
MAX_NUDGES_PER_CATEGORY_PER_DAY = 1
ENGAGEMENT_WINDOW = 3          # Last N nudges to check for engagement
LOW_ENGAGEMENT_MULTIPLIER = 2  # If user hasn't opened last 3 nudges, halve frequency
PAYDAY_GRACE_HOURS = 48        # After pay_received, suppress budget-pressure nudges

def can_send_nudge(user_id, category_id=None) -> bool:
    today_count = count_nudges_today(user_id)
    if today_count >= MAX_NUDGES_PER_DAY:
        return False

    if category_id:
        category_count = count_nudges_today(user_id, category_id)
        if category_count >= MAX_NUDGES_PER_CATEGORY_PER_DAY:
            return False

    # Low engagement suppression
    last_3 = get_last_n_nudges(user_id, ENGAGEMENT_WINDOW)
    if all(n.opened_at is None for n in last_3):
        # User hasn't engaged — enforce minimum time between nudges
        last_nudge_time = last_3[0].created_at if last_3 else None
        if last_nudge_time and (now() - last_nudge_time) < timedelta(hours=12):
            return False

    return True
```

### Message Generation: Two Paths

**Path A — Template (80% of nudges, zero LLM cost)**

Used for: `threshold_80`, `threshold_100`, `large_single_tx`, `pay_received`,
`underfunded_target`

```python
TEMPLATES = {
    "threshold_80": [
        "Oshey! {name}, your {category} budget don reach 80%. "
        "Only ₦{remaining:,.0f} remain till month end.",

        "Careful o! You don spend ₦{spent:,.0f} for {category}. "
        "Just ₦{remaining:,.0f} remain — {days_left} days to go.",
    ],
    "threshold_100": [
        "E don do! Your {category} budget don finish. "
        "Move money from another category or go light.",
    ],
    "pay_received": [
        "Owo don enter! ₦{amount:,.0f} credit dey your {bank} account. "
        "Time to give every Naira a job 🎯",
    ],
    "large_single_tx": [
        "Big spend alert! ₦{amount:,.0f} from one transaction — "
        "that's {pct:.0f}% of your {category} budget. "
        "Everything dey alright?",
    ],
}

def generate_template_nudge(trigger_type: str, context: dict) -> str:
    templates = TEMPLATES[trigger_type]
    template = random.choice(templates)  # slight randomness prevents repetition
    return template.format(**context)
```

**Path B — LLM (20% of nudges — weekly/monthly summaries, anomaly analysis)**

Used for: `weekly_review`, `month_end_summary`, `anomaly_week`

The LLM receives only aggregated, anonymized data. **No raw narrations, no account
numbers, no bank names, no PII.**

```python
def build_llm_context(user_id: str, trigger_type: str) -> dict:
    """Builds the sanitized payload for the LLM. No PII."""
    if trigger_type == "weekly_review":
        return {
            "user_first_name": get_user_first_name(user_id),
            "event": "weekly_review",
            "week_ending": str(date.today()),
            "top_categories": [
                {
                    "name": cat.name,
                    "spent_kobo": cat.week_activity,
                    "budgeted_kobo": cat.assigned,
                    "pct": round(cat.week_activity / cat.assigned * 100)
                }
                for cat in get_top_categories(user_id, n=5)
            ],
            "total_spent_kobo": get_week_total_spending(user_id),
            "to_be_budgeted_kobo": get_tbb(user_id),
            "days_to_month_end": days_until_month_end(),
        }
```

**System prompt (fixed — not user-configurable):**

```
You are MoniMata, a friendly Nigerian financial assistant. You speak in a warm mix
of English and Pidgin. You are encouraging and never judgmental about spending.
Write a nudge message of maximum 2 sentences. Use ₦ for amounts (divide kobo by 100).
Be specific with numbers. End with one concrete, actionable suggestion.
Do not mention bank names, account numbers, or transaction IDs.
```

**LLM choice:** GPT-4o-mini or Claude Haiku. At ~150 output tokens per call, and
~15% of nudges using the LLM path, cost at 5,000 users ≈ ₦30,000–₦50,000/month.

### On-Device Nudges (Client-Side)

For immediate delivery (e.g., user opens app after spending), the app can evaluate
simple threshold rules locally in TypeScript using WatermelonDB queries:

```typescript
// Runs after WatermelonDB sync completes
async function evaluateLocalNudges(db: Database): Promise<LocalNudge[]> {
  const budgetMonths = await db.collections
    .get("budget_months")
    .query(Q.where("month", currentMonthISO()))
    .fetch();

  const nudges: LocalNudge[] = [];
  for (const bm of budgetMonths) {
    const pct = bm.activity / bm.assigned;
    if (pct >= 0.8 && pct < 1.0) {
      nudges.push({ type: "threshold_80", categoryId: bm.categoryId, pct });
    }
  }
  return nudges;
}
```

These fire as local OS notifications immediately after sync — no server round-trip.
The server-side nudge engine, which does deeper analysis and LLM generation, runs
asynchronously and may deliver a richer notification minutes later. Together they
cover both speed and depth.

---

## 12. Budget Logic — The YNAB Model

MoniMata's budget is a direct implementation of zero-based budgeting as practised
in YNAB. Every Naira that enters the system must be assigned to a category before
it is spent.

### The Core Invariant

```
To Be Budgeted (TBB) = Total Income Received - Total Assigned Across All Categories
```

TBB must never be negative. If it goes negative, the user has over-assigned — they
have promised more money than they have. The UI must make this immediately visible
with a red TBB indicator.

### Budget Hierarchy

```
Budget (monthly scope)
└─ Category Group  (e.g., "Monthly Bills")
   └─ Category     (e.g., "Rent")
      ├─ assigned:           ₦120,000   ← user sets this
      ├─ activity:           ₦0         ← computed from transactions
      ├─ available:          ₦120,000   ← assigned - activity (never stored)
      └─ target (optional):
           type: "monthly_set_aside"
           amount: ₦120,000
           required_this_month: ₦120,000
           underfunded_by: ₦0
```

### Moving Money

When a user runs out of budget in a category, they move money from another category.
This is the fundamental YNAB discipline. The API endpoint is:

```
POST /budget/move
Body: { from_category_id, to_category_id, amount, month }
```

This atomically decrements `assigned` on the source and increments on the destination.
Both categories' `available` values update immediately in response.

### Carrying Forward

At month rollover (1st of each month):

- `monthly_set_aside` and `monthly_fill_up_to` targets start fresh at 0 assigned
- Unspent `available` from the previous month is carried forward into the new month's
  `available` for that category (this is YNAB's "Age of Money" mechanism)
- The carry-forward is: `new_available = prev_available + new_assigned`
- This means a category with ₦10k left over from March and ₦15k assigned in April
  has ₦25k available in April

---

## 13. Frontend Architecture — React Native

### Tech Stack

- **React Native** (TypeScript) with Expo or bare workflow
- **WatermelonDB** — local SQLite database with sync protocol
- **TanStack Query** — server state, API caching, background refetch
- **Redux Toolkit** (minimal) — UI state only (selected month, open category, etc.)
- **React Navigation** — tab + stack navigation
- **Notifee or Expo Notifications** — local notifications for on-device nudges

### Screen Architecture

```
App Root
├─ Auth Stack
│   ├─ Welcome / Onboarding
│   ├─ Register
│   ├─ BVN Verification   ← Interswitch Passport; required before bank linking
│   ├─ Login
│   └─ Link Bank Account (Mono Connect webview)
│
└─ Main Tabs (after auth)
    ├─ Budget Tab          → category groups → categories → assign amounts
    ├─ Transactions Tab    → timeline, search, filter by date/category/account
    ├─ Accounts Tab        → linked banks, balances, last sync time, add account
    ├─ Reports Tab         → spending by category, trends, net worth
    └─ Profile Tab         → nudge settings, data export, linked accounts, logout

Bill Payment (bottom sheet, not a tab)
  Opens from any category → biller category list → biller → customer ID → confirm → pay
  Powered by Interswitch Quickteller
  On payment success: category available updates in real time (no sync delay)
```

### Budget Screen Behaviour

- Shows the current month by default; user can navigate to past months
- TBB displayed prominently at the top in green (positive) or red (negative)
- Tapping a category opens an assignment field and shows its target/required amount
- Red indicator on underfunded categories (available < required_this_month)
- "Auto-Assign" button fills all underfunded from TBB in one tap (calls `/budget/auto-assign`)
- Pull-to-refresh triggers a manual Mono sync

---

## 14. Offline-First Sync

### Architecture

WatermelonDB provides a built-in `synchronize()` function that expects two server
endpoints:

```
GET  /sync/pull?last_pulled_at=<unix_ms_timestamp>
POST /sync/push
```

**Pull response shape (server → client):**

```json
{
  "changes": {
    "transactions": {
      "created": [...],
      "updated": [...],
      "deleted": ["id1", "id2"]
    },
    "categories": { "created": [...], "updated": [...], "deleted": [] },
    "budget_months": { "created": [...], "updated": [...], "deleted": [] },
    "nudges": { "created": [...], "updated": [...], "deleted": [] }
  },
  "timestamp": 1741392000000
}
```

**Push request shape (client → server):**

```json
{
  "changes": {
    "transactions": {
      "created": [{ "_id": "local-uuid", "is_manual": true, ... }],
      "updated": [{ "id": "server-uuid", "memo": "Updated memo", ... }],
      "deleted": []
    },
    "budget_months": {
      "updated": [{ "id": "...", "assigned": 12000000 }]
    }
  }
}
```

The server processes push before pull in each sync cycle to ensure the client sees
its own writes reflected back.

### What Lives in WatermelonDB

| Data                | Sync'd | Retention               |
| ------------------- | ------ | ----------------------- |
| Transactions        | Yes    | Last 90 days            |
| Categories + groups | Yes    | All                     |
| Budget months       | Yes    | Current + last 2 months |
| Category targets    | Yes    | All                     |
| Nudges              | Yes    | Last 30, unread         |
| Articles/Nuggets    | No     | Fetched on-demand       |
| Auth tokens         | No     | Keychain / AsyncStorage |
| NDPA audit logs     | No     | Server-only             |

### Sync Triggers

1. **App foreground** — on every `AppState` change from background to active
2. **Pull-to-refresh** — user manually triggers
3. **WebSocket `sync_complete` event** — server notifies when Mono fetch is done
4. **Periodic background fetch** — every 15 minutes when app has background fetch
   permission (iOS Background Fetch / Android WorkManager)

---

## 15. Security Architecture

| Concern                    | Implementation                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication             | JWT (RS256, 15-min access token) + rotating opaque refresh token (7 days, stored in Redis)                                             |
| API authorization          | All endpoints require valid JWT, except `/auth/*` and `/webhooks/mono`                                                                 |
| Row-level security         | Every query includes `WHERE user_id = current_user_id` — never trust client-supplied user_id                                           |
| Mono webhook auth          | HMAC-SHA512 signature verification on every incoming webhook (reject 401 if invalid)                                                   |
| Interswitch auth           | OAuth 2.0 client credentials; access token cached in Redis; `client_secret` stored in secrets manager, never in code                   |
| Interswitch bill pay gate  | `POST /bills/pay` checks `identity_verified = true` before calling Interswitch; prevents unverified users from initiating payments     |
| Interswitch idempotency    | Payment reference generated and persisted before the Interswitch API call; prevents duplicate charges on retry                         |
| Secrets management         | All API keys and DB credentials in environment variables. Never in code or git. Use Railway/Render secret vault or AWS Secrets Manager |
| PII at rest                | Account numbers column: AES-256-GCM encrypted before DB insert. Keys in secrets manager                                                |
| Transport security         | HTTPS everywhere, HSTS header. Certificate pinning in React Native production builds                                                   |
| On-device data             | WatermelonDB encrypted with SQLCipher. Encryption key stored in iOS Keychain / Android Keystore                                        |
| Rate limiting              | 5 login attempts per 15 minutes per IP. 100 req/min on all other endpoints per user                                                    |
| NDPA compliance            | Data export as signed time-limited URL. Deletion is a hard cascading delete with 30-day soft-delete window                             |
| Dependency security        | Dependabot / Renovate for automated CVE alerts on all packages                                                                         |
| LLM data hygiene           | Never send raw narrations, account numbers, bank names, or any PII to external LLM APIs — aggregated stats and category names only     |
| Open source considerations | Core engine is AGPL. Mono API keys, LLM keys, and Nudge model weights are in environment variables and are never open-sourced          |

---

## 16. Infrastructure & Deployment

Target: **zero to first 5,000 users** with ~$50–80/month infrastructure cost.

| Service            | Provider                       | Notes                                                          |
| ------------------ | ------------------------------ | -------------------------------------------------------------- |
| Backend (FastAPI)  | Railway or Render              | Auto-deploy from GitHub on push to main                        |
| Celery Workers     | Railway worker dyno            | Same codebase, `celery -A app.worker worker` start command     |
| Celery Beat        | Railway one-off or Render cron | Runs the scheduled jobs                                        |
| PostgreSQL         | Railway PostgreSQL or Supabase | Supabase has a built-in REST and realtime layer for future use |
| Redis              | Railway Redis or Upstash       | Upstash serverless is very cheap at low request volume         |
| File storage       | Cloudflare R2                  | Data exports, article images, cheap egress                     |
| Push notifications | Firebase Cloud Messaging (FCM) | Free tier is sufficient for 5k users                           |
| Error monitoring   | Sentry                         | Free tier: 5k errors/month                                     |
| Uptime monitoring  | Better Uptime or UptimeRobot   | Free tier available                                            |
| CI/CD              | GitHub Actions                 | Run tests, lint, type-check on every PR                        |

### Environment Variables Required

```bash
# Core
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SECRET_KEY=<random 64-byte hex>   # for JWT signing
JWT_PRIVATE_KEY=<RS256 private key>
JWT_PUBLIC_KEY=<RS256 public key>

# Mono
MONO_SECRET_KEY=<from Mono dashboard>
MONO_WEBHOOK_SECRET=<from Mono dashboard — for HMAC verification>

# Interswitch
INTERSWITCH_CLIENT_ID=<from Interswitch developer portal>
INTERSWITCH_CLIENT_SECRET=<from Interswitch developer portal>
INTERSWITCH_ENV=sandbox   # "sandbox" | "production"

# AI
OPENAI_API_KEY=<for GPT-4o-mini nudges>  # or ANTHROPIC_API_KEY for Claude Haiku

# Notifications
FIREBASE_SERVICE_ACCOUNT_JSON=<FCM credentials>

# Encryption
AES_ENCRYPTION_KEY=<32-byte key for PII field encryption>
```

---

## 17. Monorepo Structure (Nx)

```
monimata/
├── apps/
│   ├── api/                        # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── routers/            # One file per endpoint group
│   │   │   │   ├── auth.py
│   │   │   │   ├── accounts.py
│   │   │   │   ├── transactions.py
│   │   │   │   ├── budget.py
│   │   │   │   ├── categories.py
│   │   │   │   ├── nudges.py
│   │   │   │   ├── reports.py
│   │   │   │   ├── sync.py
│   │   │   │   ├── content.py
│   │   │   │   └── webhooks.py
│   │   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── schemas/            # Pydantic request/response schemas
│   │   │   ├── services/           # Business logic (not in routers)
│   │   │   │   ├── categorization.py
│   │   │   │   ├── nudge_engine.py
│   │   │   │   ├── budget_logic.py
│   │   │   │   └── mono_client.py
│   │   │   ├── worker/             # Celery tasks
│   │   │   │   ├── tasks.py
│   │   │   │   └── beat_schedule.py
│   │   │   └── core/
│   │   │       ├── config.py       # Settings from env vars (pydantic-settings)
│   │   │       ├── security.py     # JWT, password hashing, AES encryption
│   │   │       └── database.py     # SQLAlchemy engine + session
│   │   ├── alembic/                # DB migrations
│   │   ├── tests/
│   │   └── pyproject.toml
│   │
│   └── mobile/                     # React Native app
│       ├── src/
│       │   ├── screens/
│       │   │   ├── Budget/
│       │   │   ├── Transactions/
│       │   │   ├── Accounts/
│       │   │   ├── Reports/
│       │   │   └── Profile/
│       │   ├── components/         # Shared UI components
│       │   │   └── BillPayment/    # Interswitch Quickteller bottom sheet + flow
│       │   ├── database/           # WatermelonDB models + schema
│       │   │   ├── models/
│       │   │   │   ├── Transaction.ts
│       │   │   │   ├── Category.ts
│       │   │   │   └── BudgetMonth.ts
│       │   │   ├── schema.ts
│       │   │   └── sync.ts         # Pull/push sync implementation
│       │   ├── services/
│       │   │   ├── api.ts          # Axios client + interceptors
│       │   │   ├── nudges.ts       # On-device nudge evaluation
│       │   │   ├── bills.ts        # Interswitch bill payment service
│       │   │   └── websocket.ts
│       │   ├── store/              # Redux Toolkit slices (UI state only)
│       │   └── utils/
│       │       └── money.ts        # kobo ↔ naira formatting utilities
│       └── package.json
│
├── libs/
│   └── shared-types/               # TypeScript types shared between mobile and any TS tooling
│       └── src/
│           └── index.ts            # Budget, Transaction, Category, Nudge interfaces
│
├── nx.json
├── package.json                    # Root workspace deps
├── PRD.txt
└── ARCHITECTURE.md                 # ← this file
```

---

## 18. Implementation Phases

Build in strict priority order. Do not start Phase N+1 until Phase N is shippable.

### Hackathon Build Plan (4 Days)

This is the compressed path for the Enyata × Interswitch Hackathon. The goal is a
working demo that tells a complete product story, not a fully production-hardened app.

**Day 1 — Foundation + Auth**

- [ ] Nx monorepo scaffold (FastAPI app + React Native app)
- [ ] PostgreSQL schema (core tables: users, bank_accounts, transactions, categories,
      category_groups, budget_months) + Alembic migrations
- [ ] Auth endpoints: register, login, refresh
- [ ] `POST /auth/verify-bvn` → Interswitch Passport BVN check + `identity_verified` flag
- [ ] Mono account linking (`POST /accounts/connect`) + initial transaction backfill
- [ ] React Native: Register screen → BVN verification screen → Link Bank Account screen

**Day 2 — Core Budget Loop**

- [ ] Mono webhook receiver (HMAC-verified) + `fetch_transactions` Celery task
- [ ] Basic auto-categorization (keyword rules, merchant dictionary)
- [ ] Category groups + categories CRUD
- [ ] Budget CRUD: assign, move money, TBB calculation
- [ ] `GET /budget?month=` full response
- [ ] WatermelonDB models + delta sync (`/sync/pull`, `/sync/push`)
- [ ] React Native: Budget screen (assign amounts, TBB indicator) + Transactions screen

**Day 3 — Interswitch Bill Payment**

- [ ] `GET /bills/categories` + `GET /bills/billers?category=`
- [ ] `POST /bills/validate` (customer number validation)
- [ ] `POST /bills/pay` → Interswitch Quickteller → record transaction immediately
      (source="interswitch") → update `budget_months.activity` → push `budget_updated`
      WebSocket event
- [ ] Interswitch deduplication logic (prevent double-entry when Mono later syncs same tx)
- [ ] React Native: BillPayment bottom sheet (biller list → customer ID → confirm → pay)
- [ ] WebSocket client connection for real-time budget updates

**Day 4 — Polish + Demo Story**

- [ ] 2–3 template-based nudges for the demo (`pay_received`, `threshold_80`,
      `pay_bill_success`)
- [ ] React Native: Accounts screen with sync status indicator
- [ ] Error states and loading indicators throughout
- [ ] Seed data script for a convincing demo state
- [ ] Fix sync edge cases; test full flow end-to-end
- [ ] Prepare demo script (see Section 7 for the pitch narrative)

---

### Phase 0 — Foundation (Backend skeleton)

- [ ] Nx monorepo scaffold
- [ ] FastAPI app with health check endpoint
- [ ] PostgreSQL schema (all tables) + Alembic migrations
- [ ] Celery + Redis setup with a test task
- [ ] Auth endpoints (register, login, refresh, logout)
- [ ] JWT middleware on all protected routes
- [ ] Environment config with pydantic-settings
- [ ] CI pipeline (GitHub Actions: lint, type-check, tests)

### Phase 1 — Core Loop (makes the app useful)

- [ ] Mono account linking endpoint + initial backfill
- [ ] Mono webhook receiver (HMAC-verified)
- [ ] `fetch_transactions` Celery task
- [ ] Transaction upsert with mono_id deduplication
- [ ] Basic auto-categorization (merchant dictionary + keyword rules)
- [ ] Category groups and categories CRUD
- [ ] Budget CRUD (assign, move money, TBB calculation)
- [ ] `/budget?month=` full budget response
- [ ] Delta sync endpoints (`/sync/pull`, `/sync/push`)
- [ ] React Native: WatermelonDB models + sync engine
- [ ] React Native: Budget screen (functional, no targets yet)
- [ ] React Native: Transactions screen with manual entry
- [ ] React Native: Accounts screen with sync status
- [ ] Interswitch BVN verification on onboarding
- [ ] Interswitch bill payment endpoints + Pay Bill bottom sheet
- [ ] Interswitch deduplication (prevent Mono re-importing paid bills)

### Phase 2 — Intelligence (makes the app sticky)

- [ ] Category targets schema + CRUD endpoints
- [ ] `required_this_month` calculation per target type
- [ ] `/budget/underfunded` and `/budget/auto-assign` endpoints
- [ ] Budget screen: target indicators + underfunded highlights
- [ ] Template-based nudge engine (no LLM — ship this fast)
- [ ] On-device nudge evaluation (local notifications after sync)
- [ ] FCM push notifications for server-side nudges
- [ ] Nudge fatigue logic (max 3/day, quiet hours, payday grace)
- [ ] Transaction re-categorization UI (builds merchant dictionary)
- [ ] WebSocket server + client connection

### Phase 3 — Differentiators

- [ ] LLM-powered weekly review nudges (GPT-4o-mini / Claude Haiku)
- [ ] Anomaly detection nudges (`anomaly_week`)
- [ ] Spending reports (category breakdown, trends, income vs expense)
- [ ] Knowledge Hub: article/nugget CRUD (admin) + reading UI
- [ ] NDPA: data export + account deletion endpoints
- [ ] Onboarding flow (first-time budget setup wizard)
- [ ] Month rollover logic (carry-forward, target reset)
- [ ] ML transaction categorization (fine-tuned sklearn classifier)

---

## 19. Key Decisions Reference

A quick lookup for "why did we do it this way?"

| Decision                | Choice                                                | Rationale                                                                                   |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Data storage primary    | PostgreSQL (server)                                   | Mono webhooks hit server; AI analysis is server-side; multi-device; NDPA compliance         |
| Device storage          | WatermelonDB cache                                    | Offline reads, fast UI, delta sync protocol built-in                                        |
| Money representation    | Integer kobo                                          | No floating point rounding bugs                                                             |
| Goals / sinking funds   | Category target (`category_targets` table)            | Mirrors YNAB: target is a property of the category, not a separate entity                   |
| `available` field       | Never stored, always computed                         | Ensures budget self-heals when transactions are re-categorized                              |
| Mono webhook security   | HMAC-SHA512 verification                              | Without this, anyone can POST fake transactions to your webhook                             |
| Interswitch role        | KYC (Passport) + in-app bill payment (Quickteller)    | Only two Interswitch integrations — both add genuine product value, not checkbox compliance |
| Interswitch real-time   | Bill payments recorded immediately on success         | Closes the Mono 24hr sync gap for transactions the user initiates from within the app       |
| Interswitch dedup       | Match on account + date + amount before Mono upsert   | Prevents double-counting when Mono later syncs the same bill debit from the bank            |
| Interswitch idempotency | Reference generated + persisted before API call       | User is never charged twice if network drops mid-payment                                    |
| Nudge timing            | Event-driven on sync completion, gated by quiet hours | More relevant than fixed cron; avoids 3am delivery                                          |
| Nudge message source    | Template (80%) + LLM (20%)                            | Templates are instant and free; LLM reserved for complex summaries                          |
| LLM data input          | Aggregated kobo + category names only                 | PII never leaves your servers; compliant with NDPA                                          |
| On-device AI            | No LLM; JS rule evaluation + templates                | Mid-range Nigerian Android (3–4GB RAM) cannot run a viable LLM locally                      |
| Sync efficiency         | Delta sync via `last_pulled_at` timestamp             | Data-efficient on expensive Nigerian mobile data plans                                      |
| User ID in queries      | Always filter by `user_id` server-side                | Never trust client-supplied IDs to avoid cross-user data leakage                            |
| Account numbers         | AES-256-GCM encrypted column                          | Reduces blast radius if DB is ever compromised                                              |
| Open source strategy    | AGPL core, private env vars for keys                  | Community trust without exposing API credentials or proprietary nudge weights               |
