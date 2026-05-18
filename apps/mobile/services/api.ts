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

/**
 * Shared token-refresh logic used by both authFetch and the XHR upload helpers.
 *
 * Integrates with the module-level refresh queue so concurrent callers
 * (fetch + XHR) never trigger more than one /auth/refresh round-trip.
 * On failure it clears tokens and invokes the logout handler.
 */
async function doTokenRefresh(): Promise<string> {
    if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
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
        return tokens.access_token;
    } catch (err) {
        processQueue(err, null);
        await clearTokens();
        _onLogout?.();
        throw err;
    } finally {
        isRefreshing = false;
    }
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

    // 401 — attempt silent refresh via shared doTokenRefresh() ────────────────
    try {
        const newToken = await doTokenRefresh();
        const retryHeaders = new Headers(origInit.headers);
        retryHeaders.set('Authorization', `Bearer ${newToken}`);
        return fetch(url, { ...origInit, headers: retryHeaders });
    } catch {
        return response; // return the original 401 so callers see the failure
    }
}

// ── Typed clients ─────────────────────────────────────────────────────────────
export { authFetch };
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

// ── Receipt / Statement upload helpers ────────────────────────────────────────
// Uses XMLHttpRequest rather than fetch so we can track upload progress.
// Both functions handle 401 → token refresh → retry using the shared queue.

export interface UploadReceiptFile {
    uri: string;
    mimeType: string;
    name: string;
}

/**
 * Low-level XHR POST helper.  Returns { status, responseText } so the
 * caller can decide how to handle each status code.
 * Progress fraction (0 → <1) is reported via onProgress; the caller is
 * responsible for emitting the final 1 on success.
 */
function xhrSend(
    url: string,
    formData: FormData,
    token: string | null,
    onProgress: ((fraction: number) => void) | undefined,
    timeout: number,
): Promise<{ status: number; responseText: string }> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e: ProgressEvent) => {
            if (e.lengthComputable) onProgress?.(e.loaded / e.total);
        };
        xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText });
        xhr.onerror = () => reject(new Error('Network error — check your connection.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out.'));
        xhr.timeout = timeout;
        xhr.send(formData);
    });
}

/** Extracts a human-readable message from a FastAPI error body.
 * Non-validation errors:  { detail: string }
 * Validation errors:      { detail: [{msg, …}, …] }
 */
function parseErrorMessage(responseText: string): string {
    try {
        const body = JSON.parse(responseText);
        if (typeof body?.detail === 'string') return body.detail;
        if (Array.isArray(body?.detail)) {
            return (body.detail as { msg: string }[]).map((d) => d.msg).join(', ');
        }
    } catch {
        // not valid JSON — fall through to raw text
    }
    return responseText;
}

/**
 * POST multipart/form-data to /uploads/receipt with real upload-progress events.
 * Automatically refreshes the access token on 401 and retries once.
 *
 * @param file       Local file info ({ uri, mimeType, name }).
 * @param onProgress Callback receiving a fraction 0 → 1 as bytes transmit.
 */
export async function uploadReceipt(
    file: UploadReceiptFile,
    onProgress?: (fraction: number) => void,
): Promise<void> {
    let token = await getAccessToken().catch(() => null);
    const fd = new FormData();
    fd.append('file', { uri: file.uri, type: file.mimeType, name: file.name } as unknown as Blob);

    let { status, responseText } = await xhrSend(`${BASE_URL}/uploads/receipt`, fd, token, onProgress, 60_000);

    if (status === 401) {
        token = await doTokenRefresh(); // throws → clears tokens + logout on failure
        ({ status, responseText } = await xhrSend(`${BASE_URL}/uploads/receipt`, fd, token, onProgress, 60_000));
    }

    if (status === 202 || status === 200) {
        onProgress?.(1);
    } else {
        throw new Error(parseErrorMessage(responseText) || `HTTP ${status}`);
    }
}

/**
 * POST multipart/form-data to /uploads/statement with real upload-progress events.
 * Automatically refreshes the access token on 401 and retries once.
 *
 * The server identifies the bank account from the PDF itself — no account_id needed.
 * Returns immediately (202); transactions are imported asynchronously.
 * Rejects with StatementAccountNotFoundError on 404.
 *
 * @param file       Local file info ({ uri, mimeType, name }). Must be application/pdf.
 * @param onProgress Callback receiving a fraction 0 → 1 as bytes transmit.
 */
export class StatementAccountNotFoundError extends Error {
    constructor() {
        super('Account not found — make sure this bank account is added to MoniMata.');
        this.name = 'StatementAccountNotFoundError';
    }
}

export async function uploadStatement(
    file: UploadReceiptFile,
    onProgress?: (fraction: number) => void,
): Promise<void> {
    let token = await getAccessToken().catch(() => null);
    const fd = new FormData();
    fd.append('file', { uri: file.uri, type: file.mimeType, name: file.name } as unknown as Blob);

    let { status, responseText } = await xhrSend(`${BASE_URL}/uploads/statement`, fd, token, onProgress, 120_000);

    if (status === 401) {
        token = await doTokenRefresh();
        ({ status, responseText } = await xhrSend(`${BASE_URL}/uploads/statement`, fd, token, onProgress, 120_000));
    }

    if (status === 202 || status === 200) {
        onProgress?.(1);
    } else if (status === 404) {
        throw new StatementAccountNotFoundError();
    } else {
        throw new Error(parseErrorMessage(responseText) || `HTTP ${status}`);
    }
}
