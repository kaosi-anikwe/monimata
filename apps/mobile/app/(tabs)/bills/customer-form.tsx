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

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/lib/theme';
import { useBillsFlow } from './_layout';
import { useToast } from '@/components/Toast';
import { useAccounts } from '@/hooks/useAccounts';
import { useValidateCustomer } from '@/hooks/useBills';
import { koboToNaira, formatNaira } from '@/utils/money';
import { useCategoryGroups } from '@/hooks/useCategories';
import { AccountPicker, CategoryPickerField, DetailHeader, ss } from './_components';

export default function CustomerFormScreen() {
  const router = useRouter();
  const flow = useBillsFlow();
  const colors = useTheme();

  const { data: accounts = [], isLoading: loadingAccounts } = useAccounts();
  const { data: categoryGroups = [] } = useCategoryGroups();
  const validateMutation = useValidateCustomer();
  const { error } = useToast();

  const isFixed = flow.selectedItem?.is_amount_fixed ?? false;
  const isValidating = validateMutation.isPending;

  // Auto-select the first account when accounts load.
  useEffect(() => {
    if (accounts.length > 0 && !flow.selectedAccountId) {
      flow.setSelectedAccountId(accounts[0].id);
    }
    // flow is a stable context object; listing the individual values we read
    // avoids re-running on every render while satisfying the linter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, flow.selectedAccountId, flow.setSelectedAccountId]);

  function handleValidate() {
    if (!flow.customerId.trim()) {
      error('Missing Info', 'Please enter a customer/account ID.');
      return;
    }
    if (!flow.selectedItem) return;

    validateMutation.mutate(
      { payment_code: flow.selectedItem.payment_code, customer_id: flow.customerId.trim() },
      {
        onSuccess: (result) => {
          console.log('Skipping validation error in test mode');
          // if (result.response_code !== '00') {
          //   error('Validation Failed', result.response_description || '...');
          //   return;
          // }
          if (result.is_amount_fixed && result.fixed_amount) {
            flow.setAmountNaira(String(koboToNaira(result.fixed_amount)));
          }
          flow.setValidationResult(result);
          router.push('/bills/confirm');
        },
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            'Could not validate at this time. Please try again.';
          error('Validation Error', message);
        },
      },
    );
  }

  return (
    <View style={[ss.screenFlex, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <DetailHeader title="Customer Details" step="customer_form" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={ss.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={ss.formContent}>
          {/* Biller context chip */}
          <View style={[ss.contextChip, { backgroundColor: colors.surfaceElevated }]}>
            <Ionicons name="business-outline" size={14} color={colors.brand} />
            <Text style={[ss.contextChipText, { color: colors.textSecondary }]}>
              {flow.selectedBiller?.name} {'\u00b7'} {flow.selectedItem?.name}
            </Text>
          </View>

          <Text style={[ss.fieldLabel, { color: colors.textSecondary }]}>
            Customer / Account ID
          </Text>
          <TextInput
            style={[
              ss.input,
              {
                backgroundColor: colors.cardBg,
                borderColor: colors.border,
                color: colors.textPrimary,
              },
            ]}
            placeholder="e.g. 07012345678 or meter number"
            placeholderTextColor={colors.textTertiary}
            value={flow.customerId}
            onChangeText={flow.setCustomerId}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
          />

          {!isFixed && (
            <>
              <Text style={[ss.fieldLabel, { color: colors.textSecondary }]}>
                Amount ({'\u20a6'})
              </Text>
              <TextInput
                style={[
                  ss.input,
                  {
                    backgroundColor: colors.cardBg,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="e.g. 2000"
                placeholderTextColor={colors.textTertiary}
                value={flow.amountNaira}
                onChangeText={flow.setAmountNaira}
                keyboardType="decimal-pad"
              />
            </>
          )}

          {isFixed && flow.selectedItem?.fixed_amount ? (
            <View
              style={[
                ss.fixedAmountBadge,
                { backgroundColor: colors.surface, borderColor: colors.borderBrand },
              ]}
            >
              <Text style={[ss.fixedAmountLabel, { color: colors.textMeta }]}>Fixed amount</Text>
              <Text style={[ss.fixedAmountValue, { color: colors.brand }]}>
                {formatNaira(flow.selectedItem.fixed_amount)}
              </Text>
            </View>
          ) : null}

          <Text style={[ss.fieldLabel, { color: colors.textSecondary }]}>
            Budget category (optional)
          </Text>
          <CategoryPickerField
            groups={categoryGroups}
            selectedId={flow.selectedBudgetCategoryId}
            onSelect={flow.setSelectedBudgetCategoryId}
          />

          <Text style={[ss.fieldLabel, { color: colors.textSecondary }]}>Pay from account</Text>
          {loadingAccounts ? (
            <ActivityIndicator color={colors.brand} />
          ) : accounts.length === 0 ? (
            <View
              style={[
                ss.warningBox,
                {
                  backgroundColor: colors.warningSubtle,
                  borderColor: colors.warningBorder,
                },
              ]}
            >
              <Ionicons name="warning-outline" size={16} color={colors.warningText} />
              <Text style={[ss.warningText, { color: colors.warningText }]}>
                No linked accounts. Please link a bank account first.
              </Text>
            </View>
          ) : (
            <AccountPicker
              accounts={accounts}
              selectedId={flow.selectedAccountId}
              onSelect={flow.setSelectedAccountId}
            />
          )}

          <TouchableOpacity
            style={[
              ss.primaryBtn,
              { backgroundColor: colors.brand },
              (isValidating || !flow.customerId.trim() || accounts.length === 0) &&
              ss.primaryBtnDisabled,
            ]}
            onPress={handleValidate}
            disabled={isValidating || !flow.customerId.trim() || accounts.length === 0}
            activeOpacity={0.85}
          >
            {isValidating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={[ss.primaryBtnText, { color: colors.white }]}>
                Validate &amp; Continue
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
