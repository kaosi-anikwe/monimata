# MoniMata — Product Requirements Document

**Document version:** 1.0  
**Date:** March 2026  
**Status:** Draft — For Design Team  
**Authors:** Engineering Team  
**Audience:** UI/UX Designers

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Target Users](#2-target-users)
3. [Design Principles](#3-design-principles)
4. [Brand & Visual Identity](#4-brand--visual-identity)
5. [Global UX Patterns](#5-global-ux-patterns)
6. [Information Architecture](#6-information-architecture)
7. [Screen Specifications](#7-screen-specifications)
   - [AUTH-01 · Welcome](#auth-01--welcome)
   - [AUTH-02 · Register](#auth-02--register)
   - [AUTH-03 · Log In](#auth-03--log-in)
   - [AUTH-04 · Verify BVN](#auth-04--verify-bvn)
   - [ONBOARD-01 · Onboarding Questionnaire](#onboard-01--onboarding-questionnaire)
   - [ONBOARD-02 · Link Bank Account](#onboard-02--link-bank-account)
   - [ONBOARD-03 · Budget Seed Preview](#onboard-03--budget-seed-preview)
   - [BUDGET-01 · Budget (Main)](#budget-01--budget-main)
   - [BUDGET-02 · Assign Money Sheet](#budget-02--assign-money-sheet)
   - [BUDGET-03 · Move Money Sheet](#budget-03--move-money-sheet)
   - [BUDGET-04 · Edit Budget Structure](#budget-04--edit-budget-structure)
   - [BUDGET-05 · Category Target](#budget-05--category-target)
   - [TX-01 · Transactions](#tx-01--transactions)
   - [TX-02 · Transaction Detail — Bank Import](#tx-02--transaction-detail--bank-import)
   - [TX-03 · Transaction Detail — Manual](#tx-03--transaction-detail--manual)
   - [TX-04 · Add Transaction](#tx-04--add-transaction)
   - [TX-05 · Split Transaction](#tx-05--split-transaction)
   - [ACCT-01 · Accounts](#acct-01--accounts)
   - [ACCT-02 · Add Manual Account](#acct-02--add-manual-account)
   - [ACCT-03 · Update Balance](#acct-03--update-balance)
   - [BILLS-01 · Bill Categories](#bills-01--bill-categories)
   - [BILLS-02 · Biller Selection](#bills-02--biller-selection)
   - [BILLS-03 · Payment Plan Selection](#bills-03--payment-plan-selection)
   - [BILLS-04 · Customer Details Form](#bills-04--customer-details-form)
   - [BILLS-05 · Payment Confirmation](#bills-05--payment-confirmation)
   - [BILLS-06 · Payment Receipt](#bills-06--payment-receipt)
   - [NUDGE-01 · Nudges / Notification Centre](#nudge-01--nudges--notification-centre)
   - [NUDGE-02 · Nudge Detail Sheet](#nudge-02--nudge-detail-sheet)
   - [PROFILE-01 · Profile & Settings](#profile-01--profile--settings)
   - [PROFILE-02 · Notification Settings Sheet](#profile-02--notification-settings-sheet)
   - [REPORT-01 · Reports Home](#report-01--reports-home)
   - [REPORT-02 · Spending by Category](#report-02--spending-by-category)
   - [REPORT-03 · Income vs Expenses](#report-03--income-vs-expenses)
   - [REPORT-04 · Net Worth](#report-04--net-worth)
   - [HUB-01 · Knowledge Hub](#hub-01--knowledge-hub)
   - [HUB-02 · Article Detail](#hub-02--article-detail)
8. [Accessibility Requirements](#8-accessibility-requirements)
9. [Out of Scope](#9-out-of-scope)

---

## 1. Product Vision

**MoniMata** (Pidgin: "Money Matters") is a zero-based budgeting app built specifically for Nigerians.

**Tagline:** _Every Kobo, Accounted For._

**The three problems MoniMata solves:**

| Problem           | Description                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fragmentation** | Nigerians routinely use 3–5 bank/fintech accounts (GTBank, Kuda, Zenith, OPay). Knowing your true total balance at any moment is a manual, error-prone exercise.                |
| **Friction**      | Manual-entry budgeting apps fail because users forget to log small daily spending (airtime top-ups, food transfers, transport). If the data isn't there, the budget is fiction. |
| **Knowledge Gap** | Users can see what they spent, but the app doesn't tell them how to change their behaviour. Data without guidance doesn't break cycles.                                         |

**How MoniMata solves them:**

- **Automatic bank sync** via Mono Connect — transactions flow in without manual entry
- **Zero-based budgeting** — every Naira must be "given a job" before it is spent
- **AI-powered nudges** — personalised, Pidgin-infused spending alerts that feel like a knowledgeable friend advising you, not a cold alert

### Zero-Based Budgeting Primer _(must understand before designing)_

Zero-based budgeting (ZBB) means your income minus your total assigned spending **always equals zero**. Every Naira you receive is assigned to a category before any spending happens.

The core number is **TBB (To Be Budgeted)** — the money you've received but haven't yet assigned to a category.

| Term          | Meaning                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TBB**       | Money received but not yet assigned. Should always trend toward ₦0. Positive = good, you have unassigned income. Negative = you've over-assigned; you need to pull money from somewhere. |
| **Assigned**  | How much you've decided to put in this category for the month.                                                                                                                           |
| **Activity**  | How much has actually been spent (debits) or received (credits) in this category this month.                                                                                             |
| **Available** | `Assigned − Activity`. Money left to spend. Can be negative (overspent).                                                                                                                 |
| **Target**    | An optional goal for a category — "I need ₦50,000 every month for rent". Drives the "Required this month" figure and visual underfunding indicators.                                     |

---

## 2. Target Users

### Primary Persona — "The Overwhelmed Professional"

**Adaeze, 28, Lagos**  
Works in tech, earns ₦350K/month across salary and freelance income. Has accounts at GTBank and Kuda. Spends money but can never account for where it goes at month-end. Understands the concept of budgeting but has never been able to maintain a system. Wants control, not complexity.

### Secondary Persona — "The Deliberate Planner"

**Emeka, 34, Abuja**  
Civil servant, married with two children. Manages a household budget on a fixed income. Has been doing manual budgeting on Google Sheets for years. Wants automation without losing control. High trust in the system once he's set it up.

### Tertiary Persona — "The First-Time Earner"

**Temi, 22, Ibadan**  
Recent graduate, just started her first job. Has never budgeted. Doesn't know where to start. Needs guided onboarding and simple framing that doesn't require prior financial literacy.

---

## 3. Design Principles

These principles must be embedded in every design decision.

1. **Nigerian-first, not Nigerian-last.** The app should feel like it was built for Nigerians from day one — currency is ₦, contexts reference NEPA, DSTV, Lagos BRT fares, data bundles. The tone can be warm, Pidgin-inflected, and direct. Do not feel like a US app that was localised.

2. **Calm over chaos.** Money is stressful. The UI should project calm confidence. Avoid patterns that feel alarmist or shame the user for overspending. Frame nudges as coaching, not scolding.

3. **Progressive disclosure.** A new user should be able to do the one most important thing (check their budget) without understanding every feature. Advanced features (targets, splits, reports) should reveal themselves gradually.

4. **Data density done right.** Budget screens need to display a lot of numbers. This does not mean the screen should feel like a spreadsheet. Use hierarchy, colour, and whitespace to make the data scannable rather than overwhelming.

5. **Delight in the details.** Small moments — the satisfaction of bringing TBB to zero, a celebratory micro-animation when a target is hit, a warm Pidgin nudge message — make the app memorable for the right reasons.

6. **Trust through transparency.** Any time the app accesses bank data or makes a payment, the UI must make the data flow legible. Users must feel in control of their financial data at all times.

---

## 4. Brand & Visual Identity

The design team has **complete creative latitude** over visual identity. The following are technical constraints and context only — not design mandates.

### What must be communicated visually

- Nigerian identity — warm, bold, confident
- Financial trustworthiness — this app handles real money
- Approachability — not intimidating for first-time budgeters
- Modernity — feels current and polished, not like a 2015 fintech

### Current placeholder palette _(designer may replace entirely)_

- Brand green: `#0F7B3F`
- Positive/success: `#10B981`
- Error/overspent: `#EF4444`
- Warning/underfunded: `#F59E0B`
- Background: `#F9FAFB`

### Dark Mode

A dark mode variant is **required** for all screens. The system should respect the device's OS-level dark/light preference and also allow manual override in Profile settings.

### Typography

No constraints given. Designer should select type hierarchy optimised for number-heavy screens and legibility in typical Nigerian lighting conditions (bright daylight, outdoor use).

### Currency display

All monetary values display in **Naira (₦)** with comma-separated thousands. Example: `₦1,250,000`. The ₦ symbol must always be present. Never display kobo/decimals in the main UI — round to the nearest Naira.

---

## 5. Global UX Patterns

These patterns apply uniformly across the entire app.

### 5.1 Loading States

Every screen and data-fetching component needs a defined loading state. Prefer **skeleton screens** (content-shaped placeholder blocks) over bare spinners for full-page loads. Spinners are acceptable for inline loading (e.g. a button while submitting).

### 5.2 Empty States

Every list or data view must have a thoughtful empty state. Empty states should:

- Use an illustration or icon that communicates the context
- Include a short heading and 1–2 lines of copy
- Where possible, include a CTA to resolve the empty state (e.g. "Link your first bank account" in Accounts)

### 5.3 Error States

- **Network errors / sync fails:** Shown as a banner or card within the screen (not a modal). Must include a "Try again" action.
- **Form validation errors:** Inline below the relevant field. Never show all errors at once in an alert at the top.
- **API errors during actions (save, pay, etc.):** Toast notification (not Alert). Non-blocking.
- **Complete page failures:** Full-screen error state with illustration + "Retry" CTA.

### 5.4 Toast Notifications

The app uses a custom in-app toast system for feedback, with three variants:

- ✅ **Success** — green, used for completed actions
- ❌ **Error** — red, used for failures
- ℹ️ **Info** — blue, used for neutral information

Toasts slide in from the top, auto-dismiss after 3.5 seconds, and can be tapped to dismiss early.

### 5.5 Confirmation Dialogs

Destructive or irreversible actions must require confirmation. Confirmation dialogs:

- Appear as a centered modal card with a fade-in animation
- Contain a clear title, a description of consequences, and Cancel + Confirm buttons
- The confirm button should be red for destructive actions, brand colour for neutral actions
- Tapping outside the card cancels the action

### 5.6 Action Sheets

Used when a single element has multiple possible actions (e.g. an account card's "⋯" menu). Slides up from the bottom. Contains a list of options with the last item always being "Cancel". Destructive options display in red.

### 5.7 Navigation

- The app uses a **bottom tab bar** for primary navigation (5 items max)
- Screens overlaying tabs (add transaction, transaction detail, budget edit, target edit) use a **stack navigation** pattern — pushed from the bottom or sliding in from the right
- The **back affordance** on stack screens should be a chevron-left or swipe-right gesture; the back button should always be visible and reachable with one thumb
- **Bottom sheets / modals** (assign money, move money, nudge detail, etc.) should use the platform `Modal` presentation with a visible drag handle where applicable

### 5.8 Floating Action Button (FAB)

A FAB for "Add Transaction" is present on the Budget and Transactions tabs only. It should be positioned above the tab bar, in the bottom-right corner. It must not obscure critical content.

### 5.9 Pull-to-Refresh

Any screen showing data that can be refreshed from the server supports pull-to-refresh. The refresh indicator should use the brand colour.

### 5.10 Haptics

Haptic feedback should be used for:

- Confirming a successful action (light impact)
- Selecting a destructive confirm button (medium impact)
- Error states on form submission (error impact)

---

## 6. Information Architecture

### 6.1 Authentication Flow (unauthenticated)

```
Welcome
  ├── Register → Verify BVN → Onboarding Questionnaire → Link Bank → Budget Seed Preview → Main App
  └── Log In   → Main App (if already onboarded)
              └── Verify BVN (if not yet verified) → [continues above]
```

### 6.2 Main App — Tab Bar

The design team may propose structural changes to this tab bar. The following is the current implementation as a starting point.

| Tab              | Icon suggestion | Screen                         |
| ---------------- | --------------- | ------------------------------ |
| **Budget**       | Wallet          | Monthly zero-based budget view |
| **Transactions** | Receipt         | Chronological transaction list |
| **Accounts**     | Bank building   | Account management             |
| **Pay Bills**    | Flash/Lightning | Interswitch bill payment flow  |
| **Profile**      | Person          | Settings, nudges, logout       |

**Design consideration:** The Nudges/Notification Centre is currently hidden from the tab bar and accessed via Profile. Consider whether a dedicated Nudges tab (or a bell icon in a top navigation bar) better serves discoverability, given that nudges are a core differentiator.

### 6.3 Stack Screens (outside tab bar)

These screens are pushed on top of the tab bar:

- Add Transaction (`/add-transaction`)
- Transaction Detail (`/transaction/[id]`)
- Budget Edit (`/budget-edit`)
- Category Target Edit (`/target/[categoryId]`)
- Link Bank (also used post-onboarding, `/link-bank`)
- BVN Verification (`/verify-bvn`)

### 6.4 Planned (Not Yet Built)

These features are required in the design but not yet implemented in code:

- Reports (P2)
- Financial Literacy / Knowledge Hub (P1)
- Auto-Assign one-tap flow (P2)

---

## 7. Screen Specifications

---

### AUTH-01 · Welcome

**Route:** `/` (auth entry point)  
**Purpose:** First impression for new and returning users. Establishes brand, communicates value, routes to registration or login.

**Entry point:** App cold launch, unauthenticated

**UI Elements:**

- Full-screen branded hero (logo, tagline, value proposition)
- App logo / wordmark: "MoniMata" prominently styled
- Tagline: _"Every Kobo, Accounted For."_
- 1–2 sentence value proposition (automatic bank sync, zero-based budgeting, AI nudges)
- Primary CTA: **"Get Started"** → AUTH-02 Register
- Secondary CTA: **"I already have an account"** → AUTH-03 Login

**States:**

- Only one state (static screen, no data)

**Design notes:**

- This is the most important brand moment in the app. It should feel confident and uniquely Nigerian.
- Consider whether a brief illustration or animation can communicate the product concept (e.g. money flowing into labelled jars/envelopes)
- Avoid stock imagery of people; illustrations are preferred

---

### AUTH-02 · Register

**Route:** `/(auth)/register`  
**Purpose:** Account creation.

**Entry point:** AUTH-01 "Get Started" CTA

**Form fields:**
| Field | Type | Validation |
|---|---|---|
| First name | Text | Required |
| Last name | Text | Required |
| Email address | Email | Required, valid email format |
| Phone number | Tel | Optional; must be a valid Nigerian number if provided (`+234` / `0` prefix, 11 digits) |
| Password | Password (hidden) | Required, minimum 8 characters |
| Confirm password | Password (hidden) | Required, must match password |

**Actions:**

- **Create Account** (primary) — submits form; on success navigates to AUTH-04 Verify BVN
- **"Already have an account? Sign in"** (link) → AUTH-03

**States:**

- Default
- Loading (submit in progress — button shows spinner, form disabled)
- Inline field errors (shown below each field as user interacts)
- Server error banner (e.g. "Email already in use")

**Design notes:**

- Use a single-column form with clear field labels above each input, not placeholder-only labels
- Show/hide password toggle on password fields
- Nigerian phone number format guidance should appear as helper text below the phone field

---

### AUTH-03 · Log In

**Route:** `/(auth)/login`  
**Purpose:** Authentication for returning users.

**Entry point:** AUTH-01 secondary CTA; link from AUTH-02

**Form fields:**
| Field | Type | Validation |
|---|---|---|
| Email address | Email | Required |
| Password | Password | Required |

**Actions:**

- **Log In** (primary) — on success: if user has not verified BVN → AUTH-04; else → Main App (BUDGET-01)
- **"Don't have an account? Sign up"** (link) → AUTH-02
- **"Forgot password?"** (link) — _out of scope for v1, but a placeholder should exist_

**States:**

- Default
- Loading
- Error banner (wrong credentials)

---

### AUTH-04 · Verify BVN

**Route:** `/(auth)/verify-bvn`  
**Purpose:** Identity verification via BVN (Bank Verification Number). Required by CBN sandbox compliance rules before any bank account can be linked.

**Entry point:** After registration; after login if `identity_verified === false`

**UI Elements:**

- Reassuring headline — frame this as security/identity protection, not surveillance
- Brief explanation of why BVN is needed (required for bank linking under CBN rules; MoniMata does not store the BVN)
- Privacy assurance copy: the BVN is sent to Interswitch's identity service for a one-time check and is never stored by MoniMata
- BVN input field: 11-digit numeric, large display, digit counter ("8/11 digits")
- Helper text: "Dial *565*0# on any network to retrieve your BVN"
- **Verify** CTA (disabled until 11 digits are entered)
- **"Skip for now (limited features)"** link — navigates to main app with warning that linking accounts won't work

**States:**

- Default
- Loading (verification in progress)
- Error: verification failed (BVN mismatch or service error)
- Already verified: if user somehow lands here with `identity_verified === true`, immediately redirect

**Design notes:**

- The BVN field should resemble an OTP input in feel — large, prominent, digit-oriented
- The skip link should be visually de-emphasised to discourage its use, but it must be present

---

### ONBOARD-01 · Onboarding Questionnaire

**Route:** `/(auth)/onboarding` (new screen, not yet built)  
**Purpose:** Gather just enough information about the user's financial life to pre-seed their budget with categories that are relevant to them. This reduces the "blank canvas" problem that causes new users to abandon zero-based budgeting apps.

**Entry point:** After AUTH-04 (successful BVN verification)  
**This is a multi-step flow.** Each step occupies the full screen. A progress indicator (e.g. step dots or a slim top progress bar) should be visible throughout.

---

#### Step 1 of 5 — Employment / Income Type

_"How do you primarily earn money?"_

| Option                     | Seeds additional categories                |
| -------------------------- | ------------------------------------------ |
| Employed (salary)          | Pension / NHIS, Work Transport             |
| Self-employed / freelancer | Business Expenses, Client Invoicing buffer |
| Business owner             | Payroll, Business Operations               |
| Student                    | Tuition, Study Materials                   |
| Multiple income streams    | All of the above combined                  |

Single-select. User can select one.

---

#### Step 2 of 5 — Housing Situation

_"Where do you currently live?"_

| Option                       | Seeds                                    |
| ---------------------------- | ---------------------------------------- |
| Renting (independent)        | Rent, Service Charge, Electricity / NEPA |
| Living with family / no rent | Household Contribution                   |
| Paying a mortgage            | Mortgage, Building Maintenance           |
| Shared accommodation         | Rent Split, Shared Utilities             |

Single-select.

---

#### Step 3 of 5 — Household

_"Who do you budget for?"_

| Option                     | Seeds                                              |
| -------------------------- | -------------------------------------------------- |
| Just myself                | Personal-focused categories                        |
| Myself + partner           | Joint expenses, Partner's allowance                |
| Family with children       | School fees, Children's clothing, Child healthcare |
| Supporting extended family | Family support / remittances                       |

Single-select, but user can select multiple if applicable.

---

#### Step 4 of 5 — Top spending areas

_"Which of these apply to your regular spending?"_ (Select all that apply)

Multi-select checklist:

- 🚗 Transportation (fuel, BRT, Uber/Bolt)
- 📱 Airtime & Data
- 🏥 Healthcare / Medications
- 🍽️ Food & Groceries
- 🎓 Education / Courses
- 💊 Gym / Fitness
- 🎬 Entertainment & Streaming
- ✈️ Travel & Holidays
- 💆 Personal Care & Grooming
- 🐾 Pets
- 💝 Giving (church offering, charity, family support)
- 💰 Savings / Investment

---

#### Step 5 of 5 — Financial goal

_"What's your main financial goal right now?"_

| Option                                        | Influence on seeding                                           |
| --------------------------------------------- | -------------------------------------------------------------- |
| Stop living paycheck to paycheck              | Prominent Emergency Fund category, Savings group               |
| Save for a specific goal (house, car, travel) | Goal Savings category with target setting cue                  |
| Pay off debt                                  | Debt Repayment group                                           |
| Build an emergency fund                       | Emergency Fund prominently placed, suggested 3–6 months target |
| Just track my money                           | Neutral seeding                                                |
| All of the above                              | Comprehensive seed                                             |

Single-select.

---

**Final step — summary before proceeding:**

Show a brief preview: _"Based on your answers, we've created a budget structure with [N] categories across [M] groups. You can customise everything later."_

A "Let's go" CTA navigates to ONBOARD-02.

**Design notes:**

- Each step should feel light and conversational, not like a form. Think large buttons with emoji/icons rather than a dropdown.
- The back button must allow users to revise previous answers.
- Estimated time indicator: "Takes about 2 minutes"
- All questions are skippable individually with a "Skip this question" text link — skipping uses a sensible default seed.

---

### ONBOARD-02 · Link Bank Account

**Route:** `/(auth)/link-bank`  
**Purpose:** Connect the user's first Nigerian bank account via Mono Connect. This is what enables automatic transaction syncing.

**Entry point:** ONBOARD-01 completion; also accessible post-onboarding from Accounts tab (ACCT-01)

**UI Elements:**

- Reassurance-first layout: headline, brief explanation of what happens when you link, security badge ("🔒 Powered by Mono — your credentials never touch MoniMata's servers")
- List of supported banks / institutions (visual logos or bank name chips) if possible, to reduce hesitation
- Primary CTA: **"Connect Bank Account"** — launches the Mono Connect in-app browser widget
- Secondary CTA: **"I'll do this later"** → navigates to BUDGET-01 with a dismissible "You're missing out on auto-sync" banner

**States:**

- Default
- Mono widget open (full-screen webview — outside our control; no design needed)
- Success: brief success toast, navigate to ONBOARD-03 (Budget Seed Preview)
- Error: error toast with detail; user remains on this screen to retry

**Design notes:**

- The Mono Connect widget itself (the bank selection + login flow) is entirely handled by Mono's SDK and is not designable by this team. The before/after states surrounding it are ours.

---

### ONBOARD-03 · Budget Seed Preview

**Route:** `/(auth)/budget-preview` (new screen, not yet built)  
**Purpose:** Show the user their auto-generated budget structure before they enter the app. Gives a sense of what has been set up for them and sets expectations for the Budget tab. A critical moment in reducing overwhelm.

**Entry point:** ONBOARD-02 success

**UI Elements:**

- Congratulatory heading: _"Your budget is ready."_
- Sub-copy: _"Here's what we've set up for you. You can change everything — this is just a starting point."_
- Preview list of budget groups and categories (names only, no amounts yet — amounts are filled in the Budget tab)
- Each group shown as a collapsible section (collapsed by default to keep the screen from being overwhelming; one group expanded to show an example)
- Small chip/badge noting when a category has a suggested target (e.g. "Suggested: ₦50,000/mo")
- Primary CTA: **"Let's start budgeting"** → BUDGET-01

**States:**

- Loading (if seeding takes a moment on the backend)
- Populated (standard state above)

**Design notes:**

- This screen is a celebration moment. The tone should be warm and encouraging.
- Do not show numbers or ₦0 entries here — that would feel like an empty budget. Names and structure only.

---

### BUDGET-01 · Budget (Main)

**Route:** `/(tabs)/` (Budget tab)  
**Purpose:** The central screen of the app. Shows the user's zero-based budget for the selected month. Read-only with inline editing via bottom sheets.

**Entry point:** Budget tab bar item; post-onboarding; post-login

**UI Elements:**

**Month Header (sticky)**

- Previous month arrow (`‹`) | Month label (e.g. "March 2026") | Next month arrow (`›`)
- **TBB (To Be Budgeted)** displayed prominently. Colour-coded:
  - Green: TBB > 0 (unassigned income available — good)
  - Grey: TBB = 0 (fully assigned — ideal)
  - Red: TBB < 0 (over-assigned — problem; needs attention)
- Pencil/edit icon → BUDGET-04 (Edit Budget Structure)

**Auto-Assign button (if TBB > 0)**

- A one-tap affordance to automatically fill underfunded categories from available TBB, distributing it to categories with active targets. Shown only when TBB > 0 and there are underfunded categories.

**Category List (scrollable, grouped)**  
For each group:

- Group header: group name (uppercase) | group total assigned
- For each category in the group:
  - Category name
  - Assigned amount (muted)
  - Available amount (colour-coded: green = positive, amber = underfunded vs target, red = negative/overspent)
  - Funding indicator: small dot or bar segment indicating how funded this category is relative to its target (if a target exists)
  - Tapping a category row → opens BUDGET-02 (Assign Money Sheet)

**States:**

- Loading: skeleton rows
- Populated (as above)
- Error: full-page error card with retry

**Design notes:**

- The available amount is the most important number per row. It should be the largest and most visually prominent.
- The assigned amount is secondary — smaller, muted.
- Hidden categories are not shown in the default view. A "Show hidden" toggle or section at the bottom should be available.
- Consider a subtle progress fill on each category row (like YNAB's bar) to give at-a-glance spending progress without relying solely on the number.

---

### BUDGET-02 · Assign Money Sheet

**Purpose:** Set or change how much money is assigned to a category for the current month. Slides up from the bottom.

**Trigger:** Tapping a category row in BUDGET-01

**UI Elements:**

- Sheet handle + category name header
- **Stats strip**: three columns — "To Assign" (TBB, coloured) | "Activity" | "Available after"
- Large ₦ amount input (auto-focused)
- Current assigned amount shown for reference
- Quick-fill chips (only shown when relevant):
  - **"Fill to required"** — if category has a target, fills to the required amount for this month
  - **"Assign all available"** — assigns all current TBB to this category
  - **"Zero out"** — sets assigned to 0 (removes previous assignment)
- **"Move money instead"** link → transitions to BUDGET-03 (Move Money Sheet) within the same modal
- **Save** CTA

**States:**

- Default (empty input, chips if applicable)
- Amount entered (Save enabled)
- Loading (save in progress)

---

### BUDGET-03 · Move Money Sheet

**Purpose:** Transfer available money from one category to another within the same budget month.

**Trigger:** "Move money instead" link in BUDGET-02 (transition within same sheet)

**UI Elements:**

- Back arrow to return to Assign view
- Source category label: "Moving from: [Category Name]"
- Available in source: ₦[X] available
- ₦ amount input
- "Move all available" chip
- **Destination category list** (scrollable):
  - Shows all non-hidden categories except the source
  - Each row: category name + current available amount
  - Selected destination highlighted in brand colour
- **Move** CTA (enabled when amount > 0 and destination selected)

**States:**

- No destination selected: CTA disabled
- Destination selected + amount entered: CTA enabled

---

### BUDGET-04 · Edit Budget Structure

**Route:** `/budget-edit`  
**Purpose:** Manage the budget's category and group structure — add, rename, hide, and delete groups and categories, set targets.

**Entry point:** Pencil icon in BUDGET-01 month header

**UI Elements:**

**Header**

- Back button | "Edit Budget" title

**"Cost to Be Me" Card**

- Headline phrase + monthly amount (₦X/month) — sum of all target amounts gives the user their theoretical total monthly cost of living
- Progress bar: how much of the "cost to be me" has been assigned this month
- Sub-label: "₦X assigned of ₦Y monthly commitments"

**Group List (scrollable SectionList)**  
For each group:

- Group header row: group name | + (add category) button | ⋯ (group options) button
- For each category: category name | target label (e.g. `₦50,000/mo`, `₦500/wk`, `₦500,000 goal`) | ⋯ (category options) button
- Categories with no target show a muted "+ Add target" CTA

**"Add Group" button** at the bottom of the list

---

**Group Options Sheet** (triggered by ⋯ on a group):

- Rename (inline input field within the sheet)
- Hide group (confirm: "Hidden groups and their categories won't appear in your budget view. You can unhide them later.")
- Delete group (destructive, confirm: "This will also delete all categories and their history.")

**Category Options Sheet** (triggered by ⋯ on a category):

- Rename (inline input field)
- Set / Edit target → navigates to BUDGET-05
- Remove target (if one exists) (confirm)
- Hide category (confirm)
- Delete (destructive, confirm)

**Add Category Modal**: simple centred modal with a text input field, Cancel + Create buttons.

**Add Group Modal**: same pattern as Add Category.

**States:**

- Loading (initial data fetch)
- Populated
- Error

---

### BUDGET-05 · Category Target

**Route:** `/target/[categoryId]`  
**Purpose:** Set or edit a spending/saving target for a category. Targets drive the "required this month" calculation and the underfunding indicator in BUDGET-01.

**Entry point:** BUDGET-04 Category Options → "Set/Edit target"; also accessible via "+ Add target" link on a category row in BUDGET-04

**UI Elements:**

**Header**: back chevron | "Set Target for [Category Name]"

**Frequency Tab Bar**: Weekly | Monthly | Yearly | Custom  
(Each tab shows a different form layout)

---

**Monthly Tab** (default):
_"I need_ ₦[amount input] _every month"_

- Large ₦ amount field
- Due by day: stepper (1–28 + "Last day of month")
- Behavior picker (see below)

**Weekly Tab**:
_"I need_ ₦[amount] _every week"_

- Day of week selector: Mon Tue Wed Thu Fri Sat Sun chips
- Behavior picker

**Yearly Tab**:
_"I need to save_ ₦[amount] _by_ [month] / [day]"\*

- Due date: MM / DD pickers
- Behavior picker

**Custom Tab**:

- Amount field
- Due date: YYYY / MM / DD pickers
- "Repeats after target date" toggle
- Behavior picker

---

**Behavior Picker** (appears on all tabs, with adapts to selected frequency):

| Behavior      | Label                                  | Best for                                                   |
| ------------- | -------------------------------------- | ---------------------------------------------------------- |
| **Set aside** | "Assign another ₦[amount] next period" | Bills, subscriptions that recur unconditionally            |
| **Refill**    | "Refill up to ₦[amount] next period"   | Groceries, discretionary spending — tops up only if needed |
| **Balance**   | "Maintain a balance of ₦[amount]"      | Emergency funds, buffer categories — yearly/custom only    |

Each option shows a descriptive one-line explanation below.

**Save Target** button (sticky at bottom)

**States:**

- No existing target: blank form, Monthly tab pre-selected
- Existing target: pre-populated from saved data

---

### TX-01 · Transactions

**Route:** `/(tabs)/transactions`  
**Purpose:** Chronological view of all transactions across all accounts. Supports inline re-categorization.

**Entry point:** Transactions tab bar item

**UI Elements:**

**Filter bar** (sticky below tab bar, scrollable):

- All | Uncategorized | by account chip | by category chip | date range picker
- These are filter chips; the active filter is highlighted

**Transaction list (grouped by day)**  
Day header: e.g. "Tuesday, 10 March 2026" + day total

For each transaction:

- Amount (large): red for debit, green for credit
- Narration / description (truncated to 1 line)
- Category chip: if categorised, shows category name in brand colour; if not, shows "Uncategorised" in amber — tapping the category chip opens the inline category picker
- Account name + time
- "Manual" badge if the transaction was added manually (not from Mono)
- Tapping the row → TX-02 or TX-03

**Infinite scroll**: additional pages load on scroll to bottom

**States:**

- Loading: skeleton rows
- Populated
- Empty: "No transactions yet. Link a bank account to start importing." + CTA
- Filtered empty: "No transactions match your filters."

**Category Picker Modal** (triggered by category chip):

- Full-screen modal
- Search field at top
- SectionList of category groups → categories
- Tap to assign + close

---

### TX-02 · Transaction Detail — Bank Import

**Route:** `/transaction/[id]` (when `is_manual === false`)  
**Purpose:** View details of a bank-synced transaction. Financial details are read-only; only category and memo are editable.

**Entry point:** Tap on a transaction row in TX-01

**UI Elements:**

**Header**: back chevron | "Transaction Details"

**Hero amount card**: large ₦ amount + DEBIT / CREDIT badge, colour-coded

**Read-only detail card**:

- Narration
- Date & time
- Account name
- Source (e.g. "GTBank via Mono")
- Recurring badge (if linked to a recurring rule): "🔁 Recurring [frequency]" + "Stop repeating" button

**Editable fields**:

- Category (with clear button)
- Memo / note (free text)

**Save** button (only enabled if category or memo changed)

**Design notes:**

- Clearly communicate that the financial details (amount, date, narration) are immutable for bank-synced transactions — a small info tip or greyed-out appearance works well
- If a transaction is split (multiple categories), show each split line separately with its amount and category

---

### TX-03 · Transaction Detail — Manual

**Route:** `/transaction/[id]` (when `is_manual === true`)  
**Purpose:** View and edit a manually created transaction.

**Entry point:** Tap on a manual transaction row in TX-01

**UI Elements:**

**Header**: back chevron | "Manual Transaction"

**Debit / Credit toggle** (full-width segmented control)

**Amount input card**: ₦ input, large, colour-coded by type

**Editable form rows** (same as TX-04):

- Narration
- Date & time
- Account
- Category (optional, with clear)
- Memo (optional)

**Recurring section**:

- If linked to a recurring rule: green badge "🔁 Recurring [frequency]" + **"Stop repeating"** button → confirm dialog
- If not recurring: "Repeats" row with picker (set to None by default)

**Save** button + **Delete transaction** button (red outlined, destructive → confirm dialog)

---

### TX-04 · Add Transaction

**Route:** `/add-transaction`  
**Purpose:** Manually log a cash transaction or any transaction not captured by Mono.

**Entry point:** FAB (floating action button) on Budget and Transactions tabs

**UI Elements:**

**Header**: × close | "Add Transaction"

**Debit / Credit toggle**: prominent, full-width, colour-coded (red = debit, green = credit)

**Amount input card**: centre-stage ₦ input, auto-focused, colour changes with toggle

**Form rows**:
| Row | Type | Required | Notes |
|---|---|---|---|
| Narration | Text field | Yes | What was this for? |
| Date & Time | Picker | Yes | Defaults to now |
| Account | Picker modal | Yes | Which account was used |
| Category | Picker modal | No | With "None" and clear option |
| Memo | Text field | No | Optional extra note |
| Repeats | Picker modal | No | Recurrence options — None / Daily / Weekly / Every 2 weeks / Monthly / Every 3 months / Every 6 months / Yearly |

**Save** button (sticky at bottom, disabled until required fields filled)

**Date/Time picker**: native platform picker presented in a bottom sheet

**States:**

- Empty (initial)
- Partially filled
- Loading (save in progress)

---

### TX-05 · Split Transaction

**Purpose:** Assign a single transaction to multiple budget categories with different amounts (e.g. a supermarket run that included both Groceries and Household items).

**Entry point:** TX-02 or TX-03 — a "Split Transaction" option (currently accessible via category; consider a dedicated button)

**UI Elements:**

- Existing transaction header (amount + narration, read-only)
- Split list: each split shows an amount input (₦) + category picker + optional memo
- "Add split" button to add another line
- Running total: shows remaining unallocated amount ("₦2,300 remaining to allocate")
- Total validation: the split amounts must sum exactly to the transaction total — an error state shows if they don't
- **Save splits** CTA (disabled if total doesn't match)
- **Remove all splits** link (reverts transaction to uncategorised)

**Design notes:**

- The sum constraint (splits must equal total) should be communicated clearly without frustrating the user — consider one split with a "Fill remaining" affordance

---

### ACCT-01 · Accounts

**Route:** `/(tabs)/accounts`  
**Purpose:** View and manage all linked bank accounts and manual accounts.

**Entry point:** Accounts tab bar item

**UI Elements:**

**Header**: "Accounts" title | **"+ Manual"** button | **"Link Bank"** button

**Total Balance card**: headline total balance across all active accounts, formatted ₦ | sub-label "across N accounts"

**Account cards** (one per account):

_Mono-linked account card_:

- Institution logo or icon + institution name
- Account type badge (Savings / Current)
- "Mono" badge (green)
- Display name (alias if set, else account name)
- Balance (large)
- Last synced timestamp
- Footer: sync button + ⋯ more-actions button
- Re-auth banner (amber): shown when Mono requires re-authentication — "Sync paused. Re-connect to resume." + "Fix this" button

_Manual account card_:

- Wallet icon + institution name
- "Manual" badge
- Display name
- Balance (large) + "as of [date]" sub-label
- Footer: "Update balance" button + ⋯ more-actions button

**⋯ More actions** (action sheet):

_For Mono accounts_:

- Rename
- Disconnect Mono (destructive; keeps account + history, stops sync)
- Remove Account (destructive; keeps transaction history)

_For manual accounts_:

- Rename
- Update Balance
- Link to Mono (navigates to ONBOARD-02 with `accountId` context)
- Remove Account (destructive)

**Empty state**: No accounts yet. Two CTAs: "Add Manually" and "Link via Mono".

**States:**

- Loading
- Populated (described above)
- Empty

---

### ACCT-02 · Add Manual Account

**Purpose:** Create a manual (cash or unlinked bank) account.

**Entry point:** "+ Manual" button in ACCT-01 header; also from Accounts empty state

**Presentation:** Bottom sheet modal (pageSheet)

**Form fields**:
| Field | Type | Required | Notes |
|---|---|---|---|
| Display name / Alias | Text | Yes | How you'll see this account in the app (e.g. "GTB Salary Account") |
| Bank / Institution | Text | Yes | e.g. "GTBank", "Cash", "OPay" |
| Account number | Numeric | Yes | 10-digit NUBAN |
| Bank code | Text/Picker | Yes | Nigerian bank code |
| Account type | Segmented | Yes | Savings / Current |
| Opening balance | Currency input | No | Defaults to ₦0 |

**Actions**: Cancel | **Add Account** (primary)

---

### ACCT-03 · Update Balance

**Purpose:** Manually reconcile the balance of a manual account (e.g. after a cash withdrawal that wasn't logged).

**Entry point:** "Update balance" button on a manual account card; "Update Balance" in ⋯ menu

**Presentation:** Bottom sheet modal

**Form fields**:
| Field | Type | Required | Notes |
|---|---|---|---|
| New balance | Currency input | Yes | The current actual balance |
| Note | Text | No | e.g. "ATM withdrawal reconciliation" |

**Actions**: Cancel | **Update**

---

### BILLS-01 · Bill Categories

**Route:** `/(tabs)/bills`  
**Purpose:** Entry point for Interswitch Quickteller bill payments. Shows all available bill categories in a browsable grid.

**Entry point:** Bills / Pay Bills tab bar item

**UI Elements:**

- Screen title: "Pay Bills"
- **Category grid**: 2-column grid of category cards
  - Each card: icon (contextual — electricity bolt, phone, TV, water drop, etc.) + category name
  - Categories include: Airtime, Data, Electricity, Cable TV, Water, Insurance, Tolls, School fees, etc.
- **History toggle** button (clock icon in header) → switches view between category grid and payment history list
- **Payment history list** (when toggled):
  - Shows past bill payments with biller name, reference, date, amount
  - Pull-to-refresh

**States:**

- Loading
- Populated
- Empty (no categories returned from API — rare edge case)

---

### BILLS-02 · Biller Selection

**Purpose:** Select a specific biller within a chosen category (e.g. EKEDC, IKEDC, AEDC within "Electricity").

**Entry point:** Tapping a category card in BILLS-01

**UI Elements:**

- Step header: back arrow | category name (e.g. "Electricity")
- Scrollable list of billers:
  - Each item: biller icon | biller full name | short name (sub-label)
  - Chevron-right affordance

**States:**

- Loading
- Populated
- Empty: "No billers in this category"

---

### BILLS-03 · Payment Plan Selection

**Purpose:** Select a payment item / plan within a biller (e.g. a specific data bundle tier, a meter type, etc.).

**Entry point:** Tapping a biller in BILLS-02

**UI Elements:**

- Step header: back arrow | biller name
- List of payment items:
  - Each item: plan name | amount (if fixed: ₦[amount]; if variable: "Variable amount")
  - Chevron-right affordance

**Note:** If a biller has only one payment item, this screen is skipped automatically and the user proceeds to BILLS-04.

---

### BILLS-04 · Customer Details Form

**Purpose:** Collect the customer's account/meter ID, payment amount (if variable), and debit account before validating and proceeding to confirmation.

**Entry point:** Tapping a payment item in BILLS-03 (or auto-advance)

**UI Elements:**

- Step header: back arrow | "Customer Details"
- Context chip: biller name · plan name (non-interactive, just context)
- **Customer / Account ID** field: text input — the identifier relevant to the biller (phone number for airtime, meter number for electricity, smartcard number for cable TV, etc.)
- **Amount (₦)** field: shown only for variable-amount plans; hidden for fixed-amount plans
- Fixed amount display: if the plan has a fixed amount, show an info badge with the amount instead of an input
- **Budget category** picker (optional): assign this payment to a budget category for tracking
- **Pay from account** picker: horizontal scrollable chip row of the user's accounts (account name + balance); one must be selected
- **Validate & Continue** primary CTA — calls the customer validation API with the customer ID; on success advances to BILLS-05

**States:**

- Default (form empty)
- Validation in progress (CTA shows spinner)
- Validation failed: error toast + form remains
- Validation success: advances to BILLS-05

**Design notes:**

- The Customer/Account ID field label should adapt to the biller type if possible (e.g. "Meter Number" for electricity, "Phone Number" for airtime)
- The "Pay from account" section shows account balance to help users select the right account

---

### BILLS-05 · Payment Confirmation

**Purpose:** Summary review before the user commits to paying. Last chance to check all details.

**Entry point:** Validation success in BILLS-04

**UI Elements:**

- Step header: back arrow | "Confirm Payment"
- Summary card:
  - Biller name
  - Plan name
  - Customer name (returned by validation API — confirms the meter/account belongs to someone)
  - Customer ID
  - Budget category (if selected)
  - Account to debit + current balance
  - **Total amount** (large, prominent, ₦ formatted)
- Security note: "You won't be charged until you tap Pay"
- **Pay Now** CTA (primary, colour-coded — consider using a distinct payment-action colour)

**States:**

- Default (review state)
- Loading / paying (CTA shows spinner, back navigation disabled)
- Error: error toast; user remains on this screen to retry or go back

---

### BILLS-06 · Payment Receipt

**Purpose:** Show the outcome of a bill payment.

**Entry point:** Successful payment in BILLS-05

**UI Elements:**

_Success state_:

- Large success icon (animated checkmark) in brand colour
- Amount paid (₦)
- Narration / biller description
- Reference number
- Date & time
- Status: "Successful"
- **Done** CTA → resets bill flow back to BILLS-01

_Pending state_ (payment queued, awaiting Interswitch confirmation):

- Animated loading indicator (not a spinner — something more progress-like)
- Copy: "Your payment is being processed. This page refreshes automatically."
- Same detail rows: Reference, Date, Status: "Processing"
- Page **automatically polls** for status update every ~10 seconds
- Transitions to success or failure state when confirmed

_Failed state_:

- Red failure icon
- Reference number (for support)
- Error description if available
- **Try again** CTA (goes back to BILLS-04) + **Return to Bills** (goes to BILLS-01)

---

### NUDGE-01 · Nudges / Notification Centre

**Route:** `/(tabs)/nudges` (currently hidden from tab bar — see navigation note in §6.2)  
**Purpose:** In-app notification centre for AI-generated spending nudges and insights.

**Entry point:** Nudges row in PROFILE-01; notification icon if moved to tab bar; push notification tap

**UI Elements:**

- Header: "Nudges" title | unread count badge (red pill) | "Mark all read" button
- **Nudge card list** (FlatList):

Each nudge card:

- Unread indicator: a coloured dot (top-left) when `is_opened === false`
- Icon bubble: colour-coded by trigger type (amber for warning, red for exceeded, purple for large tx, green for credit/payment)
- Title + time-ago label
- Message preview (1–2 lines)
- Dismissed nudges shown at reduced opacity (55%)

**Trigger type colour coding**:
| Trigger | Colour | Label |
|---|---|---|
| `threshold_80` | Amber | Budget warning |
| `threshold_100` | Red | Budget exceeded |
| `large_single_tx` | Purple | Large transaction |
| `pay_received` | Green | Money received |
| `bill_payment` | Green | Bill payment |

- Tapping a card opens NUDGE-02 (Nudge Detail Sheet) and marks the nudge as opened

**States:**

- Loading
- Populated
- Empty: "No nudges yet. Link a bank account and start budgeting to receive personalised insights." + link to Accounts

---

### NUDGE-02 · Nudge Detail Sheet

**Purpose:** Full detail view of a nudge, with context ("why you got this"), actionable steps, and deep links.

**Entry point:** Tapping a nudge card in NUDGE-01

**Presentation:** Slide-up bottom sheet modal; backdrop tap closes

**UI Elements:**

- Icon bubble + title + trigger type label
- Full message text
- **"Why you got this"** section: grey card with generated explanation specific to nudge type (examples below)
- **"What you can do"** section: 2–3 action buttons with deep links:
  - Budget warning / exceeded → "Adjust your budget" (→ BUDGET-01) | "Review transactions" (→ TX-01)
  - Large transaction → "Review transactions" | "Adjust your budget"
  - Money received → "Assign to your budget" (→ BUDGET-01)
  - Bill payment → "View bill history" (→ BILLS-01 history view)
- **Dismiss** button (dismisses nudge, reduces opacity in list)

**Generated "Why" copy examples:**

- Budget warning: _"You've used 82% of your Groceries budget for March. Only ₦9,200 of ₦50,000 remains."_
- Exceeded: _"Your Dining Out budget for March is fully used. You overspent by ₦12,000 (24%)."_
- Large single tx: _"A single transfer of ₦75,000 ('RENT MARCH') consumed 100% of your Housing budget."_
- Credit received: _"₦350,000 credit was received: 'ACME TECH SALARY'."_
- Bill payment: _"Your EKEDC payment of ₦15,000 was processed."_

**Design notes:**

- The tone of all nudge copy should be warm and Pidgin-flavoured where it feels natural — like a knowledgeable friend giving you advice, not a compliance warning. Examples: "E don happen — you don use reach 80% of your Groceries money this month." is preferable to "You have used 80% of your Groceries budget."

---

### PROFILE-01 · Profile & Settings

**Route:** `/(tabs)/profile`  
**Purpose:** User account information, settings, and secondary navigation to nudges.

**Entry point:** Profile tab bar item

**UI Elements:**

**Account header**:

- Greeting: "Hello, [First Name]"
- Email address (muted)
- Avatar / initials circle (in the absence of a profile photo)

**BVN verification banner** (amber, shown only if `identity_verified === false`):

- "Your identity isn't verified yet. This is required to link bank accounts."
- "Verify now" → AUTH-04

**Menu rows**:

1. **Nudges** — with unread count badge → NUDGE-01
2. **Notification settings** → PROFILE-02 sheet
3. **Knowledge Hub** (P1) → HUB-01
4. **Reports** (P2) → REPORT-01
5. _[Possible future: Edit profile, Change password, Export data, Delete account]_

**Log out** button (bottom, outlined red, destructive):

- confirm() dialog → clears session, navigates to AUTH-01

**Dark mode toggle**: explicit toggle OR note that the app follows system preference (design team to decide)

**States:**

- Loaded (user data from Redux store)
- BVN unverified: shows banner

---

### PROFILE-02 · Notification Settings Sheet

**Purpose:** Control how and when AI nudges are delivered.

**Entry point:** "Notification settings" row in PROFILE-01

**Presentation:** Bottom sheet modal

**Settings**:
| Setting | Control | Notes |
|---|---|---|
| Enable nudges | Toggle (Switch) | Master on/off for all push nudges |
| Quiet hours: From | Time input (HH:MM) | Don't send push between these hours |
| Quiet hours: To | Time input (HH:MM) | Use WAT (UTC+1); default 23:00–07:00 |
| Daily nudge limit | Stepper (1–10) | Max pushes per day; default 3 |

**Actions**: Cancel | **Save Settings** (CTA)

---

### REPORT-01 · Reports Home

**Route:** `/reports` (not yet built)  
**Purpose:** Entry point for financial analytics and reporting.

**Entry point:** Reports row in PROFILE-01

**UI Elements:**

- Screen title: "Reports"
- Month/date range selector (same month navigation pattern as BUDGET-01, but with optional custom range)
- Report cards/tiles (navigation):
  1. **Spending by Category** → REPORT-02
  2. **Income vs Expenses** → REPORT-03
  3. **Net Worth** → REPORT-04
  4. _[Future: Category trends, Largest transactions, Bill payment history]_
- Quick summary strip at the top: total spent | total income | net for selected period

---

### REPORT-02 · Spending by Category

**Route:** `/reports/categories` (not yet built)  
**Purpose:** Visual breakdown of spending across categories for a selected period.

**UI Elements:**

- Month/range selector
- Donut or pie chart: each slice = a budget category, sized by spend amount
- Legend below chart: category name + ₦ amount + % of total
- Category list (sorted by spend descending):
  - Category name | amount spent | % of total | progress bar vs budget
  - Tapping a category row could filter TX-01 to that category (deep link)
- Toggle: Current month vs. 3-month average vs. 12-month average

---

### REPORT-03 · Income vs Expenses

**Route:** `/reports/income-expenses` (not yet built)  
**Purpose:** Visualise the relationship between money in and money out over time.

**UI Elements:**

- Month selector or rolling date range
- Bar chart: grouped bars per month (income bar vs. expenses bar)
- Summary stats: Total income | Total expenses | Net (colour-coded green/red)
- Monthly breakdown list: each month row showing income, expenses, net
- Average line overlay on chart (optional toggle)

---

### REPORT-04 · Net Worth

**Route:** `/reports/net-worth` (not yet built)  
**Purpose:** Track total financial position over time (sum of all account balances).

**UI Elements:**

- Current net worth (large ₦ headline)
- Line chart: net worth over time (rolling 6 or 12 months)
- Account breakdown: each account with its current balance listed below the chart
- Month-over-month change indicator (↑ ₦X or ↓ ₦X vs last month)

---

### HUB-01 · Knowledge Hub

**Route:** `/hub` (not yet built)  
**Purpose:** Bite-sized financial literacy content — articles, tips, and "wisdom nuggets" relevant to the Nigerian context.

**Entry point:** Knowledge Hub row in PROFILE-01

**UI Elements:**

- Screen title: "Knowledge Hub"
- **Featured article** (large hero card at top)
- **Article list** below: card per article with thumbnail, title, estimated read time, category tag
- Category filter chips: All | Budgeting | Saving | Investing | Debt | Bills
- Pull-to-refresh

**Design notes:**

- Content must feel _Nigerian_ in framing — examples, scenarios, and language should reference Nigerian salaries, costs, institutions, and contexts. No USD or US-centric advice.

---

### HUB-02 · Article Detail

**Route:** `/hub/[articleId]` (not yet built)  
**Purpose:** Read a single financial literacy article.

**Entry point:** Tapping any article card in HUB-01

**UI Elements:**

- Back button
- Article header image (if available)
- Article title (large)
- Category tag + estimated read time
- Article body: rich text content (markdown rendered to React Native text)
- Progress indicator (reading progress bar at top or scroll position)
- "More articles" section at bottom

---

## 8. Accessibility Requirements

All screens must meet the following minimum standards:

- **Touch targets**: minimum 44×44pt for all interactive elements
- **Contrast**: text and interactive element contrast ratios per WCAG AA (4.5:1 for body text, 3:1 for large text and UI components)
- **Screen reader**: all interactive elements must have meaningful labels. Currency amounts, chart elements, and icons must have descriptive `accessibilityLabel` values
- **Type scaling**: UI must not break at OS-level large text sizes. Avoid fixed-height containers that clip text
- **Keyboard navigation**: form screens must handle keyboard appearance correctly without content being obscured (use `KeyboardAvoidingView`)
- **Colour alone**: never use colour as the sole differentiator of meaning (e.g. debit vs credit must also differ in sign/label, not only red vs green)

---

## 9. Out of Scope

The following are explicitly **not** in scope for this design engagement:

- Password reset / forgot password flow (planned for a later phase)
- Email address change
- Account data export (NDPA compliance, planned for v2)
- Account deletion
- Multi-currency support (NGN only in v1)
- Web / desktop version
- Subscription or paywall screens (no paid tiers in v1)
- Admin / support dashboard
- Any Mono Connect widget screens (third-party SDK, not designable)
- Any Interswitch Passport / BVN verification screens (third-party service)

---

_End of document. Questions and clarifications: contact the engineering team._
