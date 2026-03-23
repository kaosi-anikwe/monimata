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

export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

/** Template stored on RecurringRule — used to create each transaction instance */
export interface RecurringTemplate {
  account_id: string;
  /** kobo; negative=debit, positive=credit */
  amount: number;
  narration: string;
  type: 'debit' | 'credit';
  category_id: string | null;
  memo: string | null;
}

export interface RecurringRule {
  id: string;
  user_id: string;
  frequency: RecurringFrequency;
  /** Every N units of frequency — 1 for most common cases */
  interval: number;
  /** 0=Mon … 6=Sun; weekly / biweekly */
  day_of_week: number | null;
  /** 1–31; 0 = last day; monthly */
  day_of_month: number | null;
  /** ISO date "YYYY-MM-DD" — next transaction to generate */
  next_due: string;
  /** ISO date "YYYY-MM-DD" — optional hard stop */
  ends_on: string | null;
  is_active: boolean;
  template: RecurringTemplate;
}

/** Display labels shown in the "How often?" picker */
export const RECURRENCE_OPTIONS: { label: string; value: RecurringFrequency; interval: number }[] =
  [
    { label: 'Daily', value: 'daily', interval: 1 },
    { label: 'Weekly', value: 'weekly', interval: 1 },
    { label: 'Every 2 weeks', value: 'biweekly', interval: 1 },
    { label: 'Monthly', value: 'monthly', interval: 1 },
    { label: 'Every 3 months', value: 'monthly', interval: 3 },
    { label: 'Every 6 months', value: 'monthly', interval: 6 },
    { label: 'Yearly', value: 'yearly', interval: 1 },
  ];
