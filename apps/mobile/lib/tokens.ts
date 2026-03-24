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
