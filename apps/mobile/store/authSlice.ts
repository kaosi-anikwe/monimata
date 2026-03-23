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
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import api, { saveTokens, clearTokens } from '@/services/api';

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
    loading: boolean;
    error: string | null;
}

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
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
        try {
            const { data } = await api.post('/auth/register', payload);
            await saveTokens(data.access_token, data.refresh_token);
            const meRes = await api.get('/auth/me');
            return meRes.data as AuthUser;
        } catch (err: unknown) {
            if (isAxiosError(err)) {
                console.log('API error details:', err.response);
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
            return meRes.data as AuthUser;
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
        await clearTokens();
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
        const setError = (state: AuthState, action: PayloadAction<any>) => {
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
            .addCase(restoreSession.fulfilled, setUser)
            .addCase(restoreSession.rejected, (state) => { state.loading = false; })
            .addCase(verifyBVN.pending, setLoading)
            .addCase(verifyBVN.fulfilled, (state) => {
                state.loading = false;
                if (state.user) state.user.identity_verified = true;
            })
            .addCase(verifyBVN.rejected, setError);
    },
});

export const { clearAuth, clearError } = authSlice.actions;
export default authSlice.reducer;
