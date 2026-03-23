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
 * Shared TypeScript interfaces used by both the mobile app and any TS tooling.
 */

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  identity_verified: boolean;
  onboarded: boolean;
  created_at: string;
}

export interface BankAccount {
  id: string;
  institution: string;
  account_name: string;
  account_type: 'SAVINGS' | 'CURRENT';
  currency: string;
  balance: number; // kobo
  last_synced_at: string | null;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  account_id: string;
  date: string; // ISO date "YYYY-MM-DD"
  amount: number; // kobo; negative = debit
  narration: string;
  type: 'debit' | 'credit';
  category_id: string | null;
  memo: string | null;
  is_split: boolean;
  is_manual: boolean;
  source: 'mono' | 'interswitch' | 'manual';
}

export interface CategoryGroup {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
  categories: Category[];
}

export interface Category {
  id: string;
  group_id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
  target?: CategoryTarget;
}

export interface CategoryTarget {
  id: string;
  category_id: string;
  target_type:
    | 'monthly_set_aside'
    | 'monthly_fill_up_to'
    | 'monthly_balance'
    | 'weekly_set_aside'
    | 'by_date';
  target_amount: number; // kobo
  target_date?: string | null;
  repeats: boolean;
  repeat_cadence?: 'monthly' | 'quarterly' | 'annually' | null;
}

export interface BudgetMonth {
  id: string;
  category_id: string;
  month: string; // "YYYY-MM"
  assigned: number; // kobo
  activity: number; // kobo (negative = total debits)
  available: number; // kobo — computed by server: assigned + activity (since activity is negative)
  required_this_month?: number; // from target calculation
}

export interface BudgetResponse {
  month: string;
  tbb: number; // kobo — To Be Budgeted
  groups: Array<
    CategoryGroup & {
      categories: Array<Category & { budget: BudgetMonth }>;
    }
  >;
}

export interface Nudge {
  id: string;
  trigger_type: string;
  message: string;
  category_id: string | null;
  is_opened: boolean;
  is_dismissed: boolean;
  delivered_at: string | null;
  created_at: string;
}
