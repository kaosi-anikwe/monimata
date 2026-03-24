import { synchronize } from '@nozbe/watermelondb/sync';

import { getAuthToken } from '../services/api';
import { getDatabase } from './index';

const API_BASE = process.env.EXPO_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error(
    '[MoniMata] EXPO_PUBLIC_API_URL is not set. ' +
    'Create apps/mobile/.env with EXPO_PUBLIC_API_URL=https://api.monimata.ng'
  );
}

export async function syncDatabase(): Promise<void> {
  const token = await getAuthToken()
  if (!token) return

  await synchronize({
    database: getDatabase(),

    pullChanges: async ({ lastPulledAt }) => {
      // Cap the initial sync window to the last 90 days to prevent enormous
      // first-sync payloads on slow Nigerian mobile connections.
      // Incremental syncs (lastPulledAt != null) are not affected.
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const pullFrom = lastPulledAt !== null ? lastPulledAt : ninetyDaysAgo;

      const url = `${API_BASE}/sync/pull?last_pulled_at=${pullFrom}`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`Sync pull failed: ${response.status}`)
      const { changes, timestamp } = await response.json()
      return { changes, timestamp }
    },

    pushChanges: async ({ changes, lastPulledAt }) => {
      const response = await fetch(`${API_BASE}/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changes, last_pulled_at: lastPulledAt }),
      })
      if (!response.ok) throw new Error(`Sync push failed: ${response.status}`)
    },

    migrationsEnabledAtVersion: 1,
  })
}
