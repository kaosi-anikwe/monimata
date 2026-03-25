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
 * components/ui/Avatar.tsx
 */

import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  /** Display name — first two characters are used as initials. */
  name?: string;
  /** Remote or local image URI. When provided, shown instead of initials. */
  uri?: string;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
}

// ─── Dimension map ────────────────────────────────────────────────────────────

const DIM: Record<AvatarSize, { box: number; radius: number; font: number }> = {
  sm: { box: 32, radius: 10, font: 13 },
  md: { box: 40, radius: 13, font: 16 },
  lg: { box: 56, radius: 16, font: 22 },
  xl: { box: 72, radius: 20, font: 28 },
};

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ name, uri, size = 'md', style }: AvatarProps) {
  const colors = useTheme();
  const { box, radius, font } = DIM[size];

  const initials = name
    ? name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
    : '?';

  return (
    <View
      style={[
        s.base,
        {
          width: box,
          height: box,
          borderRadius: radius,
          backgroundColor: colors.brand,
          borderWidth: 2,
          borderColor: colors.limeBorder,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius - 2 }]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={{
            fontFamily: 'PlusJakartaSans_800ExtraBold',
            fontSize: font,
            lineHeight: font * 1.25,
            color: colors.lime,
          }}
          allowFontScaling={false}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
