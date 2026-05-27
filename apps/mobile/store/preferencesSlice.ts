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
 * Preferences slice — client-side UI preferences persisted via SecureStore.
 *
 * Contains:
 *   - amountsHidden: privacy mode toggle (masks all monetary amounts)
 *   - reportExcludedAccountIds: accounts excluded from report queries
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import * as SecureStore from 'expo-secure-store';

// ── SecureStore keys ─────────────────────────────────────────────────────────

const STORE_KEY_AMOUNTS_HIDDEN = 'pref.amounts_hidden';
const STORE_KEY_REPORT_EXCLUDED = 'pref.report_excluded_accounts';

// ── State ────────────────────────────────────────────────────────────────────

export interface PreferencesState {
    amountsHidden: boolean;
    reportExcludedAccountIds: string[];
}

const initialState: PreferencesState = {
    amountsHidden: false,
    reportExcludedAccountIds: [],
};

// ── Slice ────────────────────────────────────────────────────────────────────

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        toggleAmountsHidden(state) {
            state.amountsHidden = !state.amountsHidden;
            SecureStore.setItemAsync(STORE_KEY_AMOUNTS_HIDDEN, state.amountsHidden ? '1' : '0').catch(console.warn);
        },
        setAmountsHidden(state, action: PayloadAction<boolean>) {
            state.amountsHidden = action.payload;
        },
        setReportExcludedAccountIds(state, action: PayloadAction<string[]>) {
            state.reportExcludedAccountIds = action.payload;
            SecureStore.setItemAsync(STORE_KEY_REPORT_EXCLUDED, JSON.stringify(action.payload)).catch(console.warn);
        },
        toggleReportAccountExclusion(state, action: PayloadAction<string>) {
            const id = action.payload;
            const idx = state.reportExcludedAccountIds.indexOf(id);
            if (idx >= 0) {
                state.reportExcludedAccountIds.splice(idx, 1);
            } else {
                state.reportExcludedAccountIds.push(id);
            }
            SecureStore.setItemAsync(
                STORE_KEY_REPORT_EXCLUDED,
                JSON.stringify(state.reportExcludedAccountIds),
            ).catch(console.warn);
        },
    },
});

export const {
    toggleAmountsHidden,
    setAmountsHidden,
    setReportExcludedAccountIds,
    toggleReportAccountExclusion,
} = preferencesSlice.actions;
export default preferencesSlice.reducer;

// ── Hydration — call once at app startup ─────────────────────────────────────

export async function hydratePreferences(
    dispatch: (action: ReturnType<typeof setAmountsHidden> | ReturnType<typeof setReportExcludedAccountIds>) => void,
) {
    const [hiddenRaw, excludedRaw] = await Promise.all([
        SecureStore.getItemAsync(STORE_KEY_AMOUNTS_HIDDEN),
        SecureStore.getItemAsync(STORE_KEY_REPORT_EXCLUDED),
    ]);
    if (hiddenRaw !== null) {
        dispatch(setAmountsHidden(hiddenRaw === '1'));
    }
    if (excludedRaw !== null) {
        try {
            const parsed = JSON.parse(excludedRaw);
            if (Array.isArray(parsed)) dispatch(setReportExcludedAccountIds(parsed));
        } catch { /* corrupt data — ignore, keep default */ }
    }
}
