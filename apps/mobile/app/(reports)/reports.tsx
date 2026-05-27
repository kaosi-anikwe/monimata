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
 * Reports Home — Dashboard screen with summary cards.
 * Fires 3 parallel API calls: monthly-summary, age-of-money, account-balances.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CountUp,
  MonthPicker,
  PercentBadge,
  SnapshotSkeleton,
  StatCardSkeleton,
} from '@/components/reports';
import { ReportAccountFilterSheet } from '@/components/ReportAccountFilterSheet';
import {
  AmountDisplay,
  Card,
  ScreenHeader,
} from '@/components/ui';
import { useReportAccountFilter } from '@/hooks/useReportAccountFilter';
import {
  useAccountBalances,
  useAgeOfMoney,
  useMonthlySummary,
} from '@/hooks/useReports';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff, formatMoney, type_ } from '@/lib/typography';
import { useAppSelector } from '@/store/hooks';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function ageOfMoneyCopy(days: number): string {
  if (days < 14) return 'Your buffer is thin — try to save more before spending.';
  if (days <= 30) return "You're spending last month's money. Solid.";
  return `Your money sits ${days} days before you spend it. That's a healthy buffer.`;
}

export default function ReportsHomeScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth);
  const [filterVisible, setFilterVisible] = useState(false);
  const accountIds = useReportAccountFilter();
  const excluded = useAppSelector((st) => st.preferences.reportExcludedAccountIds);
  const hasFilter = excluded.length > 0;

  const summary = useMonthlySummary(month, 3, accountIds);
  const ageOfMoney = useAgeOfMoney(30, accountIds);
  const balances = useAccountBalances();

  const isRefreshing = summary.isRefetching || ageOfMoney.isRefetching || balances.isRefetching;

  const onRefresh = useCallback(() => {
    summary.refetch();
    ageOfMoney.refetch();
    balances.refetch();
  }, [summary, ageOfMoney, balances]);

  const s = summary.data;
  const a = ageOfMoney.data;
  const b = balances.data;

  // Top 3 accounts sorted by balance
  const topAccounts = b?.accounts
    ? [...b.accounts].sort((x, y) => y.balance - x.balance).slice(0, 3)
    : [];
  const moreAccounts = (b?.accounts?.length ?? 0) - 3;

  // Top categories
  const topCats = s?.top_categories ?? [];

  const cardEnter = useMemo(
    () => (index: number) =>
      FadeInUp.delay(index * 100)
        .duration(400)
        .easing(Easing.out(Easing.cubic)),
    [],
  );

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Reports"
        onBack={() => router.back()}
        paddingTop={insets.top + 14}
        rightSlot={
          <TouchableOpacity onPress={() => setFilterVisible(true)} hitSlop={10}>
            <Ionicons
              name={hasFilter ? 'funnel' : 'funnel-outline'}
              size={20}
              color={hasFilter ? colors.brand : colors.white}
            />
          </TouchableOpacity>
        }
      />

      <ReportAccountFilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
      />

      <MonthPicker selected={month} onSelect={setMonth} />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* ── Headline Card — Monthly Snapshot ───────────────────────── */}
        {summary.isLoading ? (
          <SnapshotSkeleton />
        ) : s ? (
          <Animated.View entering={cardEnter(0)} style={{ overflow: 'visible' }}>
            <Card style={ss.card} onPress={() => router.push('/(reports)/income-expenses')}>
              <Text style={[type_.h3, { color: colors.textPrimary }]}>
                {formatMonthLabel(month)}
              </Text>
              <View style={ss.spacerMd} />

              <View style={ss.statRow}>
                <Text style={[type_.body, { color: colors.textSecondary }]}>Income</Text>
                <View style={ss.statRight}>
                  <AmountDisplay kobo={s.total_income} size="md" />
                  <PercentBadge value={s.comparison?.income_change_pct} />
                </View>
              </View>
              <View style={ss.statRow}>
                <Text style={[type_.body, { color: colors.textSecondary }]}>Expenses</Text>
                <View style={ss.statRight}>
                  <AmountDisplay kobo={s.total_expenses} size="md" />
                  <PercentBadge value={s.comparison?.expense_change_pct} />
                </View>
              </View>

              <View style={[ss.divider, { backgroundColor: colors.border }]} />

              <View style={ss.statRow}>
                <Text style={[type_.body, { color: colors.textSecondary }]}>Saved</Text>
                <View style={ss.statRight}>
                  <AmountDisplay kobo={s.net_savings} size="md" colorize />
                  <PercentBadge value={s.comparison?.savings_change_pct} />
                </View>
              </View>

              <View style={ss.spacerSm} />
              <Text style={[type_.small, { color: colors.textMeta }]}>
                Savings Rate {(s.savings_rate ?? 0).toFixed(1)}%
              </Text>
              <View style={ss.spacerXs} />
              <Text style={[type_.small, { color: colors.textMeta }]}>
                Avg daily spend {formatMoney(s.avg_daily_expense ?? 0, { decimals: 0 })}
                {'  ·  '}
                {(s.credit_count ?? 0) + (s.debit_count ?? 0)} transactions
              </Text>
            </Card>
          </Animated.View>
        ) : null}

        {/* ── Age of Money ───────────────────────────────────────────── */}
        {ageOfMoney.isLoading ? (
          <StatCardSkeleton />
        ) : a ? (
          <Animated.View entering={cardEnter(1)} style={{ overflow: 'visible' }}>
            <Card style={ss.card}>
              <View style={ss.cardTitleRow}>
                <Ionicons name="time-outline" size={16} color={colors.textMeta} />
                <Text style={[type_.caption, { color: colors.textMeta }]}>Age of Money</Text>
              </View>
              <View style={ss.spacerMd} />
              <CountUp
                value={a.age_days}
                formatter={(v) => `${v} days`}
                style={[type_.displayMd, { color: colors.textPrimary }]}
                duration={700}
              />
              {a.trend != null && (
                <View style={ss.trendRow}>
                  <PercentBadge value={null} />
                  <Text style={[type_.small, { color: a.trend >= 0 ? colors.success : colors.error }]}>
                    {a.trend >= 0 ? '+' : ''}{a.trend} days
                  </Text>
                </View>
              )}
              <View style={ss.spacerSm} />
              <Text style={[type_.small, { color: colors.textMeta }]}>
                {ageOfMoneyCopy(a.age_days)}
              </Text>
            </Card>
          </Animated.View>
        ) : null}

        {/* ── Net Worth ──────────────────────────────────────────────── */}
        {balances.isLoading ? (
          <StatCardSkeleton />
        ) : b ? (
          <Animated.View entering={cardEnter(2)} style={{ overflow: 'visible' }}>
            <Card style={ss.card} onPress={() => router.push('/(reports)/net-worth')}>
              <View style={ss.statRow}>
                <View style={ss.cardTitleRow}>
                  <Ionicons name="wallet-outline" size={16} color={colors.textMeta} />
                  <Text style={[type_.caption, { color: colors.textMeta }]}>Net Worth</Text>
                </View>
                <AmountDisplay kobo={b.total_balance} size="md" />
              </View>
              <View style={ss.spacerSm} />
              {topAccounts.map((acc) => (
                <View key={acc.account_id} style={ss.accountRow}>
                  <Text style={[type_.small, { color: colors.textSecondary }]}>
                    {acc.institution}
                  </Text>
                  <AmountDisplay kobo={acc.balance} size="xs" />
                </View>
              ))}
              {moreAccounts > 0 && (
                <Text style={[type_.caption, { color: colors.brand, textAlign: 'right', marginTop: spacing.xxs }]}>
                  +{moreAccounts} more → View all
                </Text>
              )}
            </Card>
          </Animated.View>
        ) : null}

        {/* ── Top Categories ─────────────────────────────────────────── */}
        {s && topCats.length > 0 && (
          <Animated.View entering={cardEnter(3)} style={{ overflow: 'visible' }}>
            <Card style={ss.card} onPress={() => router.push('/(reports)/spending-breakdown')}>
              <View style={ss.cardTitleRow}>
                <Ionicons name="pie-chart-outline" size={16} color={colors.textMeta} />
                <Text style={[type_.caption, { color: colors.textMeta }]}>Where your money went</Text>
              </View>
              <View style={ss.spacerMd} />
              {topCats.map((cat, i) => {
                const pct = cat.percentage ?? 0;
                return (
                  <View key={cat.category_id ?? i} style={ss.catRow}>
                    <View style={[ss.catBar, { width: `${Math.min(pct, 100)}%`, backgroundColor: colors.brand }]} />
                    <View style={ss.catLabelRow}>
                      <Text style={[type_.small, { color: colors.textPrimary }]}>
                        {cat.category_name}
                      </Text>
                      <Text style={[type_.caption, { color: colors.textMeta }]}>
                        {pct.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                );
              })}
              <Text style={[type_.caption, { color: colors.brand, textAlign: 'right', marginTop: spacing.xs }]}>
                → See all
              </Text>
            </Card>
          </Animated.View>
        )}

        {/* ── Cash Flow ────────────────────────────────────────────── */}
        <Animated.View entering={cardEnter(4)} style={{ overflow: 'visible' }}>
          <Card style={ss.card} onPress={() => router.push('/(reports)/cash-flow')}>
            <View style={ss.statRow}>
              <View style={ss.cardTitleRow}>
                <Ionicons name="swap-vertical-outline" size={16} color={colors.textPrimary} />
                <Text style={[type_.body, { color: colors.textPrimary }]}>Cash Flow</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
            <Text style={[type_.small, { color: colors.textMeta }]}>
              Inflows vs outflows over time
            </Text>
          </Card>
        </Animated.View>

        {/* ── Budget Performance ──────────────────────────────────────── */}
        <Animated.View entering={cardEnter(5)} style={{ overflow: 'visible' }}>
          <Card style={ss.card} onPress={() => router.push('/(reports)/budget-performance')}>
            <View style={ss.statRow}>
              <View style={ss.cardTitleRow}>
                <Ionicons name="bar-chart-outline" size={16} color={colors.textPrimary} />
                <Text style={[type_.body, { color: colors.textPrimary }]}>Budget Performance</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
            <Text style={[type_.small, { color: colors.textMeta }]}>
              How well you stuck to your plan
            </Text>
          </Card>
        </Animated.View>

        {/* ── Top Merchants ──────────────────────────────────────────── */}
        <Animated.View entering={cardEnter(6)} style={{ overflow: 'visible' }}>
          <Card style={ss.card} onPress={() => router.push('/(reports)/top-merchants')}>
            <View style={ss.statRow}>
              <View style={ss.cardTitleRow}>
                <Ionicons name="storefront-outline" size={16} color={colors.textPrimary} />
                <Text style={[type_.body, { color: colors.textPrimary }]}>Top Merchants</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
            <Text style={[type_.small, { color: colors.textMeta }]}>
              Where you spend the most
            </Text>
          </Card>
        </Animated.View>

        {/* ── Recurring Commitments (mini) ───────────────────────────── */}
        <Animated.View entering={cardEnter(7)} style={{ overflow: 'visible' }}>
          <Card style={ss.card} onPress={() => router.push('/(reports)/recurring')}>
            <View style={ss.statRow}>
              <View style={ss.cardTitleRow}>
                <Ionicons name="repeat-outline" size={16} color={colors.textPrimary} />
                <Text style={[type_.body, { color: colors.textPrimary }]}>Recurring</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
            <Text style={[type_.small, { color: colors.textMeta }]}>
              See your fixed monthly obligations
            </Text>
          </Card>
        </Animated.View>

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
  spacerXs: { height: spacing.xxs },
  spacerSm: { height: spacing.xs },
  spacerMd: { height: spacing.md },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  statRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  catRow: {
    marginBottom: spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  catBar: {
    height: 6,
    borderRadius: radius.xxs,
    marginBottom: 4,
  },
  catLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
