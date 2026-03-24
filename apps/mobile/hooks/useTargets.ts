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

import { useToast } from '@/components/Toast';

import api from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';
import type { CategoryTargetUpsert, CategoryTarget } from '@/types/target';

/** Fetch the current target for a category (null if none). */
export function useTarget(categoryId: string) {
  return useQuery({
    queryKey: queryKeys.target(categoryId),
    queryFn: async () => {
      try {
        const { data } = await api.get<CategoryTarget>(`/categories/${categoryId}/target`);
        return data;
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) return null;
        throw err;
      }
    },
  });
}

export function useUpsertTarget(month: string) {
  const { error } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, body }: { categoryId: string; body: CategoryTargetUpsert }) =>
      api.put<CategoryTarget>(`/categories/${categoryId}/target`, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not save target.'),
  });
}
