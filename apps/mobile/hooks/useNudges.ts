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

import api from '../services/api';
import { queryKeys } from '../lib/queryKeys';
import type {
  Nudge,
  NudgeListResponse,
  NudgeSettings,
  NudgeSettingsUpdate,
} from '../types/nudge';

// ── List ──────────────────────────────────────────────────────────────────

export function useNudges(includeDismissed = true) {
  return useQuery<NudgeListResponse>({
    queryKey: queryKeys.nudges(),
    queryFn: () =>
      api.get('/nudges', {
        params: { include_dismissed: includeDismissed, limit: 50 },
      }).then((r) => r.data),
    staleTime: 60_000,
  });
}

// ── Unread count (lightweight helper) ────────────────────────────────────

export function useNudgeUnreadCount(): number {
  const { data } = useNudges();
  return data?.unread_count ?? 0;
}

// ── Open ──────────────────────────────────────────────────────────────────

export function useOpenNudge() {
  const qc = useQueryClient();
  return useMutation<Nudge, unknown, string>({
    mutationFn: (id) => api.post(`/nudges/${id}/open`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Dismiss ───────────────────────────────────────────────────────────────

export function useDismissNudge() {
  const qc = useQueryClient();
  return useMutation<Nudge, unknown, string>({
    mutationFn: (id) => api.post(`/nudges/${id}/dismiss`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Delete ────────────────────────────────────────────────────────────────

export function useDeleteNudge() {
  const qc = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (id) => api.delete(`/nudges/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Mark all read ─────────────────────────────────────────────────────────

export function useMarkAllNudgesRead() {
  const qc = useQueryClient();
  return useMutation<void, unknown, void>({
    mutationFn: () => api.post('/nudges/mark-all-read').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────

export function useNudgeSettings() {
  return useQuery<NudgeSettings>({
    queryKey: queryKeys.nudgeSettings(),
    queryFn: () => api.get('/nudges/settings').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateNudgeSettings() {
  const qc = useQueryClient();
  return useMutation<NudgeSettings, unknown, NudgeSettingsUpdate>({
    mutationFn: (body) => api.patch('/nudges/settings', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudgeSettings() }),
  });
}

// ── Device token registration ─────────────────────────────────────────────

export function useRegisterDevice() {
  return useMutation<void, unknown, { token: string }>({
    mutationFn: (body) =>
      api.post('/nudges/register-device', body).then((r) => r.data),
  });
}
