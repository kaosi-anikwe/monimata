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
 * components/ui/SectionHeader.tsx
 */

import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionHeaderProps {
  title: string;
  /** Right-side link label (e.g. "See all"). Rendered only when provided. */
  linkLabel?: string;
  onLinkPress?: () => void;
  /**
   * 'section' (default) — large bold heading, used between scroll sections.
   * 'group'             — small uppercase label, used inside budget group headers.
   */
  variant?: 'section' | 'group';
  /** Extra horizontal padding override (default 20). */
  paddingHorizontal?: number;
  style?: StyleProp<ViewStyle>;
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  linkLabel,
  onLinkPress,
  variant = 'section',
  paddingHorizontal = spacing.xl,
  style,
}: SectionHeaderProps) {
  const colors = useTheme();
  const isGroup = variant === 'group';

  return (
    <View
      style={[
        s.row,
        { paddingHorizontal, marginBottom: isGroup ? 0 : 11 },
        style,
      ]}
    >
      <Text
        style={[
          isGroup ? s.groupTitle : s.sectionTitle,
          { color: isGroup ? colors.textSecondary : colors.textPrimary },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>

      {linkLabel && (
        <TouchableOpacity
          onPress={onLinkPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={linkLabel}
        >
          <Text style={[s.link, { color: colors.brand }]}>{linkLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...type_.h3,
  },
  groupTitle: {
    ...type_.label,
  },
  link: {
    ...type_.bodyReg,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});
