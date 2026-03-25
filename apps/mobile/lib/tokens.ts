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
 * lib/tokens.ts
 *
 * Layout constants — spacing, border radii, shadows, and fixed dimensions.
 *
 * --- USAGE ---
 *   import { radius, spacing, shadow, layout } from '@/lib/tokens';
 *
 *   const styles = StyleSheet.create({
 *     card: {
 *       borderRadius: radius.md,
 *       padding: spacing.lg,
 *       ...shadow.sm,
 *     },
 *   });
 *
 * --- SHADOW USAGE NOTE ---
 * Shadow objects are spread directly into StyleSheet entries.
 * On Android, only `elevation` applies. On iOS, the shadow* props apply.
 * Always pair with `backgroundColor` on the view that receives the shadow.
 */

import { Platform, ViewStyle } from 'react-native';

// ─── Border radii ─────────────────────────────────────────────────────────────
// CSS: --rm = 16px (md), --rl = 22px (lg)

export const radius = {
  /** 8 pt — small chips, badges, tags */
  xs: 8,
  /** 12 pt — buttons, small cards */
  sm: 12,
  /** 16 pt — standard cards, inputs, bottom sheets. CSS: --rm */
  md: 16,
  /** 22 pt — large hero cards, modals. CSS: --rl */
  lg: 22,
  /** 28 pt — header bottom corners */
  xl: 28,
  /** 46 pt — phone-style rounded container */
  xxl: 46,
  /** Full circle/pill */
  full: 9999,
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
// 4-pt base grid matching the mockup's padding/gap values.

export const spacing = {
  /** 3 pt — tight gaps (sidebar items) */
  xxs: 3,
  /** 4 pt */
  xs: 4,
  /** 8 pt */
  sm: 8,
  /** 10 pt */
  smd: 10,
  /** 12 pt */
  md: 12,
  /** 14 pt */
  mdn: 14,
  /** 16 pt */
  lg: 16,
  /** 20 pt */
  xl: 20,
  /** 24 pt */
  xxl: 24,
  /** 32 pt */
  xxxl: 32,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────
// CSS: --cs = small card shadow, --csm = medium modal shadow.
// Spread these directly into a StyleSheet.create() entry.

const SHADOW_COLOR = '#0D1F0D'; // --gd (deep green, not black)

export const shadow = {
  /**
   * Small card shadow. CSS: --cs
   * 0 1px 3px rgba(13,31,13,0.06), 0 4px 16px rgba(13,31,13,0.08)
   */
  sm: Platform.select<ViewStyle>({
    ios: {
      shadowColor: SHADOW_COLOR,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  })!,

  /**
   * Medium modal / sheet shadow. CSS: --csm
   * 0 4px 12px rgba(13,31,13,0.10), 0 12px 28px rgba(13,31,13,0.14)
   */
  md: Platform.select<ViewStyle>({
    ios: {
      shadowColor: SHADOW_COLOR,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
    },
    android: { elevation: 5 },
    default: {},
  })!,

  /**
   * Large overlay / FAB shadow.
   */
  lg: Platform.select<ViewStyle>({
    ios: {
      shadowColor: SHADOW_COLOR,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.20,
      shadowRadius: 28,
    },
    android: { elevation: 10 },
    default: {},
  })!,

  /**
   * Lime FAB glow shadow — uses lime colour for glow effect.
   */
  fab: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#A8E063',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
    },
    android: { elevation: 6 },
    default: {},
  })!,
} as const;

// ─── Layout dimensions ───────────────────────────────────────────────────────

export const layout = {
  /** Bottom tab bar total height (including safe area padding base). */
  tabBarHeight: 76,

  /** Status-bar-aware top padding for custom headers. */
  headerPaddingTop: 54,

  /** FAB size (width = height = borderRadius * 2). */
  fabSize: 46,

  /** FAB overlap above the tab bar (negative margin, centres it). */
  fabTabOverlap: 22,

  /** Standard list row minimum tap height (accessibility). */
  rowMinHeight: 44,

  /** Avatar sizes. */
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 56,

  /** Icon sizes to match mockup icon SVG viewBox. */
  iconXs: 12,
  iconSm: 14,
  iconMd: 16,
  iconLg: 18,
  iconXl: 22,

  /** Bottom sheet handle bar. */
  sheetHandle: { width: 36, height: 4 },

  /** Progress bar heights. */
  progressSm: 3,
  progressMd: 5,
  progressLg: 7,
} as const;

