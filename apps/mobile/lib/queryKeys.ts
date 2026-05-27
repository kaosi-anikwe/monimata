// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Centralised React Query key factory.
 *
 * Rules:
 *  - Keys are pure arrays so they compose and invalidate correctly.
 *  - Every endpoint that a screen queries MUST have an entry here —
 *    never use a magic string inline.
 *  - Broader prefix keys (e.g. ['budget']) intentionally invalidate
 *    ALL budget sub-keys across months when used with invalidateQueries.
 *
 * Two key conventions in use:
 *  - WatermelonDB-backed queries: semantic keys, e.g. ['budget', month].
 *  - API-backed queries (openapi-fetch / $api.useQuery): ['method', '/path']
 *    prefix format. $api.useQuery generates ['method', '/path', init] so a
 *    prefix key correctly matches via TanStack's prefix invalidation.
 *    New API GET queries must follow this convention.
 */
export const queryKeys = {
  // ── WatermelonDB-backed (semantic keys) ────────────────────────────────
  budget: (month: string) => ['budget', month] as const,
  transactions: () => ['transactions'] as const,
  archivedTransactions: (endDate: string) => ['archived-transactions', endDate] as const,
  searchTransactions: (q: string, endDate: string | null) => ['search-transactions', q, endDate] as const,
  monthlyFlow: (month: string) => ['monthly-flow', month] as const,
  netWorth: () => ['net-worth'] as const,
  categoryGroups: () => ['category-groups'] as const,
  recurringRule: (ruleId: string) => ['recurring-rule', ruleId] as const,
  target: (categoryId: string) => ['target', categoryId] as const,

  // ── API-backed via $api.useQuery (['method', '/path'] prefix) ──────────
  accounts: () => ['get', '/accounts'] as const,
  nudges: () => ['get', '/nudges'] as const,
  nudge: (id: string) => ['get', '/nudges/{nudge_id}', id] as const,
  nudgeSettings: () => ['get', '/nudges/settings'] as const,

  // ── Categorization ────────────────────────────────────────────────────
  clusters: () => ['get', '/transactions/clusters'] as const,
  clusterTransactions: (key: string) => ['get', '/transactions/clusters', key] as const,
  categoryTransactions: (categoryId: string) => ['category-transactions', categoryId] as const,
  reviewQueue: () => ['get', '/transactions/review-queue'] as const,
  // Prefix key — matches any GET /transactions?... query (used for the
  // local-queue approach in categorize-queue where all uncategorised
  // transactions are fetched at once and managed client-side).
  uncategorisedQueue: () => ['get', '/transactions'] as const,

  // ── Content (Knowledge Hub) ───────────────────────────────────────────
  posts: () => ['get', '/content/posts'] as const,
  post: (slug: string) => ['get', '/content/posts/{slug}', slug] as const,

  // ── AI / BYOK ─────────────────────────────────────────────────────────
  aiCredentials: () => ['get', '/ai/credentials'] as const,
  aiUsage: () => ['get', '/ai/usage'] as const,

  // ── Reports ────────────────────────────────────────────────────────────
  reports: () => ['get', '/reports'] as const,
  monthlySummary: () => ['get', '/reports/monthly-summary'] as const,
  incomeExpenseTrend: () => ['get', '/reports/income-expense-trend'] as const,
  spendingByCategory: () => ['get', '/reports/spending-by-category'] as const,
  categoryTrend: () => ['get', '/reports/category-trend'] as const,
  topMerchants: () => ['get', '/reports/top-merchants'] as const,
  budgetPerformance: () => ['get', '/reports/budget-performance'] as const,
  cashFlow: () => ['get', '/reports/cash-flow'] as const,
  accountBalances: () => ['get', '/reports/account-balances'] as const,
  recurringCommitments: () => ['get', '/reports/recurring-commitments'] as const,
  ageOfMoney: () => ['get', '/reports/age-of-money'] as const,

  // ── Billing (TBD: API or WatermelonDB) ────────────────────────────────
  billCategories: () => ['bill-categories'] as const,
  billers: (categoryId: string) => ['billers', categoryId] as const,
  billPaymentItems: (billerId: string) => ['bill-payment-items', billerId] as const,
  billHistory: () => ['bill-history'] as const,
} as const;
