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
 * components/reports/DonutChart.tsx
 *
 * Animated donut chart built on react-native-svg.
 * Shows category spending breakdown with a centre label.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/lib/theme';
import { type_ } from '@/lib/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  /** Centre label text (e.g. formatted total). */
  centreLabel?: string;
  /** Chart size. Default 200. */
  size?: number;
  /** Stroke width. Default 28. */
  strokeWidth?: number;
  /** Animate clockwise fill. Default true. */
  animate?: boolean;
  /** Animation duration in ms. Default 800. */
  animationDuration?: number;
}

export function DonutChart({
  segments,
  centreLabel,
  size = 200,
  strokeWidth = 28,
  animate = true,
  animationDuration = 800,
}: DonutChartProps) {
  const colors = useTheme();
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // Animated overlay: sweeps clockwise to reveal segments underneath.
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) {
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: animationDuration,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [animate, animationDuration, progress, segments.length]);

  const overlayProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * progress.value,
  }));

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <View style={[ss.container, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={colors.surfaceElevated}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
        {centreLabel && (
          <View style={ss.centreWrap}>
            <Text style={[ss.centreText, { color: colors.textPrimary }]}>
              {centreLabel}
            </Text>
          </View>
        )}
      </View>
    );
  }

  let accumulatedOffset = 0;

  return (
    <View style={[ss.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          {/* Track */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={colors.surfaceElevated}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Segments */}
          {segments.map((seg, i) => {
            const pct = seg.value / total;
            const dash = pct * circumference;
            const gap = circumference - dash;
            const offset = accumulatedOffset;
            accumulatedOffset += dash;

            return (
              <Circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
          })}
          {/* Clockwise reveal overlay — sweeps away to unveil segments */}
          {animate && (
            <AnimatedCircle
              cx={cx}
              cy={cy}
              r={r}
              stroke={colors.surfaceElevated}
              strokeWidth={strokeWidth + 1}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              animatedProps={overlayProps}
              strokeLinecap="butt"
            />
          )}
        </G>
      </Svg>
      {centreLabel && (
        <View style={ss.centreWrap}>
          <Text style={[ss.centreText, { color: colors.textPrimary }]}>
            {centreLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

const ss = StyleSheet.create({
  container: {
    alignSelf: 'center',
    position: 'relative',
  },
  centreWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreText: {
    ...type_.displaySm,
  },
});