// ─── Hit slop helper ─────────────────────────────────────────────────────────
// Use on small touch targets to maintain accessibility 44 pt minimum.

export function hitSlop(size: number) {
  const pad = Math.max(0, (44 - size) / 2);
  return { top: pad, bottom: pad, left: pad, right: pad };
}

// ─── Glass (frosted overlay values) ──────────────────────────────────────────
//
// These are semi-transparent overlays designed to be composited on top of the
// darkGreen (#0D1F0D) header surface. They are NOT theme-color-dependent —
// the same values work in light and dark mode because they always sit on a
// dark green background (balance card, control buttons, badge chips, etc.).
//
// Usage:
//   <View style={[glass.card, { borderColor: glass.borderLime }]} />
//
// Mapping to HTML mockup classes:
//   glass.card        → .bal-card / .ctbm-card    rgba(255,255,255,.07)
//   glass.control     → .notif-btn / .bal-btn     rgba(255,255,255,.09)
//   glass.strong      → .x-btn.dk                rgba(255,255,255,.10)
//   glass.badge       → streak badge / hub-tab    rgba(168,224,99,.15)
//   glass.borderLime  → .bal-card border          rgba(168,224,99,.13)
//   glass.borderLimeStrong → streak badge border  rgba(168,224,99,.25)
//   glass.borderWhite → .x-btn.dk / .notif-btn   rgba(255,255,255,.10)
//   glass.borderWhiteStrong → .x-btn.dk border   rgba(255,255,255,.12)
//   glass.avatarBorder → avatar ring on dark bg   rgba(168,224,99,.30)
//   glass.labelDim    → balance label             rgba(255,255,255,.42)
//   glass.textDim     → secondary text on dark    rgba(255,255,255,.45)
//   glass.textFaint   → tertiary text on dark     rgba(255,255,255,.30)
//   glass.streakDot   → unlit streak day          rgba(255,255,255,.07)
//   glass.streakDotBorder → unlit streak border   rgba(255,255,255,.08)
//   glass.streakDone  → completed streak day      rgba(168,224,99,.15)
//   glass.streakDoneBorder → completed streak day rgba(168,224,99,.30)

export const glass = {
  // Surfaces
  /** Frosted card on darkGreen — balance card, info cards  */
  card: 'rgba(255,255,255,0.07)',
  /** Slightly brighter surface — control buttons on dark  */
  control: 'rgba(255,255,255,0.09)',
  /** Opaque frosted — .x-btn.dk back button  */
  strong: 'rgba(255,255,255,0.10)',
  /** Lime-tinted badge surface — streak badge, hub tab */
  badge: 'rgba(168,224,99,0.15)',
  /** Chip on dark — balance chip  */
  chip: 'rgba(168,224,99,0.18)',

  // Borders
  /** Lime-tinted border — balance card  */
  borderLime: 'rgba(168,224,99,0.13)',
  /** Stronger lime border — focused lime elements  */
  borderLimeStrong: 'rgba(168,224,99,0.25)',
  /** Even stronger lime border — avatar ring  */
  borderLimeBright: 'rgba(168,224,99,0.30)',
  /** White frosted border — control buttons, notif btn  */
  borderWhite: 'rgba(255,255,255,0.10)',
  /** Darker white border — .x-btn.dk  */
  borderWhiteStrong: 'rgba(255,255,255,0.12)',

  // Text / icon opacities on darkGreen backgrounds
  /** ALL-CAPS label text on dark header (balance label)  */
  labelDim: 'rgba(255,255,255,0.42)',
  /** Secondary text on dark (greeting)  */
  textDim: 'rgba(255,255,255,0.45)',
  /** Tertiary text on dark (streak description)  */
  textFaint: 'rgba(255,255,255,0.50)',

  // Streak-specific
  /** Unlit streak day cell  */
  streakDay: 'rgba(255,255,255,0.07)',
  /** Unlit streak day border  */
  streakDayBorder: 'rgba(255,255,255,0.08)',
  /** Completed streak day fill  */
  streakDone: 'rgba(168,224,99,0.15)',
  /** Completed streak day border  */
  streakDoneBorder: 'rgba(168,224,99,0.30)',
} as const;
