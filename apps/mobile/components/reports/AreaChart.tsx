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
 * components/reports/AreaChart.tsx
 *
 * Overlapping area chart for cash flow visualisation, powered by
 * react-native-gifted-charts. Two semi-transparent areas (inflow / outflow)
 * plus a net line.
 */

import React, { useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import { LineChart, yAxisSides } from 'react-native-gifted-charts';

import { useTheme } from '@/lib/theme';
import { formatMoney } from '@/lib/typography';

export interface AreaChartDataPoint {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface AreaChartProps {
  data: AreaChartDataPoint[];
  height?: number;
  /** Number of points visible without scrolling. Default 6. */
  visiblePoints?: number;
  /** Scroll to end (most recent). Default true. */
  scrollToEnd?: boolean;
}

const SCREEN_W = Dimensions.get('window').width;
const Y_AXIS_W = 50;
const INITIAL_SPACING = 8;

export function AreaChart({
  data,
  height = 200,
  visiblePoints = 6,
  scrollToEnd = true,
}: AreaChartProps) {
  const colors = useTheme();
  const FONT = 'PlusJakartaSans_400Regular';

  const containerW = SCREEN_W - 90;
  const chartW = containerW - Y_AXIS_W;
  const fitsInView = data.length <= visiblePoints;
  const displayPoints = fitsInView ? Math.max(data.length, 1) : visiblePoints;
  const spacing = Math.max(20, Math.floor((chartW - INITIAL_SPACING) / displayPoints));

  const { inflowData, outflowData, netData } = useMemo(() => {
    return {
      inflowData: data.map((d) => ({
        value: Math.abs(d.inflow),
        label: d.label,
      })),
      outflowData: data.map((d) => ({
        value: Math.abs(d.outflow),
      })),
      netData: data.map((d) => ({
        value: Math.abs(d.net),
      })),
    };
  }, [data]);

  if (data.length === 0) return <View style={{ height }} />;

  return (
    <LineChart
      data={inflowData}
      data2={outflowData}
      data3={netData}
      height={height}
      spacing={spacing}
      initialSpacing={INITIAL_SPACING}
      areaChart
      curved
      hideDataPoints
      isAnimated
      animationDuration={300}
      color1={colors.brandBright}
      color2={colors.error}
      color3={colors.info}
      thickness1={1}
      thickness2={1}
      thickness3={2}
      startFillColor1={colors.brandBright}
      endFillColor1={colors.brandBright}
      startOpacity1={0.25}
      endOpacity1={0.05}
      startFillColor2={colors.error}
      endFillColor2={colors.error}
      startOpacity2={0.25}
      endOpacity2={0.05}
      startFillColor3="transparent"
      endFillColor3="transparent"
      startOpacity3={0}
      endOpacity3={0}
      noOfSections={3}
      yAxisThickness={0}
      xAxisThickness={1}
      xAxisColor={colors.border}
      rulesColor={colors.border}
      rulesType="dashed"
      dashWidth={4}
      dashGap={4}
      yAxisTextStyle={{ color: colors.textMeta, fontSize: 10, fontFamily: FONT }}
      xAxisLabelTextStyle={{ color: colors.textMeta, fontSize: 10, fontFamily: FONT }}
      yAxisLabelWidth={Y_AXIS_W}
      yAxisSide={yAxisSides.RIGHT}
      width={chartW}
      disableScroll={fitsInView}
      scrollToEnd={!fitsInView && scrollToEnd}
      showScrollIndicator={false}
      formatYLabel={(label: string) => {
        const val = parseFloat(label);
        if (isNaN(val) || val === 0) return '₦0';
        const naira = Math.abs(val) / 100;
        if (naira >= 1_000_000) return `₦${Math.round(naira / 1_000_000)}M`;
        if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}K`;
        return `₦${Math.round(naira)}`;
      }}
    />
  );
}
