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

import { configureStore } from '@reduxjs/toolkit';
import type { AuthState } from './authSlice';
import authReducer from './authSlice';
import type { BudgetState } from './budgetSlice';
import budgetReducer from './budgetSlice';
import type { PreferencesState } from './preferencesSlice';
import preferencesReducer from './preferencesSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        budget: budgetReducer,
        preferences: preferencesReducer,
    },
});

export interface RootState {
    auth: AuthState;
    budget: BudgetState;
    preferences: PreferencesState;
}
export type AppDispatch = typeof store.dispatch;
