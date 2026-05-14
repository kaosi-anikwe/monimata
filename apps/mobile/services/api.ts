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
 * Type-safe HTTP client built on openapi-fetch + the generated OpenAPI spec.
 *
 * The client attaches a Bearer token to every request via a custom fetch
 * wrapper.  On a 401 the wrapper attempts a silent token refresh (with
 * request queueing so concurrent calls are not lost) then retries.  On
 * refresh failure it wipes stored tokens and invokes the logout handler
 * registered by app/_layout.tsx.
 *
 * Exports:
 *   default / client  – openapi-fetch typed client  (mutations, one-off calls)
 *   $api              – openapi-react-query wrapper  (use inside components)
 *   token helpers     – getAccessToken, saveTokens, clearTokens, …
 *   setLogoutHandler  – breaks the circular dep with the Redux store
 */
import * as SecureStore from 'expo-secure-store';
import createClient from 'openapi-fetch';
import createQueryClient from 'openapi-react-query';

import type { paths } from '@monimata/shared-types';

// ── Logout callback ───────────────────────────────────────────────────────────
// Registered by app/_layout.tsx after the Redux store is initialised.
// Avoids the circular dependency:  api → store/index → authSlice → api
let _onLogout: (() => void) | null = null;
export function setLogoutHandler(handler: () => void): void {
    _onLogout = handler;
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
if (!BASE_URL) {
    throw new Error(
        '[MoniMata] EXPO_PUBLIC_API_URL is not set. ' +
        'Create apps/mobile/.env with EXPO_PUBLIC_API_URL=https://api.moni-mata.ng'
    );
}

// ── SecureStore keys ──────────────────────────────────────────────────────────
const SECURE_KEYS = {
    ACCESS_TOKEN: 'mm_access_token',
    REFRESH_TOKEN: 'mm_refresh_token',
    /** Tracks which user ID is currently stored in the local WatermelonDB. */
    LAST_USER_ID: 'mm_last_uid',
} as const;

// ── In-memory token cache ─────────────────────────────────────────────────────
// undefined = not yet loaded from SecureStore
// null      = loaded and confirmed absent
// string    = loaded, valid token
let _cachedAccessToken: string | null | undefined = undefined;

export async function getAccessToken(): Promise<string | null> {
    if (_cachedAccessToken !== undefined) return _cachedAccessToken;
    _cachedAccessToken = await SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
    return _cachedAccessToken;
}

/** Alias used by the WatermelonDB sync service */
export const getAuthToken = getAccessToken;

export async function getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
    _cachedAccessToken = access; // update memory cache immediately
    await Promise.all([
        SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, access),
        SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refresh),
    ]);
}

export async function clearTokens(): Promise<void> {
    _cachedAccessToken = null; // clear memory cache immediately
    await Promise.all([
        SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN),
        SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN),
    ]);
}

/** Persists the ID of the user whose data currently lives in WatermelonDB. */
export async function saveLastUserId(id: string): Promise<void> {
    await SecureStore.setItemAsync(SECURE_KEYS.LAST_USER_ID, id);
}

/** Returns the stored user ID, or null if not yet set. */
export async function getLastUserId(): Promise<string | null> {
    return SecureStore.getItemAsync(SECURE_KEYS.LAST_USER_ID);
}

/** Removes the stored user ID — called on logout. */
export async function clearLastUserId(): Promise<void> {
    await SecureStore.deleteItemAsync(SECURE_KEYS.LAST_USER_ID);
}

// ── 401 refresh queue ─────────────────────────────────────────────────────────
let isRefreshing = false;
let failedQueue: { resolve: (token: string) => void; reject: (e: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null) {
    failedQueue.forEach((p) => {
        if (token) p.resolve(token);
        else p.reject(error);
    });
    failedQueue = [];
}

// ── Custom fetch: auth header + silent 401 refresh ────────────────────────────
// We normalise the input to (url string, init) immediately so that retrying
// after a token refresh never reads an already-consumed Request body stream.
//
// openapi-fetch constructs a Request object and calls fetch(request, undefined).
// We must extract method/body/headers from it — otherwise origInit is {} and
// every call silently falls back to GET (the fetch default).
async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string;
    let origInit: RequestInit;

    if (input instanceof Request) {
        url = input.url;
        // Read body as text now so it can be replayed on retry without re-reading
        // a consumed ReadableStream.  We call text() unconditionally — React Native's
        // fetch polyfill stores the body internally but sets request.body = null, so
        // a truthiness check on .body always skips the read and sends an empty body.
        const bodyText = await input.text();
        origInit = {
            method: input.method,
            headers: new Headers(input.headers),
            body: bodyText || undefined,
            credentials: input.credentials,
            cache: input.cache,
            redirect: input.redirect,
            mode: input.mode,
            ...(init ?? {}),
        };
    } else {
        url = String(input);
        origInit = init ?? {};
    }

    const headers = new Headers(origInit.headers);
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url, { ...origInit, headers });
    if (response.status !== 401) return response;

    // 401 — attempt silent refresh ────────────────────────────────────────────
    if (isRefreshing) {
        // Queue this call; it will be retried once the in-flight refresh settles.
        return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
        }).then((newToken) => {
            const retryHeaders = new Headers(origInit.headers);
            retryHeaders.set('Authorization', `Bearer ${newToken}`);
            return fetch(url, { ...origInit, headers: retryHeaders });
        });
    }

    isRefreshing = true;
    try {
        const storedRefresh = await getRefreshToken();
        if (!storedRefresh) throw new Error('No refresh token stored');

        const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: storedRefresh }),
        });
        if (!refreshRes.ok) throw new Error('Token refresh failed');

        const tokens: { access_token: string; refresh_token: string } = await refreshRes.json();
        _cachedAccessToken = tokens.access_token;
        await SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, tokens.access_token);
        await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
        processQueue(null, tokens.access_token);

        const retryHeaders = new Headers(origInit.headers);
        retryHeaders.set('Authorization', `Bearer ${tokens.access_token}`);
        return fetch(url, { ...origInit, headers: retryHeaders });
    } catch (err) {
        processQueue(err, null);
        await clearTokens();
        _onLogout?.();
        return response; // return the original 401 so callers see the failure
    } finally {
        isRefreshing = false;
    }
}

// ── Typed clients ─────────────────────────────────────────────────────────────
const client = createClient<paths>({ baseUrl: BASE_URL, fetch: authFetch });

/**
 * openapi-react-query wrapper — use $api.useQuery / $api.useMutation inside
 * React components for fully typed TanStack Query hooks without writing
 * queryFn boilerplate.
 *
 * @example
 *   const { data } = $api.useQuery('get', '/accounts');
 *   const mutation = $api.useMutation('post', '/accounts/manual');
 */
export const $api = createQueryClient(client);

export default client;

