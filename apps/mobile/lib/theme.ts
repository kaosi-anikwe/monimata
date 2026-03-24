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
 * lib/theme.ts
 *
 * Semantic colour token system for MoniMata.
 *
 * --- USAGE ---
 * Inside any component:
 *
 *   import { useTheme } from '@/lib/theme';
 *
 *   function MyScreen() {
 *     const colors = useTheme();
 *     return (
 *       <View style={{ backgroundColor: colors.background }}>
 *         <Text style={{ color: colors.textPrimary }}>Hello</Text>
 *       </View>
 *     );
 *   }
 *
 * For StyleSheet.create() with dynamic colours, build styles inside the
 * component (after `useTheme()`) rather than at module level:
 *
 *   function MyScreen() {
 *     const colors = useTheme();
 *     const styles = makeStyles(colors);
 *     ...
 *   }
 *   function makeStyles(c: ThemeColors) {
 *     return StyleSheet.create({ container: { backgroundColor: c.surface } });
 *   }
 *
 * --- OVERRIDING THE SYSTEM PREFERENCE ---
 * The user's manual override (stored in Settings) can be wired in by passing
 * a forced scheme to getTheme() directly:
 *   const colors = getTheme(userPreference ?? systemScheme);
 *
 * --- BRAND IDENTITY ---
 * Current placeholder palette from PRD (designers may change all of this):
 *   Brand green:      #0F7B3F
 *   Positive:         #10B981
 *   Error/overspent:  #EF4444
 *   Warning:          #F59E0B
 *   Background light: #F9FAFB
 */

import { useColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  // ── Brand ────────────────────────────────────────────────────────────────
  /** Primary brand accent — use for CTAs, icons, active states. */
  brand: string;
  /** Tinted background for brand-coloured surfaces (chips, banners). */
  brandSubtle: string;

  // ── Status ───────────────────────────────────────────────────────────────
  /** Positive balance / money received / success actions. */
  success: string;
  /** Overspent category / error / destructive actions. */
  error: string;
  /** Underfunded category / warning state. */
  warning: string;
  /** Success tinted background. */
  successSubtle: string;
  /** Error tinted background. */
  errorSubtle: string;
  /** Warning tinted background. */
  warningSubtle: string;

  // ── Surfaces ─────────────────────────────────────────────────────────────
  /** App background (behind all screens). */
  background: string;
  /** Card / modal / sheet surface (sits on background). */
  surface: string;
  /** Elevated surface — e.g. input fields, selected rows. */
  surfaceElevated: string;

  // ── Borders ──────────────────────────────────────────────────────────────
  /** Strong border — form inputs, card outlines. */
  border: string;
  /** Hairline separator — between list rows. */
  separator: string;

  // ── Text ─────────────────────────────────────────────────────────────────
  /** Headings, primary body copy. */
  textPrimary: string;
  /** Secondary labels, meta information. */
  textSecondary: string;
  /** Placeholder text, disabled states, captions. */
  textTertiary: string;
  /** Text on coloured backgrounds (buttons, badges). */
  textInverse: string;
}

// ─── Light theme ─────────────────────────────────────────────────────────────

export const lightColors: ThemeColors = {
  brand: '#0F7B3F',
  brandSubtle: '#ECFDF5',

  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  successSubtle: '#ECFDF5',
  errorSubtle: '#FEF2F2',
  warningSubtle: '#FFFBEB',

  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  border: '#E5E7EB',
  separator: '#F3F4F6',

  textPrimary: '#111827',
  textSecondary: '#374151',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',
};

// ─── Dark theme ──────────────────────────────────────────────────────────────

export const darkColors: ThemeColors = {
  brand: '#34D399',
  brandSubtle: '#064E3B',

  success: '#34D399',
  error: '#F87171',
  warning: '#FBBF24',
  successSubtle: '#064E3B',
  errorSubtle: '#450A0A',
  warningSubtle: '#451A03',

  background: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',

  border: '#334155',
  separator: '#1E293B',

  textPrimary: '#F9FAFB',
  textSecondary: '#E5E7EB',
  textTertiary: '#6B7280',
  textInverse: '#111827',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the token map for a given colour scheme.
 * Useful when you need the tokens outside of React (e.g. navigation theme config).
 */
export function getTheme(scheme: string | null | undefined): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

/**
 * React hook — returns the correct token map based on the device's OS setting.
 * Re-renders automatically when the user changes their device appearance.
 */
export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  return getTheme(scheme);
}
