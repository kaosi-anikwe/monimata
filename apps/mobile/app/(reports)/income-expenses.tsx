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
 * Screen 2 — Income & Expenses trend view.
 * Grouped bar chart with income/expenses/net over time.
 */

import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChart, ChartSkeleton } from '@/components/reports';
import { AmountDisplay, Card, ScreenHeader } from '@/components/ui';
import { useIncomeExpenseTrend } from '@/hooks/useReports';
import { useReportAccountFilter } from '@/hooks/useReportAccountFilter';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

const MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function IncomeExpensesScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const accountIds = useReportAccountFilter();

  const { data, isLoading } = useIncomeExpenseTrend(undefined, accountIds);

  const points = data?.points ?? [];

  const chartData = points.map((p) => {
    const [, m] = p.month.split('-');
    return {
      label: MONTH_LABELS_SHORT[parseInt(m, 10) - 1],
      values: [p.income, p.expenses],
      lineValue: p.net,
    };
  });

  const totalIncome = points.reduce((sum, p) => sum + p.income, 0);
  const totalExpenses = points.reduce((sum, p) => sum + p.expenses, 0);
  const totalNet = totalIncome - totalExpenses;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Income & Expenses"
        onBack={() => router.back()}
        paddingTop={insets.top + 14}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ChartSkeleton height={220} />
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ overflow: 'visible' }}>
            <Card style={ss.card}>
              <BarChart
                data={chartData}
                colors={[colors.brandBright, colors.error]}
                height={220}
                showLine
                lineColor={colors.info}
              />
            </Card>
          </Animated.View>
        )}

        {/* Legend */}
        <View style={ss.legendRow}>
          <View style={ss.legendItem}>
            <View style={[ss.legendDot, { backgroundColor: colors.brandBright }]} />
            <Text style={[type_.caption, { color: colors.textMeta }]}>Income</Text>
          </View>
          <View style={ss.legendItem}>
            <View style={[ss.legendDot, { backgroundColor: colors.error }]} />
            <Text style={[type_.caption, { color: colors.textMeta }]}>Expenses</Text>
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
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Total Income</Text>
                </View>
                <AmountDisplay kobo={totalIncome} size="md" color={colors.brandBright} />
              </View>
              <View style={[ss.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={ss.summaryRow}>
                <View style={ss.summaryLabel}>
                  <View style={[ss.legendDot, { backgroundColor: colors.error }]} />
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Total Expenses</Text>
                </View>
                <AmountDisplay kobo={totalExpenses} size="md" color={colors.error} />
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
