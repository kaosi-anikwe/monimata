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

/** Determines which UI tab created this target */
export type TargetFrequency = 'weekly' | 'monthly' | 'yearly' | 'custom';

/**
 * What to do each period:
 * - set_aside → assign the amount again (bills, subscriptions)
 * - refill    → top up until available == amount (groceries, fun money)
 * - balance   → ensure available never drops below amount (emergency fund)
 */
export type TargetBehavior = 'set_aside' | 'refill' | 'balance';

export interface CategoryTarget {
  id: string;
  category_id: string;
  frequency: TargetFrequency;
  behavior: TargetBehavior;
  /** kobo — must be positive */
  target_amount: number;
  /** 0=Mon … 6=Sun; weekly only */
  day_of_week: number | null;
  /** 1–31; 0 = last day of month; monthly only */
  day_of_month: number | null;
  /** ISO date "YYYY-MM-DD"; yearly / custom due date */
  target_date: string | null;
  /** custom frequency only */
  repeats: boolean;
  updated_at: string;
}

/** Payload for PUT /categories/:id/target */
export interface CategoryTargetUpsert {
  frequency: TargetFrequency;
  behavior: TargetBehavior;
  target_amount: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
  target_date?: string | null;
  repeats?: boolean;
}
