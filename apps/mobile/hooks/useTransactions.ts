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

import { Q } from '@nozbe/watermelondb';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/Toast';
import { getDatabase } from '@/database';
import TransactionModel from '@/database/models/Transaction';
import { syncDatabase } from '@/database/sync';
import { queryKeys } from '@/lib/queryKeys';
import client from '@/services/api';
import { useAppSelector } from '@/store/hooks';
import type { Transaction, TransactionListResponse as TransactionPage, TransactionSplit, TransactionSplitItem } from '@monimata/shared-types';

export interface ManualTransactionBody {
  account_id: string;
  date: string; // ISO 8601 datetime, e.g. "2025-03-10T14:30:00.000Z"
  amount: number; // kobo; signed — negative for debit, positive for credit
  narration: string;
  type: 'debit' | 'credit';
  category_id?: string | null;
  memo?: string | null;
}

const PAGE_LIMIT = 30;

function txModelToDto(m: TransactionModel): Transaction {
  return {
    id: m.id,
    account_id: m.accountId,
    date: m.date.toISOString(),
    narration: m.narration,
    amount: m.amount,
    type: m.type as 'debit' | 'credit',
    balance_after: m.balanceAfter ?? null,
    category_id: m.categoryId,
    memo: m.memo,
    is_split: m.isSplit,
    source: m.source as 'bank_alert' | 'manual',
    recurrence_id: m.recurrenceId,
    splits: [],
    categorization_source: null,
    category_confidence: 0,
    created_at: m.createdAt.toISOString(),
    updated_at: m.updatedAt.toISOString(),
  };
}

export function useTransactions() {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions(),
    queryFn: async ({ pageParam = 1 }) => {
      const db = getDatabase();
      const [total, items] = await Promise.all([
        db.get<TransactionModel>('transactions').query().fetchCount(),
        db.get<TransactionModel>('transactions').query(
          Q.sortBy('date', Q.desc),
          Q.skip((pageParam - 1) * PAGE_LIMIT),
          Q.take(PAGE_LIMIT),
        ).fetch(),
      ]);
      return {
        items: items.map(txModelToDto),
        page: pageParam,
        limit: PAGE_LIMIT,
        total,
      } as TransactionPage;
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
    mutationFn: async ({ txId, categoryId }: { txId: string; categoryId: string | null }) => {
      const db = getDatabase();
      await db.write(async () => {
        const tx = await db.get<TransactionModel>('transactions').find(txId);
        await tx.update(t => {
          t.categoryId = categoryId;
          t.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['monthly-flow'] });
    },
    onError: () => error('Error', 'Could not update category.'),
  });
}

export function useTransaction(txId: string) {
  return useQuery({
    queryKey: ['transaction', txId],
    queryFn: async () => {
      const db = getDatabase();
      const tx = await db.get<TransactionModel>('transactions').find(txId);
      return txModelToDto(tx);
    },
    enabled: Boolean(txId),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  const { error } = useToast();
  const userId = useAppSelector(state => state.auth.user?.id ?? '');
  return useMutation({
    mutationFn: async (body: ManualTransactionBody) => {
      const db = getDatabase();
      await db.write(async () => {
        await db.get<TransactionModel>('transactions').create(tx => {
          tx.userId = userId;
          tx.accountId = body.account_id;
          tx.date = new Date(body.date);
          tx.amount = body.amount;
          tx.narration = body.narration;
          tx.type = body.type;
          tx.categoryId = body.category_id ?? null;
          tx.memo = body.memo ?? null;
          tx.isManual = true;
          tx.isSplit = false;
          tx.source = 'manual';
          tx.balanceAfter = null;
          tx.recurrenceId = null;
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['monthly-flow'] });
      qc.invalidateQueries({ queryKey: queryKeys.netWorth() });
    },
    onError: () => error('Error', 'Could not create transaction.'),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async ({ txId, body }: { txId: string; body: Partial<ManualTransactionBody> & { memo?: string | null } }) => {
      const db = getDatabase();
      await db.write(async () => {
        const tx = await db.get<TransactionModel>('transactions').find(txId);
        await tx.update(t => {
          if (body.date !== undefined) t.date = new Date(body.date as string);
          if (body.amount !== undefined) t.amount = body.amount as number;
          if (body.narration !== undefined) t.narration = body.narration as string;
          if (body.type !== undefined) t.type = body.type as string;
          if (body.category_id !== undefined) t.categoryId = body.category_id ?? null;
          if (body.memo !== undefined) t.memo = body.memo ?? null;
          t.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: (_data, _vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['monthly-flow'] });
      qc.invalidateQueries({ queryKey: queryKeys.netWorth() });
    },
    onError: () => error('Error', 'Could not update transaction.'),
  });
}

export function useSplitTransaction() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async ({ txId, splits }: { txId: string; splits: TransactionSplitItem[] }) => {
      const { error: apiError } = await client.POST('/transactions/{tx_id}/split', {
        params: { path: { tx_id: txId } },
        body: { splits },
      });
      if (apiError) throw new Error('Split failed');

      // Mark the transaction as split in the local DB so the UI reflects it
      // immediately without waiting for the next full sync pull.
      const db = getDatabase();
      await db.write(async () => {
        const tx = await db.get<TransactionModel>('transactions').find(txId);
        await tx.update((t) => {
          t.isSplit = true;
          t.updatedAt = new Date();
        });
      });

      // Pull fresh server state so splits array and budget activity are current.
      syncDatabase().catch(console.warn);
    },
    onSuccess: (_data, { txId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: ['transaction', txId] });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['monthly-flow'] });
    },
    onError: () => error('Error', 'Could not save split.'),
  });
}

export function useTransactionSplits(txId: string, enabled: boolean) {
  return useQuery<TransactionSplit[]>({
    queryKey: ['transaction', txId, 'splits'],
    queryFn: async () => {
      const { data, error } = await client.GET('/transactions/{tx_id}', {
        params: { path: { tx_id: txId } },
      });
      if (error) throw new Error('Could not load splits');
      return data.splits;
    },
    enabled: Boolean(txId) && enabled,
  });
}

export function useRemoveSplit() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (txId: string) => {
      const { error: apiError } = await client.DELETE('/transactions/{tx_id}/split', {
        params: { path: { tx_id: txId } },
      });
      if (apiError) throw new Error('Could not remove split');
      const db = getDatabase();
      await db.write(async () => {
        const tx = await db.get<TransactionModel>('transactions').find(txId);
        await tx.update((t) => {
          t.isSplit = false;
          t.categoryId = null;
          t.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: (_data, txId) => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: ['transaction', txId] });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['monthly-flow'] });
    },
    onError: () => error('Error', 'Could not remove split.'),
  });
}


