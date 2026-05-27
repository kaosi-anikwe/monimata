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
 * Screen 5 — Top Merchants.
 * Ranked list of merchants by spending for a given month.
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
import Animated, { Easing, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListSkeleton, MonthPicker } from '@/components/reports';
import { AmountDisplay, ScreenHeader } from '@/components/ui';
import { useTopMerchants } from '@/hooks/useReports';
import { useReportAccountFilter } from '@/hooks/useReportAccountFilter';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { formatMoney, type_ } from '@/lib/typography';

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TopMerchantsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth);
  const accountIds = useReportAccountFilter();

  const { data, isLoading } = useTopMerchants(month, 10, accountIds);

  const merchants = data?.merchants ?? [];

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Top Merchants"
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
          <ListSkeleton rows={8} />
        ) : (
          <View style={[ss.listContainer, { backgroundColor: colors.cardBg }]}>
            {merchants.map((m, i) => {
              const isTop3 = i < 3;
              const lastDate = m.last_date
                ? new Date(m.last_date).toLocaleDateString('en-NG', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
                : null;
              return (
                <Animated.View
                  key={`${m.narration}-${i}`}
                  entering={FadeInRight.delay(i * 60).duration(300).easing(Easing.out(Easing.cubic))}
                  style={[
                    ss.row,
                    i < merchants.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      ss.rankBadge,
                      isTop3
                        ? { backgroundColor: RANK_COLORS[i] }
                        : { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        ss.rankText,
                        isTop3 ? { color: '#fff', fontWeight: '700' } : { color: colors.textMeta },
                      ]}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <View style={ss.textArea}>
                    <Text style={[type_.body, { color: colors.textPrimary }]} numberOfLines={1}>
                      {m.narration}
                    </Text>
                    <Text style={[type_.caption, { color: colors.textMeta }]}>
                      {m.category_name ?? 'Uncategorised'} · {m.transaction_count} txns · avg{' '}
                      {formatMoney(m.avg_transaction, { decimals: 0 })}
                    </Text>
                    {lastDate && (
                      <Text style={[type_.caption, { color: colors.textTertiary }]}>
                        Last: {lastDate}
                      </Text>
                    )}
                  </View>
                  <AmountDisplay kobo={m.total_spent} size="xs" />
                </Animated.View>
              );
            })}
          </View>
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
  listContainer: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    ...type_.caption,
    textAlign: 'center',
  },
  textArea: {
    flex: 1,
    gap: 2,
  },
});
