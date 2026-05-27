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
 * Screen 3 — Spending Breakdown.
 * Donut chart + category list for a given month.
 */

import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DonutChart,
  ListSkeleton,
  MonthPicker,
  StatCardSkeleton,
} from '@/components/reports';
import { AmountDisplay, ListRow, ScreenHeader } from '@/components/ui';
import { useSpendingByCategory } from '@/hooks/useReports';
import { useReportAccountFilter } from '@/hooks/useReportAccountFilter';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { formatMoney } from '@/lib/typography';

const DONUT_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4',
  '#E91E63', '#8BC34A', '#3F51B5', '#FF5722', '#607D8B',
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SpendingBreakdownScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth);
  const accountIds = useReportAccountFilter();

  const { data, isLoading } = useSpendingByCategory(month, accountIds);

  const categories = data?.categories ?? [];
  const totalSpent = data?.total_spent ?? 0;

  const segments = categories.map((cat, i) => ({
    label: cat.category_name,
    value: cat.total_spent,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Spending Breakdown"
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
            <ListSkeleton rows={5} />
          </>
        ) : (
          <>
            {/* Donut Chart */}
            <Animated.View entering={FadeIn.duration(400)} style={ss.chartWrap}>
              <DonutChart
                segments={segments}
                centreLabel={formatMoney(totalSpent, { decimals: 0 })}
                size={200}
              />
            </Animated.View>

            {/* Category List */}
            <View style={[ss.listContainer, { backgroundColor: colors.cardBg }]}>
              {categories.map((cat, i) => (
                <Animated.View key={cat.category_id} entering={FadeInUp.delay(i * 80).duration(300).easing(Easing.out(Easing.cubic))}>
                  <ListRow
                    leftIcon={
                      <View style={[ss.colorDot, { backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }]} />
                    }
                    iconBg="transparent"
                    title={cat.category_name}
                    subtitle={`${(cat.percentage ?? 0).toFixed(0)}% · ${cat.transaction_count} txns · avg ${formatMoney(cat.avg_transaction, { decimals: 0 })}`}
                    right={<AmountDisplay kobo={cat.total_spent} size="xs" />}
                    showChevron
                    onPress={() =>
                      router.push({
                        pathname: '/(reports)/category-detail',
                        params: { categoryId: cat.category_id, categoryName: cat.category_name },
                      })
                    }
                    separator={i < categories.length - 1}
                  />
                </Animated.View>
              ))}
            </View>
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
  chartWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  listContainer: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
