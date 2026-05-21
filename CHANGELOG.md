# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Git tags follow the pattern `mobile/vX.Y.Z` and `api/vX.Y.Z`.

**Navigate to:** [Mobile App](#mobile-app) · [API](#api)

---

## Mobile App

### [0.3.0] - 2026-05-21

This is the first recorded changelog entry. It covers all features present at
the time of writing; future entries will document incremental changes only.

#### Added

**Authentication & Onboarding**

- Registration, login, forgot-password, and password-reset flows
- Email-based verification code screen for password resets
- Onboarding questionnaire (income type, housing situation, financial goals)
- Budget seed preview — generates a personalised starter budget from onboarding answers
- Marks onboarding complete and transitions to the main app

**Dashboard (Home tab)**

- Net worth card showing total assets across all accounts
- Monthly income and expense summary
- Guided tour for first-time users covering key dashboard elements
- Background sync on app foreground

**Budget tab**

- Zero-based budget view for the current (or any selected) month
- Per-category assigned / available breakdown with colour-coded indicators
- First-time walkthrough explaining zero-based budgeting concepts (shown once, dismissible)
- Edit mode via `budget-edit` screen:
  - Add, rename, reorder (drag-and-drop), hide, or delete categories and groups
  - Set spending targets per category (weekly / monthly / yearly / custom, with optional repeat)
  - Auto-assign feature to distribute available funds across unassigned categories

**Transactions tab**

- Transactions listed chronologically, grouped by day
- Full-text search bar
- Filter by account, category, date range, and transaction type
- Re-categorise any transaction via an inline bottom sheet
- Pull-to-refresh
- Transaction detail screen (`/transaction/[id]`):
  - Edit amount, memo, date, and category for manual transactions
  - Update category and memo for bank-synced transactions
  - Split a transaction across multiple categories (`/split-transaction`)
  - Delete manual transactions
  - Recurring transaction badge with stop option

**Accounts tab**

- Manually add bank accounts with institution name, account type, and opening balance
- Bank picker with supported Nigerian banks
- Per-account actions: rename, update balance, reconcile, upload bank statement (PDF), remove
- Pull-to-refresh
- Total balance card across all accounts
- Accessible from the Profile page as a stack screen with back navigation

**Nudges tab**

- In-app notification centre for actionable financial nudges
- Deep links from nudges to relevant screens
- Unread badge on the tab icon
- Nudge explanation sheet

**Knowledge Hub tab**

- Articles, video courses, and quizzes on personal finance topics
- Static content (CMS integration planned)

**Profile tab**

- User avatar, display name, and gamification streak
- Edit Profile screen — update first name, last name, email, and phone; username shown read-only as `username@moni-mata.ng`
- Notification Settings screen:
  - Enable / disable push notifications with OS permission request
  - Quiet hours (start and end time)
  - Fatigue limit (max nudges per day)
  - Nudge language preference (English / Pidgin)
- Biometric app-lock toggle (Face ID / fingerprint); auto-locks after 30 s in background
- About screen — app version, AGPL-3.0 open-source notice, link to GitHub repository
- Log out

**Receipts**

- Upload receipt images or PDFs for automatic transaction extraction
- Asynchronous backend processing with real-time status via WebSocket / push notification

**Security & Infrastructure**

- SQLCipher-encrypted local database (WatermelonDB)
- Background sync with the API; prevents concurrent sync calls
- Biometric lock overlay preserving deep-navigation state across lock/unlock cycles
- Push notification registration and permission management
- Sentry error monitoring (production builds)
- Expo EAS build configuration (development, preview, production)

---

## API

### [0.3.1] - 2026-05-21

#### Added

- `MinAppVersionMiddleware` — every API request must carry an `X-App-Version` header.
  Requests without the header, or with a version below `MIN_APP_VERSION`, receive
  `HTTP 426 Upgrade Required` with `min_version` and (when configured) `update_url` in
  the response body. Enforcement is off when `MIN_APP_VERSION` is empty or `"0.0.0"`.
  Exempt paths: `/health`, `/webhooks/*`, `/docs`, `/redoc`, `/openapi.json`.
- `X-App-Platform` header support — clients send `android` or `ios`; the 426 response
  returns the matching store deep-link (`APP_UPDATE_URL_ANDROID` / `APP_UPDATE_URL_IOS`),
  falling back to whichever URL is configured when the platform is unknown.
- `APP_UPDATE_URL_ANDROID` and `APP_UPDATE_URL_IOS` env vars replacing the single
  `APP_UPDATE_URL`.

#### Security

- Requests from unidentified clients (no `X-App-Version` header) are rejected while
  `MIN_APP_VERSION` is set, preventing unversioned or third-party callers from reaching
  the API.

---

### [0.3.0] - 2026-05-21

This is the first recorded changelog entry. It covers all features present at
the time of writing; future entries will document incremental changes only.

#### Added

**Authentication & User Management**

- `POST /auth/register` — creates a user account, seeds default category groups and
  categories, issues a JWT access/refresh token pair, and starts the daily streak at 1
- `POST /auth/login` — authenticates with email + password and issues tokens; updates streak
- `POST /auth/refresh` — rotates the refresh token and returns a new access/refresh pair;
  token-reuse detection revokes the entire session on replay
- `POST /auth/logout` — revokes the active refresh token and blocklists the access token JTI
- `GET /auth/me` — returns the authenticated user's profile
- `PATCH /auth/me` — updates mutable profile fields (first name, last name, phone, email,
  onboarding flag); uniqueness-checked; username is immutable after onboarding
- `GET /auth/check-username` — validates format and availability of a candidate username
- `POST /auth/forgot-password` — sends a time-limited OTP via email; constant response body
  to prevent account enumeration
- `POST /auth/verify-reset-code` — validates OTP and returns a short-lived signed reset token
- `POST /auth/reset-password` — resets password and invalidates all active refresh sessions
- Sensitive endpoints rate-limited via slowapi; constant-time password and OTP comparisons
- Daily login streak tracked on `users.streak` / `users.last_streak_date`

**Zero-Based Budgeting**

- `GET /budget` — full month view: category groups with per-category `assigned`, `activity`,
  `available`, `carried_over`, `required_this_month`, plus total To Be Budgeted (TBB)
- `PATCH /budget/{category_id}` — sets the budget assignment for a category-month
- `POST /budget/move` — moves funds between two categories within the same month
- `GET /budget/tbb` — returns the current TBB for a given month
- `GET /budget/underfunded` — lists categories where `available < required_this_month`
- `POST /budget/auto-assign` — three strategies: `underfunded` (fills to target, TBB-capped),
  `last_month` (copies prior month assignments), `averages` (uses N-month rolling average)
- Budget activity kept in sync via SQLAlchemy event listeners on transaction
  insert/update/delete (`BudgetMonth.activity` auto-recalculates)
- Historical month edits enqueue a carry-over cascade recalculation task

**Categories & Targets**

- `GET /category-groups` and `GET /categories` — grouped category tree with nested categories
- `POST /category-groups`, `PATCH /category-groups/{id}`, `DELETE /category-groups/{id}` —
  create, rename, and remove groups; non-empty groups are archived (hidden) rather than deleted
- `PATCH /category-groups/{id}/sort` and `PATCH /categories/{id}/sort` — drag-and-drop sort
- `POST /categories`, `PATCH /categories/{id}`, `DELETE /categories/{id}` — category CRUD;
  categories with transaction history are hidden rather than deleted
- `GET /categories/{id}/target`, `PUT /categories/{id}/target`,
  `DELETE /categories/{id}/target` — per-category spending targets with `weekly`, `monthly`,
  `yearly`, and `custom` frequencies, optional `repeats` flag, and `due_by`/`fill_up`
  behaviours

**Transactions**

- `GET /transactions` — paginated list with filters: account, category, date range,
  transaction type, and search
- `GET /transactions/{id}` — transaction detail
- `PATCH /transactions/{id}` — edits amount, memo, date, and category with atomic budget and
  account balance rebalancing; raises `422` if the update would leave a debit transaction
  without a category
- `POST /transactions/{id}/confirm-category` — confirms a suggested category and persists a
  `UserCategoryRule` for future auto-classification; retroactively backfills matching
  uncategorised transactions
- `POST /transactions/{id}/split` — splits a transaction across multiple categories; budget
  activity is rebalanced atomically across all affected months
- `DELETE /transactions/{id}/split` — removes a split and resets the transaction to uncategorised
- `POST /transactions/manual` — creates a manual transaction with full field control
- `DELETE /transactions/{id}` — deletes a transaction; optional `cancel_rule=true` query
  parameter deactivates the associated recurring rule
- `GET /transactions/clusters` — Levenshtein-based cluster groups of uncategorised debit
  narrations, with per-cluster count and total spend (credits excluded)
- `POST /transactions/clusters/categorize` — batch-categorises all transactions in a cluster
  and updates budget activity in one operation
- `GET /transactions/review-queue` — next uncategorised debit transaction (oldest-first) with
  up to three ranked category suggestions; includes remaining queue count (credits excluded)

**Accounts**

- `GET /accounts/supported-banks` — open endpoint listing institutions supported for email
  alert ingestion and PDF statement upload
- `POST /accounts/manual` — adds a manual bank account; account number is Fernet-encrypted
  at rest; duplicate detection via decrypt-and-compare; optionally creates a starting-balance
  transaction
- `GET /accounts` — lists user accounts with live computed balance
  (`starting_balance + Σ transactions`)
- `PATCH /accounts/{id}/alias` — renames an account's display label
- `PATCH /accounts/{id}/balance` — applies a manual balance adjustment as a synthetic delta
  transaction, appending an audit entry to `balance_adjustments`
- `DELETE /accounts/{id}` — soft-deletes an account (`deleted_at` timestamp)
- `POST /accounts/{id}/reconcile` — anchors the tracked balance to the user's stated real
  balance by creating a signed reconciliation transaction

**Bank Alert Ingestion (Email Forwarding)**

- `POST /webhooks/bank-alerts` — receives auto-forwarded bank email alerts (via Gmail
  forwarding rules); shared-secret verification with constant-time comparison
- Supports debit/credit alert parsing for: **Access Bank**, **First Bank**, **GTBank**,
  **OPay**, **UBA**, **Zenith Bank**
- Forwarded-sender resolution: probes available parsers and scans the embedded `From:` header
  to identify the originating bank without relying on the forwarding address
- Deduplication by `external_ref` with race-safe `IntegrityError` handling; Gmail
  verification challenge intercepted and relayed automatically
- Statement attachments embedded in forwarded emails are routed to the statement pipeline

**Statement & Receipt Processing**

- `POST /uploads/statement` — PDF bank statement upload; identified by bank and account,
  ownership verified via account-number decrypt-and-compare; queued for async processing
- `POST /uploads/receipt` — receipt image or PDF upload; file type validated by magic bytes
  (no trust in `Content-Type`); queued for async OCR processing
- Statement processor: parses PDF, deduplicates against existing records, upserts
  transactions, anchors `starting_balance` from the statement's opening balance, then queues
  categorisation and emits a push notification on completion
- Receipt processor: OCR extraction, account-direction inference, deduplication and upsert,
  then queues categorisation and notifies; supports OPay receipts
- Statement-source transactions are immutable in the sync push path

**WatermelonDB Sync**

- `GET /sync/pull` — incremental pull; generates any overdue recurring transactions before
  responding; anti-gap timestamp handling prevents missed records at boundary
- `POST /sync/push` — processes client `created`, `updated`, and `deleted` change sets for
  all sync tables (transactions, bank accounts, categories, category groups, budget months,
  category targets, recurring rules); per-record ownership validation; debit transactions
  cannot have their category nulled via sync push; post-commit enqueues
  categorisation, nudge evaluation, and WebSocket invalidation events

**Recurring Transactions**

- `GET /recurring-rules`, `GET /recurring-rules/{id}` — list and fetch recurring rules
- `POST /recurring-rules` — creates a rule with frequency, interval, day-of-week/month,
  `next_due`, optional `ends_on`, and a transaction template; accepts
  `source_transaction_id` to retroactively tag the originating transaction with
  `recurrence_id`
- `PATCH /recurring-rules/{id}` — updates `is_active`, `ends_on`, and `next_due`
- `DELETE /recurring-rules/{id}` — hard-deletes a rule
- Overdue recurring transactions are generated lazily on each sync pull, keeping the client
  up to date without a polling job

**AI Categorisation (BYOK)**

- `POST /ai/credentials` — validates a user-supplied API key against the provider, then
  Fernet-encrypts and stores it; deactivates any prior active credential for the same
  provider; supports **OpenAI** (gpt-4o-mini), **Google Gemini** (gemini-flash-latest),
  and **Anthropic** (claude-3-5-haiku)
- `GET /ai/credentials` — lists active stored credentials without exposing the plaintext key
- `DELETE /ai/credentials/{id}` — removes a credential
- `POST /ai/categorize` — queues LLM categorisation for all uncategorised transactions
- `GET /ai/usage` — returns efficiency metrics: offline vs. LLM categorisation ratios,
  monthly and lifetime token consumption
- LLM task: batch categorisation with configurable retry policy; permanent auth errors
  deactivate the credential and send a push notification; usage logged per transaction

**Auto-Categorisation Pipeline**

- Five-tier offline categorisation pipeline applied to every new transaction before LLM
  fallback: (1) exact narration match from user's category rule cache,
  (2) merchant-token matching against global merchant list, (3) keyword scoring,
  (4) pgvector cosine similarity against stored `UserCategoryRule` embeddings,
  (5) heuristic scoring engine
- `UserCategoryRule` records updated on every confirmed categorisation with hit count,
  last-triggered timestamp, and a 384-dimension sentence-transformer embedding (IVFFlat
  cosine index via pgvector)
- `NarrationCategoryMap` cache upserted on confirmation with retroactive backfill of
  matching uncategorised transactions

**Nudge Engine & Notifications**

- `GET /nudges` — paginated nudge list, undismissed first; includes `unread_count`
- `GET /nudges/{id}`, `POST /nudges/{id}/open`, `POST /nudges/{id}/dismiss`,
  `DELETE /nudges/{id}` — fetch, mark opened, dismiss, and delete nudges
- `POST /nudges/mark-all-read` — bulk marks all nudges as opened
- `GET /nudges/settings`, `PATCH /nudges/settings` — per-user nudge preferences:
  enabled/disabled, quiet hours (start + end), fatigue limit (max nudges per day),
  language (English / Pidgin)
- `POST /nudges/register-device` — idempotent Expo push token registration
- `POST /nudges/test-trigger` — creates a synthetic nudge bypassing fatigue and
  deduplication for QA
- `GET /nudges/insights` — user-level nudge interaction metrics over a configurable period
- DSL-driven nudge rule engine: rules stored in `nudge_rules` with per-group fatigue limits,
  event subscriptions, lookback windows, and conditional expressions evaluated at
  categorisation time
- Quiet-hours enforcement: nudges generated during the user's quiet window are queued
  (not dropped) and delivered by a Celery Beat task running every 10 minutes
- Expo push payloads include `screen`, `nudge_type`, `trigger_type`, `nudge_id`, and
  `category_id` for deep linking
- Tokens detected as expired during delivery are cleared from the user record

**Admin — Nudge Rules**

- `GET /admin/nudge-rules` — paginated, filterable rule list (by active state, group, title)
- `GET /admin/nudge-rules/groups` — rule groups aggregated with `rule_count`/`active_count`
- `GET /admin/nudge-rules/groups/{gid}` — rules by group
- `POST /admin/nudge-rules`, `PUT /admin/nudge-rules/{id}`,
  `PATCH /admin/nudge-rules/{id}/toggle`, `DELETE /admin/nudge-rules/{id}` — full CRUD;
  every mutation rebuilds the Redis rule cache
- `GET /admin/nudge-rules/stats/summary` — aggregate metrics (hits, delivered, suppressed,
  opened, dismissed) per rule over a date range
- `GET /admin/nudge-rules/{id}/stats` — daily per-rule breakdown
- All admin routes are guarded by a separate `get_current_admin` dependency

**WebSocket — Real-Time Events**

- `WS /ws/events` — per-user event stream authenticated via JWT query token; backed by
  Redis pub/sub fan-out; ping/pong keepalive; clean cancellation and unsubscribe on
  disconnect
- Invalidation events emitted after account mutations, sync push commits, statement and
  receipt processing, and transaction ingestion via bank alerts

**Background Jobs (Celery)**

- `categorize_transactions` — runs the five-tier offline pipeline, evaluates nudge rules,
  queues LLM fallback for unresolved items, and notifies the user
- `evaluate_nudges_for_transactions` — nudge evaluation for transactions categorised in the
  sync push path
- `deliver_queued_nudges` — delivers quiet-hours-queued nudges with per-user window checks;
  runs every 10 minutes via Celery Beat
- `run_llm_categorization` — batch LLM categorisation with retry, credential lifecycle, and
  usage logging; runs on a dedicated `llm` queue
- `embed_category_rule` — generates and stores sentence-transformer embeddings for new
  `UserCategoryRule` records; runs on the `embeddings` queue
- `recalculate_carried_over_cascade` — recomputes `carried_over` forward from an edited
  historical budget month
- `process_bank_statement` — full statement ingestion pipeline (parse → dedup → upsert →
  categorise → notify)
- `process_receipt` — full receipt ingestion pipeline (OCR → parse → dedup → upsert →
  categorise → notify)
- `roll_up_nudge_stats` — rolls up the previous day's nudge interaction metrics into
  `nudge_stats`; runs nightly at 00:15 WAT via Celery Beat

**Security & Infrastructure**

- FastAPI 0.135 on Python 3.11+; PostgreSQL with SQLAlchemy 2 ORM; Alembic migrations
- Account numbers Fernet-encrypted at rest; decrypt-and-compare for duplicate detection
  and statement ownership verification
- JWT access tokens (short-lived) + rotating refresh tokens stored server-side; JTI
  blocklist for immediate revocation
- Rate limiting via slowapi on authentication, upload, and webhook endpoints
- pgvector extension for cosine-similarity category matching
- Celery 5 + Redis for task queuing and pub/sub; Africa/Lagos timezone throughout
- Structured logging: Rich console + rotating file handlers (`logs/app.log`,
  `logs/error.log`); Celery worker writes to the same log files
- 25 incremental Alembic schema migrations covering the full evolution from initial schema
  to vector embeddings, nudge metrics, and DSL rule seeding
