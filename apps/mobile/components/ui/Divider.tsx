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
 * components/ui/Divider.tsx
 *
 * Hairline horizontal separator matching the .sbdiv / .ash-div classes.
 *
 * CSS reference:
 *   .sbdiv    height:1, bg:rgba(255,255,255,0.06) (on dark)
 *   .ash-div  height:1, bg:--bd (on light)
 *
 * Usage:
 *   <Divider />                  — full-width, light surface
 *   <Divider inset={16} />       — indented both sides
 *   <Divider variant="dark" />   — for dark-surface use (sidebar, dark headers)
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DividerProps {
  /** Horizontal indent applied to both left and right edges. */
  inset?: number;
  /** Top + bottom margin. */
  verticalMargin?: number;
  variant?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({
  inset = 0,
  verticalMargin = 0,
  variant = 'light',
  style,
}: DividerProps) {
  const colors = useTheme();

  const color =
    variant === 'dark'
      ? colors.separatorInverse
      : colors.border;

  return (
    <View
      style={[
        s.line,
        {
          backgroundColor: color,
          marginHorizontal: inset,
          marginVertical: verticalMargin,
        },
        style,
      ]}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    alignSelf: 'stretch',
  },
});
