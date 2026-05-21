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
 *
 * Auto-generated API types (from FastAPI's OpenAPI spec) live in ./api.ts —
 * run `npm run generate:types` from the monorepo root to regenerate them.
 *
 * This file re-exports the generated types under friendly names so consumers
 * can write:
 *   import type { User, Transaction } from '@monimata/shared-types';
 * instead of the verbose bracket-notation form.
 */

export type { components, operations, paths } from './api';

import type { components } from './api';

// ── Auth ──────────────────────────────────────────────────────────────────────
export type User = components['schemas']['UserResponse'];
export type RegisterPayload = components['schemas']['RegisterRequest'];
export type LoginPayload = components['schemas']['LoginRequest'];
export type UpdateProfilePayload = components['schemas']['UpdateProfileRequest'];
export type TokenResponse = components['schemas']['TokenResponse'];
export type AccessTokenResponse = components['schemas']['AccessTokenResponse'];
export type RefreshPayload = components['schemas']['RefreshRequest'];

// ── Accounts ─────────────────────────────────────────────────────────────────
export type BankAccount = components['schemas']['BankAccountResponse'];
export type SupportedBank = components['schemas']['SupportedBankResponse'];
export type AddManualAccountPayload = components['schemas']['AddManualAccountRequest'];
export type UpdateAliasPayload = components['schemas']['UpdateAliasRequest'];
export type UpdateManualBalancePayload = components['schemas']['UpdateManualBalanceRequest'];

// ── Transactions ─────────────────────────────────────────────────────────────
export type Transaction = components['schemas']['TransactionResponse'];
export type TransactionSplit = components['schemas']['TransactionSplitResponse'];
export type TransactionSplitItem = components['schemas']['TransactionSplitItem'];
export type TransactionSplitPayload = components['schemas']['TransactionSplitRequest'];
export type ManualTransactionPayload = components['schemas']['ManualTransactionRequest'];
export type TransactionPatchPayload = components['schemas']['TransactionPatchRequest'];
export type TransactionListResponse = components['schemas']['TransactionListResponse'];
export type TransactionSource = components['schemas']['TransactionSource'];

// ── Budget ────────────────────────────────────────────────────────────────────
export type BudgetResponse = components['schemas']['BudgetResponse'];
export type BudgetGroup = components['schemas']['BudgetGroupResponse'];
export type BudgetCategory = components['schemas']['BudgetCategoryResponse'];
export type TBBResponse = components['schemas']['TBBResponse'];
export type AssignBudgetPayload = components['schemas']['AssignRequest'];
export type MoveMoneyPayload = components['schemas']['MoveMoneyRequest'];
export type AutoAssignStrategy = components['schemas']['AutoAssignStrategy'];
export type AutoAssignResponse = components['schemas']['AutoAssignResponse'];
export type UnderfundedCategory = components['schemas']['UnderfundedCategoryResponse'];

// ── Categories ────────────────────────────────────────────────────────────────
export type Category = components['schemas']['CategoryResponse'];
export type CategoryGroup = components['schemas']['CategoryGroupResponse'];
export type CategoryGroupWithCategories = components['schemas']['CategoryGroupWithCategories'];
export type CategoryCreatePayload = components['schemas']['CategoryCreate'];
export type CategoryUpdatePayload = components['schemas']['CategoryUpdate'];
export type CategoryGroupCreatePayload = components['schemas']['CategoryGroupCreate'];
export type CategoryGroupUpdatePayload = components['schemas']['CategoryGroupUpdate'];
export type CategoryTarget = components['schemas']['CategoryTargetResponse'];
export type CategoryTargetUpsert = components['schemas']['CategoryTargetUpsert'];

// ── Nudges ────────────────────────────────────────────────────────────────────
export type Nudge = components['schemas']['NudgeResponse'];
export type NudgeListResponse = components['schemas']['NudgeListResponse'];
export type NudgeSettings = components['schemas']['NudgeSettingsResponse'];
export type NudgeSettingsUpdate = components['schemas']['NudgeSettingsUpdate'];
export type NudgeTriggerType = components['schemas']['NudgeTriggerType'];
export type NudgeScreen = components['schemas']['NudgeScreen'];
export type DSLNudgeContext = components['schemas']['DSLNudgeContext'];
export type OperationalNudgeContext = components['schemas']['OperationalNudgeContext'];
export type RegisterDevicePayload = components['schemas']['RegisterDeviceRequest'];
export type TestTriggerPayload = components['schemas']['TestTriggerRequest'];

// ── Recurring rules ───────────────────────────────────────────────────────────
export type RecurringRule = components['schemas']['RecurringRuleResponse'];
export type RecurringRuleCreate = components['schemas']['RecurringRuleCreate'];
export type RecurringRuleUpdate = components['schemas']['RecurringRuleUpdate'];
export type RecurringFrequency = components['schemas']['RecurringRuleCreate']['frequency'];
export type RecurringTemplate = components['schemas']['RecurringTemplate'];
