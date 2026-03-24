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

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import api from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/components/Toast';
import type { Transaction, TransactionPage } from '@/types/transaction';

export interface ManualTransactionBody {
  account_id: string;
  date: string; // ISO 8601 datetime, e.g. "2025-03-10T14:30:00.000Z"
  amount: number; // kobo; positive
  narration: string;
  type: 'debit' | 'credit';
  category_id?: string | null;
  memo?: string | null;
}

const PAGE_LIMIT = 30;

export function useTransactions() {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions(),
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await api.get<TransactionPage>('/transactions', {
        params: { page: pageParam, limit: PAGE_LIMIT },
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const loaded = (last.page - 1) * last.limit + last.items.length;
      return loaded < last.total ? last.page + 1 : undefined;
    },
  });
}

export function useRecategorize() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ txId, categoryId }: { txId: string; categoryId: string | null }) =>
      api.patch(`/transactions/${txId}`, { category_id: categoryId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      // Recategorizing affects budget activity totals — invalidate all months
      qc.invalidateQueries({ queryKey: queryKeys.budget("") });
    },
    onError: () => error('Error', 'Could not update category.'),
  });
}

export function useTransaction(txId: string) {
  return useQuery({
    queryKey: ['transaction', txId],
    queryFn: async () => {
      const { data } = await api.get<Transaction>(`/transactions/${txId}`);
      return data;
    },
    enabled: Boolean(txId),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (body: ManualTransactionBody) =>
      api.post<Transaction>('/transactions/manual', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: queryKeys.budget('') });
      // The Celery worker categorizes the transaction and evaluates nudges
      // asynchronously. Refresh nudges after a short delay so the badge and
      // Nudges tab update without requiring a push notification roundtrip.
      setTimeout(
        () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
        4000,
      );
    },
    onError: () => error('Error', 'Could not create transaction.'),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ txId, body }: { txId: string; body: Partial<ManualTransactionBody> & { memo?: string | null } }) =>
      api.patch<Transaction>(`/transactions/${txId}`, body),
    onSuccess: (_data, { txId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: queryKeys.budget("") });
    },
    onError: () => error('Error', 'Could not update transaction.'),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (txId: string) => api.delete(`/transactions/${txId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: queryKeys.budget("") });
    },
    onError: () => error('Error', 'Could not delete transaction.'),
  });
}
