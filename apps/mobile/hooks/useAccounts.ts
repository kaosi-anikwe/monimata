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
import type { BankAccount } from '@/types/account';

export interface AddManualAccountPayload {
  institution: string;
  bank_code: string;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
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

export function useLinkMono() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ accountId, code }: { accountId: string; code: string }) =>
      api.post<BankAccount>(`/accounts/${accountId}/link`, { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts() });
      setTimeout(
        () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
        3000,
      );
    },
    onError: () => error('Error', 'Could not link account. Try again.'),
  });
}

export function useUnlinkMono() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (accountId: string) => api.post(`/accounts/${accountId}/unlink`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not disconnect Mono. Try again.'),
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (accountId: string) => api.post(`/accounts/${accountId}/sync`),
    onSuccess: () => {
      // Server returns 202 — fetch returns immediately. Give Celery a moment then refresh.
      setTimeout(
        () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
        3000,
      );
      // Sync may categorize transactions and trigger nudges — also refresh nudges.
      setTimeout(
        () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
        6000,
      );
    },
    onError: () => error('Sync Failed', 'Could not start sync. Try again.'),
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

/** @deprecated Use useUnlinkMono() + useDeleteAccount() separately. */
export function useUnlinkAccount() {
  return useDeleteAccount();
}

