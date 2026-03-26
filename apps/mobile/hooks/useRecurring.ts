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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDatabase } from '@/database';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/components/Toast';
import { syncDatabase } from '@/database/sync';
import { useAppSelector } from '@/store/hooks';
import RecurringRuleModel from '@/database/models/RecurringRule';
import type { RecurringFrequency, RecurringRule, RecurringTemplate } from '@/types/recurring';

export interface RecurringRuleBody {
  frequency: RecurringFrequency;
  interval: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
  /** ISO date "YYYY-MM-DD" — date of the NEXT occurrence to generate */
  next_due: string;
  ends_on?: string | null;
  template: {
    account_id: string;
    /** kobo; negative = debit, positive = credit */
    amount: number;
    narration: string;
    type: 'debit' | 'credit';
    category_id: string | null;
    memo: string | null;
  };
}

function ruleModelToDto(m: RecurringRuleModel): RecurringRule {
  return {
    id: m.id,
    user_id: m.userId,
    frequency: m.frequency as RecurringFrequency,
    interval: m.interval,
    day_of_week: m.dayOfWeek,
    day_of_month: m.dayOfMonth,
    next_due: m.nextDue,
    ends_on: m.endsOn,
    is_active: m.isActive,
    template: JSON.parse(m.template) as RecurringTemplate,
  };
}

export function useRecurringRules() {
  return useQuery({
    queryKey: queryKeys.recurringRule(''),
    queryFn: async () => {
      const db = getDatabase();
      const rules = await db.get<RecurringRuleModel>('recurring_rules').query().fetch();
      return rules.map(ruleModelToDto);
    },
  });
}

export function useRecurringRule(ruleId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.recurringRule(ruleId ?? ''),
    queryFn: async () => {
      const db = getDatabase();
      const rule = await db.get<RecurringRuleModel>('recurring_rules').find(ruleId!);
      return ruleModelToDto(rule);
    },
    enabled: Boolean(ruleId),
  });
}

export function useCreateRecurringRule() {
  const { error } = useToast();
  const qc = useQueryClient();
  const userId = useAppSelector(state => state.auth.user?.id ?? '');
  return useMutation({
    mutationFn: async (body: RecurringRuleBody) => {
      const db = getDatabase();
      await db.write(async () => {
        await db.get<RecurringRuleModel>('recurring_rules').create(r => {
          r.userId = userId;
          r.frequency = body.frequency;
          r.interval = body.interval;
          r.dayOfWeek = body.day_of_week ?? null;
          r.dayOfMonth = body.day_of_month ?? null;
          r.nextDue = body.next_due;
          r.endsOn = body.ends_on ?? null;
          r.isActive = true;
          r.template = JSON.stringify(body.template);
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recurringRule("") }),
    onError: () => error('Error', 'Could not schedule recurring transaction.'),
  });
}

export function useDeactivateRecurringRule() {
  const { error } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const rule = await db.get<RecurringRuleModel>('recurring_rules').find(ruleId);
        await rule.update(r => {
          r.isActive = false;
          r.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.recurringRule("") });
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
    },
    onError: () => error('Error', 'Could not stop recurring transaction.'),
  });
}

export function useDeleteRecurringRule() {
  const { error } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const rule = await db.get<RecurringRuleModel>('recurring_rules').find(ruleId);
        await rule.markAsDeleted();
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recurringRule("") }),
    onError: () => error('Error', 'Could not delete recurring rule.'),
  });
}
