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

import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  // ── Brand greens ─────────────────────────────────────────────────────────
  /** Deep forest green — dark headers, gradient backgrounds. CSS: --gd */
  darkGreen: string;
  /** Mid dark green — secondary dark surface. CSS: --gm */
  darkGreenMid: string;
  /** Deep blood red — danger/error card backgrounds (mirrors darkGreen for error states). */
  darkRed: string;
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
  /** Card, sheet, and form-field backgrounds — white in light mode, dark surface in dark mode. */
  cardBg: string;

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
  /** Dark foreground for text/icons rendered on warningSubtle backgrounds. */
  warningText: string;

  // ── Status — success ─────────────────────────────────────────────────────
  /** Positive balance / received money / success actions. */
  success: string;
  /** Success tinted background. */
  successSubtle: string;
  /** Dark foreground for text/icons rendered on successSubtle backgrounds. */
  successText: string;

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

  // ── Semantic border variants ─────────────────────────────────────────────
  /** Brand-green at 20% opacity — badge borders, brand-tinted dividers. */
  borderBrand: string;
  /** Purple at 20% opacity — Manual account badge border. */
  purpleBorder: string;
  /** Amber at 30% opacity — warning card / reauth card borders. */
  warningBorder: string;
  /** successText (#2E7D32) at 25% — success toast border. */
  successBorder: string;
  /** error (#D93025) at 25% — error toast border. */
  errorBorder: string;
  /** info (#2563EB) at 25% — info toast border. */
  infoBorder: string;

  // ── On-dark text hierarchy (elements on darkGreen card backgrounds) ───────
  /** ~40% white — muted labels and icon strokes on darkGreen backgrounds. */
  textInverseFaint: string;
  /** ~50% white — secondary body text on darkGreen backgrounds. */
  textInverseSecondary: string;

  // ── Glow overlays ────────────────────────────────────────────────────────
  /** Lime at 20% opacity — radial glow overlay on darkGreen promo cards. */
  limeGlow: string;

  // ── Ghost elements on dark-green surfaces ────────────────────────────────
  /** 10% white — ghost button background on dark-green headers. */
  overlayGhost: string;
  /** 12% white — ghost button border on dark-green headers. */
  overlayGhostBorder: string;
  /** 70% white — readable but de-emphasised text on dark-green headers. */
  textInverseMid: string;

  // ── Modal / sheet scrim overlays ─────────────────────────────────────────
  /** darkGreen at 50% — confirm dialog backdrop. */
  overlayDark: string;
  /** darkGreen at 40% — action sheet backdrop. */
  overlayDarkMid: string;
  /** darkGreen at 55% — BottomSheet heavy backdrop. */
  overlayDarkHeavy: string;
  /** Pure black at 45% — neutral date-picker / modal scrim (not brand-tinted). */
  overlayNeutral: string;
  /** white at 20% — ghost button / disabled borders on dark surfaces. */
  overlayGhostMid: string;

  // ── Extended lime overlays ────────────────────────────────────────────────
  /** lime at 30% — avatar and component outline borders. */
  limeBorder: string;
  /** lime at 40% — strong lime ring (profile header avatar). */
  limeBorderStrong: string;
  /** lime at 12% — very subtle lime background tint (gamification badges). */
  limeBadgeBg: string;

  // ── Extended inverse text scale ──────────────────────────────────────────
  /** white at 90% — near-opaque text/icons on dark headers and gradients. */
  textInverseHigh: string;
  /** white at 55% — mid-bright narration / caption text on dark headers. */
  textInverseSub: string;
  /** white at 6% — hairline separator on dark surfaces. */
  separatorInverse: string;

  // ── Extended warning ─────────────────────────────────────────────────────
  /** amber at 20% — lighter warning border variant (hint cards, nudge pills). */
  warningBorderLight: string;

  // ── Error badge (on dark-red card surfaces) ───────────────────────────────
  /** error at 18% — badge/button background on darkRed card (Fix button). */
  errorBadgeBg: string;
  /** error at 45% — badge/button border on darkRed card (Fix button). */
  errorBadgeBorder: string;
}

// ─── Light theme ─────────────────────────────────────────────────────────────

