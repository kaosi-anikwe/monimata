import { synchronize } from '@nozbe/watermelondb/sync';

import { showToast } from '../components/Toast';
import { authFetch, getAuthToken } from '../services/api';
import { getDatabase } from './index';

const API_BASE = process.env.EXPO_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error(
    '[MoniMata] EXPO_PUBLIC_API_URL is not set. ' +
    'Create apps/mobile/.env with EXPO_PUBLIC_API_URL=https://api.monimata.ng'
  );
}

/** Extract a human-readable detail from a non-OK fetch response. */
async function extractDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.detail ?? body?.message ?? '';
  } catch {
    return '';
  }
}

/**
 * In-flight sync promise. Prevents concurrent synchronize() calls.
 * If a new sync is requested while one is running, a follow-up run is
 * queued so writes that land during the current push phase are not missed.
 */
let syncInFlight: Promise<void> | null = null;
let syncPending = false;

export function syncDatabase(): Promise<void> {
  if (syncInFlight) {
    // Mark that another run is needed after the current one finishes.
    syncPending = true;
    return syncInFlight;
  }
  syncInFlight = _drain().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function _drain(): Promise<void> {
  do {
    syncPending = false;
    await _runSync();
  } while (syncPending);
}

async function _runSync(): Promise<void> {
  await _attempt(/* retryOn401 */ true);
}

async function _attempt(retryOn401: boolean): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;

  try {
    await synchronize({
      database: getDatabase(),

      pullChanges: async ({ lastPulledAt }) => {
        // Cap the initial sync window to the last 90 days to prevent enormous
        // first-sync payloads on slow Nigerian mobile connections.
        // Incremental syncs (lastPulledAt != null) are not affected.
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const pullFrom = lastPulledAt !== null ? lastPulledAt : ninetyDaysAgo;

        const url = `${API_BASE}/sync/pull?last_pulled_at=${pullFrom}`;
        const response = await authFetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) throw Object.assign(new Error('Sync unauthenticated'), { is401: true });
        if (!response.ok) {
          const detail = await extractDetail(response);
          throw Object.assign(
            new Error(`Sync pull failed (${response.status})${detail ? ': ' + detail : ''}`),
            { isNetworkError: true },
          );
        }
        const { changes, timestamp } = await response.json();
        return { changes, timestamp };
      },

      pushChanges: async ({ changes, lastPulledAt }) => {
        const response = await authFetch(`${API_BASE}/sync/push?last_pulled_at=${lastPulledAt}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ changes, last_pulled_at: lastPulledAt }),
        });
        if (response.status === 401) throw Object.assign(new Error('Sync unauthenticated'), { is401: true });
        if (!response.ok) {
          const detail = await extractDetail(response);
          throw Object.assign(
            new Error(`Sync push failed (${response.status})${detail ? ': ' + detail : ''}`),
            { isNetworkError: true },
          );
        }
      },

      migrationsEnabledAtVersion: 1,
      sendCreatedAsUpdated: true,
    });
  } catch (e) {
    console.error('[Sync]', e);

    if ((e as any)?.is401) {
      if (retryOn401) {
        // Silent retry — token may have just rotated
        await _attempt(false);
        return;
      }
      // Persisted 401 — let the auth layer handle logout
      throw e;
    }

    if ((e as any)?.isNetworkError) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred';
      showToast({ title: 'Sync failed', message, variant: 'error' });
      throw e;
    }

    // WatermelonDB internal / diagnostic error — logged above, not shown to user
    throw e;
  }
}
