# MoniMata Mobile — Audit Action Plan

**Created:** March 2026  
**Source:** Full app audit findings  
**Purpose:** Fact-check document — every item here maps 1:1 to a code change.  
**Status key:** ✅ Done | 🔧 In Progress | ⏳ Pending

---

## How to use this document

Each section below describes:

1. **What was wrong** — the exact problem
2. **What was done** — the exact fix applied
3. **Files changed** — so you can verify the diff

---

## 🔴 Critical Fixes

---

### C-1 · WatermelonDB Local Database Encryption

**What was wrong:**  
`database/index.ts` used a plain `SQLiteAdapter` with no encryption. Every bank balance, transaction narration, and BVN-verified flag was stored in plaintext SQLite on the device. Architecture doc required SQLCipher + device keychain.

**What was done (JS side — complete):**

- Created `database/encryption.ts` — generates a 256-bit key using `globalThis.crypto.getRandomValues()` (native Web Crypto, no extra package), stores it in `expo-secure-store` keychain.
- Updated `database/index.ts` — added a comment block showing exactly where the key plugs into the SQLCipher adapter config. The key is now generated and persisted on app init.
- Updated `app/_layout.tsx` — calls `initDbEncryptionKey()` before the first sync, so the key is in the keychain by the time WatermelonDB needs it.

**What still needs native changes:**  
SQLCipher requires modifying `android/app/build.gradle` to link `net.zetetic:android-database-sqlcipher`. The JS infrastructure is now fully ready — when native SQLCipher is wired up on Android, the `encryptionKey` value is already in SecureStore and the init code reads it from there automatically. Steps:

```
// android/app/build.gradle — add under dependencies:
implementation "net.zetetic:android-database-sqlcipher:4.5.4"
implementation "androidx.sqlite:sqlite:2.3.1"
// Then rebuild the native module with JSI enabled and pass encryptionKey to the adapter.
```

**Files changed:**

- `database/encryption.ts` ← NEW
- `database/index.ts` ← modified
- `app/_layout.tsx` ← modified

---

### C-2 · Hardcoded Cloudflare Dev Tunnel URL

**What was wrong:**  
`database/sync.ts` had `?? 'https://accessing-ignored-transmit-sms.trycloudflare.com'` as a fallback. A missing `EXPO_PUBLIC_API_URL` env var in a production build would silently forward auth tokens and financial data to a dead Cloudflare subdomain.

`services/api.ts` also had `?? 'http://localhost:8000'` as a fallback — safer but still wrong for production.

**What was done:**  
Both files now throw a startup error if `EXPO_PUBLIC_API_URL` is not set. Explicit, loud failure is better than silent data routing to an unexpected host.

**Files changed:**

- `services/api.ts` ← modified
- `database/sync.ts` ← modified

---

### C-3 · No Crash Reporting

**What was wrong:**  
`ErrorBoundary.componentDidCatch` only called `console.error`. Production crashes were completely invisible to the team.

**What was done:**

- Installed `@sentry/react-native`.
- Created `lib/sentry.ts` — Sentry init logic, reads DSN from `EXPO_PUBLIC_SENTRY_DSN`.
- Updated `app/_layout.tsx` — wraps `RootNavigator` with `Sentry.wrap()`.
- Updated `components/ErrorBoundary.tsx` — calls `Sentry.captureException(error)` in `componentDidCatch`.
- Added `@sentry/react-native` plugin to `app.json`.
- Added `EXPO_PUBLIC_SENTRY_DSN` to `.env.example`.

**NOTE — Native setup required:**  
Run the following ONCE to configure native crash reporting (symbol upload, ProGuard rules):

```
npx @sentry/wizard@latest -i reactNative
```

Without this, only JS-layer exceptions are captured. Native crashes (JNI, OOM) require the wizard.

**Files changed:**

- `lib/sentry.ts` ← NEW
- `app/_layout.tsx` ← modified
- `components/ErrorBoundary.tsx` ← modified
- `app.json` ← modified
- `.env.example` ← NEW

---

### C-4 · Unprofessional Camera Permission String

**What was wrong:**  
`app.json` had `"NSCameraUsageDescription": "Yo, we need your camera."` — this phrasing guarantees Apple App Review rejection. Additionally, no camera feature exists in the app; the permission declaration itself is grounds for rejection.

**What was done:**

