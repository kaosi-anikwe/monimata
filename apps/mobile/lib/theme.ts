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
 *   --gd   → darkGreen       #0D1F0D
 *   --gm   → darkGreenMid    #1A3A1A
 *   --gp   → brand           #2D6A2D
 *   --gb   → brandBright     #4CAF50
 *   --lime → lime            #A8E063
 *   --ow   → background      #F5F9F0
 *   --s1   → surface         #EEF9E4
 *   --s2   → surfaceElevated #E0F2D0
 *   --s3   → surfaceHigh     #CAE8B4
 *   --tp   → textPrimary     #0D1F0D
 *   --ts   → textSecondary   #3D5C3D
 *   --tm   → textMeta        #7A9A7A
 *   --tl   → textTertiary    #B0C8B0
 *   --bd   → border          rgba(45,106,45,0.12)
 *   --bds  → borderStrong    rgba(45,106,45,0.25)
 */

import { useColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  // ── Brand greens ─────────────────────────────────────────────────────────
  /** Deep forest green — dark headers, gradient backgrounds. CSS: --gd */
  darkGreen: string;
  /** Mid dark green — secondary dark surface. CSS: --gm */
  darkGreenMid: string;
  /** Primary brand green — CTAs, active icons, links. CSS: --gp */
  brand: string;
  /** Bright indicator green — funding dots, progress fills. CSS: --gb */
  brandBright: string;
  /** Lime accent — primary CTA buttons, active tab indicator. CSS: --lime */
  lime: string;
  /** Lighter lime — hover/pressed lime states. CSS: --lime2 */
  lime2: string;
  /** Subtlest lime tint — backgrounds behind lime elements. CSS: --lime3 */
  lime3: string;

  // ── Surfaces ─────────────────────────────────────────────────────────────
  /** App background — off-white green tint. CSS: --ow */
  background: string;
  /** Card / row / chip surface. CSS: --s1 */
  surface: string;
  /** Progress bar track, selected states. CSS: --s2 */
  surfaceElevated: string;
  /** Higher-contrast surface — group headers. CSS: --s3 */
  surfaceHigh: string;
  /** Pure white — modal/sheet backgrounds, button text on dark. */
  white: string;

  // ── Borders ──────────────────────────────────────────────────────────────
  /** Standard card and input border. CSS: --bd */
  border: string;
  /** Focused input / strong divider border. CSS: --bds */
  borderStrong: string;
  /** Hairline row separator (slightly lighter than border). */
  separator: string;

  // ── Text ─────────────────────────────────────────────────────────────────
  /** Headings, primary body copy. CSS: --tp */
  textPrimary: string;
  /** Sub-labels, secondary copy. CSS: --ts */
  textSecondary: string;
  /** Meta info, captions, timestamps. CSS: --tm */
  textMeta: string;
  /** Placeholder text, disabled states. CSS: --tl */
  textTertiary: string;
  /** Text on dark/coloured backgrounds (buttons, dark headers). */
  textInverse: string;

  // ── Status — error ───────────────────────────────────────────────────────
  /** Overspent category / destructive actions. CSS: --red */
  error: string;
  /** Error tinted background. CSS: --redl */
  errorSubtle: string;

  // ── Status — warning ─────────────────────────────────────────────────────
  /** Underfunded category / caution. CSS: --amber */
  warning: string;
  /** Warning tinted background. CSS: --ambl */
  warningSubtle: string;

  // ── Status — success ─────────────────────────────────────────────────────
  /** Positive balance / received money / success actions. */
  success: string;
  /** Success tinted background. */
  successSubtle: string;

  // ── Accent — info / blue ─────────────────────────────────────────────────
  /** Info colour — links, info badges. CSS: --blue */
  info: string;
  /** Info tinted background. CSS: --bluel */
  infoSubtle: string;

  // ── Accent — purple ───────────────────────────────────────────────────────
  /** Gamification / rewards accent. CSS: --purple */
  purple: string;
  /** Purple tinted background. CSS: --purpl */
  purpleSubtle: string;

  // ── Accent — teal ─────────────────────────────────────────────────────────
  /** Knowledge Hub / education accent. CSS: --teal */
  teal: string;
  /** Teal tinted background. CSS: --teall */
  tealSubtle: string;
}

