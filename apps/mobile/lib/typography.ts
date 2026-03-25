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
 * lib/typography.ts
 *
 * Text style presets and money formatting utilities for MoniMata.
 * Font family: Plus Jakarta Sans (loaded via expo-font in Phase 1).
 *
 * --- USAGE ---
 *   import { type_, formatMoney } from '@/lib/typography';
 *
 *   // Predefined text style:
 *   <Text style={[type_.h2, { color: colors.textPrimary }]}>Budget</Text>
 *
 *   // Money display:
 *   <Text style={type_.display}>{formatMoney(transaction.amount)}</Text>
 *   // → "₦150,000.00"
 *
 * --- FONT WEIGHT NOTES ---
 * Plus Jakarta Sans loaded weights: 300, 400, 500, 600, 700, 800.
 * On iOS, weight is specified via fontWeight.
 * On Android, weight must be embedded in the fontFamily name
 * (e.g. 'PlusJakartaSans-Bold') because the OS does not synthesise weights.
 * Phase 1 will set up the correct platform-specific fontFamily mapping.
 * Until fonts are loaded, these styles fall back to the system sans-serif.
 */

import { TextStyle } from 'react-native';

// ─── Font family helper ───────────────────────────────────────────────────────
// Maps a numeric weight to the fontFamily string loaded by @expo-google-fonts/plus-jakarta-sans.
// With expo-google-fonts each variant is its own family (e.g. 'PlusJakartaSans_700Bold'),
// so fontWeight is not needed — the family name encodes the weight on all platforms.

type Weight = 300 | 400 | 500 | 600 | 700 | 800;

const WEIGHT_TO_FAMILY: Record<Weight, string> = {
  300: 'PlusJakartaSans_300Light',
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
};

export function ff(weight: Weight): Pick<TextStyle, 'fontFamily'> {
  return { fontFamily: WEIGHT_TO_FAMILY[weight] };
}

// ─── Text style presets ───────────────────────────────────────────────────────
// Colours are NOT included — always pair with a color from useTheme().
// Line heights follow the mockup's visible rhythm (1.2–1.6 × font size).

