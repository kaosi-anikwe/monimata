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
 * Screen 7 — Cash Flow.
 * Overlapping area chart showing inflow vs outflow with a net line.
 */

import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaChart, ChartSkeleton, SegmentedControl } from '@/components/reports';
import { AmountDisplay, Card, ScreenHeader } from '@/components/ui';
import { useCashFlow } from '@/hooks/useReports';
import { useReportAccountFilter } from '@/hooks/useReportAccountFilter';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

const MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const GRANULARITY_OPTIONS = [
  { label: 'Daily', value: 'daily' as const },
  { label: 'Weekly', value: 'weekly' as const },
  { label: 'Monthly', value: 'monthly' as const },
];

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonth(): string {
  return monthsAgo(0);
}

export default function CashFlowScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const accountIds = useReportAccountFilter();

  const start = monthsAgo(6);
  const end = currentMonth();
  const { data, isLoading } = useCashFlow(start, end, granularity, accountIds);

  const points = data?.points ?? [];

  const chartData = points.map((p) => {
    let label = p.period;
    if (granularity === 'monthly' && p.period.match(/^\d{4}-\d{2}$/)) {
      const [, m] = p.period.split('-');
      label = MONTH_LABELS_SHORT[parseInt(m, 10) - 1];
    } else if (p.period.length > 5) {
      label = p.period.slice(5);
    }
    return {
      label,
      inflow: p.inflow,
      outflow: p.outflow,
      net: p.net,
    };
  });

  const totalIn = points.reduce((s, p) => s + p.inflow, 0);
  const totalOut = points.reduce((s, p) => s + p.outflow, 0);
  const totalNet = totalIn - totalOut;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Cash Flow"
        onBack={() => router.back()}
        paddingTop={insets.top + 14}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Granularity control */}
        <View style={ss.controlRow}>
          <SegmentedControl
            options={GRANULARITY_OPTIONS as unknown as { label: string; value: string }[]}
            selected={granularity}
            onSelect={(v) => setGranularity(v as 'daily' | 'weekly' | 'monthly')}
          />
        </View>

        {isLoading ? (
          <ChartSkeleton height={220} />
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ overflow: 'visible' }}>
            <Card style={ss.card}>
              <AreaChart data={chartData} height={220} visiblePoints={6} />
            </Card>
          </Animated.View>
        )}

        {/* Legend */}
        <View style={ss.legendRow}>
          <View style={ss.legendItem}>
            <View style={[ss.legendDot, { backgroundColor: colors.brandBright, opacity: 0.5 }]} />
            <Text style={[type_.caption, { color: colors.textMeta }]}>Inflow</Text>
          </View>
          <View style={ss.legendItem}>
            <View style={[ss.legendDot, { backgroundColor: colors.error, opacity: 0.5 }]} />
            <Text style={[type_.caption, { color: colors.textMeta }]}>Outflow</Text>
          </View>
          <View style={ss.legendItem}>
            <View style={[ss.legendDot, { backgroundColor: colors.info }]} />
            <Text style={[type_.caption, { color: colors.textMeta }]}>Net</Text>
          </View>
        </View>

        {/* Summary rows */}
        {!isLoading && points.length > 0 && (
          <Animated.View entering={FadeInUp.delay(200).duration(300).easing(Easing.out(Easing.cubic))} style={{ overflow: 'visible' }}>
            <Card style={ss.summaryCard}>
              <View style={ss.summaryRow}>
                <View style={ss.summaryLabel}>
                  <View style={[ss.legendDot, { backgroundColor: colors.brandBright }]} />
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Total Inflow</Text>
                </View>
                <AmountDisplay kobo={totalIn} size="md" color={colors.brandBright} />
              </View>
              <View style={[ss.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={ss.summaryRow}>
                <View style={ss.summaryLabel}>
                  <View style={[ss.legendDot, { backgroundColor: colors.error }]} />
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Total Outflow</Text>
                </View>
                <AmountDisplay kobo={totalOut} size="md" color={colors.error} />
              </View>
              <View style={[ss.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={ss.summaryRow}>
                <View style={ss.summaryLabel}>
                  <View style={[ss.legendDot, { backgroundColor: colors.info }]} />
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Net</Text>
                </View>
                <AmountDisplay kobo={totalNet} size="md" colorize />
              </View>
            </Card>
          </Animated.View>
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: spacing.sm },
  controlRow: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
  },
});