- Removed `NSCameraUsageDescription` from `app.json` `ios.infoPlist`.
- Removed `android.permission.CAMERA` from `android.permissions`.

**Files changed:**

- `app.json` ← modified

---

### C-5 · Missing `ios.bundleIdentifier`

**What was wrong:**  
`android.package` was set (`ng.com.monimata`) but `ios.bundleIdentifier` was absent. EAS builds for iOS would fail or produce an auto-generated identifier, blocking App Store submission.

**What was done:**  
Added `"bundleIdentifier": "ng.com.monimata"` to `app.json` under `ios`.

_Note from developer: iOS testing is not a priority right now (Android-only local builds). This is added for correctness but does not need immediate validation._

**Files changed:**

- `app.json` ← modified

---

## 🟠 High Priority

---

### H-1 · Offline-First Writes — Architecture Clarification

**Q: Is this a straightforward fix?**  
**A: No.** It requires coordinated frontend + backend changes.

**Q: If we do this, are the existing backend REST routes still needed?**  
**A: Most data mutation routes become redundant. Here is the exact breakdown:**

| Route                         | Status after full offline-first                         |
| ----------------------------- | ------------------------------------------------------- |
| `POST /transactions/manual`   | ❌ Replaced by WDB create → sync push                   |
| `PATCH /transactions/:id`     | ❌ Replaced by WDB update → sync push                   |
| `DELETE /transactions/:id`    | ❌ Replaced by WDB delete → sync push                   |
| `PATCH /budget/:categoryId`   | ❌ Replaced by WDB BudgetMonth update → sync push       |
| `POST /category-groups`       | ❌ Replaced by WDB create → sync push                   |
| `PATCH /category-groups/:id`  | ❌ Replaced by WDB update → sync push                   |
| `DELETE /category-groups/:id` | ❌ Replaced by WDB delete → sync push                   |
| `POST /categories`            | ❌ Replaced by WDB create → sync push                   |
| `PATCH /categories/:id`       | ❌ Replaced by WDB update → sync push                   |
| `POST /budget/move`           | ❌ Replaced by WDB atomic update → sync push            |
| `PUT /categories/:id/target`  | ❌ Replaced by WDB CategoryTarget upsert → sync push    |
| **All `/auth/*` routes**      | ✅ Still required                                       |
| **All `/accounts/*` routes**  | ✅ Still required (Mono linking triggers external APIs) |
| **All `/bills/*` routes**     | ✅ Still required (real Interswitch money movement)     |
| **All `/nudges/*` routes**    | ✅ Still required (read + settings)                     |
| `/sync/pull` and `/sync/push` | ✅ Become the only data plane                           |

**What this means for the backend:**  
The `/sync/push` handler must be able to process creates/updates/deletes for all WatermelonDB tables. It also needs to trigger Celery categorization when a new transaction is pushed. This is a significant backend change.

**What was done (frontend infrastructure only):**  
Nothing changed in the write path — existing REST mutations are preserved. The `useJobEvents` WebSocket hook (H-3) replaces the `setTimeout` cache invalidation pattern and improves the feedback loop from async Celery jobs. Full offline writes are a Phase 2 item once the backend sync protocol supports it.

**Files changed:** None (architecture decision, documented here)

---

### H-2 · Dark Mode Preparation — Theme Token System

**What was wrong:**  
Dark mode is a PRD requirement. All screens hardcoded light-mode hex values in StyleSheets. With the design team's new UI incoming, migrating later screen-by-screen would be a massive refactor.

**What was done:**  
Created `lib/theme.ts` — a semantic colour token system with:

- `ThemeColors` interface (brand, success, error, warning, 8 surface/text roles)
- `lightColors` and `darkColors` token maps
- `getTheme(scheme)` function
- `useTheme()` hook that reads `useColorScheme()` from React Native

**How to use when implementing the new UI:**

```ts
import { useTheme } from "@/lib/theme";

function MyScreen() {
  const colors = useTheme();
  // Use colors.background, colors.textPrimary, colors.brand, etc.
  // StyleSheet.create() must be called inside the component or rebuilt reactively.
}
```

**Files changed:**

- `lib/theme.ts` ← NEW

---

### H-3 · `setTimeout` Cache Invalidation — WebSocket Replacement