export const type_ = {
  /**
   * Display — hero amounts (balance, large stats).
   * Matches .bal-amt: 36px / 800 / -1.5px tracking
   */
  display: {
    ...ff(800),
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -1.5,
  } as TextStyle,

  /**
   * Display medium — large sub-totals (TBB value, big category amounts).
   * Matches .tbb-val: 24px / 800 / -0.5px
   */
  displayMd: {
    ...ff(800),
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  } as TextStyle,

  /**
   * H1 — screen/section titles.
   * Matches .feat-ttl / .cd-title: 22px / 800 / -0.4px
   */
  h1: {
    ...ff(800),
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  } as TextStyle,

  /**
   * H2 — modal/sheet titles.
   * Matches .sheet-title / .conf-h: 17–18px / 700–800 / -0.3px
   */
  h2: {
    ...ff(700),
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.3,
  } as TextStyle,

  /**
   * H3 — card section headings.
   * Matches .sec-ttl: 16px / 800 / -0.3px
   */
  h3: {
    ...ff(800),
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3,
  } as TextStyle,

  /**
   * Body — standard body copy, list item names.
   * Matches .bgt-rname / .ash-nm: 14px / 600
   */
  body: {
    ...ff(600),
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,

  /**
   * Body regular — secondary body text, descriptions.
   * Matches .sheet-sub: 13px / 400 / 1.5 line-height
   */
  bodyReg: {
    ...ff(400),
    fontSize: 13,
    lineHeight: 20,
  } as TextStyle,

  /**
   * Small — meta text, timestamps, sub-labels.
   * Matches .nudge-time / .bgt-asgn: 11–12px / 500
   */
  small: {
    ...ff(500),
    fontSize: 12,
    lineHeight: 16,
  } as TextStyle,

  /**
   * Caption — smallest readable text, badges, chips.
   * Matches .stat-lbl / .sbs: 10–11px / 600–700
   */
  caption: {
    ...ff(600),
    fontSize: 11,
    lineHeight: 14,
  } as TextStyle,

  /**
   * Label — uppercase section labels (group headers, section dividers).
   * Matches .bgt-grp-name: 11px / 700 / uppercase / 1.5px tracking
   */
  label: {
    ...ff(700),
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  } as TextStyle,

  /**
   * Label small — smallest uppercase label (tab bar captions, tags).
   * Matches .art-tag: 10px / 700 / uppercase / 1px tracking
   */
  labelSm: {
    ...ff(700),
    fontSize: 10,
    lineHeight: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  } as TextStyle,

  /**
   * Mono — fixed-width numerals for amounts in budget rows.
   * Same family as body but consistent character width for column alignment.
   */
  mono: {
    ...ff(700),
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
  } as TextStyle,

  /**
   * Button large — primary CTA buttons.
   * Matches .btn-lime / .btn-green: 15–16px / 700 / -0.2px
   */
  btnLg: {
    ...ff(700),
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
  } as TextStyle,

  /**
   * Button small — secondary/compact buttons, sheet footer buttons.
   * Matches .assign-footer .btn: 14px / 700
   */
  btnSm: {
    ...ff(700),
    fontSize: 14,
    lineHeight: 18,
  } as TextStyle,

  /**
   * Nav item — bottom tab bar labels.
   * Matches .ni span: 10px / 500
   */
  navItem: {
    ...ff(500),
    fontSize: 10,
    lineHeight: 13,
  } as TextStyle,

  /**
   * User name — topbar greeting name.
   * Matches .user-name: 15px / 700
   */
  userName: {
    ...ff(700),
    fontSize: 15,
    lineHeight: 19,
  } as TextStyle,

  /**
   * Numpad key — assign money numpad.
   * Matches .nk: 19px / 600
   */
  numpad: {
    ...ff(600),
    fontSize: 19,
    lineHeight: 24,
  } as TextStyle,
} as const;

// ─── Money formatting ─────────────────────────────────────────────────────────

export interface FormatMoneyOptions {
  /** Show the ₦ symbol. Default: true. */
  symbol?: boolean;
  /** Number of decimal places. Default: 2. */
  decimals?: number;
  /** Show positive sign for income. Default: false. */
  sign?: boolean;
  /** Shorten large amounts (₦1.5M, ₦250K). Default: false. */
  compact?: boolean;
}

/**
 * Formats a kobo integer into a human-readable Naira string.
 *
 * @param kobo - Amount in kobo (integer). Positive = income, negative = expense.
 * @param opts - Display options.
 * @returns Formatted string, e.g. "₦150,000.00" or "-₦3,500.50".
 *
 * @example
 *   formatMoney(15000000)        // "₦150,000.00"
 *   formatMoney(-350050)         // "-₦3,500.50"
 *   formatMoney(0)               // "₦0.00"
 *   formatMoney(1500000, { compact: true })  // "₦15K"
 */
export function formatMoney(kobo: number, opts: FormatMoneyOptions = {}): string {
  const { symbol = true, decimals = 2, sign = false, compact = false } = opts;

  const naira = kobo / 100;
  const isNegative = naira < 0;
  const abs = Math.abs(naira);

  const sym = symbol ? '₦' : '';

  let formatted: string;

  if (compact) {
    if (abs >= 1_000_000) {
      formatted = `${sym}${(abs / 1_000_000).toLocaleString('en-NG', { maximumFractionDigits: 1 })}M`;
    } else if (abs >= 1_000) {
      formatted = `${sym}${(abs / 1_000).toLocaleString('en-NG', { maximumFractionDigits: 1 })}K`;
    } else {
      formatted = `${sym}${abs.toLocaleString('en-NG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
  } else {
    formatted = `${sym}${abs.toLocaleString('en-NG', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  if (isNegative) return `-${formatted}`;
  if (sign && naira > 0) return `+${formatted}`;
  return formatted;
}

/**
 * Parses a user-entered money string (e.g. "150,000" or "1500") into kobo.
 * Strips currency symbols, commas, and whitespace before parsing.
 *
 * @param input - Raw string from a text input.
 * @returns Amount in kobo, or NaN if the input is not a valid number.
 */
export function parseMoneyInput(input: string): number {
  const cleaned = input.replace(/[₦,\s]/g, '');
  const naira = parseFloat(cleaned);
  if (isNaN(naira)) return NaN;
  return Math.round(naira * 100);
}
