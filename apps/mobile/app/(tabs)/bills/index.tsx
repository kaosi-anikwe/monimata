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

import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useBillsFlow } from './_layout';
import { layout, spacing } from '@/lib/tokens';
import type { BillerCategory } from '@/types/bills';
import { useBillCategories, useBillHistory } from '@/hooks/useBills';
import { CategoryCard, CategoriesHeader, HistoryRow, HistoryView, ss } from './_components';

export default function CategoriesScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [showHistory, setShowHistory] = useState(false);

  const { data: categories = [], isLoading: loadingCategories } = useBillCategories();
  const { data: history = [] } = useBillHistory();
  const recentHistory = history.slice(0, 3);

  const bottomPad = layout.tabBarHeight + Math.max(insets.bottom, 4) + spacing.lg;

  function selectCategory(cat: BillerCategory) {
    // Reset downstream state when a new flow starts.
    flow.setSelectedCategory(cat);
    flow.setSelectedBiller(null);
    flow.setSelectedItem(null);
    flow.resetForm();
    router.push('/bills/billers');
  }

  return (
    <View style={[ss.screenFlex, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <CategoriesHeader
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((v) => !v)}
      />

      {showHistory ? (
        <HistoryView />
      ) : loadingCategories ? (
        <ActivityIndicator style={ss.loader} color={colors.brand} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }}>
          <View style={ss.sectionLabelRow}>
            <Text style={[ss.sectionLabel, { color: colors.textSecondary }]}>
              All Categories
            </Text>
          </View>

          {categories.length === 0 ? (
            <View style={ss.emptyContainer}>
              <Text style={[ss.emptyTitle, { color: colors.textSecondary }]}>
                No categories found
              </Text>
            </View>
          ) : (
            <View style={ss.categoryGrid}>
              {categories.map((item) => (
                <CategoryCard
                  key={item.id}
                  item={item}
                  onPress={() => selectCategory(item)}
                />
              ))}
            </View>
          )}

          {recentHistory.length > 0 && (
            <View style={ss.recentSection}>
              <Text style={[ss.sectionLabel, { color: colors.textSecondary }]}>
                Recent Payments
              </Text>
              <View
                style={[
                  ss.recentCard,
                  { backgroundColor: colors.cardBg, borderColor: colors.border },
                ]}
              >
                {recentHistory.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 && (
                      <View style={[ss.separator, { backgroundColor: colors.separator }]} />
                    )}
                    <HistoryRow item={item} />
                  </View>
                ))}
              </View>

              {history.length > 3 && (
                <TouchableOpacity
                  style={ss.viewAllBtn}
                  onPress={() => setShowHistory(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[ss.viewAllTxt, { color: colors.brand }]}>
                    View all {history.length} payments →
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
