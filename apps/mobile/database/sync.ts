import { synchronize } from '@nozbe/watermelondb/sync'

import database from './index'
import { getAuthToken } from '../services/api'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://accessing-ignored-transmit-sms.trycloudflare.com'

export async function syncDatabase(): Promise<void> {
  const token = await getAuthToken()
  if (!token) return

  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt }) => {
      const url = `${API_BASE}/sync/pull?last_pulled_at=${lastPulledAt ?? 0}`
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
