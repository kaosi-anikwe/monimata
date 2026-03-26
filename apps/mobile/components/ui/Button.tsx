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
 * components/ui/Button.tsx
 *
 * All variants scale down to 0.97 on press (Reanimated spring).
 * Pass `loading` to show an ActivityIndicator inside the button.
 * Pass `fullWidth` (default true for lime/green/red/ghost) to fill container.
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
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
import { layout, radius } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ButtonVariant = 'lime' | 'green' | 'red' | 'ghost' | 'icon' | 'destructive';

export interface ButtonProps {
  variant?: ButtonVariant;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** For lime/green/red/ghost: fill parent width. Default true. */
  fullWidth?: boolean;
  children?: React.ReactNode;
  /** Icon slot — rendered left of children text. */
  icon?: React.ReactNode;
  /** For icon variant: 'light' renders on light surfaces, 'dark' on dark. */
  iconTheme?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

// ─── AnimatedTouchable ───────────────────────────────────────────────────────

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// ─── Button ──────────────────────────────────────────────────────────────────

export function Button({
  variant = 'green',
  onPress,
  disabled = false,
  loading = false,
  fullWidth = variant !== 'icon',
  children,
  icon,
  iconTheme = 'light',
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const colors = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
  }
  function handlePressOut() {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  }

  // ── Resolve variant styles ────────────────────────────────────────────────

  if (variant === 'icon') {
    const isDark = iconTheme === 'dark';
    return (
      <AnimatedTouchable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[
          animStyle,
          s.iconBtn,
          isDark ? { backgroundColor: colors.overlayGhost, borderWidth: 1, borderColor: colors.overlayGhostBorder } : { backgroundColor: colors.surface },
          disabled && s.disabled,
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        {loading
          ? <ActivityIndicator size={14} color={isDark ? colors.white : colors.textSecondary} />
          : children}
      </AnimatedTouchable>
    );
  }

  const variantStyle = resolveVariantStyle(variant, colors);

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={1}
      style={[
        animStyle,
        s.base,
        variantStyle.container,
        fullWidth && s.fullWidth,
        disabled && s.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityHint={accessibilityHint}
    >
      {loading ? (
        <ActivityIndicator size={18} color={variantStyle.loaderColor} />
      ) : (
        <View style={s.inner}>
          {icon && <View style={s.iconSlot}>{icon}</View>}
          {children && (
            <Text
              style={[
                variant === 'lime' ? type_.btnLg : type_.btnSm,
                variantStyle.text,
                textStyle,
              ]}
              numberOfLines={1}
            >
              {children}
            </Text>
          )}
        </View>
      )}
    </AnimatedTouchable>
  );
}

// ─── Variant resolver ─────────────────────────────────────────────────────────

function resolveVariantStyle(
  variant: Exclude<ButtonVariant, 'icon'>,
  colors: ReturnType<typeof useTheme>,
): { container: ViewStyle; text: TextStyle; loaderColor: string } {
  switch (variant) {
    case 'lime':
      return {
        container: { backgroundColor: colors.lime, height: 54 },
        text: { color: colors.darkGreen },
        loaderColor: colors.darkGreen,
      };
    case 'green':
      return {
        container: { backgroundColor: colors.brand, height: 52 },
        text: { color: colors.white },
        loaderColor: colors.white,
      };
    case 'red':
      return {
        container: { backgroundColor: colors.error, height: 52 },
        text: { color: colors.white },
        loaderColor: colors.white,
      };
    case 'ghost':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.overlayGhostMid,
          height: 50,
        },
        text: { color: colors.textInverseHigh },
        loaderColor: colors.textInverseHigh,
      };
    case 'destructive':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.errorBorder,
          height: 52,
        },
        text: { color: colors.error },
        loaderColor: colors.error,
      };
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  fullWidth: {
    width: '100%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconSlot: {
    flexShrink: 0,
  },
  iconBtn: {
    width: layout.rowMinHeight - 8, // 36pt
    height: layout.rowMinHeight - 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtnDark: {
    // kept for reference only — overridden inline using colors.overlayGhost / overlayGhostBorder
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.45,
  },
});
