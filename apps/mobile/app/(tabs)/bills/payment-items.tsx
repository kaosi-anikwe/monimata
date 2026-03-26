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

import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useBillsFlow } from './_layout';
import type { PaymentItem } from '@/types/bills';
import { useBillPaymentItems } from '@/hooks/useBills';
import { formatNaira, koboToNaira } from '@/utils/money';
import { BillListRow, DetailHeader, ss } from './_components';

export default function PaymentItemsScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();

  const { data: paymentItems = [], isLoading } = useBillPaymentItems(
    flow.selectedBiller?.id ?? null,
  );

  // Auto-advance when only one option exists. Use router.replace so that the
  // user goes back to billers (not this screen) when pressing back.
  useEffect(() => {
    if (!isLoading && paymentItems.length === 1) {
      selectPaymentItem(paymentItems[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, paymentItems]);

  function selectPaymentItem(item: PaymentItem) {
    flow.setSelectedItem(item);
    if (item.is_amount_fixed && item.fixed_amount) {
      flow.setAmountNaira(String(koboToNaira(item.fixed_amount)));
    } else {
      flow.setAmountNaira('');
    }
    router.replace('/bills/customer-form');
  }

  return (
    <View style={[ss.screenFlex, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <DetailHeader
        title={flow.selectedBiller?.name ?? 'Select Plan'}
        step="payment_items"
        onBack={() => router.back()}
      />
      {isLoading ? (
        <ActivityIndicator style={ss.loader} color={colors.brand} />
      ) : (
        <FlatList
          data={paymentItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={ss.listContent}
          ItemSeparatorComponent={() => (
            <View style={[ss.separator, { backgroundColor: colors.separator }]} />
          )}
          ListEmptyComponent={
            <View style={ss.emptyContainer}>
              <Text style={[ss.emptyTitle, { color: colors.textSecondary }]}>
                No payment options found
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const subtitle =
              item.is_amount_fixed && item.fixed_amount
                ? formatNaira(item.fixed_amount)
                : 'Variable amount';
            return (
              <BillListRow
                icon="pricetag-outline"
                title={item.name}
                subtitle={subtitle}
                onPress={() => selectPaymentItem(item)}
              />
            );
          }}
        />
      )}
    </View>
  );
}
