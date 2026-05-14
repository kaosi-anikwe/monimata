# MoniMata

> **Every Kobo, Accounted For.**

MoniMata (Pidgin: _Money Matters_) is a zero-based budgeting app built specifically for Nigerians. It automatically captures transactions from bank alert emails, lets you give every Naira a job before you spend it, and delivers AI-powered spending nudges in Pidgin English — like a knowledgeable friend advising you, not a cold alert.

---

## The Three Problems MoniMata Solves

| Problem           | Description                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fragmentation** | Nigerians routinely hold 3–5 bank/fintech accounts (GTBank, Kuda, Zenith, OPay). Knowing your true balance at any moment is manual and error-prone. |
| **Friction**      | Manual-entry budgeting apps fail because users forget to log small daily spending. If the data isn't there, the budget is fiction.                  |
| **Knowledge Gap** | Users can see what they spent, but the app doesn't tell them how to change their behaviour. Data without guidance doesn't break cycles.             |

---

## Features

- **Automatic Transaction Capture** — Bank alert emails are forwarded by a Cloudflare Worker and parsed into transactions automatically
- **Receipt Upload** — Snap or export a bank transaction receipt (JPEG, PNG, WebP, or PDF); the bank and account are identified automatically via OCR and a pluggable parser registry
- **Statement Upload** — Upload a bank statement PDF directly from the app; all transactions are imported in the background with full deduplication
- **Manual Transaction Entry** — Log cash purchases and any transaction not covered by the above channels
- **Zero-Based Budgeting** — Every Naira assigned to a category before it is spent (YNAB model: TBB, Assigned, Activity, Available)
- **Category Targets** — Monthly, weekly, or date-based savings goals per category
- **AI Nudge Engine** — Personalised, Pidgin-infused spending alerts triggered by incoming transactions
- **Transaction Auto-Categorisation** — Rule-based + fuzzy-matching pipeline to label bank narrations automatically
- **Offline-First UI** — Budget remains readable and usable without a network connection (WatermelonDB, 90-day local cache)
- **Recurring Rules** — Automatic scheduling of repeated transactions
- **Split Transactions** — Allocate a single purchase across multiple categories
- **Financial Reports** — Spending by category, income vs. expenses, net worth trends
- **Knowledge Hub** — Bite-sized financial literacy articles and "Wisdom Nuggets"
- **Biometric App Lock** — Face ID / fingerprint lock for sensitive screens
- **Push Notifications** — Real-time nudges delivered via Firebase Cloud Messaging

---

## Architecture Overview

MoniMata is a **cloud-primary, device-cached** system. Financial records are authoritative in PostgreSQL on the server. The device holds a read-optimised local cache (WatermelonDB / SQLCipher) of the last 90 days that also queues writes for server sync.

### Transaction Ingestion Channels

Transactions can enter the system through three independent channels, all funnelling into the same deduplication and categorisation pipeline:

| Channel               | Trigger                                                        | Parser                         | Notes                                                                                                               |
| --------------------- | -------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Email alert**       | Bank debit/credit SMS-style email forwarded via Cloudflare     | `EmailBankParser` per bank     | Zero-friction; no user action after initial forwarding setup                                                        |
| **Statement PDF**     | User uploads via `POST /uploads/statement` or email attachment | `StatementBankParser` per bank | Bulk-imports historical transactions; deduplicates against existing rows                                            |
| **Receipt image/PDF** | User uploads via `POST /uploads/receipt`                       | `ReceiptBankParser` per bank   | OCR (Tesseract) for images; direct text extraction (pdfplumber) for PDFs; bank auto-identified from receipt content |

All three channels share the same registry of supported banks (`app/services/ingestion/registry.py`). Adding support for a new bank means implementing one or more parser protocols and registering them at import time — no changes to the channel or routing layer.

