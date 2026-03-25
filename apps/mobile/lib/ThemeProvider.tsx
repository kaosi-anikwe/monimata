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
 * ThemeProvider — wraps the app so the user's manual dark/light preference is
 * available everywhere via useTheme() and useThemePreference().
 *
 * The preference is persisted to expo-secure-store and restored on mount.
 * This must sit above any component that calls useTheme().
 *
 * Separated into its own .tsx file because lib/theme.ts is JSX-free .ts.
 */
import * as SecureStore from 'expo-secure-store';
import { type PropsWithChildren, useEffect, useState } from 'react';

import { THEME_STORAGE_KEY, ThemeContext } from '@/lib/theme';

export function ThemeProvider({ children }: PropsWithChildren) {
  const [overrideScheme, setOverrideSchemeState] = useState<'light' | 'dark' | null>(null);

  // Restore persisted preference on mount.
  useEffect(() => {
    SecureStore.getItemAsync(THEME_STORAGE_KEY)
      .then((val) => {
        if (val === 'light' || val === 'dark') setOverrideSchemeState(val);
      })
      .catch(() => {
        // Ignore — fall back to device OS setting.
      });
  }, []);

  function setOverrideScheme(scheme: 'light' | 'dark') {
    setOverrideSchemeState(scheme);
    SecureStore.setItemAsync(THEME_STORAGE_KEY, scheme).catch(console.warn);
  }

  return (
    <ThemeContext.Provider value={{ overrideScheme, setOverrideScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
