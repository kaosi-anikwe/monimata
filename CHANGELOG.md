# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Git tags follow the pattern `mobile/vX.Y.Z` and `api/vX.Y.Z`.

**Navigate to:** [Mobile App](#mobile-app) · [API](#api)

---

## Mobile App

### [0.6.0] - 2026-05-26

#### Added

- **Financial Reports module** — new `(reports)/` route group with a hub screen
  and nine dedicated report screens:
  - **Reports hub** (`reports.tsx`) — dashboard of summary cards with at-a-glance
    metrics for income vs expenses, spending breakdown, budget performance, net
    worth, and age of money; each card navigates to its full report.
  - **Income & Expenses** (`income-expenses.tsx`) — monthly income vs expense
    trend chart with net savings.
  - **Spending Breakdown** (`spending-breakdown.tsx`) — donut chart of spending by
    category for the selected month.
  - **Category Detail** (`category-detail.tsx`) — per-category spending trend over
    time.
  - **Budget Performance** (`budget-performance.tsx`) — assigned vs spent per
    category with utilisation percentages.
  - **Cash Flow** (`cash-flow.tsx`) — inflow/outflow bar chart with
    daily/weekly/monthly granularity toggle.
  - **Net Worth** (`net-worth.tsx`) — account balances overview.
  - **Top Merchants** (`top-merchants.tsx`) — ranked list of highest-spend
    narrations for the month.
  - **Recurring Commitments** (`recurring.tsx`) — active recurring rules with
    estimated monthly inflow/outflow totals.
- Chart components (`components/reports/`): `AreaChart`, `BarChart`,
  `DonutChart`, `CountUp`, `MonthPicker`, `PercentBadge`, `ReportSkeletons`,
  and `SegmentedControl`.
- `useReports` hooks (`hooks/useReports.ts`) — TanStack Query hooks for all
  report endpoints.
- `react-native-gifted-charts` dependency added for chart rendering.
- Report-related query keys added to `lib/queryKeys.ts`.

### [0.5.1] - 2026-05-25

#### Changed

- Reorganised app routes into domain-scoped route groups: `(profile)/`,
  `(budget)/`, and `(transactions)/` replace the flat collection of screens
  that previously lived at the app root.
- Added a nested `<Stack>` layout for `(profile)/hub/` so that hub list →
  post detail navigation is self-contained; hardware back / swipe-back on a
  post returns to the hub list rather than the profile screen.

#### Fixed

- Renamed `(profile)/index.tsx` → `profile.tsx` and `(profile)/accounts.tsx`
  → `bank-accounts.tsx` to eliminate URL collisions with the Home tab (`/`)
  and the Accounts tab (`/accounts`) caused by Expo Router's transparent
  route-group semantics.
- Fixed broken post deep-link: push target corrected from `/post/:slug` to
  `/hub/post/:slug` after the post screen moved under the hub group.
- Removed extraneous `Tabs.Screen` entries for `profile` and `hub` that were
  causing "Too many screens defined" warnings.

### [0.5.0] - 2026-05-25

#### Added

- **Knowledge Hub — live CMS posts** — the tab now fetches posts from Sanity CMS
  via the `/content/posts` proxy. Article cards show the cover image (or a greyed
  logo placeholder), post title, author name, and publish date. Category filter
  chips are derived from the fetched posts.
- **Post detail screen** (`/post/[slug]`) — new screen navigated to from every
  post card:
  - Full **Portable Text renderer** supporting: paragraphs, H2 / H3 / H4 headings
    with distinct type scales, bullet and numbered lists (nested), blockquotes,
    inline marks (bold, italic, underline, strikethrough, code), hyperlinks, code
    blocks with optional filename / language label, callout cards
    (info / warning / tip / note), inline images with captions, and video embeds.
  - Cover image hero or greyed logo fallback.
  - Author avatar, name, and publish date row.
  - Tag pills.
  - Skeleton loading animation and pull-to-refresh on both the hub list and
    post detail screen.
  - Tapping a video embed card deep-links into the YouTube or Vimeo native app.
- **Global API error toast** — `authFetch` now surfaces a user-visible error toast
  for every non-2xx response except 401, with friendly status-specific messages
  (`502`/`503` → "Service unavailable", `504` → "Request timed out",
  other 5xx → "Server error", other 4xx → "Request failed").
- `usePosts` and `usePost` hooks (`hooks/usePosts.ts`) for typed TanStack Query
  access to the content endpoints.
- `Skeleton` reusable pulsing placeholder component (`components/ui/Skeleton.tsx`).
- `queryKeys.posts` and `queryKeys.post` entries in `lib/queryKeys.ts`.
- User profile now cached in SecureStore on login, registration, and session
  restore; restored from cache on cold start if the server is unavailable.

#### Changed

- Knowledge Hub and Post detail screens use the shared `ScreenHeader` component
  for consistent navigation chrome across both screens.
- Post list `useMemo` stabilised to prevent the `categories` derived value
  recalculating on every render.

#### Removed

- `react-native-webview` dependency dropped — video embeds now deep-link to the
  native YouTube / Vimeo app instead of rendering an in-app WebView player.

### [0.4.0] - 2026-05-23

#### Changed

- **Auth split** — all authentication flows (login, register, password reset, profile
  updates) now route to the private admin gateway (`console.monimata.ng`) instead of the
  public API, enforcing a clear security boundary between identity and data planes.
- New `consoleClient` service (`services/consoleApi.ts`) — typed HTTP wrapper for the
  admin gateway with `APP_VERSION` and `APP_PLATFORM` headers on every request.
- `doTokenRefresh` in `services/api.ts` now calls the console gateway for token refresh.
- Edit Profile screen rewritten to use `consoleClient.PATCH` instead of the openapi-fetch
  `$api.useMutation` hook; removed the `identity_verified` badge (field no longer exposed).
- Auth types (`TokenResponse`, `UserResponse`, `UpdateProfileRequest`, etc.) moved from
  generated shared-types to a manually maintained `types/auth.ts` file — prevents the
  private gateway's API surface from leaking into the open-source repository.
- All `consoleClient` call sites in auth screens and `authSlice` now use generic type
  parameters for full type safety.
- `EXPO_PUBLIC_CONSOLE_URL` added to `.env.example` and test setup.

### [0.3.1] - 2026-05-21

#### Changed

- Every API request now includes `X-App-Version` and `X-App-Platform` headers,
  enabling the server to enforce minimum-version requirements and return
  platform-specific update links when an upgrade is needed.
- `axios` moved to `devDependencies` — it is only used in test mocks and is no
  longer bundled into the production app.

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

### [0.6.0] - 2026-05-26

#### Added

- **Financial Reports endpoints** — ten new read-only analytics endpoints under
  `/reports`:
  - `GET /reports/monthly-summary` — total income, expenses, net savings, savings
    rate, average daily expense, top spending categories, and month-over-month
    comparison percentages.
  - `GET /reports/income-expense-trend` — monthly income vs expense time series;
    supports full-history retrieval via `months=all`.
  - `GET /reports/spending-by-category` — per-category spend totals with
    percentages and transaction counts for a given month.
  - `GET /reports/category-trend` — monthly spend trend for a single category;
    supports full-history retrieval via `months=all`.
  - `GET /reports/top-merchants` — ranked narrations by total spend, with average
    transaction size and last-seen date.
  - `GET /reports/budget-performance` — assigned vs actual spend per category with
    utilisation percentage.
  - `GET /reports/cash-flow` — inflow/outflow time series with configurable
    granularity (daily, weekly, monthly).
  - `GET /reports/account-balances` — per-account computed balances and total
    net worth.
  - `GET /reports/recurring-commitments` — active recurring rules with estimated
    monthly inflow/outflow totals.
  - `GET /reports/age-of-money` — estimated age of money in days based on balance
    and average daily spending, with trend vs prior period.
- Pydantic response schemas for all report endpoints (`schemas/reports.py`).
- **Comprehensive test suite** — 319 pytest tests covering all routers, services,
  schemas, middleware, and security modules. Tests use a dedicated PostgreSQL
  database with SAVEPOINT-based transaction isolation; Redis, Celery, and push
  notifications are fully mocked.
- CI workflow updated: `api-lint.yml` → `api-ci.yml` with a `pytest` job
  (PostgreSQL 16 + pgvector, Redis 7).

#### Fixed

- HTTP 422 status code updated from deprecated `UNPROCESSABLE_ENTITY` to
  `UNPROCESSABLE_CONTENT` across all routers (AI, budget, transactions, uploads).
- `routers/recurring.py`: Pydantic model now serialised to dict before storing
  in JSONB column (found during test development).
- `schemas/nudges.py`: stricter `HH:MM` quiet-hours validation regex.
- Webhook tests patched to use settings-level secret validation.

#### Changed

- `README.md` updated with PostgreSQL 16 version requirement and pgvector
  extension setup instructions.

### [0.5.0] - 2026-05-25

#### Added

- **Sanity CMS content proxy** — two new endpoints backed by GROQ queries against
  the Sanity API:
  - `GET /content/posts` — paginated list of published posts with optional
    `category` filter; returns `PostSummary` items (id, title, slug, excerpt,
    cover image URL, category, author, publish date, tags).
  - `GET /content/posts/{slug}` — full post detail including resolved Portable
    Text body, author avatar, and category; returns `PostDetail`.
- `app/services/sanity.py` — singleton async HTTP client for executing GROQ
  queries; reads `SANITY_PROJECT_ID`, `SANITY_DATASET`, and `SANITY_API_TOKEN`
  from config.
- `app/schemas/content.py` — `PostSummary`, `PostDetail`, `PostListResponse`,
  `AuthorSummary`, and `CategorySummary` Pydantic models.
- Redis async caching for both content endpoints (5-minute TTL); cache is keyed
  per query so filtered lists are cached independently.

#### Changed

- `app/core/redis_client.py` migrated from `redis` (sync) to `redis.asyncio`;
  added `get_async_redis_client` helper and cache-key constants for content.
- Structured logging configuration (`app/core/logging_config.py`) improved with
  more granular handler setup.

### [0.4.0] - 2026-05-23

#### Changed

- **Architecture split** — the API is now a stateless public calculation engine
  (`api.monimata.ng`). Authentication, user management, and nudge rule CRUD are
  handled exclusively by the private admin gateway (`console.monimata.ng`).

#### Removed

- **Auth endpoints** — `POST /auth/register`, `/login`, `/refresh`, `/logout`,
  `GET /auth/me`, `PATCH /auth/me`, `/check-username`, `/forgot-password`,
  `/verify-reset-code`, `/reset-password` removed. Clients authenticate via the
  admin gateway and present the resulting JWT to this API.
- **Admin nudge-rule endpoints** — `GET/POST/PUT/PATCH/DELETE /admin/nudge-rules/*`
  and all admin metrics endpoints removed. Rule CRUD and aggregate metrics live on
  the admin gateway; this API only reads rules from the Redis cache for evaluation.
- **Admin schemas** — `NudgeRuleCreate`, `NudgeRuleUpdate`, `NudgeRuleResponse`,
  `NudgeRuleListResponse`, `NudgeRuleGroup*` removed from `schemas/nudge_rule.py`.
  Auth schemas (`schemas/auth.py`) deleted entirely.
- **Admin metric schemas** — `RuleDailyStat`, `RuleDailyStatList`, `RuleSummary`,
  `RuleSummaryList` removed from `schemas/nudge_metrics.py`.
- **Admin metric functions** — `get_rule_stats` and `get_rule_stats_summary` removed
  from `services/nudge_metrics.py` (cross-user aggregation belongs on admin).
- **Admin test file** — `tests/test_admin_nudge_rules.py` deleted.

#### Security

- **JWT verification only** — `app/core/security.py` stripped to public-key-only
  operations: `decode_access_token` and AES PII encryption. `create_access_token`,
  `create_refresh_token`, `hash_password`, `verify_password`, and `generate_otp`
  removed. The RS256 private key never touches this codebase.
- **Stateless identity** — `get_current_user` returns a `CurrentUser` dataclass
  (fields: `id`, `username`) decoded directly from the JWT. Zero database queries
  per request for identity resolution; no `get_current_admin` dependency.
- **Slim User model** — `app/models/user.py` maps only the columns the public API
  reads or writes (`id`, `username`, `created_at`, `nudge_settings`, `onboarded`,
  `expo_push_token`, `streak`, `last_streak_date`). Auth-sensitive columns
  (`password_hash`, `email`, `phone`, `role`, `identity_verified`) are unmapped and
  invisible to the ORM.
- **Redis read-only auth** — all auth write helpers removed from
  `app/core/redis_client.py`. Only `is_token_blocklisted` (read) and nudge rule
  cache operations remain.
- **Config hardened** — `JWT_PRIVATE_KEY`, token expiry settings removed from
  `app/core/config.py`. Only `JWT_PUBLIC_KEY` is accepted.
- **Migration isolation** — Alembic version files gitignored; all schema authority
  centralised in the admin backend.
- **`/admin` and `/auth` prefix removed** from `MinAppVersionMiddleware` protected prefixes.
- **`.env.example`** and **`README.md`** scrubbed of `JWT_PRIVATE_KEY` references
  and password-hashing documentation.

---

### [0.3.1] - 2026-05-21

#### Added

- `MinAppVersionMiddleware` — every API request must carry an `X-App-Version` header.
  Requests without the header, or with a version below `MIN_APP_VERSION`, receive
  `HTTP 426 Upgrade Required` with `min_version` and (when configured) `update_url` in
  the response body.
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

**Authentication**

- JWT access tokens verified using RS256 public key; tokens are minted by the
  admin gateway (`console.monimata.ng`)
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

- FastAPI 0.135 on Python 3.11+; PostgreSQL with SQLAlchemy 2 ORM
- Account numbers Fernet-encrypted at rest; decrypt-and-compare for duplicate detection
  and statement ownership verification
- JWT access tokens verified with RS256 public key; JTI blocklist for immediate revocation
- Rate limiting via slowapi on authentication, upload, and webhook endpoints
- pgvector extension for cosine-similarity category matching
- Celery 5 + Redis for task queuing and pub/sub; Africa/Lagos timezone throughout
- Structured logging: Rich console + rotating file handlers (`logs/app.log`,
  `logs/error.log`); Celery worker writes to the same log files
