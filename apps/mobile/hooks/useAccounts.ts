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

import { Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import api from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';
import type { BankAccount } from '@/types/account';

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: async () => {
      const { data } = await api.get<BankAccount[]>('/accounts');
      return data;
    },
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
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
    onError: () => Alert.alert('Sync Failed', 'Could not start sync. Try again.'),
  });
}

export function useUnlinkAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => api.delete(`/accounts/${accountId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => Alert.alert('Error', 'Could not unlink account. Try again.'),
  });
}
