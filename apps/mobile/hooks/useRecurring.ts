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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import api from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/components/Toast';
import type { RecurringRule, RecurringFrequency } from '@/types/recurring';

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

export function useRecurringRules() {
  return useQuery({
    queryKey: queryKeys.recurringRule(""),
    queryFn: async () => {
      const { data } = await api.get<RecurringRule[]>('/recurring-rules');
      return data;
    },
  });
}

export function useRecurringRule(ruleId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.recurringRule(ruleId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<RecurringRule>(`/recurring-rules/${ruleId}`);
      return data;
    },
    enabled: Boolean(ruleId),
  });
}

export function useCreateRecurringRule() {
  const { error } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecurringRuleBody) =>
      api.post<RecurringRule>('/recurring-rules', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recurringRule("") }),
    onError: () => error('Error', 'Could not schedule recurring transaction.'),
  });
}

export function useDeactivateRecurringRule() {
  const { error } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      api.patch(`/recurring-rules/${ruleId}`, { is_active: false }),
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
    mutationFn: (ruleId: string) => api.delete(`/recurring-rules/${ruleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.recurringRule("") }),
    onError: () => error('Error', 'Could not delete recurring rule.'),
  });
}