export const lightColors: ThemeColors = {
  // Brand greens
  darkGreen: '#0D1F0D',
  darkGreenMid: '#1A3A1A',
  darkRed: '#1F0D0D',
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
  cardBg: '#FFFFFF',

  // Borders
  border: 'rgba(45, 106, 45, 0.12)',
  borderStrong: 'rgba(45, 106, 45, 0.25)',
  separator: 'rgba(45, 106, 45, 0.20)',

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
  warningText: '#B45309',    // Tailwind amber-700 — legible on #FEF3C7

  // Success
  success: '#4CAF50',
  successSubtle: '#E8F5E9',
  successText: '#2E7D32',    // Material dark green — legible on #E8F5E9

  // Info
  info: '#2563EB',
  infoSubtle: '#EFF6FF',

  // Purple
  purple: '#7C3AED',
  purpleSubtle: '#F5F3FF',

  // Teal
  teal: '#0891B2',
  tealSubtle: '#E0F7FA',

  // Semantic borders
  borderBrand: 'rgba(45,106,45,0.2)',
  purpleBorder: 'rgba(124,58,237,0.2)',
  warningBorder: 'rgba(245,158,11,0.3)',
  successBorder: 'rgba(46,125,50,0.25)',
  errorBorder: 'rgba(217,48,37,0.25)',
  infoBorder: 'rgba(37,99,235,0.25)',

  // On-dark text
  textInverseFaint: 'rgba(255,255,255,0.4)',
  textInverseSecondary: 'rgba(255,255,255,0.5)',

  // Glow overlay
  limeGlow: 'rgba(168,224,99,0.2)',

  // Ghost elements on dark-green surfaces
  overlayGhost: 'rgba(255,255,255,0.10)',
  overlayGhostBorder: 'rgba(255,255,255,0.12)',
  textInverseMid: 'rgba(255,255,255,0.70)',

  // Modal / sheet scrim overlays
  overlayDark: 'rgba(13,31,13,0.5)',
  overlayDarkMid: 'rgba(13,31,13,0.4)',
  overlayDarkHeavy: 'rgba(13,31,13,0.55)',
  overlayNeutral: 'rgba(0,0,0,0.45)',
  overlayGhostMid: 'rgba(255,255,255,0.2)',

  // Extended lime overlays
  limeBorder: 'rgba(168,224,99,0.3)',
  limeBorderStrong: 'rgba(168,224,99,0.4)',
  limeBadgeBg: 'rgba(168,224,99,0.12)',

  // Extended inverse text scale
  textInverseHigh: 'rgba(255,255,255,0.9)',
  textInverseSub: 'rgba(255,255,255,0.55)',
  separatorInverse: 'rgba(255,255,255,0.06)',

  // Extended warning
  warningBorderLight: 'rgba(245,158,11,0.2)',

  // Error badge (on darkRed surfaces)
  errorBadgeBg: 'rgba(217,48,37,0.18)',
  errorBadgeBorder: 'rgba(217,48,37,0.45)',
};

// ─── Dark theme ──────────────────────────────────────────────────────────────
// Truly-dark surfaces with a barely-perceptible green undertone. The green
// identity shines through lime/brand accents and tinted borders rather than
// saturated surface colours. Surface hierarchy is tight (4-8 pts of lightness
// per step) so cards "float" without needing heavy shadows.
//
// Contrast targets (on #080C08 background):
//   textPrimary  #E4EDE4  ≈ 14 : 1   (AAA)
//   textSecondary #9BB09B ≈  6.5 : 1  (AA)
//   textMeta     #6B856B  ≈  3.5 : 1  (AA-large / meta)
//   textTertiary #4D654D  ≈  2.2 : 1  (disabled / placeholder)

