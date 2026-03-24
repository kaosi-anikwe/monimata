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
import type { BudgetResponse } from '@/types/budget';

export function useBudget(month: string) {
  return useQuery({
    queryKey: queryKeys.budget(month),
    queryFn: async () => {
      const { data } = await api.get<BudgetResponse>('/budget', { params: { month } });
      return data;
    },
  });
}

export function useAssignCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ categoryId, assigned }: { categoryId: string; assigned: number }) =>
      api.patch(`/budget/${categoryId}`, { assigned }, { params: { month } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not save assignment.'),
  });
}

export function useCreateGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (name: string) => api.post('/category-groups', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not create group.'),
  });
}

export function useCreateCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) =>
      api.post('/categories', { group_id: groupId, name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not create category.'),
  });
}

export function useRenameCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      api.patch(`/categories/${categoryId}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not rename category.'),
  });
}

export function useHideCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (categoryId: string) =>
      api.patch(`/categories/${categoryId}`, { is_hidden: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not hide category.'),
  });
}

export function useDeleteCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (categoryId: string) => api.delete(`/categories/${categoryId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      error('Cannot Delete', msg ?? 'Could not delete category.');
    },
  });
}

export function useRenameGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({ groupId, name }: { groupId: string; name: string }) =>
      api.patch(`/category-groups/${groupId}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not rename group.'),
  });
}

export function useDeleteGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (groupId: string) => api.delete(`/category-groups/${groupId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      error('Cannot Delete', msg ?? 'Could not delete group.');
    },
  });
}

export function useDeleteTarget(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (categoryId: string) => api.delete(`/categories/${categoryId}/target`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not remove target.'),
  });
}

export function useHideGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: (groupId: string) =>
      api.patch(`/category-groups/${groupId}`, { is_hidden: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not hide group.'),
  });
}

export function useMoveMoney(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: ({
      fromCategoryId,
      toCategoryId,
      amount,
    }: {
      fromCategoryId: string;
      toCategoryId: string;
      amount: number; // kobo
    }) =>
      api.post('/budget/move', {
        from_category_id: fromCategoryId,
        to_category_id: toCategoryId,
        amount,
        month,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      error('Cannot Move', msg ?? 'Could not move money.');
    },
  });
}
