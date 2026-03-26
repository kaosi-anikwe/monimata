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
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, AppState, BackHandler, Text, View } from 'react-native';

import { ss } from './_components';
import { useTheme } from '@/lib/theme';
import { useBillsFlow } from './_layout';
import { useToast } from '@/components/Toast';
import { subscribeBillPaymentUpdate } from '@/hooks/useJobEvents';
import { useVerifyBill, usePaymentStatus } from '@/hooks/useBills';

export default function ProcessingScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();
  const { error } = useToast();

  const pendingRef = flow.pendingRef ?? '';
  const verifyMutation = useVerifyBill();
  const { data: status, refetch } = usePaymentStatus(pendingRef);

  // Block the Android hardware back button while payment is in-flight.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  // Trigger Phase 3 dispatch on mount.
  useEffect(() => {
    verifyMutation.mutate(pendingRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRef]);

  // Refetch immediately when the app returns to the foreground — the payment
  // may have completed while timers and the WS were suspended in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  // Subscribe to WS bill_payment_update so we react immediately instead of
  // waiting for the next poll tick.
  useEffect(() => {
    const unsub = subscribeBillPaymentUpdate(pendingRef, (wsState) => {
      if (wsState === 'FAILED' || wsState === 'REFUNDED') {
        // We know the outcome immediately — no need to wait for a refetch.
        error('Payment Failed', 'Your payment could not be completed. Please try again.');
        router.back();
        return;
      }
      // For COMPLETED we still refetch to get the full PaymentStatusResponse
      // (amount, narration, date) needed by the receipt screen.
      refetch();
    });
    return unsub;
  }, [pendingRef, refetch, error, router]);

  // Watch for terminal states from polling or WS-triggered refetch.
  // flow, router, and error are stable references; status.state drives the logic.
  useEffect(() => {
    if (!status) return;
    if (status.state === 'COMPLETED') {
      flow.setPayResult(status);
      router.replace('/bills/receipt');
    } else if (status.state === 'FAILED' || status.state === 'REFUNDED') {
      error('Payment Failed', 'Your payment could not be completed. Please try again.');
      router.back(); // returns to confirm (checkout was replaced by this screen)
    }
  }, [status, status?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View
      style={[
        ss.screenFlex,
        { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
      ]}
    >
      <StatusBar style="dark" />
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={[ss.processingText, { color: colors.textSecondary }]}>
        Processing your payment&hellip;{'\n'}Please wait.
      </Text>
    </View>
  );
}
