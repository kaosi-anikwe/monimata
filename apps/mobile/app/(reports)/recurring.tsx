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
 * Screen 9 — Recurring Commitments.
 * Summary + grouped list of outflows and inflows.
 */

import { Ionicons } from '@expo/vector-icons';
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

import { ListSkeleton, StatCardSkeleton } from '@/components/reports';
import { AmountDisplay, Card, EmptyState, ScreenHeader, SectionHeader } from '@/components/ui';
import { useRecurringCommitments } from '@/hooks/useReports';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

export default function RecurringScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useRecurringCommitments();

  const commitments = data?.commitments ?? [];
  const outflows = commitments.filter((c) => c.type === 'debit');
  const inflows = commitments.filter((c) => c.type === 'credit');

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Recurring Commitments"
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
            <StatCardSkeleton />
            <ListSkeleton rows={5} />
          </>
        ) : commitments.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="repeat-outline" size={32} color={colors.textMeta} />}
            title="No recurring commitments"
            body="Your fixed monthly obligations will appear here."
          />
        ) : (
          <>
            {/* Summary Card */}
            <Animated.View entering={FadeIn.duration(400)} style={{ overflow: 'visible' }}>
              <Card style={ss.card}>
                <Text style={[type_.h3, { color: colors.textPrimary }]}>
                  Monthly Recurring
                </Text>
                <View style={ss.spacerMd} />
                <View style={ss.summaryRow}>
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Outflows</Text>
                  <AmountDisplay kobo={data?.total_monthly_outflow ?? 0} size="xs" color={colors.error} />
                </View>
                <View style={ss.summaryRow}>
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Inflows</Text>
                  <AmountDisplay kobo={data?.total_monthly_inflow ?? 0} size="xs" color={colors.brandBright} />
                </View>
                <View style={[ss.divider, { backgroundColor: colors.border }]} />
                <View style={ss.summaryRow}>
                  <Text style={[type_.body, { color: colors.textSecondary }]}>Net</Text>
                  <AmountDisplay
                    kobo={(data?.total_monthly_inflow ?? 0) - (data?.total_monthly_outflow ?? 0)}
                    size="xs"
                    colorize
                  />
                </View>
                <Text style={[type_.caption, { color: colors.textMeta, marginTop: spacing.xxs }]}>
                  {data?.active_count ?? 0} active rules
                </Text>
              </Card>
            </Animated.View>

            {/* Outflows */}
            {outflows.length > 0 && (
              <>
                <SectionHeader
                  title="Outflows"
                  variant="group"
                  paddingHorizontal={spacing.lg}
                  style={{ marginTop: spacing.sm, marginBottom: spacing.xxs }}
                />
                <View style={[ss.listContainer, { backgroundColor: colors.cardBg }]}>
                  {outflows.map((c, i) => (
                    <Animated.View
                      key={c.rule_id ?? i}
                      entering={FadeInUp.delay(i * 80).duration(300).easing(Easing.out(Easing.cubic))}
                      style={[
                        ss.commitRow,
                        { borderLeftColor: colors.error },
                        i < outflows.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={ss.commitInfo}>
                        <Text style={[type_.body, { color: colors.textPrimary }]} numberOfLines={1}>
                          {c.narration}
                        </Text>
                        <Text style={[type_.caption, { color: colors.textMeta }]}>
                          {c.category_name ?? 'Uncategorised'} · {c.account_name ?? ''}
                          {c.next_due ? ` · Due: ${formatDate(c.next_due)}` : ''}
                        </Text>
                      </View>
                      <View style={ss.commitRight}>
                        <AmountDisplay kobo={c.amount} size="xs" />
                        <Text style={[type_.caption, { color: colors.textTertiary }]}>
                          {c.frequency}
                        </Text>
                      </View>
                    </Animated.View>
                  ))}
                </View>
              </>
            )}

            {/* Inflows */}
            {inflows.length > 0 && (
              <>
                <SectionHeader
                  title="Inflows"
                  variant="group"
                  paddingHorizontal={spacing.lg}
                  style={{ marginTop: spacing.md, marginBottom: spacing.xxs }}
                />
                <View style={[ss.listContainer, { backgroundColor: colors.cardBg }]}>
                  {inflows.map((c, i) => (
                    <Animated.View
                      key={c.rule_id ?? i}
                      entering={FadeInUp.delay(i * 80).duration(300).easing(Easing.out(Easing.cubic))}
                      style={[
                        ss.commitRow,
                        { borderLeftColor: colors.brandBright },
                        i < inflows.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={ss.commitInfo}>
                        <Text style={[type_.body, { color: colors.textPrimary }]} numberOfLines={1}>
                          {c.narration}
                        </Text>
                        <Text style={[type_.caption, { color: colors.textMeta }]}>
                          {c.category_name ?? 'Income'} · {c.account_name ?? ''}
                          {c.next_due ? ` · Due: ${formatDate(c.next_due)}` : ''}
                        </Text>
                      </View>
                      <View style={ss.commitRight}>
                        <AmountDisplay kobo={c.amount} size="xs" />
                        <Text style={[type_.caption, { color: colors.textTertiary }]}>
                          {c.frequency}
                        </Text>
                      </View>
                    </Animated.View>
                  ))}
                </View>
              </>
            )}
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
  spacerMd: { height: spacing.md },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  listContainer: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  commitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
  },
  commitInfo: {
    flex: 1,
    gap: 2,
  },
  commitRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
});
