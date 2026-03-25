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
 * components/ui/ProgressBar.tsx
 *
 * Animated horizontal progress bar.
 * Three funding states matching the budget category rows in the mockup:
 *
 *   ok    — green fill (#4CAF50)          ≤ 100% funded
 *   warn  — amber fill (#F59E0B)          funded but over 80%
 *   over  — red fill (#D93025)            overspent (> 100%)
 *   brand — brand-to-lime gradient fill   (goals / targets)
 */

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProgressBarState = 'ok' | 'warn' | 'over' | 'brand' | 'neutral';
export type ProgressBarSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ProgressBarProps {
  /** Value between 0 and 1 (may exceed 1 for over-budget). */
  progress: number;
  state?: ProgressBarState;
  size?: ProgressBarSize;
  /** Animate the fill from 0 → target on mount (and on subsequent changes). Default false. */
  animate?: boolean;
  /** Render a brand→lime linear gradient fill (e.g. goals, CTBM). Default false. */
  gradient?: boolean;
  style?: StyleProp<ViewStyle>;
  trackStyle?: StyleProp<ViewStyle>;
}

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_H: Record<ProgressBarSize, number> = { xs: 2, sm: 3, md: 5, lg: 7 };

// ─── ProgressBar ──────────────────────────────────────────────────────────────

export function ProgressBar({
  progress,
  state = 'ok',
  size = 'sm',
  animate = false,
  gradient = false,
  style,
  trackStyle,
}: ProgressBarProps) {
  const colors = useTheme();
  const height = SIZE_H[size];
  // Clamp to 0–1 for visual fill (over-budget shows full red bar)
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  // When animate=false start at the target so there's no fill-in on mount.
  const width = useSharedValue(animate ? 0 : clampedProgress);

  useEffect(() => {
    width.value = animate
      ? withTiming(clampedProgress, { duration: 600 })
      : clampedProgress;
  }, [clampedProgress, animate, width]);

  const fillAnim = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  const fillColor = resolveFillColor(state, colors);

  return (
    <View
      style={[
        s.track,
        { height, backgroundColor: colors.surfaceElevated },
        trackStyle,
        style,
      ]}
    >
      <Animated.View
        style={[
          s.fill,
          { height },
          gradient ? undefined : { backgroundColor: fillColor },
          fillAnim,
        ]}
      >
        {gradient && (
          <LinearGradient
            colors={[colors.brand, colors.lime]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ─── Fill colour resolver ─────────────────────────────────────────────────────

function resolveFillColor(
  state: ProgressBarState,
  colors: ReturnType<typeof useTheme>,
): string {
  switch (state) {
    case 'ok':
      return colors.brandBright;   // --gb  #4CAF50
    case 'warn':
      return colors.warning;       // --amber
    case 'over':
      return colors.error;         // --red
    case 'neutral':
      return colors.textMeta;
    case 'brand':
    default:
      return colors.brand;         // solid brand; gradient handled by LinearGradient wrapper when needed
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 99,
  },
});
