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
 * components/reports/BarChart.tsx
 *
 * Scrollable grouped bar chart powered by react-native-gifted-charts.
 * YNAB-style: horizontally scrollable, auto-scrolled to latest month,
 * optional line overlay (e.g. net trend), y-axis on the right.
 */

import React, { useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import { BarChart as GiftedBarChart, yAxisSides } from 'react-native-gifted-charts';

import { useTheme } from '@/lib/theme';

export interface BarChartDataPoint {
  label: string;
  values: number[]; // kobo amounts — up to 2 values per group
  /** Optional value for the line overlay (e.g. net). */
  lineValue?: number;
}

export interface BarChartProps {
  data: BarChartDataPoint[];
  /** Colours for each value in the group. */
  colors: string[];
  /** Chart height. Default 200. */
  height?: number;
  /** Show a line overlay from lineValue data. Default false. */
  showLine?: boolean;
  /** Colour of the line overlay. Default textPrimary. */
  lineColor?: string;
  /** Number of groups visible without scrolling. Default 6. */
  visibleBars?: number;
  /** Scroll to end (most recent month) on mount. Default true. */
  scrollToEnd?: boolean;
}

const SCREEN_W = Dimensions.get('window').width;
const Y_AXIS_W = 40;
const INITIAL_SPACING = 12;
const FIXED_BAR_W = 28;
const FIXED_OUTER_GAP = 24;
const FIXED_INNER_GAP = 2;

export function BarChart({
  data,
  colors: barColors,
  height = 200,
  showLine = false,
  lineColor,
  visibleBars = 6,
  scrollToEnd = true,
}: BarChartProps) {
  const theme = useTheme();
  const FONT = 'PlusJakartaSans_400Regular';
  const valuesPerGroup = data[0]?.values.length ?? 1;

  // Fixed bar width and spacing — never resize for limited data.
  const barW = FIXED_BAR_W;
  const innerGap = valuesPerGroup > 1 ? FIXED_INNER_GAP : 0;
  const outerGap = FIXED_OUTER_GAP;

  // The library positions right y-axis labels absolutely at:
  //   left = width + yAxisLabelWidth/2 + endSpacing − 20
  // Right edge of labels = left + yAxisLabelWidth
  //   = width + 1.5·yAxisLabelWidth + endSpacing − 20
  // This must fit within the card's content area.
  // Card inset: 2 × (marginH 21 + border 1 + paddingH 21) = 86px.
  const CARD_INSET = 86;
  const cardInnerW = SCREEN_W - CARD_INSET;
  const END_SPACING = 3;
  const chartW = cardInnerW - 1.5 * Y_AXIS_W - END_SPACING + 20;

  // Right-align bars so the current (last) month is nearest the y-axis.
  // Content width excludes trailing gap — last bar's spacing is set to 0.
  const groupW = valuesPerGroup * barW + innerGap * (valuesPerGroup - 1) + outerGap;
  const barsW = data.length * groupW - outerGap;
  const startPad = barsW < chartW
    ? chartW - barsW
    : INITIAL_SPACING;

  const { barData, lineData } = useMemo(() => {
    const flat: Record<string, unknown>[] = [];
    const line: Record<string, unknown>[] = [];
    const lastGroupIdx = data.length - 1;

    data.forEach((pt, gi) => {
      const isLastGroup = gi === lastGroupIdx;

      pt.values.forEach((val, vi) => {
        const entry: Record<string, unknown> = {
          value: Math.abs(val),
          frontColor: barColors[vi] ?? theme.brand,
          barBorderRadius: 3,
        };

        if (vi === 0) {
          entry.label = pt.label;
          if (valuesPerGroup > 1) {
            entry.spacing = innerGap;
            entry.labelWidth =
              barW * valuesPerGroup + innerGap * (valuesPerGroup - 1) + outerGap;
          }
        }

        // Remove trailing gap after the very last bar so it sits flush right.
        const isLastBar = isLastGroup && vi === valuesPerGroup - 1;
        if (isLastBar) {
          entry.spacing = 0;
        }

        flat.push(entry);
      });

      // Line data: one visible point per group; duplicate to match bar count.
      if (showLine && pt.lineValue != null) {
        for (let vi = 0; vi < valuesPerGroup; vi++) {
          line.push({
            value: Math.abs(pt.lineValue),
            ...(vi > 0 ? { hideDataPoint: true } : {}),
          });
        }
      }
    });

    return { barData: flat, lineData: line };
  }, [data, barColors, theme.brand, showLine, valuesPerGroup, innerGap, outerGap, barW]);

  if (data.length === 0) return <View style={{ height }} />;

  const hasLine = showLine && lineData.length > 0;

  return (
    <GiftedBarChart
      data={barData}
      height={height}
      barWidth={barW}
      spacing={outerGap}
      initialSpacing={startPad}
      endSpacing={END_SPACING}
      noOfSections={3}
      isAnimated
      animationDuration={300}
      yAxisThickness={0}
      xAxisThickness={1}
      xAxisColor={theme.border}
      rulesColor={theme.border}
      rulesType="dashed"
      dashWidth={4}
      dashGap={4}
      yAxisTextStyle={{ color: theme.textMeta, fontSize: 10, fontFamily: FONT }}
      xAxisLabelTextStyle={{ color: theme.textMeta, fontSize: 10, fontFamily: FONT }}
      yAxisLabelWidth={Y_AXIS_W}
      yAxisSide={yAxisSides.RIGHT}
      width={chartW}
      disableScroll={false}
      scrollToEnd={scrollToEnd}
      showScrollIndicator={false}
      formatYLabel={(label: string) => {
        const val = parseFloat(label);
        if (isNaN(val) || val === 0) return '₦0';
        const naira = Math.abs(val) / 100;
        if (naira >= 1_000_000) return `₦${Math.round(naira / 1_000_000)}M`;
        if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}K`;
        return `₦${Math.round(naira)}`;
      }}
      showLine={hasLine}
      lineData={hasLine ? lineData : undefined}
      lineBehindBars={false}
      lineConfig={{
        color: lineColor ?? theme.info,
        thickness: 3,
        curved: true,
        hideDataPoints: false,
        dataPointsColor: lineColor ?? theme.info,
        dataPointsRadius: 4,
      }}
    />
  );
}
