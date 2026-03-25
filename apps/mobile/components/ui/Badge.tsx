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
 * components/ui/Badge.tsx
 *
 * Pill-shaped status badges.
 *
 * Variants:
 *   success  — green positive indicator  (.stat-bdg.up)
 *   error    — red overspent/destructive (.stat-bdg.dn)
 *   warning  — amber underfunded
 *   info     — blue informational
 *   purple   — gamification/rewards
 *   neutral  — grey/secondary
 *
 * Sizes:
 *   sm  — 10px / 7px vpad, 7px hpad  (tab bar badges, tiny indicators)
 *   md  — 11px / 2px vpad, 7px hpad  (stat badges — default)
 *   lg  — 12px / 4px vpad, 10px hpad (feature/XP badges)
 *
 * Usage:
 *   <Badge variant="success">+12%</Badge>
 *   <Badge variant="error" size="sm">3</Badge>
 */

import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';
import { type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'purple' | 'neutral';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({
  variant = 'neutral',
  size = 'md',
  children,
  style,
  textStyle,
}: BadgeProps) {
  const colors = useTheme();
  const { bg, fg } = resolveColors(variant, colors);
  const { pill, txt } = resolveSize(size);

  return (
    <View style={[s.base, pill, { backgroundColor: bg }, style]}>
      <Text style={[txt, { color: fg }, textStyle]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

function resolveColors(
  variant: BadgeVariant,
  colors: ReturnType<typeof useTheme>,
): { bg: string; fg: string } {
  switch (variant) {
    case 'success':
      return { bg: colors.successSubtle, fg: colors.successText };
    case 'error':
      return { bg: colors.errorSubtle, fg: colors.error };
    case 'warning':
      return { bg: colors.warningSubtle, fg: colors.warningText };
    case 'info':
      return { bg: colors.infoSubtle, fg: colors.info };
    case 'purple':
      return { bg: colors.purpleSubtle, fg: colors.purple };
    case 'neutral':
    default:
      return { bg: colors.surface, fg: colors.textSecondary };
  }
}

function resolveSize(size: BadgeSize): { pill: ViewStyle; txt: TextStyle } {
  switch (size) {
    case 'sm':
      return {
        pill: { paddingVertical: 1, paddingHorizontal: 5, borderRadius: 5 },
        txt: { ...type_.labelSm, textTransform: 'none', letterSpacing: 0 },
      };
    case 'lg':
      return {
        pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
        txt: { ...type_.caption, fontSize: 12 },
      };
    case 'md':
    default:
      return {
        pill: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6 },
        txt: { ...type_.caption },
      };
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
