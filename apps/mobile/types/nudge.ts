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

// ── Push notification data payload ─────────────────────────────────────────
// The push `data` dict carries the full nudge context so the client can
// render a rich card immediately — no follow-up GET required.
//
// Context shapes (DSLNudgeContext / OperationalNudgeContext) are now in the
// OpenAPI spec and re-exported from @monimata/shared-types. This file only
// defines the push-specific envelope that wraps them.

import type {
  DSLNudgeContext,
  NudgeScreen,
  NudgeTriggerType,
  OperationalNudgeContext,
} from '@monimata/shared-types';

// Re-export for convenience so consumers can import from one place.
export type { DSLNudgeContext, NudgeScreen, OperationalNudgeContext };

/**
 * Canonical fields always present on every push notification `data` dict.
 */
interface PushDataBase {
  trigger_type: NudgeTriggerType;
  nudge_id: string;
  nudge_type: string;
  screen: NudgeScreen;
}

/**
 * Push data for DSL-driven behavioural nudges (`trigger_type === "nudge"`).
 * Includes the full DSLNudgeContext fields at the top level.
 */
export interface DSLNudgePushData extends PushDataBase {
  trigger_type: 'nudge';
  slug: string;
  gid: string;
  evt_type: string;
  transaction_id: string;
  category_id?: string | null;
  category_name?: string | null;
  amount_kobo: number;
  match_count?: number;
  spend_pct?: number | null;
  budget_amount_kobo?: number | null;
  budget_remaining_kobo?: number | null;
}

/**
 * Push data for operational notifications (statement/receipt processing, etc.).
 * Includes OperationalNudgeContext fields at the top level.
 */
export interface OperationalNudgePushData extends PushDataBase {
  trigger_type: Exclude<NudgeTriggerType, 'nudge'>;
  bank_name?: string | null;
  transaction_id?: string | null;
  amount_kobo?: number | null;
  amount_naira?: string | null;
  direction?: 'credit' | 'debit' | null;
  imported?: number | null;
  updated?: number | null;
  reason?: 'unrecognised' | 'no_account' | 'parse_failed' | null;
}

/**
 * Union of all possible push notification data payloads.
 * Use `isDSLNudge()` / `isOperational()` to narrow.
 */
export type NudgePushData = DSLNudgePushData | OperationalNudgePushData;

// ── Type guards ───────────────────────────────────────────────────────────

export function isDSLNudge(data: NudgePushData): data is DSLNudgePushData {
  return data.trigger_type === 'nudge';
}

export function isOperational(data: NudgePushData): data is OperationalNudgePushData {
  return data.trigger_type !== 'nudge';
}
