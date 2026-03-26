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
import React, { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHandler, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { useBillsFlow } from './_layout';
import { formatNaira } from '@/utils/money';
import { SummaryRow, ss } from './_components';

export default function ReceiptScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  function handleDone() {
    flow.resetAll();
    router.dismissAll();
  }

  // On Android, route hardware back to handleDone so the user lands on
  // categories (not the now-stale checkout/processing screens behind receipt).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        flow.resetAll();
        router.dismissAll();
        return true;
      });
      return () => sub.remove();
      // flow and router are stable references.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const payResult = flow.payResult;
  if (!payResult) return null;

  return (
    <View style={[ss.screenFlex, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      {/* Receipt header — no back arrow */}
      <View
        style={[
          ss.detailHeaderWrap,
          { backgroundColor: colors.cardBg, borderBottomColor: colors.border },
        ]}
      >
        <View style={[ss.detailHeaderRow, { paddingTop: insets.top + spacing.sm }]}>
          <View style={ss.backBtn} />
          <Text style={[ss.detailTitle, { color: colors.textPrimary }]}>Payment Successful</Text>
          <View style={ss.backBtn} />
        </View>
      </View>

      <ScrollView contentContainerStyle={ss.formContent}>
        {/* Status icon */}
        <View style={ss.receiptIconWrap}>
          <View style={[ss.receiptCheckCircle, { backgroundColor: colors.brand }]}>
            <Ionicons name="checkmark" size={32} color={colors.white} />
          </View>
        </View>

        <Text style={[ss.receiptStatusLbl, { color: colors.brand }]}>PAYMENT SUCCESSFUL</Text>
        <Text style={[ss.receiptAmount, { color: colors.textPrimary }]}>
          {payResult.amount != null ? formatNaira(Math.abs(payResult.amount)) : '\u2014'}
        </Text>
        <Text style={[ss.receiptNarration, { color: colors.textMeta }]}>
          {payResult.narration ?? ''}
        </Text>

        <View
          style={[
            ss.receiptCard,
            { backgroundColor: colors.cardBg, borderColor: colors.border },
          ]}
        >
          <Text style={[ss.summaryGroupLabel, { color: colors.textSecondary }]}>
            Payment Details
          </Text>
          <View style={[ss.confirmDivider, { backgroundColor: colors.separator }]} />
          <SummaryRow label="Reference" value={payResult.ref} />
          <SummaryRow label="Status" value="COMPLETED" bold />
          {payResult.date ? (
            <SummaryRow
              label="Date"
              value={new Date(payResult.date).toLocaleString('en-NG', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
          ) : null}
        </View>

        <TouchableOpacity
          style={[ss.limeBtn, { backgroundColor: colors.lime }]}
          onPress={handleDone}
          activeOpacity={0.85}
        >
          <Text style={[ss.limeBtnText, { color: colors.darkGreen }]}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
