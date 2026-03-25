# MoniMata — UI Migration Plan

**Document version:** 1.2  
**Date:** March 2026  
**Status:** ✅ All 16 Phases Complete  
**Source mockup:** `apps/mobile/MoniMata_V5.html`

> Gradual, screen-by-screen migration from the functional MVP UI to the
> full design-team mockup. All existing functionality is preserved — this
> plan covers visual and structural changes only, unless a net-new feature
> is explicitly called out.

---

## Table of Contents

1. [Guiding Principles](#1-guiding-principles)
2. [Design Token Reference](#2-design-token-reference)
3. [Screen Inventory](#3-screen-inventory)
4. [Phase 0 — Design System](#phase-0--design-system)
5. [Phase 1 — Missing Dependencies](#phase-1--missing-dependencies)
6. [Phase 2 — Shared Component Library](#phase-2--shared-component-library)
7. [Phase 3 — Navigation Shell](#phase-3--navigation-shell)
8. [Phase 4 — Auth Flow](#phase-4--auth-flow)
9. [Phase 5 — Home / Dashboard Tab](#phase-5--home--dashboard-tab)
10. [Phase 6 — Budget Tab](#phase-6--budget-tab)
11. [Phase 7 — Budget Edit & Target Screens](#phase-7--budget-edit--target-screens)
12. [Phase 8 — Transactions](#phase-8--transactions)
13. [Phase 9 — Accounts Tab](#phase-9--accounts-tab)
14. [Phase 10 — Bills Tab](#phase-10--bills-tab)
15. [Phase 11 — Nudges Tab](#phase-11--nudges-tab)
16. [Phase 12 — Profile Tab](#phase-12--profile-tab)
17. [Phase 13 — Knowledge Hub Tab](#phase-13--knowledge-hub-tab)
18. [Phase 14 — Rewards & Gamification](#phase-14--rewards--gamification)
19. [Phase 15 — Onboarding Questionnaire](#phase-15--onboarding-questionnaire)
20. [Phase 16 — Polish Pass](#phase-16--polish-pass)

---

## 1. Guiding Principles

- **Functionality first.** Each phase produces a working screen. Never break
  existing business logic while restyling.
- **Design system as single source of truth.** No raw hex values or magic
  numbers in screen files. Every colour, spacing, shadow, and radius comes
  from `lib/theme.ts`, `lib/tokens.ts`, or `lib/typography.ts`.
- **Components before screens.** Phase 2 builds the shared primitive library
  so that screens assemble from reusable pieces rather than duplicating styles.
- **One screen per PR.** Makes review tractable and keeps the diff legible.
- **Pixel-perfect parity.** The end state is an exact replica of the
  `MoniMata_V5.html` mockup when viewed on a 375 × 812 pt canvas.

---

## 2. Design Token Reference

### CSS Variables → RN Token Names

| CSS variable | Value                  | RN token name        | Purpose                                |
| ------------ | ---------------------- | -------------------- | -------------------------------------- |
| `--gd`       | `#0D1F0D`              | `darkGreen`          | Dark headers, FAB gradient backgrounds |
| `--gm`       | `#1A3A1A`              | `darkGreenMid`       | Mid dark surface                       |
| `--gp`       | `#2D6A2D`              | `brand`              | Primary brand green (CTAs, icons)      |
| `--gb`       | `#4CAF50`              | `brandBright`        | Bright indicator dots                  |
| `--lime`     | `#A8E063`              | `lime`               | Lime accent — active tabs, primary CTA |
| `--lime2`    | `#C5F07A`              | `lime2`              | Lighter lime                           |
| `--lime3`    | `#E0FAB8`              | `lime3`              | Subtlest lime tint                     |
| `--white`    | `#FFFFFF`              | `white`              | Pure white                             |
| `--ow`       | `#F5F9F0`              | `background`         | Off-white app background               |
| `--s1`       | `#EEF9E4`              | `surface`            | Card / chip / row surface              |
| `--s2`       | `#E0F2D0`              | `surfaceElevated`    | Progress bar tracks, selected states   |
| `--s3`       | `#CAE8B4`              | `surfaceHigh`        | Higher-contrast surface                |
| `--tp`       | `#0D1F0D`              | `textPrimary`        | Headings, body                         |
| `--ts`       | `#3D5C3D`              | `textSecondary`      | Sub-labels                             |
| `--tm`       | `#7A9A7A`              | `textMeta`           | Meta / captions                        |
| `--tl`       | `#B0C8B0`              | `textTertiary`       | Placeholders, disabled                 |
| `--bd`       | `rgba(45,106,45,0.12)` | `border`             | Standard card/input border             |
| `--bds`      | `rgba(45,106,45,0.25)` | `borderStrong`       | Focused input border                   |
| `--red`      | `#D93025`              | `error`              | Overspent / destructive                |
| `--redl`     | `#FDECEA`              | `errorSubtle`        | Error background tint                  |
| `--amber`    | `#F59E0B`              | `warning`            | Underfunded / caution                  |
| `--ambl`     | `#FEF3C7`              | `warningSubtle`      | Warning background tint                |
| `--blue`     | `#2563EB`              | `info`               | Info / link colour                     |
| `--bluel`    | `#EFF6FF`              | `infoSubtle`         | Info background tint                   |
| `--purple`   | `#7C3AED`              | `purple`             | Gamification / rewards accent          |
| `--purpl`    | `#F5F3FF`              | `purpleSubtle`       | Purple background tint                 |
| `--teal`     | `#0891B2`              | `teal`               | Hub / education accent                 |
| `--teall`    | `#E0F7FA`              | `tealSubtle`         | Teal background tint                   |
| `--cs`       | box-shadow sm          | `shadowSm`           | Card shadows                           |
| `--csm`      | box-shadow md          | `shadowMd`           | Modal / sheet shadows                  |
| `--rm`       | `16`                   | `radius.md` (tokens) | Standard border radius                 |
| `--rl`       | `22`                   | `radius.lg` (tokens) | Large border radius (cards, sheets)    |

### Dark Mode Overrides

| Token             | Light value            | Dark value              |
| ----------------- | ---------------------- | ----------------------- |
| `background`      | `#F5F9F0`              | `#0D1F0D`               |
| `surface`         | `#EEF9E4`              | `#1A3A1A`               |
| `surfaceElevated` | `#E0F2D0`              | `#2D6A2D`               |
| `textPrimary`     | `#0D1F0D`              | `#F5F9F0`               |
| `textSecondary`   | `#3D5C3D`              | `#A8E063`               |
| `textMeta`        | `#7A9A7A`              | `#7A9A7A`               |
| `border`          | `rgba(45,106,45,0.12)` | `rgba(168,224,99,0.15)` |

---

## 3. Screen Inventory

### Existing Screens → Visual Overhaul Only

| Route                     | HTML screen ID                 | Phase |
| ------------------------- | ------------------------------ | ----- |
| `(auth)/index`            | `scr-welcome`                  | 4     |
| `(auth)/register`         | `scr-register`                 | 4     |
| `(auth)/login`            | `scr-login`                    | 4     |
| `(auth)/verify-bvn`       | `scr-verify-bvn`               | 4     |
| `(auth)/link-bank`        | `scr-link-bank`                | 4     |
| `(tabs)/index`            | `scr-budget`                   | 6     |
| `(tabs)/transactions`     | `scr-transactions`             | 8     |
| `(tabs)/accounts`         | `scr-accounts`                 | 9     |
| `(tabs)/bills`            | `scr-bills` + detail + receipt | 10    |
| `(tabs)/nudges`           | `scr-nudges`                   | 11    |
| `(tabs)/profile`          | `scr-notif-settings`           | 12    |
| `app/budget-edit`         | `scr-budget-edit`              | 7     |
| `app/add-transaction`     | `scr-add`                      | 8     |
| `app/target/[categoryId]` | (target sheet)                 | 7     |
| `app/transaction/[id]`    | (tx detail)                    | 8     |

### New Screens to Create

| Route (proposed)            | HTML screen ID         | Phase |
| --------------------------- | ---------------------- | ----- |
| `(tabs)/home`               | `scr-home`             | 5     |
| `(tabs)/rewards`            | `scr-rewards`          | 14    |
| `(tabs)/hub`                | `scr-hub`              | 13    |
| `(auth)/onboarding`         | `scr-onboarding`       | 15    |
| `(auth)/budget-seed`        | (budget seed preview)  | 15    |
| `app/split-transaction`     | `scr-split-tx`         | 8     |
| `app/notification-settings` | `scr-notif-settings`   | 12    |
| `app/challenge/[id]`        | `scr-challenge-detail` | 14    |

---

## Phase 0 — Design System ✅

**Status:** ~~In Progress~~ **Complete**  
**Files:** `lib/theme.ts`, `lib/tokens.ts`, `lib/typography.ts`

This phase is the prerequisite for every other phase. Establishes one source of
truth for all visual constants so no screen ever contains a raw hex value.

### Deliverables

#### `lib/theme.ts` — Expanded colour token system

- Extend `ThemeColors` interface with all new tokens from the mockup's `:root`
  block (`darkGreen`, `lime`, surfaces `s1/s2/s3`, text tokens `textMeta`,
  `borderStrong`, status + subtle pairs for all accent colours).
- Update both `lightColors` and `darkColors` palettes to match the mockup
  exactly.
- Export `BRAND_GRADIENT` constant (stops for the dark-green header gradient).
- Keep `useTheme()` and `getTheme()` APIs unchanged.

#### `lib/tokens.ts` — Layout constants

```ts
export const radius = { xs: 8, sm: 12, md: 16, lg: 22, full: 9999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
export const shadow = {
  sm: { shadowColor, shadowOffset: {0,1}, shadowOpacity: 0.06, elevation: 2 },
  md: { shadowColor, shadowOffset: {0,4}, shadowOpacity: 0.10, elevation: 5 },
};
export const tabBarHeight = 76;
export const headerHeight = { condensed: 54, standard: 64 };
```

#### `lib/typography.ts` — Text style presets

- Font family: `'PlusJakartaSans-{weight}'` (loaded in Phase 1).
- Named presets: `display`, `h1`–`h3`, `body`, `bodySmall`, `caption`,
  `label`, `labelSmall`, `mono` (for money amounts).
- Each preset is a `TextStyle` object ready for `StyleSheet.create()`.
- Export `formatMoney(kobo: number, opts?)` moved here from ad-hoc screen
  implementations.

### Acceptance Criteria

- [x] All tokens from design system reference table are present as typed fields.
- [x] `lightColors` + `darkColors` values match the HTML `:root` variables
      precisely (colour-check the hex values).
- [x] `lib/tokens.ts` + `lib/typography.ts` compile without errors.
- [x] Running `npx tsc --noEmit` produces no new errors.
- [x] No existing screen is broken (no import path changes yet — those happen
      as each screen is migrated).

---

## Phase 1 — Missing Dependencies ✅

**Status:** **Complete**  
**Files:** `package.json`, `app.json`, `app/_layout.tsx`

### Deliverables

1. Install `expo-linear-gradient` (`npx expo install expo-linear-gradient`) —
   replaces `react-native-linear-gradient`; already compatible with Expo SDK 55.
2. Load **Plus Jakarta Sans** via `expo-font` with all required weights (300,
   400, 500, 600, 700, 800) and italic-400. Fonts live in
   `assets/fonts/PlusJakartaSans/`.
3. Gate the root navigator behind `<useFonts>` / `SplashScreen.preventAutoHideAsync()`
   so the app never renders before fonts resolve.

### Acceptance Criteria

- [x] `expo-linear-gradient` renders a gradient on a test screen.
- [x] Plus Jakarta Sans renders correctly at all weights in a test screen.
- [x] Cold launch does not flash system font before custom font loads.

---

## Phase 2 — Shared Component Library (`components/ui/`) ✅

**Status:** **Complete**

All primitives used across screens. Zero business logic. Each component accepts
a full prop interface; style overrides allowed via `style` prop.

| File                | Variants / notes                                                |
| ------------------- | --------------------------------------------------------------- |
| `Button.tsx`        | `lime` \| `green` \| `red` \| `ghost` \| `icon` (X-btn)         |
| `Card.tsx`          | Standard card with `--cs` shadow                                |
| `Badge.tsx`         | Pill — `success` \| `error` \| `warning` \| `info` \| `neutral` |
| `Input.tsx`         | Label + field + optional hint; focus ring animation             |
| `BottomSheet.tsx`   | Reanimated spring; handle bar; backdrop; max-height prop        |
| `SectionHeader.tsx` | Uppercase label + optional right-side link                      |
| `Avatar.tsx`        | Rounded-square with initials / image; size prop                 |
| `ProgressBar.tsx`   | Animated; `ok` \| `warn` \| `over` color states                 |
| `AmountDisplay.tsx` | Kobo → formatted ₦ string; `size` / `weight` props              |
| `ListRow.tsx`       | Generic tappable row; left icon slot, right slot                |
| `Chip.tsx`          | Tappable filter chip; `on` selected state                       |
| `Divider.tsx`       | Hairline separator (`--bd` colour)                              |
| `EmptyState.tsx`    | Icon + heading + sub + optional CTA button                      |

### Acceptance Criteria

- [x] Storybook-style render test for each component (or screenshot review).
- [x] All components use theme tokens — no raw hex values.
- [x] All interactive components have `accessibilityRole` + `accessibilityLabel`.
- [x] Touch targets ≥ 44 × 44 pt.

---

## Phase 3 — Navigation Shell ✅

**Status:** **Complete**  
**Files:** `app/(tabs)/_layout.tsx`, `app/_layout.tsx`, `components/ui/TabBar.tsx`

### IA Changes from MVP

| Old tabs     | New tabs (left → right)      |
| ------------ | ---------------------------- |
| Budget       | **Home** (new default)       |
| Transactions | **Budget**                   |
| Accounts     | **[FAB — center, no label]** |
| Bills        | **Transactions**             |
| Profile      | **Profile**                  |

Accounts, Bills, Hub, and Rewards are accessible from Home cards and Profile
settings rows rather than occupying permanent tab slots.

### Custom Tab Bar

Replace default Expo Tabs tab bar with a custom `components/ui/TabBar.tsx`:

- Height: 76 pt (safe-area-aware).
- Active icon: lime stroke, lime label.
- Inactive: `textMeta` colour.
- FAB: 46 pt lime circle, `+` icon, elevated 4 pt shadow, sits `−22 pt` above
  the bar baseline (overlaps it).
- Nudge badge on Profile tab.

### Acceptance Criteria

- [x] All 5 named tabs (Home, Budget, Activity, Pay Bills, Nudges) render without errors.
- [x] FAB (lime, bottom-right) opens `/add-transaction`.
- [x] Nudge badge count updates live.
- [x] Safe area insets respected on iPhone notch and Android nav-bar devices.
- [x] Active tab uses `colors.brand` (#2D6A2D). All icons are outline-only.

---

## Phase 4 — Auth Flow ✅

**Status:** **Complete**  
**Files:** `app/(auth)/_authShared.tsx` _(new)_, `index.tsx`, `register.tsx`, `login.tsx`, `verify-bvn.tsx`, `link-bank.tsx`

### Delivered

- `_authShared.tsx` — shared primitives: `AuthInput` (animated focus ring), `BackBtn` (frosted `.x-btn.dk` pill), `EyeIcon`, `TrustCard`, shared `s` StyleSheet.
- All 5 auth screens restyled: dark-green curved header, Plus Jakarta Sans typography, brand-green CTAs.
- Back button on every screen uses `BackBtn` — 36×36 frosted-glass pill (`rgba(255,255,255,0.10)` background, `rgba(255,255,255,0.12)` border, radius 11) matching `.x-btn.dk`.
- Register screen: ToS + Privacy Policy notice below submit button.
- All form logic (`react-hook-form` + `zod` + Redux thunks) untouched.

---

## Phase 5 — Home / Dashboard Tab ✅

**Status:** **Complete**  
**File:** `app/(tabs)/home.tsx`

### Delivered

- Dark green `.home-hdr` shell (`borderBottomRadius: radius.xl`, `overflow: hidden`).
- Top row: initials avatar (→ Profile) + greeting copy + notification bell with unread dot.
- Frosted balance card (`.bal-card`) — net worth from `useAccounts()`, "Add" (→ `/add-transaction`) and "Transfer" (→ `/accounts`) action buttons.
- Stats grid — Income (total ZBB income = TBB + assigned) / Expenses (sum of negative category activity) from `useBudget()`.
- Nudge pill — first non-dismissed, unread nudge from `useNudges(false)`; X button calls `useDismissNudge`; taps navigate to Nudges tab.
- Streak card — 7-day dot row, day labels, "Keep it up!" badge.  
  ⚠ **FAKE DATA** (Phase 14 replaces with real data from gamification service — see backend design notes below).
- Goals section — categories with `target_amount !== null`; gradient progress bar (`LinearGradient`); navigates to `/target/[categoryId]`; "Budget →" link goes to Budget tab.

### Gamification / Streak — Backend Design (Phase 14)

Gamification is a **net-new vertical** that should be a separate FastAPI service (or an isolated module within the monolith) to avoid coupling the core budget domain with rewards logic. Recommended architecture:

#### Database tables (PostgreSQL)

```sql
-- user_streaks: one row per user, updated by Celery task at UTC midnight
CREATE TABLE user_streaks (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  current       INT  NOT NULL DEFAULT 0,   -- consecutive days
  longest       INT  NOT NULL DEFAULT 0,
  last_active   DATE,                      -- last date user performed a qualifying action
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- streak_events: qualifying actions that count toward the streak
CREATE TABLE streak_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  event_type  TEXT NOT NULL,               -- 'login' | 'budget_assigned' | 'transaction_added'
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_xp: running XP ledger
CREATE TABLE user_xp (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  delta       INT  NOT NULL,               -- positive = earn, negative = spend
  reason      TEXT NOT NULL,               -- 'streak_day' | 'badge_awarded' | 'challenge_complete'
  reference_id UUID,                       -- nullable FK to relevant entity
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- user_badges: earned badges (immutable once awarded)
CREATE TABLE user_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  badge_slug  TEXT NOT NULL,
  awarded_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, badge_slug)
);
```

#### Streak logic (Celery beat task, runs UTC midnight +01:00)

1. For each user, query `streak_events` where `occurred_at >= today 00:00 WAT`.
2. If at least one qualifying event exists → `current += 1`, update `last_active`.
3. If no event → reset `current = 0`.
4. Update `longest = max(longest, current)`.
5. Award XP: `+10 XP` per day, `+50 XP` bonus at 7-day milestone, `+200 XP` at 30-day milestone.

#### API endpoints (prefixed `/gamification`)

| Method | Path                        | Description                                                                  |
| ------ | --------------------------- | ---------------------------------------------------------------------------- |
| `GET`  | `/gamification/me`          | Current user's streak, XP, level, recent badges                              |
| `POST` | `/gamification/event`       | Record a qualifying event (called internally by budget/transaction services) |
| `GET`  | `/gamification/leaderboard` | Top 10 streaks (opt-in only)                                                 |
| `GET`  | `/gamification/badges`      | All badge definitions + earned status                                        |

#### Mobile integration (Phase 14)

- Add `GET /gamification/me` to React Query with `queryKeys.streak()`.
- Replace `FAKE_STREAK` constant in `home.tsx` with `useStreak()` hook.
- Add `useAwardBadge()` mutation called from success paths (transaction added, budget completed etc.).
- Rewards tab (`app/(tabs)/rewards.tsx`) uses the same hook for the full badge grid and XP bar.

---

**File:** `app/(tabs)/index.tsx` (rename to `budget.tsx`; update `_layout`)

### Visual changes

- Header: white background, month navigator centred, TBB card (dark green, lime amount).
- "Assign All" button: lime outline pill in TBB card.
- Group headers: subtle `surface` background, uppercase labels, group total.
- Category rows: name + `ProgressBar` fill (ok/warn/over) + available amount right-aligned.
- Funding dots: ● green = funded, ● amber = underfunded, ○ = empty.

### Assign Money Sheet (existing `AssignSheet`)

- Numpad-based entry (3 × 4 grid matching `assign-numpad`).
- Quick-fill chips: "Fill Up", "½ Fill", "₦10k", "₦5k" (horizontal scroll).
- Stats row: TBB / Already Assigned / Available (3-cell bar).
- Move Money sub-screen: category picker + amount + confirm.

---

## Phase 7 — Budget Edit & Target Screens ✅

**Files:** `app/budget-edit.tsx`, `app/target/[categoryId].tsx`

### Budget Edit (`scr-budget-edit`)

- Dark green gradient header, CTBM progress card.
- Drag-handle rows (visual only — `PanResponder` or `react-native-draggable-flatlist` for reorder in a future phase).
- Inline rename input with auto-focus.
- Add category button per group (dashed outline style).
- Add group button at bottom (dashed container).

### Category Target (`scr-target` — current target screen)

- 4-tab frequency selector (Weekly / Monthly / Yearly / Custom) as pill tabs.
- Behavior picker: `set_aside` / `refill` / `balance` with radio rows.
- Sentence-style amount input: "I need ₦ **_ every _**".

---

## Phase 8 — Transactions ✅

**Files:** `app/(tabs)/transactions.tsx`, `app/transaction/[id].tsx`,
`app/add-transaction.tsx`, `app/split-transaction.tsx` _(new)_

### Transactions list (`scr-transactions`)

- Date-grouped sections with sticky day headers.
- Row: narration, category pill, amount (green income / red expense), account icon.
- Search bar at top (expandable).
- Pull-to-refresh triggers WatermelonDB sync (existing).

### Transaction Detail

- Bank import: read-only except category + memo fields.
- Manual: fully editable, delete button (red, destructive confirm).

### Add Transaction (`scr-add`)

- Account picker chip row.
- Category picker (bottom sheet, grouped).
- Date + time row.
- "Split" toggle expands split rows.
- Recurring toggle → frequency picker sheet.

### Split Transaction (`scr-split-tx`) _(new screen)_

- Full-screen split editor promoted from the add-transaction overlay.
- Dynamic split rows, running total validation.

---

## Phase 9 — Accounts Tab ✅

**File:** `app/(tabs)/accounts.tsx`

### Visual changes (`scr-accounts`)

- Account cards: bank logo placeholder, balance, last-synced timestamp.
- Mono-linked badge + sync now row.
- Re-auth warning card (amber strip) when `requires_reauth = true`.
- Add account: lime "+" FAB → bottom sheet.
- Account options: edit alias / update balance / unlink / delete (action sheet).

---

## Phase 10 — Bills Tab ✅

**File:** `app/(tabs)/bills.tsx`

The 6-step payment state machine is already built. Each step gets a visual skin:

| Step              | Screen ID                  | Visual                            |
| ----------------- | -------------------------- | --------------------------------- |
| 1 — Categories    | `scr-bills`                | 2-column icon grid on dark header |
| 2 — Billers       |                            | Search + list rows                |
| 3 — Payment Items | `scr-bill-detail` (step 1) | Card list                         |
| 4 — Customer Form | `scr-bill-detail` (step 2) | Input form                        |
| 5 — Confirm       | `scr-bill-detail` (step 3) | Summary card + lime CTA           |
| 6 — Receipt       | `scr-bill-receipt`         | Success card, share button        |

---

## Phase 11 — Nudges Tab ✅

**File:** `app/(tabs)/nudges.tsx`

### Visual changes (`scr-nudges`)

- Dark header with unread count badge.
- Nudge cards: icon bubble (warn/danger/success/info), unread left-border accent,
  dismissed opacity.
- **Detail sheet**: "Why you got this" amber card, action buttons with icons,
  dismiss link.

---

## Phase 12 — Profile Tab

**Files:** `app/(tabs)/profile.tsx`, `app/notification-settings.tsx` _(new)_

### Profile screen

- User card (avatar, name, email, phone).
- Settings rows: Biometric Lock toggle, Notification Settings → push to
  `/notification-settings`, Help & Support, Privacy Policy, Log Out (red).
- Nudge unread count badge removed from tab icon; shown inline on Notification
  Settings row instead.

### Notification Settings screen _(new, promoted from modal)_

- Quiet hours time pickers.
- Fatigue limit stepper (1–10).
- Master enable/disable toggle.

---

## Phase 13 — Knowledge Hub Tab ✅

**Status:** **Complete**  
**File:** `app/(tabs)/hub.tsx`

### Layout (`scr-hub`) — Delivered

- Dark green header (`paddingTop insets+16`, `borderBottomRadius 28`).
- Title row: `x-btn.dk` back button (frosted), centred "Knowledge Hub" title, spacer.
- "Learn & Earn 📚" hero heading + subtitle.
- 3-tab pill switcher (Articles / Video Courses / Quizzes) — lime pill on dark overlay bg, matching `.hub-tabs` / `.hub-tab.on`.
- **Articles tab**: category filter chips (All / Budgeting / Saving / Investing / Debt), featured hero card (`.feat-card` — brand green bg, glow decoration, lime "Featured" tag, title, XP badge, meta), article list rows (`.art-c` — 66×66 emoji thumb in subtle colour, tag, title, read-time, XP badge).
- **Video Courses tab**: "In Progress" section with horizontal scroll of gradient-thumb mini cards (`.course-card` — `LinearGradient` thumb, play button, lessons/XP/progress bar), "All Courses" section with full-width list rows (`.chal-c` style — gradient icon tile, title, description, XP, duration, progress bar).
- **Quizzes tab**: Daily quiz hero card (emoji, title, sub, green "Start Today's Quiz" CTA), past quizzes list.
- All data is static seed (`ARTICLES`, `COURSES`, `QUIZZES` arrays) — Phase 14 wires live API.
- `hub` registered as hidden tab (`href: null`) in `app/(tabs)/_layout.tsx`.
- Profile → "Knowledge Hub" row now navigates via `router.push('/(tabs)/hub')`.
- Zero raw hex/rgba values — all theme tokens.

### Backend Design Notes (implement in Phase 14+)

The Knowledge Hub is a **Content Service** that can live as a separate FastAPI microservice (or a module inside the monolith) with its own read-optimised models. It is intentionally decoupled from the budget domain.

#### Database tables

```sql
-- Content is stored server-side; mobile fetches via REST, not WatermelonDB sync.

-- hub_content: articles, courses, quizzes (polymorphic)
CREATE TABLE hub_content (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(16) NOT NULL CHECK (content_type IN ('article', 'course', 'quiz')),
  slug         VARCHAR(128) NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT,
  category     VARCHAR(64),           -- 'Budgeting' | 'Saving' | 'Investing' | 'Debt'
  emoji        VARCHAR(8),
  xp_reward    INTEGER NOT NULL DEFAULT 0,
  read_min     INTEGER,               -- articles only
  is_featured  BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- hub_course_lessons: ordered lessons within a course
CREATE TABLE hub_course_lessons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES hub_content(id) ON DELETE CASCADE,
  position    SMALLINT NOT NULL,
  title       TEXT NOT NULL,
  video_url   TEXT,
  duration_s  INTEGER,
  xp_reward   INTEGER NOT NULL DEFAULT 0
);

-- hub_user_progress: per-user content engagement
CREATE TABLE hub_user_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id  UUID NOT NULL REFERENCES hub_content(id) ON DELETE CASCADE,
  status      VARCHAR(16) NOT NULL DEFAULT 'started'
                CHECK (status IN ('started', 'completed')),
  score       SMALLINT,              -- quizzes: raw score (e.g. 8 out of 10)
  score_max   SMALLINT,              -- quizzes: maximum possible score
  xp_earned   INTEGER NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, content_id)
);

-- hub_quiz_questions: questions within a quiz
CREATE TABLE hub_quiz_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id     UUID NOT NULL REFERENCES hub_content(id) ON DELETE CASCADE,
  position    SMALLINT NOT NULL,
  question    TEXT NOT NULL,
  options     JSONB NOT NULL,         -- [{"key":"a","text":"...","correct":true}, ...]
  explanation TEXT
);

-- hub_daily_quiz: which quiz_id is active today (rotates via a cron job)
CREATE TABLE hub_daily_quiz (
  date        DATE PRIMARY KEY,
  quiz_id     UUID NOT NULL REFERENCES hub_content(id)
);
```

#### API endpoints (prefix `/hub`)

| Method | Path                                      | Description                                                |
| ------ | ----------------------------------------- | ---------------------------------------------------------- |
| `GET`  | `/hub/articles`                           | Paginated article list; query params: `category`, `cursor` |
| `GET`  | `/hub/articles/:slug`                     | Full article body (Markdown or block JSON)                 |
| `GET`  | `/hub/courses`                            | Course list with user progress embedded                    |
| `GET`  | `/hub/courses/:slug`                      | Course detail with lessons and user progress               |
| `POST` | `/hub/courses/:slug/lessons/:id/complete` | Mark lesson done, award XP via gamification service        |
| `GET`  | `/hub/quizzes`                            | Quiz list with user scores                                 |
| `GET`  | `/hub/quizzes/daily`                      | Today's daily quiz                                         |
| `POST` | `/hub/quizzes/:slug/submit`               | Submit answers, get score, award XP                        |

#### Mobile integration (Phase 14)

- Add React Query hooks: `useHubArticles(category?)`, `useHubCourses()`, `useHubDailyQuiz()`.
- Register `queryKeys.hub.*` in `lib/queryKeys.ts`.
- Replace `ARTICLES` / `COURSES` / `QUIZZES` seed arrays in `hub.tsx` with hook data.
- Use `useInfiniteQuery` for article pagination (infinite scroll).
- `POST /hub/quizzes/:slug/submit` response triggers `invalidateQueries(queryKeys.gamification())` so the Profile XP stat and streak card update immediately.
- Cache strategy: `staleTime: 10 minutes` for content (rarely changes); `staleTime: 0` for daily quiz (resets at midnight).

#### Content management

- Seed initial content via Alembic data migration (10 articles, 4 courses, 5 quizzes) so the hub is non-empty on first launch.
- Long-term: lightweight internal CMS (Strapi or custom admin panel) so the content team can publish without a deploy.

## Phase 14 — Rewards & Gamification ✅

**Status:** **Complete**  
**Files:** `app/(tabs)/rewards.tsx`, `app/challenge/[id].tsx`

### Rewards screen (`scr-rewards`) — Delivered

- Dark green header (`borderBottomRadius 28`) with radial glow decoration, back button (frosted `x-btn.dk`).
- "Money Warrior ⚔️" level title + "Level X · Y XP" subtitle.
- XP progress bar (`.xp-bar-wrap`): `xpLev` (lime, Level + title), current/max XP, 8 pt bar with brand fill, meta row ("Current level" / "N XP to Level X+1").
- Streak banner (`.streak-banner`): fire emoji + 42 pt streak number + "days" label; day-of-week dots (7 circles — ✓ done / ★ today / · future) in correct semantic colours; "STREAK" amber uppercase label + "Daily Budget Check-in" + "Log daily" hint.
- Badges grid (3-col, `.badges-grid`): earned vs locked (0.55 opacity), "New!" pip (red dot top-right), `bdgIcon` + `bdgName` + "Earned!" / lock hint.
- Active Challenges (`.chal-c`): icon tile (46×46, colour-matched), title, desc, XP badge, progress label, progress bar (colour per challenge); **"✓ Joined"** badge or **"Join"** brand button; tap → `router.push('/challenge/[id]')`; join optimistically updates local state + toast.
- All data is static seed (`FAKE_*` constants + `CHALLENGES` array) — Phase 16 replaces with `useGamification` / `useStreak` / `useBadges` / `useChallenges` hooks.
- `rewards` registered as hidden tab (`href: null`) in `app/(tabs)/_layout.tsx`.
- Profile → "Rewards & XP" row wired to `router.push('/(tabs)/rewards')`.

### Challenge Detail (`scr-challenge-detail`) — Delivered

- `LinearGradient` hero (160°, two-stop per color: g/a/b/p) with `borderBottomRadius 28`, back button (frosted).
- 52 pt emoji, "● Active" lime pill + "{endsIn}" amber pill status row.
- Title (22 pt/800) + description (14 pt/0.6 opacity) + reward row (3 frosted cells: XP, Badge name, Participants).
- **Your Progress card** (shown when joined): gradient progress bar (10 pt), progress label, milestone dots row (achieved = brand border).
- **Mini-leaderboard**: top entries + "You" row highlighted in `surface`/`brand` border; trophy emoji medals for top.
- **Challenge Rules card**: numbered bullets in `surface` circles.
- **Participants strip**: 5 avatar circles (overlapping, −8 ml) + `+N` count pill.
- **CTA**: joined → "✓ You're In — Keep Going!" (`successSubtle`) + "Leave Challenge" (`error`) with confirm dialog; not joined → "Join Challenge 🎯" (`brand`).
- All 4 challenge IDs (`nospend`, `literacy`, `save10k`, `zero`) have full seed data; unknown IDs show a graceful fallback.

### Backend Integration Notes

The Gamification backend design is already documented in Phase 5 (streak + XP tables, `/gamification/*` endpoints). Additional endpoints needed for challenges:

```sql
-- challenges: challenge definitions
CREATE TABLE challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(64) NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  emoji       VARCHAR(8),
  color       VARCHAR(2) NOT NULL DEFAULT 'g',   -- g | a | b | p
  xp_reward   INTEGER NOT NULL DEFAULT 0,
  badge_slug  TEXT REFERENCES badge_definitions(slug),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- challenge_participants: many-to-many join
CREATE TABLE challenge_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress_pct FLOAT NOT NULL DEFAULT 0,
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (challenge_id, user_id)
);
```

| Method   | Path                                  | Description                                        |
| -------- | ------------------------------------- | -------------------------------------------------- |
| `GET`    | `/gamification/challenges`            | List active challenges with user join status       |
| `GET`    | `/gamification/challenges/:slug`      | Challenge detail + user progress + top leaderboard |
| `POST`   | `/gamification/challenges/:slug/join` | Join a challenge                                   |
| `DELETE` | `/gamification/challenges/:slug/join` | Leave a challenge                                  |
| `GET`    | `/gamification/badges`                | Already planned in Phase 5 backend notes           |

**Mobile integration (Phase 16 wiring):**

- Add `useChallenges()`, `useChallengeDetail(slug)`, `useJoinChallenge()`, `useLeaveChallenge()` hooks in `hooks/useGamification.ts`.
- Replace `CHALLENGES` seed in `rewards.tsx` and `CHALLENGES` record in `challenge/[id].tsx` with hook data.
- Replace `FAKE_*` constants in `rewards.tsx` and `profile.tsx` with `useGamificationMe()` response.
- Register `queryKeys.challenges()` and `queryKeys.challenge(slug)` in `lib/queryKeys.ts`.
- Challenge progress is updated server-side (Celery task checks transactions / hub reads at midnight); mobile polls with `refetchInterval: 30_000` when challenge detail is open.

---

## Phase 15 — Onboarding Questionnaire ✅

**Status:** **Complete**  
**Files:** `app/(auth)/onboarding.tsx`, `app/(auth)/budget-seed.tsx`

### Onboarding screen (`scr-onboarding`) — Delivered

- 3-step questionnaire flow, shown once immediately after BVN verification (new users only).
- `verify-bvn.tsx` now routes new users → `/(auth)/onboarding`; returning verified users still skip directly to `/(auth)/link-bank`.
- Dark green `LinearGradient` header (`darkGreen → darkGreenMid`): 3-pill progress bar (done = `brand`, active = `lime`, future = `overlayGhost` 6 pt pills with 3 pt radius), step meta label, 20/800 question, 13/400 sub.
- **Step 1 — Income type**: briefcase / laptop / storefront / school Ionicons with option keys `employed | freelancer | business | student`.
- **Step 2 — Housing**: home / people / business / person-add Ionicons with option keys `renting | family | mortgage | shared`.
- **Step 3 — Financial goal**: wallet / flag / trending-down / bar-chart Ionicons with option keys `cashflow | specific_goal | debt | track`.
- Each `RadioOptionCard`: 44×44 Ionicons tile (surfaceHigh/surfaceElevated bg), `optName` (700/14) + `optSub` (400/12), 22×22 rounded-7 checkbox (brand bg + `checkmark` icon when selected), border flips to `colors.brand` and bg to `colors.surface` on select.
- Live-preview hint card (`sparkles-outline` + text) animates in once an option is tapped.
- Privacy reassurance copy below options.
- "Continue" / "See My Budget Preview ✨" CTA (radius.full, 50 pt, disabled/0.4 opacity until selection); last step uses `lime` bg + `darkGreen` text to match `btn-lime` style.
- "Skip this question" text link advances (or finishes) without recording an answer (`null`).
- `OnboardingAnswers` type exported: `{ incomeType, housing, goal }` each typed union | `null`.
- Answers forwarded to `budget-seed` as JSON-encoded `answers` route param via `router.push`.
- All data is local component state — Phase 16 replaces `proceedToBudgetSeed()` with `POST /users/onboarding` before navigation.

### Budget Seed Preview (`scr-budget-seed`) — Delivered

- Receives `answers` JSON param; available for Phase 16 API call.
- Dark green `LinearGradient` header with radial `limeGlow` decoration, 48 pt `trophy-outline` Ionicon, "Your budget is ready!" (800/22) title, sub copy, stats row (3 cells: total categories / groups / target-suggested count — `lime`/800/24 numbers separated by `overlayGhostBorder` dividers).
- Scrollable `SeedGroup` accordion: each card has a coloured `groupIconTile` (Ionicons) + ALLCAPS group name + category count + `chevron-forward`/`chevron-down` toggle; first group expanded by default.
- Category rows: 8 pt `catDot` (brand or muted), category name, optional "Target suggested" badge (`flag-outline` Ionicon + text in `surface` pill).
- Seed groups: Housing (home-outline), Food & Groceries (restaurant-outline), Transport (car-outline), Savings & Goals (save-outline), Personal (phone-portrait-outline).
- Static `FAKE_SEED_GROUPS` seed data — totals computed at module level; Phase 16 replaces with API response.
- **"Let's start budgeting!"** lime 52 pt `radius.full` button + `rocket-outline` Ionicon → `router.replace('/(tabs)')`.
- **"Customise my categories"** ghost button (brand border, surface bg) + `settings-outline` → `router.replace('/budget-edit')`.
- Zero raw hex/rgba throughout.

### Backend Integration Notes

```
POST /users/onboarding
Authorization: Bearer <access_token>
Content-Type: application/json
Body:
  {
    "income_type": "employed" | "freelancer" | "business" | "student" | null,
    "housing":     "renting"  | "family"     | "mortgage" | "shared"  | null,
    "goal":        "cashflow" | "specific_goal" | "debt"   | "track"   | null
  }
Response 201:
  {
    "groups": [
      {
        "id": "uuid",
        "name": "Housing",
        "icon_slug": "home",
        "categories": [
          { "id": "uuid", "name": "Rent", "target_suggested": true },
          ...
        ]
      }
    ]
  }
```

**Server-side seeding logic:**

- A mapping table `onboarding_rules` maps `(income_type, housing, goal)` combination patterns to a set of category groups + categories.
- Seeding is idempotent: calling the endpoint again returns the same groups without duplicating.
- After the user taps "Let's start budgeting!", call `PATCH /users/me { "onboarding_complete": true }` so the onboarding flow is suppressed on future logins.

**Mobile integration (Phase 16 wiring):**

- Add `useSubmitOnboarding()` mutation in `hooks/useOnboarding.ts` (React Query `useMutation`).
- Replace `proceedToBudgetSeed()` in `onboarding.tsx` with the mutation; pass API-returned `groups` as a second param to `budget-seed`.
- Replace `FAKE_SEED_GROUPS` in `budget-seed.tsx` with the parsed groups param.
- Add `onboarding_complete: boolean` field to `AuthUser` type and `authSlice` state.
- In the root `_layout.tsx` auth guard, check `user.onboarding_complete`; if false, redirect new users to `/(auth)/onboarding` after first login.
- Register `queryKeys.onboarding()` in `lib/queryKeys.ts`.

---

## Phase 16 — Polish Pass ✅

**Status:** **Complete**  
**Files touched:** All screens + `store/authSlice.ts`, `database/index.ts`, `app/(auth)/_layout.tsx`, `app/_layout.tsx`, `app/(auth)/verify-bvn.tsx`, `app/(auth)/budget-seed.tsx`, `app/(tabs)/profile.tsx`

### Delivered

#### Accessibility

- Full audit across every interactive element in all migrated screens: `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`, and `accessibilityState` on all tappable rows, toggles, chips, and buttons.
- Budget `AssignSheet` numpad keys — each digit and backspace labelled.
- `accessibilityState={{ selected }}` on all filter chips (`nudges.tsx`, `hub.tsx`, `bills.tsx`).

#### Error States

- Home screen: `ErrorBoundary` wrapper + network error banner + loading skeletons on all data-fetching cards.
- Transactions screen: empty state with call-to-action; error banner on fetch failure.
- Accounts screen: re-auth warning card (amber strip) surfaced when `requires_reauth = true`.

#### Haptics

- `expo-haptics` `ImpactFeedbackStyle.Light` on all primary CTA button presses and FAB taps.
- `NotificationFeedbackType.Success` / `Error` on form submit success / failure paths.

#### Tests

- 28 `@testing-library/react-native` render tests added for all `components/ui/` primitives (`Button`, `Card`, `Badge`, `Input`, `BottomSheet`, `ProgressBar`, `AmountDisplay`, `ListRow`, `Chip`, `Divider`, `EmptyState`, `Avatar`, `SectionHeader`).
- `authSlice.test.ts` and `budgetSlice.test.ts` updated and passing.
- All 78 tests passing (`npx jest --no-coverage`).

#### Bug Fixes (discovered during polish pass)

| Bug                                                                                         | Root Cause                                                                                                        | Fix                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Registration failed even though backend created user                                        | `saveTokens(undefined, undefined)` threw TypeError when backend returned no tokens; single try/catch swallowed it | Register thunk restructured into 3 separate try/catch steps: soft-fail 5xx, login fallback, then saveTokens + `/auth/me` |
| `unsafeResetDatabase() can only be called from inside of a Writer` on logout                | WatermelonDB runtime constraint                                                                                   | `clearDatabase()` in `database/index.ts` wrapped in `_db.write(async () => {...})`                                       |
| `markOnboarded()` didn't navigate to `(tabs)`                                               | Expo Router `Stack.Screen` conditionals don't auto-navigate on Redux state change                                 | Added `<Redirect href="/(tabs)" />` guard to `(auth)/_layout.tsx`, reactive to `isAuthenticated && user.onboarded`       |
| Navigating to BVN verify / link-bank from post-onboarding screens redirected to home        | `(auth)/_layout.tsx` redirect guard fired for all authenticated+onboarded users                                   | Whitelist `verify-bvn` and `link-bank` routes from the redirect                                                          |
| After BVN verification, user sent to onboarding instead of link-bank (post-onboarding flow) | `verify-bvn.tsx` always navigated to `/(auth)/onboarding`                                                         | Check `user.onboarded` — if already onboarded, route to `/(auth)/link-bank`; otherwise continue to `/(auth)/onboarding`  |
| Dark space between budget-seed header curves and scroll content                             | Root view `backgroundColor: colors.darkGreen` showed through `overflow: hidden` corner cuts of curved header      | Changed root `backgroundColor` to `colors.background`                                                                    |
| Status bar renders dark on screens that set `style="light"`                                 | Root `_layout.tsx` had `<StatusBar style='auto' />` which conflicted with per-screen `StatusBar`                  | Removed global `StatusBar` from root layout; each screen controls its own                                                |
| `Text strings must be rendered within a <Text> component` on Profile screen                 | `<StatusBar />` and comment crammed onto same JSX line as `<View>`, leaving whitespace text nodes as children     | Split onto separate lines                                                                                                |

### Deferred to Phase 17+

| Item                                            | Notes                                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nudge Language persistent storage               | `profile.tsx` language preference needs `SecureStore` persistence across sessions                                                                  |
| Dark mode system-default                        | `ThemeProvider.tsx` needs a `clearOverride()` to revert to OS scheme rather than forcing light/dark                                                |
| `POST /users/onboarding` API wiring             | `onboarding.tsx` / `budget-seed.tsx` still use `FAKE_SEED_GROUPS`; replace with real API response                                                  |
| `PATCH /users/me { onboarding_complete: true }` | Should be called from `budget-seed.tsx` before the CTA navigates, so onboarding is suppressed on next login                                        |
| `FlashList` migration                           | Long lists (transactions, nudges, accounts) still use `ScrollView`; migrate to `FlashList` for 60 fps performance                                  |
| Gamification API wiring                         | `profile.tsx`, `home.tsx`, `rewards.tsx`, `challenge/[id].tsx` all use `FAKE_*` constants — Phase 14 backend notes describe the required endpoints |

---

## Implementation Status

| Phase | Description              | Status      |
| ----- | ------------------------ | ----------- |
| 0     | Design System            | ✅ Complete |
| 1     | Missing Dependencies     | ✅ Complete |
| 2     | Shared Component Library | ✅ Complete |
| 3     | Navigation Shell         | ✅ Complete |
| 4     | Auth Flow                | ✅ Complete |
| 5     | Home / Dashboard Tab     | ✅ Complete |
| 6     | Budget Tab               | ✅ Complete |
| 7     | Budget Edit & Target     | ✅ Complete |
| 8     | Transactions             | ✅ Complete |
| 9     | Accounts Tab             | ✅ Complete |
| 10    | Bills Tab                | ✅ Complete |
| 11    | Nudges Tab               | ✅ Complete |
| 12    | Profile Tab              | ✅ Complete |
| 13    | Knowledge Hub Tab        | ✅ Complete |
| 14    | Rewards & Gamification   | ✅ Complete |
| 15    | Onboarding Questionnaire | ✅ Complete |
| 16    | Polish Pass              | ✅ Complete |
