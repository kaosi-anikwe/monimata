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
 * components/ui/Card.tsx
 *
 * General-purpose card surface.
 * Matches the --cs shadow + --bd border + --rm radius from the mockup.
 *
 * Usage:
 *   <Card>...</Card>
 *   <Card onPress={...}>...</Card>        — tappable variant
 *   <Card elevated>...</Card>             — medium shadow
 *   <Card variant="dark">...</Card>       — dark green card (budget headers etc.)
 */

import React from 'react';
import {
  StyleProp,
  StyleSheet,
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
import { radius, shadow } from '@/lib/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardProps {
  children?: React.ReactNode;
  /** When provided, the card becomes a touchable. */
  onPress?: () => void;
  /** Use the medium shadow instead of the small one. */
  elevated?: boolean;
  /** 'light' (default) — white/surface. 'dark' — deep green (budget header cards). */
  variant?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// ─── AnimatedTouchable ────────────────────────────────────────────────────────

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  onPress,
  elevated = false,
  variant = 'light',
  style,
  contentStyle,
  accessibilityLabel,
}: CardProps) {
  const colors = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const cardStyle: ViewStyle = {
    backgroundColor: variant === 'dark' ? colors.darkGreen : colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: variant === 'dark'
      ? colors.limeBadgeBg
      : colors.border,
    ...(elevated ? shadow.md : shadow.sm),
  };

  if (onPress) {
    return (
      <AnimatedTouchable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 20, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 300 });
        }}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[animStyle, cardStyle, style]}
      >
        <View style={contentStyle}>{children}</View>
      </AnimatedTouchable>
    );
  }

  return (
    <View style={[cardStyle, style]}>
      {contentStyle ? <View style={contentStyle}>{children}</View> : children}
    </View>
  );
}

// Card sub-components for common patterns ─────────────────────────────────────

/** Convenience row used inside a Card for the "title + right link" pattern. */
export function CardRow({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  return <View style={[row.container, style]}>{children}</View>;
}

const row = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
