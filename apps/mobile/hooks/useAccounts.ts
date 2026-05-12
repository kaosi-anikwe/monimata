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

import { useToast } from '@/components/Toast';
import { queryKeys } from '@/lib/queryKeys';
import api from '@/services/api';
import type { BankAccount } from '@/types/account';

export interface AddManualAccountPayload {
  institution: string;
  account_number: string;
  alias: string;
  account_type?: string;
  currency?: string;
  balance?: number;
}

export interface UpdateBalancePayload {
  balance: number;
  note?: string;
}

export interface UpdateAliasPayload {
  alias: string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: async () => {
      const { data } = await api.get<BankAccount[]>('/accounts');
      return data;
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useAddManualAccount() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (payload: AddManualAccountPayload) =>
      api.post<BankAccount>('/accounts/manual', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts() });
      // The opening balance transaction also affects TBB and the tx list.
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
    },
    onError: () => error('Could not add account', 'Check the details and try again.'),
  });
}

export function useUpdateBalance() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ accountId, ...body }: UpdateBalancePayload & { accountId: string }) =>
      api.patch<BankAccount>(`/accounts/${accountId}/balance`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not update balance. Try again.'),
  });
}

export function useUpdateAlias() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ accountId, alias }: UpdateAliasPayload & { accountId: string }) =>
      api.patch<BankAccount>(`/accounts/${accountId}/alias`, { alias }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not update account name. Try again.'),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (accountId: string) => api.delete(`/accounts/${accountId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not remove account. Try again.'),
  });
}

