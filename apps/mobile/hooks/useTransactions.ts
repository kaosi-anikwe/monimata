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

import { getDatabase } from '@/database';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/components/Toast';
import { useAppSelector } from '@/store/hooks';
import { syncDatabase } from '@/database/sync';
import TransactionModel from '@/database/models/Transaction';
import type { Transaction, TransactionPage } from '@/types/transaction';

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
    category_id: m.categoryId,
    memo: m.memo,
    is_split: m.isSplit,
    is_manual: m.isManual,
    source: m.source,
    recurrence_id: m.recurrenceId,
    splits: [],
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
      // Use the bare ['budget'] prefix key so TanStack Query invalidates every
      // budget query regardless of month (e.g. ['budget', '2026-03']).
      // queryKeys.budget('') = ['budget', ''] which does NOT match ['budget', '2026-03'].
      qc.invalidateQueries({ queryKey: ['budget'] });
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
          tx.monoId = null;
          tx.balanceAfter = null;
          tx.recurrenceId = null;
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      // ['budget'] prefix invalidates all months — budget('')  would only match ['budget', ''].
      qc.invalidateQueries({ queryKey: ['budget'] });
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
      // ['budget'] prefix invalidates all months — budget('')  would only match ['budget', ''].
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
    onError: () => error('Error', 'Could not update transaction.'),
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
      // ['budget'] prefix invalidates all months — budget('')  would only match ['budget', ''].
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
    onError: () => error('Error', 'Could not delete transaction.'),
  });
}
