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
 * components/ui/AmountDisplay.tsx
 *
 * Renders a kobo integer as a formatted ₦ Naira string using the
 * formatMoney() utility from lib/typography.ts.
 *
 * Sizing shorthands:
 *   display  — 36px/800  (balance card hero amount)
 *   lg       — 24px/800  (TBB value, account balance)
 *   md       — 20px/700  (stat cards)
 *   sm       — 15px/700  (category available column)
 *   xs       — 13px/600  (secondary amounts, sub-rows)
 *
 * The amount is split into a currency symbol + integer part + fraction part
 * so callers can optionally render the symbol/fraction at a smaller size.
 *
 * Usage:
 *   <AmountDisplay kobo={1500000} />               → ₦15,000.00
 *   <AmountDisplay kobo={-350050} />               → -₦3,500.50  (red)
 *   <AmountDisplay kobo={transaction.amount} size="sm" colorize />
 *   <AmountDisplay kobo={tbb} size="lg" color={colors.lime} />
 */

import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

import { useTheme } from '@/lib/theme';
import { formatMoney, FormatMoneyOptions } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AmountSize = 'display' | 'lg' | 'md' | 'sm' | 'xs';

export interface AmountDisplayProps extends FormatMoneyOptions {
  /** Amount in kobo (integer). */
  kobo: number;
  size?: AmountSize;
  /**
   * When true, positive amounts use success green and negative amounts use
   * the error red. When false (default), no automatic coloring.
   */
  colorize?: boolean;
  /** Override the resolved color completely. */
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

// ─── Size presets ─────────────────────────────────────────────────────────────

const SIZE_STYLES: Record<AmountSize, TextStyle> = {
  display: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 36, letterSpacing: -1.5, lineHeight: 44 },
  lg: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 24, letterSpacing: -0.5, lineHeight: 30 },
  md: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 20, letterSpacing: -0.5, lineHeight: 26 },
  sm: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, letterSpacing: -0.2, lineHeight: 20 },
  xs: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, lineHeight: 18 },
};

// ─── AmountDisplay ────────────────────────────────────────────────────────────

export function AmountDisplay({
  kobo,
  size = 'sm',
  colorize = false,
  color,
  style,
  numberOfLines = 1,
  // FormatMoneyOptions
  symbol = true,
  decimals = 2,
  sign = false,
  compact = false,
}: AmountDisplayProps) {
  const colors = useTheme();

  let resolvedColor = color ?? colors.textPrimary;
  if (colorize && !color) {
    if (kobo > 0) resolvedColor = colors.brandBright;
    else if (kobo < 0) resolvedColor = colors.error;
    else resolvedColor = colors.textMeta;
  }

  const formatted = formatMoney(kobo, { symbol, decimals, sign, compact });

  return (
    <Text
      style={[SIZE_STYLES[size], { color: resolvedColor }, style]}
      numberOfLines={numberOfLines}
      allowFontScaling={false}
    >
      {formatted}
    </Text>
  );
}
