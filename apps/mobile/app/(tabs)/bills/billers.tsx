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

import React from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useBillsFlow } from './_layout';
import type { Biller } from '@/types/bills';
import { useBillers } from '@/hooks/useBills';
import { BillListRow, DetailHeader, ss } from './_components';

export default function BillersScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();

  const { data: billers = [], isLoading } = useBillers(flow.selectedCategory?.id ?? null);

  function selectBiller(biller: Biller) {
    flow.setSelectedBiller(biller);
    flow.setSelectedItem(null);
    flow.resetForm();
    router.push('/bills/payment-items');
  }

  return (
    <View style={[ss.screenFlex, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <DetailHeader
        title={flow.selectedCategory?.name ?? 'Select Biller'}
        step="billers"
        onBack={() => router.back()}
      />
      {isLoading ? (
        <ActivityIndicator style={ss.loader} color={colors.brand} />
      ) : (
        <FlatList
          data={billers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={ss.listContent}
          ItemSeparatorComponent={() => (
            <View style={[ss.separator, { backgroundColor: colors.separator }]} />
          )}
          ListEmptyComponent={
            <View style={ss.emptyContainer}>
              <Text style={[ss.emptyTitle, { color: colors.textSecondary }]}>
                No billers in this category
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <BillListRow
              icon="business-outline"
              title={item.name}
              subtitle={item.short_name ?? undefined}
              onPress={() => selectBiller(item)}
            />
          )}
        />
      )}
    </View>
  );
}