```
[GTBank / Kuda / Zenith / OPay]
      |
      | Bank sends alert email to user's inbox
      ↓
[Cloudflare Email Routing] → [email-parser (postal-mime)]
      |                                    |
      |                                    | Attached PDF? → identify_statement()
      |                                    ↓
      | POST /webhooks/bank-alerts  (X-MoniMata-Secret)
      ↓
[FastAPI Backend]  ←──────────────────────────────────────────┐
      |                                                         |
      ├── Verify shared secret (constant-time compare)         |
      ├── Parse alert → Transaction row (upsert)               |
      ├── Enqueue Celery tasks                                  |
      |                                                         |
      |            [Mobile App]                                 |
      |                 │                                       |
      |     POST /uploads/receipt (image or PDF)               |
      |     POST /uploads/statement (PDF)    ──────────────────┘
      |
      ├── [PostgreSQL]    ← source of financial truth
      ├── [Redis]         ← Celery broker + token store + rate limits
      └── [Celery Workers + Beat]
              ├── categorize_transactions
              ├── process_receipt        ← OCR + parse + upsert
              ├── process_bank_statement ← PDF parse + bulk upsert
              ├── evaluate_nudges
              ├── deliver_queued_nudges  (7:05 AM WAT)
              └── reconcile_budget_activity  (4:00 AM WAT)
                      |
                      ↓
      [REST API + WebSocket /ws/events]
                      ↕
          [React Native (Expo) App]
                      |
                      └── [WatermelonDB + SQLCipher]  ← encrypted local cache
                                  ↕
                      [Device Secure Store]  ← SQLCipher encryption key
```

---

## Tech Stack

### Backend (`apps/api`)

| Layer              | Technology                                      |
| ------------------ | ----------------------------------------------- |
| Web framework      | FastAPI 0.135                                   |
| ORM                | SQLAlchemy 2 + Alembic migrations               |
| Database           | PostgreSQL (BIGINT kobo, UUID PKs, TIMESTAMPTZ) |
| Task queue         | Celery 5                                        |
| Message broker     | Redis                                           |
| Auth               | RS256 JWT (15 min access / 7-day refresh)       |
| PII encryption     | AES-256-GCM (account numbers)                   |
| Password hashing   | bcrypt min cost 12                              |
| Push notifications | Firebase Admin SDK                              |
| OCR                | Tesseract 4 via pytesseract (receipt images)    |
| PDF parsing        | pdfplumber (statements + receipt PDFs)          |
| Error reporting    | Sentry (`sentry-sdk` + FastAPI integration)     |
| HTTP client        | httpx                                           |
| Runtime            | Python 3.11+                                    |

### Mobile (`apps/mobile`)

| Layer           | Technology                              |
| --------------- | --------------------------------------- |
| Framework       | React Native 0.83 + Expo SDK 55         |
| Navigation      | Expo Router (file-based)                |
| Local database  | WatermelonDB 0.28 (SQLCipher encrypted) |
| Server state    | TanStack Query v5                       |
| Global state    | Redux Toolkit                           |
| Forms           | React Hook Form                         |
| Crash reporting | Sentry (`@sentry/react-native`)         |
| Animations      | React Native Reanimated 4               |
| Lists           | Shopify FlashList                       |

### Email Worker (`apps/email-parser`)

| Layer           | Technology                    |
| --------------- | ----------------------------- |
| Runtime         | Cloudflare Workers            |
| Email parsing   | postal-mime                   |
| Error reporting | Sentry (`@sentry/cloudflare`) |
| Deploy          | Wrangler 4                    |

### Monorepo

| Tool                 | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| Nx 18                | Task orchestration, caching                       |
| TypeScript 5         | Shared types (`libs/shared-types`)                |
| openapi-typescript 6 | Generates TS types from FastAPI's `/openapi.json` |
| uv                   | Python package manager (backend)                  |
| pre-commit           | Git hook runner (ruff lint/format)                |

---

## Repository Structure

