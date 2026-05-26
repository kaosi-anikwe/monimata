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
 * Screen 4 — Category Detail.
 * Sparkline bar chart + month-by-month breakdown for a single category.
 */

import { router, useLocalSearchParams } from 'expo-router';
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

import { BarChart, ChartSkeleton, ListSkeleton } from '@/components/reports';
import { AmountDisplay, Card, ScreenHeader } from '@/components/ui';
import { useCategoryTrend } from '@/hooks/useReports';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

const MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function CategoryDetailScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { categoryId, categoryName } = useLocalSearchParams<{
    categoryId: string;
    categoryName: string;
  }>();

  const { data, isLoading } = useCategoryTrend(categoryId ?? '');

  const points = data?.points ?? [];

  const chartData = points.map((p) => {
    const [, m] = p.month.split('-');
    return {
      label: MONTH_LABELS_SHORT[parseInt(m, 10) - 1],
      values: [p.spent],
    };
  });

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title={categoryName ?? 'Category'}
        onBack={() => router.back()}
        paddingTop={insets.top + 14}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <>
            <ChartSkeleton height={180} />
            <ListSkeleton rows={4} />
          </>
        ) : (
          <>
            <Animated.View entering={FadeIn.duration(400)} style={{ overflow: 'visible' }}>
              <Card style={ss.card}>
                <BarChart
                  data={chartData}
                  colors={[colors.brand]}
                  height={180}
                />
              </Card>
            </Animated.View>

            {/* Month-by-month list */}
            <View style={ss.listSection}>
              {[...points].reverse().map((p, i) => {
                const [y, m] = p.month.split('-');
                const label = `${MONTH_LABELS_SHORT[parseInt(m, 10) - 1]} ${y}`;
                return (
                  <Animated.View key={p.month} entering={FadeInUp.delay(i * 60).duration(300).easing(Easing.out(Easing.cubic))} style={ss.monthRow}>
                    <Text style={[type_.body, { color: colors.textPrimary }]}>
                      {label}
                    </Text>
                    <View style={ss.monthRight}>
                      <AmountDisplay kobo={p.spent} size="xs" />
                      <Text style={[type_.caption, { color: colors.textMeta }]}>
                        {p.transaction_count} txns
                      </Text>
                    </View>
                  </Animated.View>
                );
              })}
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
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  listSection: {
    paddingHorizontal: spacing.lg,
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  monthRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
});
