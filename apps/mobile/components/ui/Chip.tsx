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
 * components/ui/Chip.tsx
 *
 * The `selected` prop switches between off/on states.
 * Pass `onPress` to make it interactive; omit for a display-only chip.
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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';
import { type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** 'filter' (default) — category filter chips. 'quickfill' — numpad quick-fill chips. */
  variant?: 'filter' | 'quickfill';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// ─── AnimatedTouchable ────────────────────────────────────────────────────────

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// ─── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({
  label,
  selected = false,
  onPress,
  variant = 'filter',
  disabled = false,
  style,
  accessibilityLabel,
}: ChipProps) {
  const colors = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bg = selected ? colors.brand : colors.white;
  const border = selected ? colors.brand : colors.borderStrong;
  const textColor = selected ? colors.white : colors.textSecondary;

  const isQuickfill = variant === 'quickfill';

  if (!onPress) {
    // Display-only chip
    return (
      <View
        style={[
          s.base,
          isQuickfill ? s.qf : s.filter,
          { backgroundColor: bg, borderColor: border },
          style,
        ]}
      >
        <Text style={[s.label, { color: textColor }]}>{label}</Text>
      </View>
    );
  }

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={() => scale.value = withSpring(0.95, { damping: 20, stiffness: 300 })}
      onPressOut={() => scale.value = withSpring(1, { damping: 20, stiffness: 300 })}
      activeOpacity={1}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[
        animStyle,
        s.base,
        isQuickfill ? s.qf : s.filter,
        { backgroundColor: bg, borderColor: border },
        disabled && s.disabled,
        style,
      ]}
    >
      <Text style={[s.label, { color: textColor }]}>{label}</Text>
    </AnimatedTouchable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filter: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
  },
  qf: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
  },
  label: {
    ...type_.small,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  disabled: {
    opacity: 0.45,
  },
});
