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
 * hooks/useReports.ts
 *
 * React Query hooks for all /reports endpoints.
 * Follows the same $api.useQuery pattern as useAccounts / useNudges.
 */

import { $api } from '@/services/api';

// ── Queries ──────────────────────────────────────────────────────────────────

export function useMonthlySummary(month: string, topN = 3, accountIds?: string) {
    return $api.useQuery(
        'get',
        '/reports/monthly-summary',
        { params: { query: { month, top_n: topN, account_ids: accountIds } } },
        { staleTime: 60_000 },
    );
}

export function useAgeOfMoney(lookbackDays = 30, accountIds?: string) {
    return $api.useQuery(
        'get',
        '/reports/age-of-money',
        { params: { query: { lookback_days: lookbackDays, account_ids: accountIds } } },
        { staleTime: 60_000 },
    );
}

export function useAccountBalances() {
    return $api.useQuery(
        'get',
        '/reports/account-balances',
        {},
        { staleTime: 60_000 },
    );
}

export function useIncomeExpenseTrend(months?: number, accountIds?: string) {
    return $api.useQuery(
        'get',
        '/reports/income-expense-trend',
        { params: { query: { months, account_ids: accountIds } } },
        { staleTime: 60_000 },
    );
}

export function useSpendingByCategory(month: string, accountIds?: string) {
    return $api.useQuery(
        'get',
        '/reports/spending-by-category',
        { params: { query: { month, account_ids: accountIds } } },
        { staleTime: 60_000 },
    );
}

export function useCategoryTrend(categoryId: string, months?: number, accountIds?: string) {
    return $api.useQuery(
        'get',
        '/reports/category-trend',
        { params: { query: { category_id: categoryId, months, account_ids: accountIds } } },
        { enabled: !!categoryId, staleTime: 60_000 },
    );
}

export function useTopMerchants(month: string, limit = 10, accountIds?: string) {
    return $api.useQuery(
        'get',
        '/reports/top-merchants',
        { params: { query: { month, limit, account_ids: accountIds } } },
        { staleTime: 60_000 },
    );
}

export function useBudgetPerformance(month: string) {
    return $api.useQuery(
        'get',
        '/reports/budget-performance',
        { params: { query: { month } } },
        { staleTime: 60_000 },
    );
}

export function useCashFlow(
    start: string,
    end: string,
    granularity: 'daily' | 'weekly' | 'monthly' = 'monthly',
    accountIds?: string,
) {
    return $api.useQuery(
        'get',
        '/reports/cash-flow',
        { params: { query: { start, end, granularity, account_ids: accountIds } } },
        { staleTime: 60_000 },
    );
}

export function useRecurringCommitments() {
    return $api.useQuery(
        'get',
        '/reports/recurring-commitments',
        {},
        { staleTime: 60_000 },
    );
}