```
monimata/
├── apps/
│   ├── api/                    # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py         # App factory + router includes
│   │   │   ├── core/           # Config, database, security, Redis
│   │   │   ├── models/         # SQLAlchemy ORM models
│   │   │   ├── routers/        # One file per endpoint group
│   │   │   ├── schemas/        # Pydantic request/response schemas
│   │   │   ├── services/
│   │   │   │   ├── ingestion/          # Transaction ingestion pipeline
│   │   │   │   │   ├── base.py         # Parser protocols (Email/Statement/ReceiptBankParser)
│   │   │   │   │   ├── registry.py     # Bank registry + iter_*_parsers helpers
│   │   │   │   │   ├── channels/       # Per-channel dispatch (email, statement, receipt)
│   │   │   │   │   └── banks/          # Per-bank parser implementations
│   │   │   │   ├── categorization.py   # Rule-based + fuzzy narration categorisation
│   │   │   │   ├── nudge_engine.py     # Nudge triggers, quiet hours, fatigue limits
│   │   │   │   └── push_service.py     # Expo push notification delivery
│   │   │   └── worker/         # Celery app, tasks, beat schedule
│   │   └── alembic/            # Database migrations
│   ├── email-parser/           # Cloudflare Email Worker
│   │   ├── src/index.ts        # Worker entrypoint (postal-mime + Sentry)
│   │   ├── scripts/deploy.mjs  # Cross-platform deploy + source map upload
│   │   └── wrangler.toml       # Cloudflare Workers configuration
│   └── mobile/                 # React Native (Expo) app
│       ├── app/                # Expo Router screens
│       │   ├── (auth)/         # Welcome, Register, Login
│       │   └── (tabs)/         # Budget, Transactions, Accounts, Nudges, Profile, Hub
│       ├── components/         # Shared UI components
│       ├── database/           # WatermelonDB setup, schema, encryption, sync
│       ├── hooks/              # Feature-specific React hooks
│       ├── lib/                # Theme, tokens, typography, Sentry
│       ├── services/           # Axios API client (with silent token refresh)
│       ├── store/              # Redux slices
│       └── types/              # TypeScript domain types
├── libs/
│   └── shared-types/           # Types shared across apps
└── docs/                       # Architecture, PRD, deployment, sync spec, audit plan
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+ and npm
- PostgreSQL 15+
- Redis 7+
- Tesseract 4+ (`tesseract-ocr` package) — required for receipt image OCR
- Java 17 (for Android builds)
- Android SDK (for Android builds)

### Backend

The backend uses [uv](https://docs.astral.sh/uv/) for dependency management.

```bash
# 1. Install dependencies (creates .venv automatically)
cd apps/api
uv sync

# Activate the virtual environment
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, JWT keys, and BANK_ALERT_WEBHOOK_SECRET

# 3. Run database migrations
alembic upgrade head

# 4. Start the four required processes (in separate terminals)
uvicorn app.main:app --reload --port 8000
celery -A app.worker.celery_app worker --loglevel=info
celery -A app.worker.celery_app beat -l info
# Redis runs as a system service
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Shared Types

