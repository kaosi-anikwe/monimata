# MoniMata

> **Every Kobo, Accounted For.**

MoniMata (Pidgin: _Money Matters_) is a zero-based budgeting app built specifically for Nigerians. It automatically syncs transactions from Nigerian banks via [Mono Connect](https://mono.co), lets you give every Naira a job before you spend it, and delivers AI-powered spending nudges in Pidgin English — like a knowledgeable friend advising you, not a cold alert.

---

## The Three Problems MoniMata Solves

| Problem           | Description                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fragmentation** | Nigerians routinely hold 3–5 bank/fintech accounts (GTBank, Kuda, Zenith, OPay). Knowing your true balance at any moment is manual and error-prone. |
| **Friction**      | Manual-entry budgeting apps fail because users forget to log small daily spending. If the data isn't there, the budget is fiction.                  |
| **Knowledge Gap** | Users can see what they spent, but the app doesn't tell them how to change their behaviour. Data without guidance doesn't break cycles.             |

---

## Features

- **Automatic Bank Sync** — Daily transaction fetching from 200+ Nigerian banks and fintechs via Mono Connect
- **Zero-Based Budgeting** — Every Naira assigned to a category before it is spent (YNAB model: TBB, Assigned, Activity, Available)
- **Category Targets** — Monthly, weekly, or date-based savings goals per category
- **In-App Bill Payment** — Electricity, cable TV, airtime, data bundles via Interswitch Quickteller — budget updates in real time
- **BVN Identity Verification** — Powered by Interswitch Passport; required before bill payments or bank linking
- **AI Nudge Engine** — Personalised, Pidgin-infused spending alerts triggered by sync events
- **Transaction Auto-Categorisation** — Rule-based + fuzzy-matching pipeline to label bank narrations automatically
- **Offline-First UI** — Budget remains readable and usable without a network connection (WatermelonDB, 90-day local cache)
- **Recurring Rules** — Automatic detection and scheduling of repeated transactions
- **Split Transactions** — Allocate a single purchase across multiple categories
- **Financial Reports** — Spending by category, income vs. expenses, net worth trends
- **Knowledge Hub** — Bite-sized financial literacy articles and "Wisdom Nuggets"
- **Biometric App Lock** — Face ID / fingerprint lock for sensitive screens
- **Push Notifications** — Real-time nudges delivered via Firebase Cloud Messaging

---

## Architecture Overview

MoniMata is a **cloud-primary, device-cached** system. Financial records are authoritative in PostgreSQL on the server. The device holds a read-optimised local cache (WatermelonDB / SQLCipher) of the last 90 days that also queues writes for server sync.

```
[GTBank / Kuda / Zenith / OPay]
      ↕  Mono Connect (OAuth-based, no credentials stored)
  [Mono API]                       [Interswitch API]
      |                                    |
      | webhook: account_updated           | on-demand: bill pay / BVN
      ↓                                    ↓
[FastAPI Backend] ───────────────────────────┤
      |                                    |
      ├── Verify HMAC-SHA512 webhook sig   ├── Quickteller: bill payments
      ├── Enqueue Celery tasks             ├── Passport:    BVN verification
      |                                    |
      ├── [PostgreSQL]    ← source of financial truth
      ├── [Redis]         ← Celery broker + result backend
      └── [Celery Workers + Beat]
              ├── fetch_transactions
              ├── categorize_transactions
              ├── evaluate_nudges / generate_nudge
              └── nightly_reconciliation (3 AM WAT)
                      |
                      ↓
      [REST API + WebSocket /ws/events]
                      ↕
          [React Native (Expo) App]
              ├── Budget, Transactions, Accounts, Bills
              ├── Nudges, Reports, Hub, Profile
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
| Crash reporting | Sentry                                  |
| Animations      | React Native Reanimated 4               |
| Lists           | Shopify FlashList                       |

### Monorepo

| Tool         | Purpose                            |
| ------------ | ---------------------------------- |
| Nx 18        | Task orchestration, caching        |
| TypeScript 5 | Shared types (`libs/shared-types`) |

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
│   │   │   ├── services/       # Mono client, Interswitch client, categorisation
│   │   │   └── worker/         # Celery app, tasks, beat schedule
│   │   └── alembic/            # Database migrations
│   └── mobile/                 # React Native (Expo) app
│       ├── app/                # Expo Router screens
│       │   ├── (auth)/         # Welcome, Register, Login, Verify BVN, Link Bank
│       │   └── (tabs)/         # Budget, Transactions, Accounts, Bills, Nudges, Profile, Hub, Rewards
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
- Java 17 (for Android builds)
- Android SDK (for Android builds)

### Backend

```bash
# 1. Create and activate a virtual environment
cd apps/api
python3.11 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, JWT keys, Mono and Interswitch credentials

# 4. Run database migrations
alembic upgrade head

# 5. Start the four required processes (in separate terminals)
uvicorn app.main:app --reload --port 8000
celery -A app.worker.celery_app worker --loglevel=info
celery -A app.worker.celery_app beat -l info
# Redis runs as a system service
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

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
| `MONO_SECRET_KEY`           | Mono API secret key                                           |
| `MONO_WEBHOOK_SECRET`       | Mono webhook HMAC-SHA512 signing secret                       |
| `INTERSWITCH_CLIENT_ID`     | Interswitch client ID                                         |
| `INTERSWITCH_CLIENT_SECRET` | Interswitch client secret                                     |
| `INTERSWITCH_ENV`           | `sandbox` or `production`                                     |
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

---

## API Endpoints

| Prefix             | Description                                  |
| ------------------ | -------------------------------------------- |
| `GET /health`      | Health check                                 |
| `/auth`            | Register, login, token refresh               |
| `/accounts`        | Bank account management                      |
| `/transactions`    | Transaction CRUD and manual entry            |
| `/budget`          | Budget month management                      |
| `/categories`      | Category CRUD                                |
| `/category-groups` | Category group CRUD                          |
| `/recurring-rules` | Recurring transaction rules                  |
| `/sync/pull`       | WatermelonDB delta pull                      |
| `/sync/push`       | WatermelonDB delta push                      |
| `/ws/events`       | WebSocket real-time events                   |
| `/nudges`          | AI-generated spending nudges                 |
| `/reports`         | Spending, income vs. expense, net worth      |
| `/bills`           | Interswitch Quickteller bill payment         |
| `/content`         | Knowledge Hub articles                       |
| `/webhooks/mono`   | Mono webhook receiver (HMAC-SHA512 verified) |

---

## Background Jobs (Celery Beat)

| Schedule                 | Task                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| Daily 3:00 AM WAT        | Re-sync stale bank accounts (`nightly_reconciliation`)                    |
| Daily 4:00 AM WAT        | Recompute budget activity from transactions (`reconcile_budget_activity`) |
| Daily 7:05 AM WAT        | Deliver queued nudge notifications (`deliver_queued_nudges`)              |
| Every Friday 5:00 PM WAT | Weekly review nudges (`weekly_review_nudges`)                             |

---

## Money Conventions

- All money is stored as **kobo (integer)**. ₦150.00 → `15000`. Never use floats.
- Division to Naira happens only at the display layer (`apps/mobile/utils/money.ts`).
- `available` is never stored — always computed as `assigned + activity` (activity is negative for debits).

---

## Security

- All primary keys are UUIDs — no sequential IDs exposed in URLs
- Account numbers stored as AES-256-GCM ciphertext; only the last 4 digits shown
- Mono webhooks verified with HMAC-SHA512 before any processing
- BVN verification (`identity_verified = true`) required before bill payments or linking bank accounts
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

## Team

| Member | Role | Contributions |
| --- | --- | --- |
| **Kaosi Anikwe** | Full-Stack Developer | Entire codebase — FastAPI backend, WatermelonDB sync engine, React Native app, Celery workers, Mono & Interswitch integrations, CI/CD, deployment |
| **Patricia Oko** | UI/UX Designer | App design, screen flows, visual identity, and authored this README |

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
See the [LICENSE](LICENSE) file for details.
