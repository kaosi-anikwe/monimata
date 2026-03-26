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
import { isAxiosError } from 'axios';

import { clearDatabase } from '@/database';
import api, { clearLastUserId, clearTokens, getLastUserId, saveLastUserId, saveTokens } from '@/services/api';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    identity_verified: boolean;
    onboarded: boolean;
}

interface AuthState {
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

// ── Async thunks ──────────────────────────────────────────────────────────────

export const register = createAsyncThunk(
    'auth/register',
    async (
        payload: { email: string; password: string; first_name?: string; last_name?: string; phone?: string },
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
            const { data } = await api.post('/auth/register', payload);
            accessToken = data.access_token ?? null;
            refreshToken = data.refresh_token ?? null;
        } catch (err: unknown) {
            // If this is a "real" client error (4xx), surface it immediately —
            // no point trying to login, the account was not created.
            if (isAxiosError(err) && err.response && err.response.status < 500) {
                console.log('[register] 4xx error:', err.response.status, err.response.data);
                return rejectWithValue(err.response.data?.detail ?? 'Registration failed');
            }
            // 5xx / network error: the user record may have been created. Fall
            // through and try logging in before giving up.
            console.log('[register] server error or no response — will attempt login fallback:', err);
            registrationError = err;
        }

        // ── Step 2: obtain tokens via login if not already obtained ───────
        // Covers two cases:
        //   A) Register 5xx after DB insert (registrationError set above)
        //   B) Register 2xx but tokens not included in the response body
        if (!accessToken || !refreshToken) {
            try {
                const { data: loginData } = await api.post('/auth/login', {
                    email: payload.email,
                    password: payload.password,
                });
                accessToken = loginData.access_token ?? null;
                refreshToken = loginData.refresh_token ?? null;
            } catch (loginErr: unknown) {
                // Login also failed — surface the original registration error
                // if it was informative, otherwise the login error.
                const surfaced = registrationError ?? loginErr;
                if (isAxiosError(surfaced)) {
                    console.log('[register] login fallback also failed:', surfaced.response?.status, surfaced.response?.data);
                    return rejectWithValue(surfaced.response?.data?.detail ?? 'Registration failed');
                }
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
            const meRes = await api.get('/auth/me');
            const user = meRes.data as AuthUser;
            await clearDatabase();
            await saveLastUserId(user.id);
            return user;
        } catch (err: unknown) {
            console.log('[register] post-auth step failed:', err);
            if (isAxiosError(err)) {
                return rejectWithValue(err.response?.data?.detail ?? 'Registration failed');
            }
            return rejectWithValue('Registration failed');
        }
    },
);

export const login = createAsyncThunk(
    'auth/login',
    async (payload: { email: string; password: string }, { rejectWithValue }) => {
        try {
            const { data } = await api.post('/auth/login', payload);
            await saveTokens(data.access_token, data.refresh_token);
            const meRes = await api.get('/auth/me');
            const user = meRes.data as AuthUser;
            // Wipe local DB when a different account uses this device.
            // WatermelonDB is a local cache — data re-syncs on first pull, so
            // clearing it is always safe and prevents cross-account data leaks.
            const lastId = await getLastUserId();
            if (lastId !== null && lastId !== user.id) {
                await clearDatabase();
            }
            await saveLastUserId(user.id);
            return user;
        } catch (err: unknown) {
            if (isAxiosError(err)) {
                return rejectWithValue(err.response?.data?.detail ?? 'Login failed');
            }
            return rejectWithValue('Login failed');
        }
    },
);

export const logout = createAsyncThunk('auth/logout', async (_, { dispatch }) => {
    try {
        await api.post('/auth/logout');
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
        const { data } = await api.get('/auth/me');
        return data as AuthUser;
    } catch {
        return rejectWithValue('No active session');
    }
});

export const markOnboardedThunk = createAsyncThunk(
    'auth/markOnboarded',
    async (_, { rejectWithValue }) => {
        try {
            const { data } = await api.patch('/auth/me', { onboarded: true });
            return data as AuthUser;
        } catch (err: unknown) {
            if (isAxiosError(err)) {
                return rejectWithValue(err.response?.data?.detail ?? 'Failed to update onboarding status');
            }
            return rejectWithValue('Failed to update onboarding status');
        }
    },
);

export const verifyBVN = createAsyncThunk(
    'auth/verifyBVN',
    async (bvn: string, { rejectWithValue }) => {
        try {
            const { data } = await api.post('/auth/verify-bvn', { bvn });
            return data;
        } catch (err: unknown) {
            if (isAxiosError(err)) {
                return rejectWithValue(err.response?.data?.detail ?? 'BVN verification failed');
            }
            return rejectWithValue('BVN verification failed');
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
            .addCase(verifyBVN.pending, setLoading)
            .addCase(verifyBVN.fulfilled, (state) => {
                state.loading = false;
                if (state.user) state.user.identity_verified = true;
            })
            .addCase(verifyBVN.rejected, setError)
            .addCase(markOnboardedThunk.pending, setLoading)
            .addCase(markOnboardedThunk.fulfilled, setUser)
            .addCase(markOnboardedThunk.rejected, setError);
    },
});

export const { clearAuth, clearError } = authSlice.actions;
export const markOnboarded = markOnboardedThunk;
export default authSlice.reducer;