**What was wrong:**  
`hooks/useAccounts.ts` and `hooks/useTransactions.ts` used `setTimeout(invalidate, 3000–6000ms)` to wait for Celery jobs. This is a race condition — jobs may complete in 50ms on a fast server, or 30s on a busy queue.

**Why WebSocket over polling:**  
At millions of users, polling (even at 30s intervals) generates ≈ 33 requests/user/hour × 1M users = 33M extra requests/hour against the backend. WebSocket push from server eliminates this entirely and gives true real-time feedback. The architecture already plans for a WebSocket server (FastAPI supports it natively). **This is the enterprise choice.**

**What was done:**

- Created `hooks/useJobEvents.ts` — WebSocket client that:
  - Connects to `{WS_BASE}/ws/events` (derived from `EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_WS_URL`)
  - Authenticates via `?token=` query param
  - Handles `{"type": "invalidate", "keys": [...]}` events from server
  - Exponential backoff reconnect (up to 5 retries, max 30s)
  - Reconnects on app foreground
  - Disconnects cleanly on logout
- Removed `setTimeout` invalidations from `hooks/useAccounts.ts` and `hooks/useTransactions.ts`.
- Added `useJobEvents()` call in `app/_layout.tsx`.

**Backend integration required:**  
The FastAPI backend must emit WebSocket events after Celery job completion:

```python
# When a sync/categorize/nudge job completes:
await ws_manager.broadcast_to_user(user_id, {
    "type": "invalidate",
    "keys": ["accounts", "transactions", "nudges"]
})
```

**Files changed:**

- `hooks/useJobEvents.ts` ← NEW
- `hooks/useAccounts.ts` ← modified
- `hooks/useTransactions.ts` ← modified
- `app/_layout.tsx` ← modified

---

### H-4 · Biometric App Lock

**What was wrong:**  
No lock screen on app resume. Any person who picks up an unlocked phone has full access to all financial data.

**What was done:**

- Installed `expo-local-authentication`.
- Created `hooks/useBiometricLock.ts` — manages lock state, AppState transitions, 30-second background timeout, and `expo-local-authentication` calls.
- Created `components/AppLockScreen.tsx` — full-screen lock UI shown when `isLocked = true`.
- Updated `app/_layout.tsx` — renders `AppLockScreen` over all content when locked.
- Updated `app/(tabs)/profile.tsx` — added "Biometric Lock" menu row to let users enable/disable. Row is hidden if no biometrics are enrolled on the device.

**Files changed:**

- `hooks/useBiometricLock.ts` ← NEW
- `components/AppLockScreen.tsx` ← NEW
- `app/_layout.tsx` ← modified
- `app/(tabs)/profile.tsx` ← modified

---

### H-5 · SecureStore Called on Every API Request

**What was wrong:**  
`services/api.ts` called `SecureStore.getItemAsync()` (a Keychain syscall, ~5–50ms) on every single API request. For a paginated transactions screen firing 10+ requests, this adds unnecessary latency across every user session.

**What was done:**  
Added an in-memory cache (`_cachedAccessToken`) to `services/api.ts`. SecureStore is now only read once per session. The cache is invalidated synchronously when `saveTokens()` or `clearTokens()` is called, so correctness is preserved.

**Files changed:**

- `services/api.ts` ← modified

---

### H-7 · Transactions List Uses `SectionList` Instead of `FlashList`

**What was wrong:**  
The transactions screen — the most scroll-heavy screen in the app — used React Native's `SectionList` despite `@shopify/flash-list` already being a dependency. FlashList uses recycled cells and avoids JS-heap allocation per item, giving substantially better scroll performance for long lists.

**What was done:**  
Replaced `SectionList` with `FlashList` in `app/(tabs)/transactions.tsx`. Because FlashList v2 doesn't have a native `sections` prop, data is flattened into a typed union array (`'header' | 'transaction'`) and `overrideItemType` differentiates rendering. `estimatedItemSize={68}` is set for optimal pre-rendering.

**Files changed:**

- `app/(tabs)/transactions.tsx` ← modified

---

## 🟡 Medium Priority

---

### M-1 · No Test Coverage

**Q: Can we test the entire app?**  
**A: Yes. Here's the full testing pyramid:**

