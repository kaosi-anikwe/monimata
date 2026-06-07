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

import { Directory } from 'expo-file-system';
import { useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/Toast';
import { syncDatabase } from '@/database/sync';
import { queryKeys } from '@/lib/queryKeys';
import { $api, authFetch } from '@/services/api';

export interface AddManualAccountPayload {
  institution: string;
  bank_slug: string;
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
  return $api.useQuery('get', '/accounts', {});
}

export function useSupportedBanks() {
  return $api.useQuery('get', '/accounts/supported-banks', {});
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useAddManualAccount() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('post', '/accounts/manual', {
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
  return $api.useMutation('patch', '/accounts/{account_id}/balance', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not update balance. Try again.'),
  });
}

export function useUpdateAlias() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('patch', '/accounts/{account_id}/alias', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not update account name. Try again.'),
  });
}

export function useUpdateExcludeFromNetWorth() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('patch', '/accounts/{account_id}/exclude-from-net-worth', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not update account. Try again.'),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  const { error } = useToast();
  return $api.useMutation('delete', '/accounts/{account_id}', {
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts() }),
    onError: () => error('Error', 'Could not remove account. Try again.'),
  });
}

export function useReconcile() {
  const qc = useQueryClient();
  const { success, error } = useToast();
  return $api.useMutation('post', '/accounts/{account_id}/reconcile', {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts() });
      qc.invalidateQueries({ queryKey: queryKeys.transactions() });
      syncDatabase().catch(console.warn);
      success('Account reconciled', 'Balance updated and adjustment recorded.');
    },
    onError: () => error('Error', 'Could not reconcile account. Try again.'),
  });
}

// ─── Gmail Filter ─────────────────────────────────────────────────────────────

/**
 * Downloads the Gmail filter XML for the given bank slugs using
 * File.downloadFileAsync (the current expo-file-system API), then opens the
 * native share sheet so the user can save the file to their desktop for
 * import into Gmail Settings.
 *
 * Returns the raw XML string so callers can show a confirmation step before
 * prompting for a save location.
 */
export async function fetchGmailFilterXml(bankSlugs: string[]): Promise<string> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  const qs = bankSlugs.map((s) => `bank_slugs=${encodeURIComponent(s)}`).join('&');
  const url = `${baseUrl}/accounts/gmail-filter?${qs}`;

  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.text();
}

/**
 * Opens the native folder picker and writes the given XML to
 * `monimata-gmail-filter.xml` in the chosen directory.
 *
 * Returns the saved file URI.
 */
export async function saveGmailFilterXml(xml: string): Promise<string> {
  // Let the user choose where to save the file.
  // Uses ACTION_OPEN_DOCUMENT_TREE (SAF) on Android, Files picker on iOS.
  const dir = await Directory.pickDirectoryAsync();
  const file = dir.createFile('monimata-gmail-filter.xml', 'application/xml');
  file.write(xml);

  return file.uri;
}

