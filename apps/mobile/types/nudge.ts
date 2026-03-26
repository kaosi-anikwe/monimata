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

export type NudgeTriggerType =
  | 'threshold_80'
  | 'threshold_100'
  | 'large_single_tx'
  | 'pay_received'
  | 'bill_payment';

// ── Context shapes (per trigger_type) ─────────────────────────────────────

export interface Threshold80Context {
  category_name: string;
  month: string;
  spent_kobo: number;
  assigned_kobo: number;
  remaining_kobo: number;
  remaining_naira: string;
  assigned_naira: string;
  percentage: number;
}

export interface Threshold100Context {
  category_name: string;
  month: string;
  spent_kobo: number;
  assigned_kobo: number;
  overage_kobo: number;
  overage_naira: string;
  percentage: number;
}

export interface LargeSingleTxContext {
  category_name: string;
  tx_amount_kobo: number;
  amount_naira: string;
  narration: string;
  assigned_kobo: number;
  percentage: number;
  tx_id: string;
}

export interface PayReceivedContext {
  amount_kobo: number;
  amount_naira: string;
  narration: string;
  account_id: string;
}

export interface BillPaymentContext {
  biller_name: string;
  amount_kobo: number;
  amount_naira: string;
  reference: string;
  category_name?: string;
}

export type NudgeContext =
  | Threshold80Context
  | Threshold100Context
  | LargeSingleTxContext
  | PayReceivedContext
  | BillPaymentContext
  | Record<string, unknown>; // fallback for unknown types

// ── Main Nudge type ────────────────────────────────────────────────────────

export interface Nudge {
  id: string;
  trigger_type: NudgeTriggerType | string;
  title: string | null;
  message: string;
  context: NudgeContext | null;
  category_id: string | null;
  is_opened: boolean;
  is_dismissed: boolean;
  delivered_at: string | null;
  created_at: string;
}

export interface NudgeListResponse {
  nudges: Nudge[];
  total: number;
  unread_count: number;
}

export interface NudgeSettings {
  enabled: boolean;
  quiet_hours_start: string; // HH:MM
  quiet_hours_end: string;   // HH:MM
  fatigue_limit: number;
  language: 'pidgin' | 'formal';
}

export interface NudgeSettingsUpdate {
  enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  fatigue_limit?: number;
  language?: 'pidgin' | 'formal';
}
