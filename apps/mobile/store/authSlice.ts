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
 * Auth Redux slice — holds minimal auth UI state.
 * Tokens themselves live in SecureStore (never in Redux).
 */
import { clearDatabase } from '@/database';
import client, { clearLastUserId, clearTokens, getLastUserId, saveLastUserId, saveTokens } from '@/services/api';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    onboarded: boolean;
}

export interface AuthState {
    user: AuthUser | null;
    isAuthenticated: boolean;
    /** True once the initial restoreSession check has settled (success or failure). */
    isInitialised: boolean;
    loading: boolean;
    error: string | null;
}

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    isInitialised: false,
    loading: false,
    error: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts a human-readable message from a FastAPI error body.
 *
 * FastAPI returns two shapes:
 *   - 4xx (non-validation):  { detail: string }
 *   - 422 (validation):      { detail: [{loc, msg, type}, …] }
 *
 * Joining the `msg` fields of the validation array gives a usable message.
 */
function extractDetail(err: unknown, fallback: string | null): string | null {
    const detail = (err as { detail?: unknown } | null)?.detail;
    if (!detail) return fallback;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        const msgs = detail
            .map((d: unknown) => (d as { msg?: string }).msg)
            .filter(Boolean)
            .join(', ');
        return msgs || fallback;
    }
    return fallback;
}

// ── Async thunks ──────────────────────────────────────────────────────────────

export const register = createAsyncThunk(
    'auth/register',
    async (
        payload: { email: string; password: string; username: string; first_name?: string; last_name?: string; phone?: string },
        { rejectWithValue },
    ) => {
        // ── Step 1: attempt registration ──────────────────────────────────
        // Capture any error rather than re-throwing immediately, because some
        // backends create the user in the DB but then fail to build the token
        // response (500) or simply don't include tokens in a 201.  In both
        // cases we can recover by falling through to the login step below.
        let registrationError: unknown = null;
        let accessToken: string | null = null;
        let refreshToken: string | null = null;

        try {
            const { data: regData, error: regError, response: regResponse } =
                await client.POST('/auth/register', { body: payload });
            if (regError) {
                if (regResponse.status < 500) {
                    console.log('[register] 4xx error:', regResponse.status, regError);
                    return rejectWithValue(extractDetail(regError, 'Registration failed'));
                }
                // 5xx — user may have been created; fall through to login.
                console.log('[register] server error — will attempt login fallback:', regError);
                registrationError = regError;
            } else {
                accessToken = regData?.access_token ?? null;
                refreshToken = regData?.refresh_token ?? null;
            }
        } catch (err) {
            // Network error — fall through to login fallback.
            console.log('[register] network error — will attempt login fallback:', err);
            registrationError = err;
        }

        // ── Step 2: obtain tokens via login if not already obtained ───────
        // Covers two cases:
        //   A) Register 5xx after DB insert (registrationError set above)
        //   B) Register 2xx but tokens not included in the response body
        if (!accessToken || !refreshToken) {
            try {
                const { data: loginData, error: loginError } = await client.POST('/auth/login', {
                    body: { email: payload.email, password: payload.password },
                });
                if (loginError) {
                    console.log('[register] login fallback also failed:', loginError);
                    return rejectWithValue(
                        extractDetail(registrationError, null) ??
                        extractDetail(loginError, null) ??
                        'Registration failed',
                    );
                }
                accessToken = loginData?.access_token ?? null;
                refreshToken = loginData?.refresh_token ?? null;
            } catch {
                return rejectWithValue('Registration failed');
            }
        }

        // ── Step 3: save tokens and load the user profile ─────────────────
        try {
            if (!accessToken) {
                return rejectWithValue('Registration failed — no authentication token received');
            }
            // refreshToken may legitimately be absent (stateless / cookie-based
            // refresh backends). saveTokens accepts null for refresh.
            await saveTokens(accessToken, refreshToken ?? '');
            const { data: me, error: meError } = await client.GET('/auth/me', {});
            if (meError || !me) return rejectWithValue('Registration failed');
            await clearDatabase();
            await saveLastUserId(me.id);
            return me as AuthUser;
        } catch (err: unknown) {
            console.log('[register] post-auth step failed:', err);
            return rejectWithValue('Registration failed');
        }
    },
);

