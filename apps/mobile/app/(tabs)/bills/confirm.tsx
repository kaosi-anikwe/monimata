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
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/lib/theme';
import { useBillsFlow } from './_layout';
import { usePayBill } from '@/hooks/useBills';
import { useToast } from '@/components/Toast';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategoryGroups } from '@/hooks/useCategories';
import { DetailHeader, SummaryRow, ss } from './_components';
import { formatNaira, nairaStringToKobo } from '@/utils/money';

export default function ConfirmScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();

  const { data: accounts = [] } = useAccounts();
  const { data: categoryGroups = [] } = useCategoryGroups();
  const payMutation = usePayBill();
  const { error } = useToast();

  const isPaying = payMutation.isPending;
  const selectedAccount = accounts.find((a) => a.id === flow.selectedAccountId) ?? null;

  function buildDisplayAmount(): string {
    if (!flow.selectedItem) return '\u2014';
    if (flow.validationResult?.is_amount_fixed && flow.validationResult.fixed_amount) {
      return formatNaira(flow.validationResult.fixed_amount);
    }
    if (flow.selectedItem.is_amount_fixed && flow.selectedItem.fixed_amount) {
      return formatNaira(flow.selectedItem.fixed_amount);
    }
    const kobo = nairaStringToKobo(flow.amountNaira);
    return kobo > 0 ? formatNaira(kobo) : '\u2014';
  }

  function handlePay() {
    if (!flow.selectedItem || !flow.validationResult || !flow.selectedAccountId) return;

    const amountKobo =
      flow.validationResult.is_amount_fixed && flow.validationResult.fixed_amount
        ? flow.validationResult.fixed_amount
        : nairaStringToKobo(flow.amountNaira);

    if (amountKobo < 100) {
      error('Invalid Amount', 'Amount must be at least \u20a61.00.');
      return;
    }

    payMutation.mutate(
      {
        payment_code: flow.selectedItem.payment_code,
        customer_id: flow.customerId.trim(),
        amount: amountKobo,
        account_id: flow.selectedAccountId,
        biller_name: flow.selectedBiller?.name ?? undefined,
        ...(flow.selectedBudgetCategoryId ? { category_id: flow.selectedBudgetCategoryId } : {}),
      },
      {
        onSuccess: (result) => {
          flow.setCheckoutUrl(result.checkout_url);
          flow.setPendingRef(result.ref);
          flow.setWebViewLoading(true);
          router.push('/bills/checkout');
        },
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            'Payment failed. Please try again.';
          error('Payment Failed', message);
        },
      },
    );
  }

  return (
    <View style={[ss.screenFlex, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <DetailHeader title="Confirm Payment" step="confirm" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={ss.formContent}>
        <View
          style={[ss.confirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[ss.summaryGroupLabel, { color: colors.textSecondary }]}>
            Payment Summary
          </Text>
          <View style={[ss.confirmDivider, { backgroundColor: colors.separator }]} />

          <SummaryRow label="Biller" value={flow.selectedBiller?.name ?? '\u2014'} />
          <SummaryRow label="Plan" value={flow.selectedItem?.name ?? '\u2014'} />
          <SummaryRow
            label="Customer"
            value={flow.validationResult?.customer_name ?? flow.customerId}
          />
          <SummaryRow label="Customer ID" value={flow.customerId} />
          <SummaryRow
            label="Budget category"
            value={
              flow.selectedBudgetCategoryId
                ? (categoryGroups
                  .flatMap((g) => g.categories)
                  .find((c) => c.id === flow.selectedBudgetCategoryId)
                  ?.name ?? '\u2014')
                : 'None'
            }
          />
          <SummaryRow
            label="Account"
            value={
              selectedAccount
                ? `${selectedAccount.institution} (${formatNaira(selectedAccount.balance)})`
                : '\u2014'
            }
          />
          <View style={[ss.confirmDivider, { backgroundColor: colors.separator }]} />
          <SummaryRow label="Amount" value={buildDisplayAmount()} bold />
        </View>

        {/* Security note */}
        <View
          style={[
            ss.securityNote,
            { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder },
          ]}
        >
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.warningText} />
          <Text style={[ss.securityNoteText, { color: colors.warningText }]}>
            You won&apos;t be charged until you confirm. This action cannot be undone.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            ss.limeBtn,
            { backgroundColor: colors.lime },
            isPaying && ss.primaryBtnDisabled,
          ]}
          onPress={handlePay}
          disabled={isPaying}
          activeOpacity={0.85}
        >
          {isPaying ? (
            <ActivityIndicator color={colors.darkGreen} />
          ) : (
            <Text style={[ss.limeBtnText, { color: colors.darkGreen }]}>
              Confirm &amp; Pay {buildDisplayAmount()}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={[ss.disclaimer, { color: colors.textMeta }]}>
          By tapping Confirm &amp; Pay, you authorise MoniMata to process this payment
          via Interswitch.
        </Text>
      </ScrollView>
    </View>
  );
}
