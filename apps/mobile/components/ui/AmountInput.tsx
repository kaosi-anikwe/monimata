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
 * components/ui/AmountInput.tsx
 *
 * Large branded Naira amount input field.
 *
 * Two modes (controlled by `allowDecimals`):
 *   integer (default) — strips non-digits, formats with commas ("1,500").
 *                       Stores raw digit string; use nairaStringToKobo() to convert.
 *                       keyboardType="numeric"
 *
 *   decimal           — allows a single decimal point, formats integer part
 *                       with commas ("1,500.50"). Stores raw decimal string;
 *                       use parseFloat() to get naira value.
 *                       keyboardType="decimal-pad"
 *
 * Usage:
 *   // Target screen — integer kobo input
 *   <AmountInput value={amount} onChange={setAmount} />
 *
 *   // Balance update — naira with decimal
 *   <AmountInput
 *     label="New Balance *"
 *     value={amount}
 *     onChange={setAmount}
 *     allowDecimals
 *     autoFocus
 *   />
 */

import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';

import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AmountInputProps {
  /** Raw value — digit string in integer mode, digit+dot string in decimal mode. */
  value: string;
  onChange: (v: string) => void;
  /**
   * When true, allows a single decimal point and uses `decimal-pad` keyboard.
   * Default false (integer-only, `numeric` keyboard).
   */
  allowDecimals?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Optional label rendered above the input row (styled like form field labels). */
  label?: string;
  /** Override container style (e.g. to remove marginVertical in gap layouts). */
  style?: StyleProp<ViewStyle>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(raw: string, allowDecimals: boolean): string {
  if (!raw) return '';
  if (!allowDecimals) {
    return Number(raw).toLocaleString('en-NG');
  }
  const dotIdx = raw.indexOf('.');
  if (dotIdx === -1) return Number(raw).toLocaleString('en-NG');
  const intPart = raw.slice(0, dotIdx);
  const decPart = raw.slice(dotIdx); // includes the dot
  return `${intPart ? Number(intPart).toLocaleString('en-NG') : '0'}${decPart}`;
}

function cleanValue(text: string, allowDecimals: boolean): string {
  if (!allowDecimals) {
    return text.replace(/[^0-9]/g, '');
  }
  const stripped = text.replace(/[^0-9.]/g, '');
  const parts = stripped.split('.');
  // Collapse multiple dots: keep only one decimal point
  return parts.length <= 2 ? stripped : `${parts[0]}.${parts.slice(1).join('')}`;
}

// ─── AmountInput ─────────────────────────────────────────────────────────────

export function AmountInput({
  value,
  onChange,
  allowDecimals = false,
  placeholder = '0',
  autoFocus,
  label,
  style,
}: AmountInputProps) {
  const colors = useTheme();

  return (
    <View style={style}>
      {label && (
        <Text style={[s.label, { color: colors.textSecondary }]}>{label}</Text>
      )}
      <View style={[s.row, { backgroundColor: colors.surface, borderColor: colors.brand }]}>
        <Text style={[s.symbol, { color: colors.brand }]}>₦</Text>
        <TextInput
          style={[s.input, { color: colors.brand }]}
          value={formatValue(value, allowDecimals)}
          onChangeText={(text) => onChange(cleanValue(text, allowDecimals))}
          keyboardType={allowDecimals ? 'decimal-pad' : 'numeric'}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  label: {
    ...type_.labelSm,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.smd,
    marginVertical: spacing.sm,
  },
  symbol: {
    ...type_.displayMd,
    ...ff(700),
    marginRight: 6,
  },
  input: {
    flex: 1,
    ...type_.displayEntry,
    padding: 0,
  },
});