// TODO: switch to local WatermelonDB table queries for these read operations,
// with syncDatabase() calls in the mutations to keep the local cache up to date. 
// This will give a much snappier UI experience and reduce load on the API, 
// especially for the transactions list which is paginated but currently still 
// makes an API call on every page.

// export function useNetWorth() {
//   const db = getDatabase();
//   return useQuery({
//     queryKey: queryKeys.netWorth(),
//     queryFn: async () => {
//       // Credits are positive, debits are negative — a plain sum gives the ledger balance.
//       const txns = await db.get<TransactionModel>('transactions').query().fetch();
//       return txns.reduce((s, t) => s + t.amount, 0);
//     },
//   });
// }

export function useMonthlyFlow(month: string) {
  const db = getDatabase();
  return useQuery({
    queryKey: queryKeys.monthlyFlow(month),
    queryFn: async () => {
      const [year, monthNum] = month.split('-').map(Number);
      const startMs = new Date(year, monthNum - 1, 1).getTime();
      const endMs = new Date(year, monthNum, 1).getTime();

      // Exclude synthetic 'system' entries (e.g. opening balance adjustments).
      // Use signed amount as source of truth — positive = in, negative = out.
      const monthlyTransactions = await db
        .get<TransactionModel>('transactions')
        .query(
          Q.where('date', Q.gte(startMs)),
          Q.where('date', Q.lt(endMs)),
          Q.where('source', Q.notEq('system')),
        )
        .fetch();

      let totalIn = 0;
      let totalOut = 0;

      for (const tx of monthlyTransactions) {
        if (tx.amount > 0) totalIn += tx.amount;
        else totalOut += Math.abs(tx.amount);
      }

      return { totalIn, totalOut };
    },
    enabled: Boolean(month),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (txId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const tx = await db.get<TransactionModel>('transactions').find(txId);
        await tx.markAsDeleted();
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['monthly-flow'] });
      qc.invalidateQueries({ queryKey: queryKeys.netWorth() });
    },
    onError: () => error('Error', 'Could not delete transaction.'),
  });
}
