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
 * components/reports/PercentBadge.tsx
 *
 * Green/red percentage change badge with up/down arrow.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { BounceIn } from 'react-native-reanimated';

import { Badge } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { type_ } from '@/lib/typography';

export interface PercentBadgeProps {
  /** Percentage change value. Null or undefined hides the badge. */
  value: number | null | undefined;
}

function formatPct(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(abs / 1000).toFixed(0)}k%`;
  return `${abs.toFixed(1)}%`;
}

export function PercentBadge({ value }: PercentBadgeProps) {
  const colors = useTheme();
  if (value == null) return null;

  const isPositive = value >= 0;
  const variant = isPositive ? 'success' : 'error';
  const iconName = isPositive ? 'arrow-up' : 'arrow-down';
  const display = formatPct(value);

  return (
    <Animated.View entering={BounceIn.delay(200).duration(400)}>
      <Badge variant={variant} size="sm">
        <View style={ss.inner}>
          <Ionicons name={iconName} size={10} color={isPositive ? colors.successText : colors.error} />
          <Text style={[type_.caption, { color: isPositive ? colors.successText : colors.error }]}>
            {display}
          </Text>
        </View>
      </Badge>
    </Animated.View>
  );
}

const ss = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
