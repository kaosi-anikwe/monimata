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
 */
export const queryKeys = {
  budget: (month: string) => ['budget', month] as const,
  transactions: () => ['transactions'] as const,
  categoryGroups: () => ['category-groups'] as const,
  accounts: () => ['accounts'] as const,
  recurringRule: (ruleId: string) => ['recurring-rule', ruleId] as const,
  target: (categoryId: string) => ['target', categoryId] as const,
  billCategories: () => ['bill-categories'] as const,
  billers: (categoryId: string) => ['billers', categoryId] as const,
  billPaymentItems: (billerId: string) => ['bill-payment-items', billerId] as const,
  billHistory: () => ['bill-history'] as const,
} as const;