`libs/shared-types` is the single source of truth for TypeScript types shared across the mobile app and any TS tooling. Hand-written domain types live in `src/index.ts`. Auto-generated API types (mirroring FastAPI's Pydantic schemas) live in `src/api.ts` — never edit that file manually.

To regenerate after a backend schema change (requires the API server running on `localhost:8000`):

```bash
# From the monorepo root
npm run generate:types

# Then commit the updated libs/shared-types/src/api.ts
git add libs/shared-types/src/api.ts
git commit -m "chore: regenerate shared types"
```

### Mobile

```bash
# 1. Install dependencies
cd apps/mobile
npm install

# 2. Configure environment
# Create .env with:
# EXPO_PUBLIC_API_URL=http://<your-local-ip>:8000
# EXPO_PUBLIC_SENTRY_DSN=<your-sentry-dsn>  (optional for dev)

# 3. Run on Android (requires Android SDK and a connected device or emulator)
npx expo run:android

# 4. Or start the Metro dev server
npm start
```

> **Note:** `EXPO_PUBLIC_API_URL` must be set. The app will throw a startup error if it is missing, to prevent auth tokens from being routed to an unintended host.

---

## Environment Variables

### Backend (`apps/api/.env`)

| Variable                    | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string                                  |
| `REDIS_URL`                 | Redis connection string (default: `redis://localhost:6379/0`) |
| `CORS_ORIGINS`              | JSON array of allowed origins                                 |
| `JWT_PRIVATE_KEY`           | RS256 private key (PEM)                                       |
| `JWT_PUBLIC_KEY`            | RS256 public key (PEM)                                        |
| `AES_ENCRYPTION_KEY`        | 64-char hex string for AES-256 PII encryption                 |
| `BANK_ALERT_WEBHOOK_SECRET` | Shared secret matched against `X-MoniMata-Secret` header      |
| `OPENAI_API_KEY`            | OpenAI key for nudge generation (optional)                    |
| `SENTRY_DSN`                | Sentry DSN for error reporting (leave blank to disable)       |
| `LOG_LEVEL`                 | `DEBUG` / `INFO` / `WARNING` (default: `INFO`)                |

Generate the RS256 key pair:

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Generate the AES encryption key:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Mobile (`apps/mobile/.env`)

| Variable                 | Description                                  |
| ------------------------ | -------------------------------------------- |
| `EXPO_PUBLIC_API_URL`    | Backend base URL — **required**, no fallback |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for crash reporting               |

### Email Worker (`apps/email-parser/.dev.vars` for local dev; Cloudflare secrets in production)

| Variable         | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `WEBHOOK_SECRET` | Shared secret; must match `BANK_ALERT_WEBHOOK_SECRET` on the API |
| `SENTRY_DSN`     | Sentry DSN for error reporting                                   |

---

## API Endpoints

| Prefix                  | Description                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- |
| `GET /health`           | Health check                                                                  |
| `/auth`                 | Register, login, token refresh                                                |
| `/accounts`             | Bank account management; `GET /accounts/supported-banks` returns the registry |
| `/transactions`         | Transaction CRUD and manual entry                                             |
| `/budget`               | Budget month management                                                       |
| `/categories`           | Category CRUD                                                                 |
| `/category-groups`      | Category group CRUD                                                           |
| `/recurring-rules`      | Recurring transaction rules                                                   |
| `/uploads/receipt`      | Upload a receipt image or PDF — bank auto-identified                          |
| `/uploads/statement`    | Upload a bank statement PDF — transactions bulk-imported                      |
| `/sync/pull`            | WatermelonDB delta pull                                                       |
| `/sync/push`            | WatermelonDB delta push                                                       |
| `/ws/events`            | WebSocket real-time events                                                    |
| `/nudges`               | AI-generated spending nudges                                                  |
| `/reports`              | Spending, income vs. expense, net worth                                       |
| `/content`              | Knowledge Hub articles                                                        |
| `/webhooks/bank-alerts` | Bank alert email receiver (forwarded by email-parser)                         |

---

## Background Jobs (Celery Beat)

| Schedule                 | Task                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| Daily 4:00 AM WAT        | Recompute budget activity from transactions (`reconcile_budget_activity`) |
| Daily 7:05 AM WAT        | Deliver queued nudge notifications (`deliver_queued_nudges`)              |
| Every Friday 5:00 PM WAT | Weekly review nudges (`weekly_review_nudges`)                             |

---

## Code Quality

A pre-commit hook runs automatically on every `git commit` and enforces code style on the Python backend.

```bash
# Install hooks after cloning (one-time)
cd apps/api
uv run pre-commit install

# Run manually against all files
uv run pre-commit run --all-files
```

The hook runs two steps via [ruff](https://docs.astral.sh/ruff/):

| Step          | What it does                              |
| ------------- | ----------------------------------------- |
| `ruff check`  | Lint and auto-fix (E, F, I, UP rule sets) |
| `ruff format` | Format code (Black-compatible)            |

To add or update backend dependencies:

```bash
uv add <package>          # runtime dependency
uv add --group dev <pkg>  # dev-only dependency
```

---

## Money Conventions

- All money is stored as **kobo (integer)**. ₦150.00 → `15000`. Never use floats.
- Division to Naira happens only at the display layer (`apps/mobile/utils/money.ts`).
- `available` is never stored — always computed as `assigned + activity` (activity is negative for debits).

---

## Security

- All primary keys are UUIDs — no sequential IDs exposed in URLs
- Account numbers stored as AES-256-GCM ciphertext; only the last 4 digits shown
- Bank-alert webhook authenticated via constant-time shared secret comparison
- Device-side database encrypted with SQLCipher; key stored in the OS secure keychain
- RS256 JWT with 15-minute access tokens and 7-day rotating refresh tokens
- CORS origins configured explicitly — no wildcard in production

---

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full Ubuntu production deployment guide, including systemd service units, Nginx reverse proxy configuration, and TLS setup with Certbot.

For building a release APK without EAS or the Play Store, see [docs/LOCAL_APK_BUILD.md](docs/LOCAL_APK_BUILD.md).

---

## Documentation

| Document                                               | Description                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)           | Full system architecture and all technical decisions               |
| [docs/PRD.md](docs/PRD.md)                             | Product requirements and screen specifications for the design team |
| [docs/BACKEND_SYNC_SPEC.md](docs/BACKEND_SYNC_SPEC.md) | WatermelonDB sync protocol and column mapping reference            |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)               | Ubuntu server setup and production deployment guide                |
| [docs/LOCAL_APK_BUILD.md](docs/LOCAL_APK_BUILD.md)     | Building and signing a local release APK                           |
| [docs/AUDIT_ACTION_PLAN.md](docs/AUDIT_ACTION_PLAN.md) | Security and quality audit findings and fixes applied              |
| [docs/UI_MIGRATION_PLAN.md](docs/UI_MIGRATION_PLAN.md) | Screen-by-screen UI migration plan and design token reference      |

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
See the [LICENSE](LICENSE) file for details.