export const darkColors: ThemeColors = {
  // Brand greens — kept vivid so they pop off the near-black background
  darkGreen: '#0D1F0D',
  darkGreenMid: '#1A3A1A',
  darkRed: '#1A0A0A',
  brand: '#5CB85C',            // slightly desaturated — CTAs, active icons, links
  brandBright: '#78D178',      // brighter indicator green — progress dots, fills
  lime: '#A8E063',             // unchanged — primary CTA, active tab indicator
  lime2: '#C5F07A',
  lime3: '#1A2810',            // dark lime tint — replaces bright light-mode value

  // Surfaces — near-black with faint green cast
  background: '#080C08',       // near-black, barely perceptible green
  surface: '#101610',          // card / row / chip — subtle lift
  surfaceElevated: '#182018',  // progress track, selected chip bg
  surfaceHigh: '#222E22',      // group headers, stronger-contrast surface
  white: '#FFFFFF',
  cardBg: '#121812',           // card / sheet / field — sits between bg and surface

  // Borders — lime-tinted at low opacity; visible on dark without glowing
  border: 'rgba(168, 224, 99, 0.08)',
  borderStrong: 'rgba(168, 224, 99, 0.20)',
  separator: 'rgba(168, 224, 99, 0.10)',

  // Text — cool white-green hierarchy
  textPrimary: '#E4EDE4',      // near-white with green tint — headings, body
  textSecondary: '#9BB09B',    // muted green — sub-labels, secondary copy
  textMeta: '#6B856B',         // medium green — captions, timestamps
  textTertiary: '#4D654D',     // dim green — placeholder, disabled
  textInverse: '#080C08',      // dark text on lime/light buttons

  // Error — softer red for comfortable dark-bg reading
  error: '#EF6B6B',
  errorSubtle: '#1F0D0D',

  // Warning — warm amber
  warning: '#F5B731',
  warningSubtle: '#1F1808',
  warningText: '#F5B731',      // amber on dark — legible on #1F1808

  // Success — distinct from lime/brand
  success: '#5EC464',          // bright green, not lime-yellow
  successSubtle: '#0F2812',    // saturated dark green, distinct from cardBg
  successText: '#7AD680',      // lighter green — legible on #0F2812

  // Info
  info: '#5BAAF8',
  infoSubtle: '#0B1A30',

  // Purple
  purple: '#A78BFA',
  purpleSubtle: '#170E35',

  // Teal
  teal: '#26C6DA',
  tealSubtle: '#061E25',

  // Semantic borders — keyed to dark-mode accent colours
  borderBrand: 'rgba(92,184,92,0.20)',     // brand (#5CB85C) at 20%
  purpleBorder: 'rgba(167,139,250,0.18)',
  warningBorder: 'rgba(245,183,49,0.25)',  // #F5B731 at 25%
  successBorder: 'rgba(94,196,100,0.25)',  // #5EC464 at 25%
  errorBorder: 'rgba(239,107,107,0.25)',   // #EF6B6B at 25%
  infoBorder: 'rgba(91,170,248,0.25)',     // #5BAAF8 at 25%

  // On-dark text (on darkGreen header/gradient surfaces — same logic both modes)
  textInverseFaint: 'rgba(255,255,255,0.35)',
  textInverseSecondary: 'rgba(255,255,255,0.50)',

  // Glow overlay
  limeGlow: 'rgba(168,224,99,0.15)',

  // Ghost elements on dark-green surfaces
  overlayGhost: 'rgba(255,255,255,0.06)',
  overlayGhostBorder: 'rgba(255,255,255,0.10)',
  textInverseMid: 'rgba(255,255,255,0.65)',

  // Modal / sheet scrim overlays — heavy black for true-dark mode
  overlayDark: 'rgba(0,0,0,0.72)',
  overlayDarkMid: 'rgba(0,0,0,0.60)',
  overlayDarkHeavy: 'rgba(0,0,0,0.82)',
  overlayNeutral: 'rgba(0,0,0,0.70)',
  overlayGhostMid: 'rgba(255,255,255,0.15)',

  // Extended lime overlays — slightly toned down so they don't over-glow
  limeBorder: 'rgba(168,224,99,0.22)',
  limeBorderStrong: 'rgba(168,224,99,0.35)',
  limeBadgeBg: 'rgba(168,224,99,0.10)',

  // Extended inverse text scale (on dark-green header surfaces)
  textInverseHigh: 'rgba(255,255,255,0.90)',
  textInverseSub: 'rgba(255,255,255,0.50)',
  separatorInverse: 'rgba(255,255,255,0.05)',

  // Extended warning
  warningBorderLight: 'rgba(245,183,49,0.15)',

  // Error badge (on darkRed surfaces)
  errorBadgeBg: 'rgba(239,107,107,0.15)',
  errorBadgeBorder: 'rgba(239,107,107,0.40)',
};

// ─── Gradient presets ─────────────────────────────────────────────────────────
// Use with expo-linear-gradient: <LinearGradient colors={GRADIENTS.darkHeader} ...>

export const GRADIENTS = {
  /** Deep forest green — used for Home header, dark overlays. */
  darkHeader: ['#060E06', '#0D1A0D', '#081408'] as const,
  /** Dark green card backgrounds (budget header, edit header). */
  darkCard: ['#0D1F0D', '#1A3A1A'] as const,
  /** Dark red — expense/debit transaction hero header. */
  expenseHdr: ['#1F0D0D', '#3A1A1A'] as const,
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

// ─── Theme preference context ─────────────────────────────────────────────────
// Stores the user's manual dark/light override, persisted to SecureStore.
// ThemeProvider (the component) lives in lib/ThemeProvider.tsx (JSX file).
// Set overrideScheme to null to follow the device OS setting.

export const THEME_STORAGE_KEY = 'mm_theme_preference_v1';

export interface ThemeContextValue {
  overrideScheme: 'light' | 'dark' | null;
  setOverrideScheme: (scheme: 'light' | 'dark') => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  overrideScheme: null,
  setOverrideScheme: () => { },
});

/**
 * React hook — returns the correct token map.
 * Honours the user's manual override (set via the Profile dark-mode toggle);
 * falls back to the device OS appearance setting.
 */
export function useTheme(): ThemeColors {
  const { overrideScheme } = useContext(ThemeContext);
  // Don't default to dark mode
  // const deviceScheme = useColorScheme();
  // return getTheme(overrideScheme ?? deviceScheme);
  return getTheme(overrideScheme);
}

/**
 * Returns whether dark mode is currently active and a setter that persists the
 * choice to device storage. Use in the Profile screen dark-mode toggle.
 */
export function useThemePreference() {
  const { overrideScheme, setOverrideScheme } = useContext(ThemeContext);
  const deviceScheme = useColorScheme();
  const isDark = (overrideScheme ?? deviceScheme) === 'dark';
  return {
    isDark,
    setIsDark: (dark: boolean) => setOverrideScheme(dark ? 'dark' : 'light'),
  };
}
