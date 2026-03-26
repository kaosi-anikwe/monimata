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

import React, { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
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
  /**
   * When provided, enables dual-bar mode:
   * - `progress` becomes the bottom "assigned" layer (muted surfaceHigh colour).
   * - `secondProgress` is the top "spent" layer (state colour, absolutely overlaid).
   */
  secondProgress?: number;
  state?: ProgressBarState;
  size?: ProgressBarSize;
  /** Animate the fill from 0 → target on mount (and on subsequent changes). Default false. */
  animate?: boolean;
  /** Render a brand→lime linear gradient fill (e.g. goals, CTBM). Default false. */
  gradient?: boolean;
  /** Override the fill colour directly (takes precedence over `state`). */
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
  trackStyle?: StyleProp<ViewStyle>;
}

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_H: Record<ProgressBarSize, number> = { xs: 2, sm: 3, md: 5, lg: 7 };

// ─── ProgressBar ──────────────────────────────────────────────────────────────

export function ProgressBar({
  progress,
  secondProgress,
  state = 'ok',
  size = 'sm',
  animate = false,
  gradient = false,
  fillColor,
  style,
  trackStyle,
}: ProgressBarProps) {
  const colors = useTheme();
  const height = SIZE_H[size];
  const isDual = secondProgress !== undefined;

  // Primary bar (assigned in dual mode / single spend bar otherwise)
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const width = useSharedValue(animate ? 0 : clampedProgress);

  // Secondary bar (spent in dual mode)
  const clampedSecondProgress = secondProgress !== undefined
    ? Math.min(Math.max(secondProgress, 0), 1)
    : 0;
  const secondWidth = useSharedValue(animate ? 0 : clampedSecondProgress);

  useEffect(() => {
    width.value = animate
      ? withTiming(clampedProgress, { duration: 600 })
      : clampedProgress;
  }, [clampedProgress, animate, width]);

  useEffect(() => {
    secondWidth.value = animate
      ? withTiming(clampedSecondProgress, { duration: 600 })
      : clampedSecondProgress;
  }, [clampedSecondProgress, animate, secondWidth]);

  const fillAnim = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  const secondFillAnim = useAnimatedStyle(() => ({
    width: `${secondWidth.value * 100}%`,
  }));

  // In dual mode: bottom fill colour is derived from funding ratio (red→amber→green).
  // In single mode: colour comes from the `state` prop as before.
  const assignedFillColor = isDual
    ? resolveFundedColor(clampedProgress, colors)
    : (fillColor ?? resolveFillColor(state, colors));

  // Track is neutral (empty feel) in dual mode; brand-tinted otherwise.
  const trackBg = isDual ? colors.border : colors.surfaceElevated;

  return (
    <View
      style={[
        s.track,
        { height, backgroundColor: trackBg },
        trackStyle,
        style,
      ]}
    >
      {/* Primary fill: assigned extent (dual) or single spend bar */}
      <Animated.View
        style={[
          s.fill,
          { height },
          gradient && !isDual ? undefined : { backgroundColor: assignedFillColor },
          fillAnim,
        ]}
      >
        {gradient && !isDual && (
          <LinearGradient
            colors={[colors.brand, colors.lime]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {/* Secondary fill (dual mode only): spent extent — tinted + hatched */}
      {isDual && clampedSecondProgress > 0 && (
        <Animated.View
          style={[
            s.fill,
            s.fillAbsolute,
            s.fillClip,
            { height, backgroundColor: assignedFillColor },
            secondFillAnim,
          ]}
        >
          {/* White wash: desaturates the fill to a grayed-out version of the same hue */}
          <View style={[StyleSheet.absoluteFill, s.spentWash]} />
          {/* Diagonal stripes: YNAB-style "consumed" indicator */}
          <StripePatternFill height={height} />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Stripe pattern fill (spent bar) ────────────────────────────────────────

/**
 * Renders an SVG with repeated 45° diagonal lines filling the spent bar.
 * Uses a large fixed pixel width — the track's overflow:hidden clips the excess.
 * We must use explicit pixel dimensions on <Svg> because react-native-svg
 * cannot resolve percentage widths when the parent has a Reanimated width.
 */
function StripePatternFill({ height }: { height: number }) {
  // 4000px is wide enough for any screen. The track clips the overflow.
  const W = 4000;
  return (
    <Svg
      width={W}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <Defs>
        <Pattern
          id="spend-stripes"
          patternUnits="userSpaceOnUse"
          width={6}
          height={6}
          patternTransform="rotate(45 0 0)"
        >
          <Line
            x1="0" y1="0"
            x2="0" y2="6"
            stroke="rgba(0,0,0,0.22)"
            strokeWidth={2.5}
          />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={W} height={height} fill="url(#spend-stripes)" />
    </Svg>
  );
}

// ─── Fill colour resolvers ──────────────────────────────────────────────────

/**
 * Dual-bar mode: colour the assigned fill based on how funded the category is
 * relative to its target — giving an at-a-glance underfunded signal.
 *   < 50% assigned  → red   (significantly underfunded)
 *   50–89% assigned → amber (partially funded)
 *   ≥ 90% assigned  → green (fully / near-fully funded)
 */
function resolveFundedColor(
  fundedRatio: number,
  colors: ReturnType<typeof useTheme>,
): string {
  if (fundedRatio >= 0.9) return colors.brandBright;
  if (fundedRatio >= 0.5) return colors.warning;
  return colors.error;
}

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
  fillAbsolute: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  fillClip: {
    overflow: 'hidden',
  },
  spentWash: {
    // Lightens the hue to create a visibly grayed-out version of the fill color.
    // Opaque white at 52% makes any hue look washed-out without bleed-through.
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderRadius: 99,
  },
});
