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

/**
 * hooks/useCategorization.ts
 *
 * All read queries and mutation hooks for the categorization module and the
 * BYOK AI credential panel (spec §4 – §8).
 *
 * Conventions:
 *  - All API-backed queries use $api.useQuery / $api.useMutation (openapi-react-query).
 *  - Query keys are centralised in lib/queryKeys.ts — never inline magic strings.
 *  - Every mutation that changes transaction or budget state invalidates the
 *    correct superset of query keys so all cached views stay consistent.
 *  - Toast messages surface network errors to the user; raw errors are not
 *    swallowed silently.
 */

import { useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/Toast';
import { queryKeys } from '@/lib/queryKeys';
import { $api } from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// ── CATEGORIZATION — Read queries ────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Levenshtein-clustered merchant groups for all uncategorised transactions.
 *
 * Returns `ClustersResponse`:
 *   clusters: ClusterItem[]  — each has key, member_narrations, count, total_amount
 *   total_uncategorised: number
 *
 * staleTime of 60 s avoids hammering the endpoint on every tab focus while
 * still refreshing after the user completes a batch session.
 */
export function useClusters() {
  return $api.useQuery(
    'get',
    '/transactions/clusters',
    {},
    { staleTime: 60_000 },
  );
}

/**
 * Next uncategorised transaction with top-3 category suggestions.
 *
 * Returns `ReviewQueueItem | null`.
 *   null means the queue is empty.
 *
 * No staleTime — must always reflect the freshest server state so the card
 * stack advances correctly after each confirm/defer.
 */
export function useReviewQueue() {
  return $api.useQuery('get', '/transactions/review-queue', {});
}

/**
 * Full list of uncategorised transactions (oldest-first) for the Review
 * Queue local-queue mode.
 *
 * Fetched once on screen mount; the screen manages order client-side so
 * "Later" (defer) moves a transaction to the back without a server round-trip.
 * Large limit is intentional — categorisation sessions rarely exceed 200 items.
 */
export function useUncategorisedQueue() {
  return $api.useQuery('get', '/transactions', {
    params: { query: { uncategorized: true, limit: 100 } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── CATEGORIZATION — Mutations ────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Batch-assign a category to every uncategorised transaction in a cluster.
 *
 * Body: { cluster_key: string; category_id: string }
 *
 * On success:
 *  - clusters & reviewQueue re-fetched (uncategorised counts change).
 *  - transactions & budget invalidated (activity / available figures change).
 */
export function useCategorizeCluster() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('post', '/transactions/clusters/categorize', {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.clusters() });
      qc.invalidateQueries({ queryKey: queryKeys.reviewQueue() });
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      // Bare ['budget'] prefix invalidates every month variant.
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
    onError: () => error('Error', 'Could not categorise transactions. Try again.'),
  });
}

/**
 * Confirm or override the category suggestion for a single transaction.
 *
 * Path param tx_id is supplied via the params object at call-site:
 *   mutation.mutate({ params: { path: { tx_id } }, body: { category_id } })
 *
 * Also upserts a UserCategoryRule so future identical narrations are
 * matched at Tier 1 (exact-match cache) automatically.
 *
 * On success: reviewQueue & transactions re-fetched.
 */
export function useConfirmCategory() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('post', '/transactions/{tx_id}/confirm-category', {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reviewQueue() });
      qc.invalidateQueries({ queryKey: queryKeys.uncategorisedQueue() });
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
    onError: () => error('Error', 'Could not confirm category. Try again.'),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── AI / BYOK — Read queries ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List the user's BYOK AI credentials (provider + active status, no keys).
 *
 * Returns `AiCredentialResponse[]`.
 */
export function useAiCredentials() {
  return $api.useQuery(
    'get',
    '/ai/credentials',
    {},
    { staleTime: 5 * 60_000 },
  );
}

/**
 * AI efficiency monitor data (spec §8.3).
 *
 * Returns `AiUsageResponse` with offline success rate, LLM-handled %, and
 * current-month / lifetime token volumes.
 */
export function useAiUsage() {
  return $api.useQuery(
    'get',
    '/ai/usage',
    {},
    { staleTime: 5 * 60_000 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── AI / BYOK — Mutations ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Store a new BYOK API credential.
 *
 * Body: { provider: 'gemini' | 'openai' | 'anthropic'; api_key: string }
 *
 * The plaintext key is transmitted over HTTPS; the backend encrypts it at
 * rest with AES-256-GCM before writing to the database (spec §8.1).
 * The key is never stored or logged on-device.
 */
export function useAddAiCredential() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('post', '/ai/credentials', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.aiCredentials() }),
    onError: () => error('Error', 'Could not save API key. Check the key and try again.'),
  });
}

/**
 * Remove a BYOK credential.
 *
 * Path param credential_id supplied via params at call-site:
 *   mutation.mutate({ params: { path: { credential_id } } })
 */
export function useDeleteAiCredential() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('delete', '/ai/credentials/{credential_id}', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.aiCredentials() }),
    onError: () => error('Error', 'Could not remove API key. Try again.'),
  });
}

/**
 * Manually trigger LLM categorisation for all uncategorised transactions.
 *
 * Requires an active BYOK credential. Returns 202 immediately; a push
 * notification is sent when processing completes (spec §8.2).
 *
 * aiUsage is re-fetched on success so the monitor panel updates.
 * The caller is responsible for showing an informational Toast after mutate()
 * resolves (the backend is async, so we only confirm queuing here).
 */
export function useTriggerLlmCategorization() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('post', '/ai/categorize', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.aiUsage() }),
    onError: () =>
      error(
        'AI Categorisation Failed',
        'Could not queue AI run. Check your API key is active and has credits.',
      ),
  });
}