// ─── Light theme ─────────────────────────────────────────────────────────────

export const lightColors: ThemeColors = {
  // Brand greens
  darkGreen: '#0D1F0D',
  darkGreenMid: '#1A3A1A',
  brand: '#2D6A2D',
  brandBright: '#4CAF50',
  lime: '#A8E063',
  lime2: '#C5F07A',
  lime3: '#E0FAB8',

  // Surfaces
  background: '#F5F9F0',
  surface: '#EEF9E4',
  surfaceElevated: '#E0F2D0',
  surfaceHigh: '#CAE8B4',
  white: '#FFFFFF',

  // Borders
  border: 'rgba(45, 106, 45, 0.12)',
  borderStrong: 'rgba(45, 106, 45, 0.25)',
  separator: 'rgba(45, 106, 45, 0.08)',

  // Text
  textPrimary: '#0D1F0D',
  textSecondary: '#3D5C3D',
  textMeta: '#7A9A7A',
  textTertiary: '#B0C8B0',
  textInverse: '#FFFFFF',

  // Error
  error: '#D93025',
  errorSubtle: '#FDECEA',

  // Warning
  warning: '#F59E0B',
  warningSubtle: '#FEF3C7',

  // Success
  success: '#4CAF50',
  successSubtle: '#E8F5E9',

  // Info
  info: '#2563EB',
  infoSubtle: '#EFF6FF',

  // Purple
  purple: '#7C3AED',
  purpleSubtle: '#F5F3FF',

  // Teal
  teal: '#0891B2',
  tealSubtle: '#E0F7FA',
};

// ─── Dark theme ──────────────────────────────────────────────────────────────
// Dark mode inverts the surface hierarchy: the deep greens become backgrounds
// and the lime/light greens become text/accent colours.

export const darkColors: ThemeColors = {
  // Brand greens
  darkGreen: '#0D1F0D',
  darkGreenMid: '#1A3A1A',
  brand: '#A8E063',        // lime becomes the primary accent on dark
  brandBright: '#C5F07A',
  lime: '#A8E063',
  lime2: '#C5F07A',
  lime3: '#E0FAB8',

  // Surfaces (inverted — dark becomes the new background stack)
  background: '#0D1F0D',
  surface: '#1A3A1A',
  surfaceElevated: '#2D6A2D',
  surfaceHigh: '#3A7A3A',
  white: '#FFFFFF',

  // Borders
  border: 'rgba(168, 224, 99, 0.15)',
  borderStrong: 'rgba(168, 224, 99, 0.30)',
  separator: 'rgba(168, 224, 99, 0.08)',

  // Text
  textPrimary: '#F5F9F0',
  textSecondary: '#C5F07A',
  textMeta: '#7A9A7A',
  textTertiary: '#4A6A4A',
  textInverse: '#0D1F0D',

  // Error
  error: '#F87171',
  errorSubtle: '#450A0A',

  // Warning
  warning: '#FBBF24',
  warningSubtle: '#451A03',

  // Success
  success: '#A8E063',
  successSubtle: '#1A3A1A',

  // Info
  info: '#60A5FA',
  infoSubtle: '#1E3A5F',

  // Purple
  purple: '#A78BFA',
  purpleSubtle: '#2E1065',

  // Teal
  teal: '#22D3EE',
  tealSubtle: '#0C2D3A',
};

// ─── Gradient presets ─────────────────────────────────────────────────────────
// Use with expo-linear-gradient: <LinearGradient colors={GRADIENTS.darkHeader} ...>

export const GRADIENTS = {
  /** Deep forest green — used for Home header, dark overlays. */
  darkHeader: ['#060E06', '#0D1A0D', '#081408'] as const,
  /** Dark green card backgrounds (budget header, edit header). */
  darkCard: ['#0D1F0D', '#1A3A1A'] as const,
  /** Brand progress fill — left to right brand→lime. */
  brandProgress: ['#2D6A2D', '#A8E063'] as const,
  /** Lime FAB glow. */
  limeFab: ['#A8E063', '#C5F07A'] as const,
} as const;

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