| Level     | Tool                           | What it tests                          | Status                  |
| --------- | ------------------------------ | -------------------------------------- | ----------------------- |
| Unit      | Jest + jest-expo               | Pure functions, reducers, utility math | ✅ Implemented          |
| Component | React Native Testing Library   | Screens with mocked API                | Foundation laid         |
| E2E       | **Maestro** (recommended 2026) | Full user flows on device/emulator     | Setup instructions only |

Maestro (https://maestro.mobile.dev) is the recommended E2E tool in 2026 — it requires no Xcode/native SDK, runs YAML flow files, works with Expo Go and dev builds, and integrates with CI. To add E2E later: `brew install maestro` (macOS) and write `.maestro/login_flow.yaml`.

**What was done:**

- Installed `jest-expo`, `@testing-library/react-native`, `@testing-library/jest-native`, `@types/jest`.
- Created `jest.config.js`.
- Added `"test": "jest"` and `"test:watch": "jest --watch"` scripts to `package.json`.
- Created `__tests__/utils/money.test.ts` — comprehensive coverage of all money utility functions.
- Created `__tests__/store/budgetSlice.test.ts` — tests for month navigation, initial state.
- Created `__tests__/store/authSlice.test.ts` — tests for auth state transitions.

**Files changed:**

- `jest.config.js` ← NEW
- `__tests__/utils/money.test.ts` ← NEW
- `__tests__/store/budgetSlice.test.ts` ← NEW
- `__tests__/store/authSlice.test.ts` ← NEW
- `package.json` ← modified

---

### M-3 · FAB Visibility Logic Was Fragile

**What was wrong:**  
`segments.length === 1` was used to detect the Budget tab. The user correctly identified that `activeTab` (i.e., `segments[1]`) is never `'index'` — it is `undefined` on the Budget/index tab. The logic was correct by accident but would break silently with any route structure change.

**What was done:**  
Replaced with explicit checks:

- `tabName === undefined` → Budget/index tab (segments = `['(tabs)']`)
- `tabName === 'transactions'` → Transactions tab
- `isAtRootTabLevel` guard (`segments.length <= 2`) prevents FAB showing when inside nested stack screens

**Files changed:**

- `app/(tabs)/_layout.tsx` ← modified

---

### M-4 · Predictive Back Gesture Disabled

**What was wrong:**  
`"predictiveBackGestureEnabled": false` disabled Android 13+ system UX that users expect.

**What was done:**  
Removed the `predictiveBackGestureEnabled: false` line from `app.json`. The feature is now enabled by default.

**Files changed:**

- `app.json` ← modified

---

### M-5 · No `.env.example` File

**What was wrong:**  
New engineers would get a Cloudflare tunnel pointing to a dead endpoint (now a startup crash after C-2 fix).

**What was done:**  
Created `apps/mobile/.env.example` with all required and optional environment variables documented.

**Files changed:**

- `.env.example` ← NEW

---

### M-6 · Missing Accessibility Labels

**What was wrong:**  
No `accessibilityLabel`, `accessibilityRole`, or `accessibilityHint` props anywhere. Icon-only buttons (month nav chevrons, pencil edit, FAB, close buttons) are completely opaque to screen readers.

**What was done:**  
Added accessibility props to:

- FAB in `app/(tabs)/_layout.tsx`
- Month nav buttons in `app/(tabs)/index.tsx` (Budget screen)
- Login form fields and CTA in `app/(auth)/login.tsx`
- Register form fields and CTA in `app/(auth)/register.tsx`

_Note: Full WCAG coverage across all screens is a task for the new UI implementation. A screen-reader-accessible `accessibilityLabel` pattern is now established for the team to follow._

**Files changed:**

- `app/(tabs)/_layout.tsx` ← modified
- `app/(tabs)/index.tsx` ← modified
- `app/(auth)/login.tsx` ← modified
- `app/(auth)/register.tsx` ← modified

---

### M-7 · Quiet Hours Validation Accepts Invalid Times

**What was wrong:**  
`/^\d{2}:\d{2}$/.test(value)` accepted `99:99` and other invalid times.

**What was done:**  
Changed to `/^([01]\d|2[0-3]):[0-5]\d$/` which correctly validates HH:MM range.

**Files changed:**

- `app/(tabs)/profile.tsx` ← modified

---

### M-8 · `google-services.json` Committed to Repository

**What was wrong:**  
Firebase project configuration checked into git exposed the Firebase project ID and API keys. For an enterprise security posture these must be managed via EAS secrets.

**What was done:**

- Added `google-services.json` and `android/app/google-services.json` to `.gitignore`.
- Ran `git rm --cached` to un-track both files from the repository.

**HOW TO DISTRIBUTE TO NEW ENGINEERS:**  
These files should be stored in your team's secrets manager (1Password, Vault, EAS secrets) and documented in the project README. For CI, use `GOOGLE_SERVICES_JSON` as a build environment variable.

**Files changed:**

- `.gitignore` ← modified

---

### M-9 · WatermelonDB Sync Has No 90-Day Window

**What was wrong:**  
On first sync (`lastPulledAt = null`), the code passed `?last_pulled_at=0` — fetching all history. For a user with years of bank data, first sync could be enormous and would time out on weak Nigerian mobile connections.

**What was done:**  
`database/sync.ts` now caps initial sync at 90 days ago. Incremental syncs (where `lastPulledAt` is a recent timestamp) are unaffected.

```ts
// First sync: fetch last 90 days only
// Subsequent syncs: fetch from last_pulled_at (unchanged)
const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
const pullFrom = lastPulledAt !== null ? lastPulledAt : ninetyDaysAgo;
```

**Files changed:**

- `database/sync.ts` ← modified

---

### M-10 · `budgetSlice` Month String Computed at Module Load Time

**What was wrong:**  
`currentMonthStr()` was called once when the Redux module was first imported. If the app was kept alive across a month boundary, `selectedMonth` stayed stale until hard-restart.

**What was done:**

- Added `syncToCurrentMonth` action to `budgetSlice.ts` — advances `selectedMonth` to the current month if the stored value has fallen behind (month rolled over while app was in background).
- `app/_layout.tsx` AppState `active` handler now also dispatches `syncToCurrentMonth()`. Users who were reviewing a past month are automatically brought to the current month when the month boundary passes while the app is backgrounded.

**Files changed:**

- `store/budgetSlice.ts` ← modified
- `app/_layout.tsx` ← modified

---

### M-11 · `PayloadAction<any>` in Auth Slice

**What was wrong:**  
`setError` was typed as `PayloadAction<any>`, defeating the `strict: true` TypeScript config.

**What was done:**  
Changed to `PayloadAction<unknown>` and narrowed with `String(action.payload)`.

**Files changed:**

- `store/authSlice.ts` ← modified

---

### M-12 · Deprecated `useUnlinkAccount` Hook Still Exported

**What was wrong:**  
`useUnlinkAccount` was marked `@deprecated` but still exported. Calling it deletes the account without unlinking Mono first, leaving a dangling consent.

**What was done:**  
Removed the function from `hooks/useAccounts.ts`. Verified it has no remaining usages in the codebase.

**Files changed:**

- `hooks/useAccounts.ts` ← modified

---

## Summary Checklist

| ID   | Description                          | Status                               |
| ---- | ------------------------------------ | ------------------------------------ |
| C-1  | SQLCipher key infrastructure         | ✅                                   |
| C-2  | Remove Cloudflare URL fallback       | ✅                                   |
| C-3  | Sentry crash reporting               | ✅                                   |
| C-4  | Remove camera permission             | ✅                                   |
| C-5  | Add ios.bundleIdentifier             | ✅                                   |
| H-1  | Offline-first architecture           | ✅ Documented, backend work required |
| H-2  | Dark mode theme token system         | ✅                                   |
| H-3  | WebSocket real-time invalidation     | ✅                                   |
| H-4  | Biometric app lock                   | ✅                                   |
| H-5  | Access token memory cache            | ✅                                   |
| H-7  | FlashList for transactions           | ✅                                   |
| M-1  | Jest test suite                      | ✅                                   |
| M-3  | FAB visibility logic                 | ✅                                   |
| M-4  | Predictive back gesture enabled      | ✅                                   |
| M-5  | `.env.example`                       | ✅                                   |
| M-6  | Accessibility labels                 | ✅ (key screens)                     |
| M-7  | Quiet hours validation               | ✅                                   |
| M-8  | google-services.json gitignored      | ✅                                   |
| M-9  | 90-day sync window                   | ✅                                   |
| M-10 | Month string stale on month rollover | ✅                                   |
| M-11 | PayloadAction<any>                   | ✅                                   |
| M-12 | Remove deprecated hook               | ✅                                   |
