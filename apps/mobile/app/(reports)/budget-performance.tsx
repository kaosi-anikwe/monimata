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
 * Screen 6 — Budget Performance.
 * Overall budget utilization + per-category progress bars.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BudgetRowSkeleton,
  MonthPicker,
  StatCardSkeleton,
} from '@/components/reports';
import {
  AmountDisplay,
  Card,
  EmptyState,
  ProgressBar,
  ScreenHeader,
} from '@/components/ui';
import { useBudgetPerformance } from '@/hooks/useReports';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { formatMoney, type_ } from '@/lib/typography';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function utilizationState(pct: number): 'ok' | 'warn' | 'over' {
  if (pct > 100) return 'over';
  if (pct > 80) return 'warn';
  return 'ok';
}

function formatPct(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(abs / 1000).toFixed(0)}k%`;
  return `${abs.toFixed(0)}%`;
}

export default function BudgetPerformanceScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth);

  const { data, isLoading } = useBudgetPerformance(month);

  const categories = data?.categories ?? [];
  const sorted = [...categories].sort(
    (a, b) => (b.utilization_pct ?? 0) - (a.utilization_pct ?? 0),
  );

  const [, m] = month.split('-');
  const monthLabel = `${MONTH_NAMES[parseInt(m, 10) - 1]}`;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Budget Performance"
        onBack={() => router.back()}
        paddingTop={insets.top + 14}
      />

      <MonthPicker selected={month} onSelect={setMonth} />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <>
            <StatCardSkeleton />
            {Array.from({ length: 4 }).map((_, i) => (
              <BudgetRowSkeleton key={i} />
            ))}
          </>
        ) : !data || categories.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="pie-chart-outline" size={32} color={colors.textMeta} />}
            title="No budget data"
            body="Set up your budget to track progress here."
          />
        ) : (
          <>
            {/* Overall Summary */}
            <Animated.View entering={FadeInUp.duration(400).easing(Easing.out(Easing.cubic))} style={{ overflow: 'visible' }}>
              <Card style={ss.card}>
                <Text style={[type_.h3, { color: colors.textPrimary }]}>
                  Budget Overview — {monthLabel}
                </Text>
                <View style={ss.spacerMd} />

                <View style={ss.summaryRow}>
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Assigned</Text>
                  <AmountDisplay kobo={data.total_assigned} size="xs" />
                </View>
                <View style={ss.summaryRow}>
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Spent</Text>
                  <AmountDisplay kobo={data.total_spent} size="xs" />
                </View>
                <View style={ss.summaryRow}>
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Available</Text>
                  <AmountDisplay kobo={data.total_available} size="xs" colorize />
                </View>

                <View style={ss.spacerSm} />
                <ProgressBar
                  progress={Math.min((data.overall_utilization_pct ?? 0) / 100, 1)}
                  state={utilizationState(data.overall_utilization_pct ?? 0)}
                  size="lg"
                  animate
                />
                <Text style={[type_.caption, { color: colors.textMeta, textAlign: 'right', marginTop: spacing.xxs }]}>
                  {formatPct(data.overall_utilization_pct ?? 0)}
                </Text>
              </Card>
            </Animated.View>

            {/* Per-Category */}
            {sorted.map((cat, i) => {
              const pct = cat.utilization_pct ?? 0;
              const state = utilizationState(pct);
              const available = cat.available ?? 0;
              const isOver = pct > 100;

              return (
                <Animated.View key={cat.category_id} entering={FadeInUp.delay((i + 1) * 80).duration(300).easing(Easing.out(Easing.cubic))} style={ss.catRow}>
                  <View style={ss.catHeader}>
                    <Text style={[type_.body, { color: colors.textPrimary }]} numberOfLines={1}>
                      {cat.category_name}
                    </Text>
                    {isOver && <Ionicons name="warning-outline" size={14} color={colors.warning} />}
                  </View>

                  <Text style={[type_.caption, { color: colors.textMeta }]}>
                    {formatMoney(cat.spent, { decimals: 0 })} / {formatMoney(cat.assigned, { decimals: 0 })} assigned{'  '}
                    {formatPct(pct)}
                  </Text>

                  <ProgressBar
                    progress={Math.min(pct / 100, 1.3)}
                    state={state}
                    size="md"
                    animate
                    style={{ marginTop: spacing.xxs }}
                  />

                  <Text
                    style={[
                      type_.caption,
                      {
                        color: isOver ? colors.error : colors.textMeta,
                        marginTop: 2,
                      },
                    ]}
                  >
                    {isOver ? '-' : ''}{formatMoney(Math.abs(available), { decimals: 0 })}
                    {isOver ? ' over' : ' left'}
                  </Text>
                </Animated.View>
              );
            })}
          </>
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
  spacerSm: { height: spacing.xs },
  spacerMd: { height: spacing.md },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  catRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
});
