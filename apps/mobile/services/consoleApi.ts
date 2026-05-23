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
 * Console API client — typed wrapper for the private identity gateway.
 *
 * Auth types live in @/types/auth (manually defined, never generated) so the
 * console gateway's API surface is never exposed in the public repository.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { authFetch } from '@/services/api';

export type {
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    ForgotPasswordRequest,
    VerifyResetCodeRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
    TokenResponse,
    AccessTokenResponse,
    ResetTokenResponse,
    UserResponse,
} from '@/types/auth';

// ── Console URL ──────────────────────────────────────────────────────────────

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const APP_PLATFORM = Platform.OS as 'android' | 'ios';

export const CONSOLE_URL =
    process.env.EXPO_PUBLIC_CONSOLE_URL || process.env.EXPO_PUBLIC_API_URL;

if (!CONSOLE_URL) {
    throw new Error(
        '[MoniMata] Neither EXPO_PUBLIC_CONSOLE_URL nor EXPO_PUBLIC_API_URL is set.'
    );
}

// ── Helper ───────────────────────────────────────────────────────────────────

interface ApiResponse { status: number; ok: boolean }

type ApiResult<T> =
    | { data: T; error: undefined; response: ApiResponse }
    | { data: undefined; error: unknown; response: ApiResponse };

async function consoleRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
): Promise<ApiResult<T>> {
    const url = new URL(path, CONSOLE_URL);
    if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const headers: Record<string, string> = {
        'X-App-Version': APP_VERSION,
        'X-App-Platform': APP_PLATFORM,
    };
    if (body) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const res = await authFetch(url.toString(), {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        const response: ApiResponse = { status: res.status, ok: res.ok };

        if (!res.ok) {
            const error = await res.json().catch(() => ({ detail: res.statusText }));
            return { data: undefined, error, response };
        }

        if (res.status === 204) {
            return { data: undefined as unknown as T, error: undefined, response };
        }

        const data = await res.json();
        return { data, error: undefined, response };
    } catch (err) {
        return { data: undefined, error: err, response: { status: 0, ok: false } };
    }
}

// ── Typed console API methods ────────────────────────────────────────────────

const consoleClient = {
    POST: <T = unknown>(path: string, opts?: { body?: unknown }) =>
        consoleRequest<T>('POST', path, opts?.body),

    GET: <T = unknown>(path: string, opts?: { params?: { query?: Record<string, string> } }) =>
        consoleRequest<T>('GET', path, undefined, opts?.params?.query),

    PATCH: <T = unknown>(path: string, opts?: { body?: unknown }) =>
        consoleRequest<T>('PATCH', path, opts?.body),
};

export default consoleClient;
