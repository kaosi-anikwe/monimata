/**
 * Default MSW request handlers.
 *
 * Override per-test with server.use(...) for error cases or specific payloads.
 * Import `server` from __tests__/mocks/server.ts in your test file.
 */
import { http, HttpResponse } from 'msw';

const BASE = process.env.EXPO_PUBLIC_API_URL!;

export const handlers = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  http.get(`${BASE}/auth/me`, () =>
    HttpResponse.json({
      id: 'user-1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      onboarded: true,
    }),
  ),
  http.post(`${BASE}/auth/login`, () =>
    HttpResponse.json({ access_token: 'test-access', refresh_token: 'test-refresh' }),
  ),
  http.post(`${BASE}/auth/register`, () =>
    HttpResponse.json({ access_token: 'test-access', refresh_token: 'test-refresh' }, { status: 201 }),
  ),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({ access_token: 'new-access', refresh_token: 'new-refresh' }),
  ),
  http.get(`${BASE}/auth/check-username`, () => HttpResponse.json({ available: true })),

  // ── Accounts ──────────────────────────────────────────────────────────────
  http.get(`${BASE}/accounts`, () => HttpResponse.json([])),
  http.post(`${BASE}/accounts/manual`, () =>
    HttpResponse.json({ id: 'acc-1', alias: 'Test Account' }, { status: 201 }),
  ),
];
