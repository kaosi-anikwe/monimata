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

import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../lib/queryKeys';
import { $api } from '../services/api';

// ── List ──────────────────────────────────────────────────────────────────

export function useNudges(includeDismissed = true) {
  return $api.useQuery(
    'get',
    '/nudges',
    { params: { query: { include_dismissed: includeDismissed, limit: 50 } } },
    { staleTime: 60_000 },
  );
}

// ── Unread count (lightweight helper) ────────────────────────────────────

export function useNudgeUnreadCount(): number {
  const { data } = useNudges();
  return data?.unread_count ?? 0;
}

// ── Open ──────────────────────────────────────────────────────────────────

export function useOpenNudge() {
  const qc = useQueryClient();
  return $api.useMutation('post', '/nudges/{nudge_id}/open', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Dismiss ───────────────────────────────────────────────────────────────

export function useDismissNudge() {
  const qc = useQueryClient();
  return $api.useMutation('post', '/nudges/{nudge_id}/dismiss', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Delete ────────────────────────────────────────────────────────────────

export function useDeleteNudge() {
  const qc = useQueryClient();
  return $api.useMutation('delete', '/nudges/{nudge_id}', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Mark all read ─────────────────────────────────────────────────────────

export function useMarkAllNudgesRead() {
  const qc = useQueryClient();
  return $api.useMutation('post', '/nudges/mark-all-read', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudges() }),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────

export function useNudgeSettings() {
  return $api.useQuery('get', '/nudges/settings', {}, { staleTime: 5 * 60_000 });
}

export function useUpdateNudgeSettings() {
  const qc = useQueryClient();
  return $api.useMutation('patch', '/nudges/settings', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.nudgeSettings() }),
  });
}

// ── Device token registration ─────────────────────────────────────────────

export function useRegisterDevice() {
  return $api.useMutation('post', '/nudges/register-device');
}