export const login = createAsyncThunk(
    'auth/login',
    async (payload: { email: string; password: string }, { rejectWithValue }) => {
        try {
            const { data, error } = await client.POST('/auth/login', { body: payload });
            if (error) return rejectWithValue(extractDetail(error, 'Login failed'));
            if (!data) return rejectWithValue('Login failed');
            await saveTokens(data.access_token, data.refresh_token);
            const { data: me, error: meError } = await client.GET('/auth/me', {});
            if (meError || !me) return rejectWithValue('Login failed');
            const user = me as AuthUser;
            // Wipe local DB when a different account uses this device.
            const lastId = await getLastUserId();
            if (lastId !== null && lastId !== user.id) {
                await clearDatabase();
            }
            await saveLastUserId(user.id);
            return user;
        } catch {
            return rejectWithValue('Login failed');
        }
    },
);

export const logout = createAsyncThunk('auth/logout', async (_, { dispatch }) => {
    try {
        await client.POST('/auth/logout', {});
    } finally {
        // Wipe local DB on logout so the next user (or same user re-logging in
        // after a longer gap) starts with a clean, server-authoritative state.
        await clearDatabase();
        await clearTokens();
        await clearLastUserId();
        dispatch(authSlice.actions.clearAuth());
    }
});

export const restoreSession = createAsyncThunk('auth/restoreSession', async (_, { rejectWithValue }) => {
    try {
        const { data, error } = await client.GET('/auth/me', {});
        if (error || !data) return rejectWithValue('No active session');
        return data as AuthUser;
    } catch {
        return rejectWithValue('No active session');
    }
});

export const markOnboardedThunk = createAsyncThunk(
    'auth/markOnboarded',
    async (_, { rejectWithValue }) => {
        try {
            const { data, error } = await client.PATCH('/auth/me', { body: { onboarded: true } });
            if (error) return rejectWithValue(extractDetail(error, 'Failed to update onboarding status'));
            if (!data) return rejectWithValue('Failed to update onboarding status');
            return data as AuthUser;
        } catch {
            return rejectWithValue('Failed to update onboarding status');
        }
    },
);

// ── Slice ─────────────────────────────────────────────────────────────────────

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        clearAuth(state) {
            state.user = null;
            state.isAuthenticated = false;
            state.error = null;
        },
        clearError(state) {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        const setLoading = (state: AuthState) => { state.loading = true; state.error = null; };
        const setUser = (state: AuthState, action: PayloadAction<AuthUser>) => {
            state.loading = false;
            state.user = action.payload;
            state.isAuthenticated = true;
        };
        const setError = (state: AuthState, action: PayloadAction<unknown>) => {
            state.loading = false;
            state.error = String(action.payload);
        };

        builder
            .addCase(register.pending, setLoading)
            .addCase(register.fulfilled, setUser)
            .addCase(register.rejected, setError)
            .addCase(login.pending, setLoading)
            .addCase(login.fulfilled, setUser)
            .addCase(login.rejected, setError)
            .addCase(restoreSession.pending, setLoading)
            .addCase(restoreSession.fulfilled, (state, action) => {
                state.loading = false;
                state.isInitialised = true;
                state.user = action.payload;
                state.isAuthenticated = true;
            })
            .addCase(restoreSession.rejected, (state) => {
                state.loading = false;
                state.isInitialised = true; // session check done — show auth screen
            })
            .addCase(markOnboardedThunk.pending, setLoading)
            .addCase(markOnboardedThunk.fulfilled, setUser)
            .addCase(markOnboardedThunk.rejected, setError);
    },
});

export const { clearAuth, clearError } = authSlice.actions;
export const markOnboarded = markOnboardedThunk;
export default authSlice.reducer;
