# MoniMata — Mobile App

React Native (Expo) client for [MoniMata](../../README.md) — a zero-based budgeting app built for Nigerians.

- **Version:** 0.3.0
- **Platform:** Android (primary) · iOS · Web (static, limited)
- **Bundle IDs:** `ng.monimata` (Android & iOS)

---

## Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Environment Variables](#environment-variables)
5. [Running Locally](#running-locally)
6. [Running Tests](#running-tests)
7. [Building for Release](#building-for-release)
8. [Architecture Notes](#architecture-notes)
9. [Money Conventions](#money-conventions)
10. [Push Notification Payload](#push-notification-payload)

---

## Tech Stack

| Concern            | Library / Tool                                 |
| ------------------ | ---------------------------------------------- |
| Framework          | React Native 0.83 + Expo SDK 55                |
| Navigation         | Expo Router 55 (file-based, typed routes)      |
| Local database     | WatermelonDB 0.28 (JSI, SQLCipher-ready)       |
| Server state       | TanStack Query v5 + openapi-react-query        |
| Global state       | Redux Toolkit                                  |
| API client         | openapi-fetch (typed against FastAPI spec)     |
| Forms              | React Hook Form + Zod                          |
| Animations         | React Native Reanimated 4                      |
| Lists              | Shopify FlashList                              |
| Fonts              | Plus Jakarta Sans (`@expo-google-fonts`)       |
| Auth storage       | expo-secure-store (Keychain / Keystore)        |
| Push notifications | expo-notifications + Firebase (FCM)            |
| Biometric lock     | expo-local-authentication                      |
| Share intent       | expo-share-intent (receipt upload from share)  |
| Quick actions      | expo-quick-actions (home screen shortcuts)     |
| Crash reporting    | Sentry (`@sentry/react-native`)                |
| Testing            | Jest + jest-expo + MSW + React Testing Library |
| Build / OTA        | EAS Build + EAS Update                         |
| Language           | TypeScript 5.9 (strict)                        |

---

## Project Structure

```
apps/mobile/
├── app/                        # Expo Router screens (file-based routing)
│   ├── _layout.tsx             # Root layout — Redux, QueryClient, theme, Sentry
│   ├── (auth)/                 # Unauthenticated screens
│   │   ├── index.tsx           # Splash / redirect guard
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── onboarding.tsx      # Post-registration account setup
│   │   ├── budget-seed.tsx     # First-time budget category setup
│   │   ├── forgot-password.tsx
│   │   ├── verify-reset-code.tsx
│   │   └── reset-password.tsx
│   ├── (tabs)/                 # Tab bar (authenticated)
│   │   ├── index.tsx           # Home / dashboard
│   │   ├── budget.tsx          # Zero-based budget screen
│   │   ├── transactions.tsx    # Transaction list
│   │   ├── accounts.tsx        # Account management
│   │   ├── nudges.tsx          # AI spending nudges
│   │   ├── hub.tsx             # Knowledge hub
│   │   └── profile.tsx         # Settings, logout, app version
│   ├── transaction/[id].tsx    # Transaction detail + inline edit
│   ├── target/[categoryId].tsx # Category savings target editor
│   ├── add-transaction.tsx     # Manual transaction entry
│   ├── budget-edit.tsx         # Budget category management
│   ├── split-transaction.tsx   # Split a transaction across categories
│   ├── upload-receipt.tsx      # Receipt / statement upload
│   └── notification-settings.tsx
│
├── components/
│   ├── ui/                     # Design-system primitives (Button, Badge, AmountInput…)
│   ├── tour/                   # Onboarding walkthrough (TourProvider, TourTarget)
│   ├── AutoAssignSheet.tsx     # Budget auto-assign bottom sheet
│   ├── BudgetWalkthrough.tsx
│   ├── AppLockScreen.tsx       # Biometric lock overlay
│   ├── AppWelcome.tsx          # First-launch welcome screen
│   ├── ErrorBoundary.tsx
│   └── Toast.tsx               # In-app toast (confirm / info)
│
├── database/
│   ├── index.ts                # WatermelonDB adapter setup
│   ├── schema.ts               # Table schema (version 6)
│   ├── models/                 # WatermelonDB model classes
│   ├── encryption.ts           # SQLCipher key lifecycle (SecureStore)
│   └── sync.ts                 # syncDatabase() — pull/push with drain queue
│
├── hooks/                      # Feature hooks (useBudget, useTransactions…)
├── lib/                        # Theme, design tokens, typography, Sentry init
├── services/
│   └── api.ts                  # openapi-fetch client with silent 401 token refresh
├── store/
│   ├── authSlice.ts            # JWT tokens + user state
│   └── budgetSlice.ts          # selectedMonth
├── types/                      # TypeScript domain types
├── utils/
│   └── money.ts                # Kobo ↔ Naira helpers, formatNaira, nairaStringToKobo
│
├── __tests__/                  # Jest test suites
├── assets/                     # Icons, images, splash
├── plugins/
│   └── withWatermelonDBJSI.js  # Expo config plugin — enables WatermelonDB JSI on Android
│
├── app.json                    # Expo config
├── eas.json                    # EAS Build profiles
├── babel.config.js
├── metro.config.js
└── tsconfig.json
```

---

## Prerequisites

| Tool        | Version | Notes                                           |
| ----------- | ------- | ----------------------------------------------- |
| Node.js     | 20+     |                                                 |
| npm         | 10+     |                                                 |
| Expo CLI    | latest  | `npm i -g expo-cli` or use `npx expo`           |
| EAS CLI     | 18.3+   | `npm i -g eas-cli` — for builds and OTA updates |
| Java        | 17      | Android builds only                             |
| Android SDK | API 34+ | Android builds only; set `ANDROID_HOME`         |
| Xcode       | 15+     | iOS builds only (macOS required)                |

A running [MoniMata backend](../../apps/api/README.md) is required. The app **will not start** if `EXPO_PUBLIC_API_URL` is missing.

---

## Environment Variables

Create `apps/mobile/.env`:

```env
# Required — the FastAPI backend base URL (no trailing slash)
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000

# Optional — Sentry DSN for crash reporting (omit to disable)
EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

> Use your machine's LAN IP (not `localhost`) when testing on a physical device.

---

## Running Locally

```bash
cd apps/mobile
npm install

# Start Metro dev server (Expo Go or dev build)
npm start

# Run on a connected Android device or emulator (native dev build)
npm run android

# Run on iOS simulator (macOS only)
npm run ios
```

**First run on Android** will trigger a native build via Gradle. Subsequent runs use the cached dev client — only `npm start` is needed.

To use Expo Go instead of a dev build, start Metro and scan the QR code. Note that JSI-based native modules (WatermelonDB, Reanimated) are not supported in Expo Go; use a dev build for full functionality.

---

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests use [MSW](https://mswjs.io/) to intercept API calls, jest-expo for Expo/RN transforms, and `@testing-library/react-native` for component assertions.

Coverage is collected from `utils/`, `store/`, and `hooks/`.

---

## Building for Release

Builds are managed by [EAS Build](https://docs.expo.dev/build/introduction/). Three profiles are defined in `eas.json`:

| Profile       | Distribution | Notes                                                |
| ------------- | ------------ | ---------------------------------------------------- |
| `development` | Internal     | Includes dev client; for team testing                |
| `preview`     | Internal     | Production JS, internal APK/IPA                      |
| `production`  | Store        | Auto-increments build number; Play Store / App Store |

```bash
# Android preview APK
eas build --profile preview --platform android

# Production build (Play Store)
eas build --profile production --platform android

# Send an OTA update (JS-only change, no native rebuild)
eas update --branch main --message "fix: kobo amount display"
```

For building a local APK without EAS, see [docs/LOCAL_APK_BUILD.md](../../docs/LOCAL_APK_BUILD.md).

---

## Architecture Notes

### Offline-First Sync

The app uses WatermelonDB as an offline-first local cache. All reads are served from the device; writes are queued locally then pushed to the server via `syncDatabase()`.

- `database/sync.ts` implements a drain-queue pattern: if a sync is in flight when a new one is requested, a follow-up run is scheduled automatically so no writes are missed.
- Pull/push endpoints: `GET /sync/pull` and `POST /sync/push`.
- The local DB holds a rolling cache of the last 90 days of transactions.
- Schema version is **6**. Migrations are handled by WatermelonDB's `migrations` API in `database/index.ts`.

### Database Encryption

`database/encryption.ts` manages a per-install 256-bit SQLCipher key:

1. Generated with `crypto.getRandomValues` on first install.
2. Stored in the OS secure keychain via `expo-secure-store`.
3. Passed to the SQLiteAdapter's `encryptionKey` option at DB open time.

The app-level biometric lock (`hooks/useBiometricLock.ts`) is a separate layer that gates UI access — it does not affect the encryption key.

### Token Refresh

`services/api.ts` wraps the openapi-fetch client with a custom fetch function that:

1. Attaches `Authorization: Bearer <accessToken>` to every request.
2. On a 401 response, attempts a silent refresh (`POST /auth/refresh`).
3. Concurrent requests during the refresh are queued and replayed after the new token arrives.
4. If the refresh fails, stored tokens are cleared and the registered logout handler is invoked.

### Navigation

Expo Router uses file-based routing. Route groups:

| Group     | Guard                            |
| --------- | -------------------------------- |
| `(auth)/` | Redirects to tabs if logged in   |
| `(tabs)/` | Redirects to login if logged out |

The root `_layout.tsx` checks `isAuthenticated` from Redux and performs the redirect.

### Push Notification Routing

When the user taps a push notification (foreground or background), `hooks/usePushNotifications.ts` dispatches navigation based on the `trigger_type` and `screen` fields of the payload. See [Push Notification Payload](#push-notification-payload) below.

### Amount Input (Numpad)

All custom numpad inputs (add transaction, transaction detail edit, budget assign sheet) use a **cash-register style** input:

- State stores raw kobo digits as a string (`"12345"` = ₦123.45).
- Each keypress appends a digit; backspace removes the last digit.
- Display always shows 2 decimal places: `parseInt(digits) / 100`.
- Saving: `parseInt(digits)` is already kobo — no conversion needed.

Keyboard-based `AmountInput` (category targets) uses `allowDecimals` mode with a 2-decimal-place cap.

---

## Money Conventions

All money is stored and transmitted as **kobo (integer)**. ₦150.00 = `15000`. Floats are never used.

```ts
// ✅ Correct
const kobo = 15000;
const display = formatNaira(kobo); // "₦150.00"

// ❌ Never do this
const naira = 150.0;
```

Key helpers in `utils/money.ts`:

| Function               | Description                                  |
| ---------------------- | -------------------------------------------- |
| `formatNaira(kobo)`    | `15000` → `"₦150.00"` (display only)         |
| `nairaStringToKobo(s)` | `"150.50"` → `15050` (keyboard input → kobo) |
| `koboToNaira(kobo)`    | `15000` → `150` (float, for calculations)    |
| `nairaToKobo(naira)`   | `150.5` → `15050` (rounds to nearest kobo)   |

Transactions: credits are **positive**, debits are **negative**.

---

## Push Notification Payload

The backend sends structured `data` payloads with every push notification.

```jsonc
{
  "trigger_type": "nudge", // see trigger types below
  "nudge_type": "threshold_80", // nudge sub-type (nudge trigger only)
  "nudge_id": "abc123",
  "screen": "budget", // target screen (nudge trigger only)
  "category_id": "...", // when applicable
  "transaction_id": "...", // when applicable
}
```

### Trigger types

| `trigger_type`         | Navigation                                                               |
| ---------------------- | ------------------------------------------------------------------------ |
| `nudge`                | Routed by `screen` field (see below)                                     |
| `transaction_received` | Transactions tab                                                         |
| `receipt_received`     | Transactions tab                                                         |
| `receipt_processed`    | Transaction detail (falls back to Transactions tab if not found locally) |
| `receipt_duplicate`    | Transaction detail (falls back to Transactions tab if not found locally) |
| `receipt_failed`       | Transactions tab                                                         |
| `statement_received`   | Transactions tab                                                         |
| `statement_processed`  | Transactions tab                                                         |
| `statement_failed`     | Transactions tab                                                         |

### `screen` values (nudge trigger)

| `screen`       | Navigation                |
| -------------- | ------------------------- |
| `transaction`  | Transaction detail screen |
| `budget`       | Budget tab                |
| `transactions` | Transactions tab          |
| `accounts`     | Accounts tab              |
| `nudges`       | Nudges tab (default)      |

---
