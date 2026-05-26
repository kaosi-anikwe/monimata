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
 * Screen 8 — Net Worth & Accounts.
 * Hero total balance + per-account balance cards.
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
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListSkeleton, StatCardSkeleton } from '@/components/reports';
import { AmountDisplay, Card, ScreenHeader } from '@/components/ui';
import { useAccountBalances } from '@/hooks/useReports';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

export default function NetWorthScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useAccountBalances();

  const accounts = data?.accounts
    ? [...data.accounts].sort((a, b) => b.balance - a.balance)
    : [];

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Net Worth & Accounts"
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
            <ListSkeleton rows={4} />
          </>
        ) : (
          <>
            {/* Hero */}
            <Animated.View entering={FadeInUp.duration(400).easing(Easing.out(Easing.cubic))} style={ss.heroWrap}>
              <Text style={[type_.caption, { color: colors.textMeta }]}>Total Balance</Text>
              <AmountDisplay kobo={data?.total_balance ?? 0} size="display" />
            </Animated.View>

            {/* Account cards */}
            {accounts.map((acc, i) => (
              <Animated.View key={acc.account_id} entering={FadeInUp.delay((i + 1) * 100).duration(400).easing(Easing.out(Easing.cubic))} style={{ overflow: 'visible' }}>
                <Card style={ss.card}>
                  <View style={ss.accRow}>
                    <View style={ss.accInfo}>
                      <Text style={[type_.body, { color: colors.textPrimary }]}>
                        <Ionicons name="business-outline" size={16} color={colors.textPrimary} />{' '}
                        {acc.institution}
                      </Text>
                      <Text style={[type_.caption, { color: colors.textMeta }]}>
                        {acc.account_type ?? 'Account'} · {acc.currency ?? 'NGN'}
                      </Text>
                      {acc.alias ? (
                        <Text style={[type_.caption, { color: colors.textTertiary }]}>
                          {acc.alias}
                        </Text>
                      ) : null}
                    </View>
                    <AmountDisplay kobo={acc.balance} size="md" />
                  </View>
                </Card>
              </Animated.View>
            ))}
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
  heroWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
  },
  accRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accInfo: {
    flex: 1,
    gap: 2,
  },
});
