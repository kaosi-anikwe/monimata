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
 * Axios API client with request/response interceptors.
 * - Attaches Bearer token from the auth store.
 * - On 401, attempts a silent token refresh and retries once.
 * - On refresh failure, clears auth and redirects to /login.
 */
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// Callback registered by app/_layout.tsx after both this module and the Redux
// store are initialised. Breaks the circular dependency:
//   api.ts → store/index.ts → authSlice.ts → api.ts
// Instead of importing the store here, the store registers itself after boot.
let _onLogout: (() => void) | null = null;
export function setLogoutHandler(handler: () => void): void {
    _onLogout = handler;
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
if (!BASE_URL) {
    throw new Error(
        '[MoniMata] EXPO_PUBLIC_API_URL is not set. ' +
        'Create apps/mobile/.env with EXPO_PUBLIC_API_URL=https://api.monimata.ng'
    );
}

const SECURE_KEYS = {
    ACCESS_TOKEN: 'mm_access_token',
    REFRESH_TOKEN: 'mm_refresh_token',
} as const;

// In-memory token cache — avoids a Keychain syscall on every API request.
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

let isRefreshing = false;
let failedQueue: { resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null) {
    failedQueue.forEach((prom) => {
        if (token) prom.resolve(token);
        else prom.reject(error);
    });
    failedQueue = [];
}

const api: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const token = await getAccessToken();
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 — silent refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status !== 401 || originalRequest._retry) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return api(originalRequest);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const refreshToken = await getRefreshToken();
            if (!refreshToken) throw new Error('No refresh token');

            const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
                refresh_token: refreshToken,
            });

            const newAccess: string = data.access_token;
            _cachedAccessToken = newAccess; // keep memory cache in sync
            await SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, newAccess);
            processQueue(null, newAccess);
            originalRequest.headers.Authorization = `Bearer ${newAccess}`;
            return api(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);
            await clearTokens();
            _onLogout?.();
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    },
);

export default api;
