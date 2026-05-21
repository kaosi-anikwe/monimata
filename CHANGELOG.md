# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Git tags follow the pattern `mobile/vX.Y.Z` and `api/vX.Y.Z`.

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

### [0.3.0] - TBD

> _Changelog to be written by the API team._
