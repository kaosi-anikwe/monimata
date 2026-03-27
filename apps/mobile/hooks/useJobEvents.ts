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
 * hooks/useJobEvents.ts
 *
 * WebSocket client that subscribes to server-side job completion events
 * and reactively invalidates React Query caches.
 *
 * This replaces the setTimeout-based cache invalidation pattern that was
 * used after Celery job triggers (account sync, transaction categorisation,
 * nudge evaluation). setTimeout is a race condition at scale — the WebSocket
 * gives true push-from-server behaviour.
 *
 * --- BACKEND CONTRACT ---
 * The FastAPI backend must maintain a WebSocket endpoint at /ws/events.
 * After any async job completes, emit to the authenticated user's connection:
 *
 *   { "type": "invalidate", "keys": ["accounts", "transactions", "nudges"] }
 *
 * Authentication: the token is passed as a query param (?token=...) so the
 * server can validate it before upgrading the HTTP connection.
 *
 * Example FastAPI handler:
 *   @router.websocket("/ws/events")
 *   async def events_ws(websocket: WebSocket, token: str = Query(...)):
 *       user = await verify_token(token)
 *       await manager.connect(user.id, websocket)
 *       try:
 *           while True:
 *               await websocket.receive_text()  # keep-alive pings
 *       except WebSocketDisconnect:
 *           manager.disconnect(user.id, websocket)
 *
 * --- FALLBACK BEHAVIOUR ---
 * If the WebSocket URL is unavailable (dev environment, backend not yet updated),
 * the hook degrades gracefully — no error is thrown, and the app continues to
 * function with manual pull-to-refresh for updates.
 *
 * --- CONFIGURATION ---
 * WS URL is derived from EXPO_PUBLIC_API_URL (http→ws, https→wss).
 * Override with EXPO_PUBLIC_WS_URL if your WS server is on a different host.
 */

import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { AppState, AppStateStatus } from 'react-native';

import type { RootState } from '@/store';
import { getAccessToken } from '@/services/api';
import { syncDatabase } from '@/database/sync';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const WS_BASE =
  process.env.EXPO_PUBLIC_WS_URL ??
  API_BASE.replace(/^https/, 'wss').replace(/^http/, 'ws');

interface InvalidateEvent {
  type: 'invalidate';
  keys: string[];
}

interface BillPaymentUpdateEvent {
  type: 'bill_payment_update';
  ref: string;
  state: 'COMPLETED' | 'FAILED' | 'REFUNDED';
}

type ServerEvent = InvalidateEvent | BillPaymentUpdateEvent;

// ─── Bill payment update observers ───────────────────────────────────────────
// ProcessingStep registers a callback keyed by ref so it can react immediately
// to a pushed state change rather than waiting for the next poll tick.

type BillStateCallback = (state: BillPaymentUpdateEvent['state']) => void;
const _billObservers = new Map<string, BillStateCallback>();

export function subscribeBillPaymentUpdate(ref: string, cb: BillStateCallback): () => void {
  _billObservers.set(ref, cb);
  return () => _billObservers.delete(ref);
}

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Opens a long-lived WebSocket connection to /ws/events and invalidates
 * React Query caches when the server signals that async jobs have completed.
 *
 * Mount in the root layout so it stays alive across all tabs.
 * Automatically disconnects when the user logs out.
 */
export function useJobEvents(): void {
  const qc = useQueryClient();
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !WS_BASE) return;

    async function connect() {
      if (!mountedRef.current) return;

      try {
        const token = await getAccessToken();
        if (!token || !mountedRef.current) return;

        const url = `${WS_BASE}/ws/events?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          retryCountRef.current = 0;
        };

        ws.onmessage = (event: MessageEvent<string>) => {
          try {
            const msg = JSON.parse(event.data) as ServerEvent;
            if (msg.type === 'invalidate' && Array.isArray(msg.keys)) {
              // Keys that indicate new server-side data (Mono sync, categorisation,
              // nudge evaluation). We must pull WatermelonDB before invalidating React
              // Query — otherwise the query re-runs against stale local SQLite data.
              const needsSync = msg.keys.some((k) =>
                k === 'transactions' || k === 'budget' || k === 'accounts',
              );
              const doInvalidate = () =>
                msg.keys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));

              if (needsSync) {
                syncDatabase().then(doInvalidate).catch(() => doInvalidate());
              } else {
                doInvalidate();
              }
            } else if (msg.type === 'bill_payment_update') {
              // Invalidate status query so polling picks up the new state.
              qc.invalidateQueries({ queryKey: ['bill-payment-status', msg.ref] });
              // Immediately notify any mounted ProcessingStep.
              const cb = _billObservers.get(msg.ref);
              if (cb) cb(msg.state);
            }
          } catch {
            // Ignore malformed or unrecognised messages.
          }
        };

        // onclose fires for both intentional closes and connection errors.
        ws.onclose = () => {
          wsRef.current = null;
          if (!mountedRef.current) return;
          if (retryCountRef.current < MAX_RETRIES) {
            const backoff = Math.min(
              BASE_BACKOFF_MS * 2 ** retryCountRef.current,
              MAX_BACKOFF_MS,
            );
            retryCountRef.current += 1;
            retryTimeoutRef.current = setTimeout(connect, backoff);
          }
        };

        // onerror fires before onclose — let onclose handle reconnect.
        ws.onerror = () => { };
      } catch {
        // WebSocket constructor itself can throw if the URL is invalid.
        // Degrade gracefully.
      }
    }

    connect();

    // Reconnect when the app comes back to the foreground.
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        nextState === 'active' &&
        (!wsRef.current || wsRef.current.readyState > WebSocket.OPEN)
      ) {
        retryCountRef.current = 0;
        connect();
      }
    });

    return () => {
      appStateSub.remove();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect loop on intentional close.
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, qc]);
}
