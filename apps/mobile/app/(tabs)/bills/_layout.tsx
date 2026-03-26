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
 * Bills flow — Stack layout + BillsFlowContext provider.
 *
 * All flow state lives here so screens can read/write without prop drilling or
 * route-param serialisation. Back navigation is handled natively by the Stack:
 *   - iOS: swipe-back gesture on every screen except processing/receipt
 *   - Android: hardware back button on every screen
 *   - processing/receipt: gestureEnabled:false, BackHandler handled per-screen
 */

import { Stack } from 'expo-router';
import type {
  Biller,
  BillerCategory,
  CustomerValidationResponse,
  PaymentItem,
  PaymentStatusResponse,
} from '@/types/bills';
import React, { createContext, useContext, useState } from 'react';

// ── Context ───────────────────────────────────────────────────────────────────

export interface BillsFlowContextValue {
  // Selection
  selectedCategory: BillerCategory | null;
  setSelectedCategory: (c: BillerCategory | null) => void;
  selectedBiller: Biller | null;
  setSelectedBiller: (b: Biller | null) => void;
  selectedItem: PaymentItem | null;
  setSelectedItem: (i: PaymentItem | null) => void;

  // Customer form
  customerId: string;
  setCustomerId: (id: string) => void;
  amountNaira: string;
  setAmountNaira: (a: string) => void;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  selectedBudgetCategoryId: string | null;
  setSelectedBudgetCategoryId: (id: string | null) => void;
  validationResult: CustomerValidationResponse | null;
  setValidationResult: (r: CustomerValidationResponse | null) => void;

  // Checkout / payment
  checkoutUrl: string | null;
  setCheckoutUrl: (url: string | null) => void;
  pendingRef: string | null;
  setPendingRef: (ref: string | null) => void;
  payResult: PaymentStatusResponse | null;
  setPayResult: (r: PaymentStatusResponse | null) => void;
  webViewLoading: boolean;
  setWebViewLoading: (v: boolean) => void;

  // Flow resets
  resetForm: () => void;
  resetAll: () => void;
}

const BillsFlowContext = createContext<BillsFlowContextValue | null>(null);

export function useBillsFlow(): BillsFlowContextValue {
  const ctx = useContext(BillsFlowContext);
  if (!ctx) throw new Error('useBillsFlow must be used within BillsLayout');
  return ctx;
}

// ── Root layout ────────────────────────────────────────────────────────────────

export default function BillsLayout() {
  const [selectedCategory, setSelectedCategory] = useState<BillerCategory | null>(null);
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedItem, setSelectedItem] = useState<PaymentItem | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [amountNaira, setAmountNaira] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedBudgetCategoryId, setSelectedBudgetCategoryId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<CustomerValidationResponse | null>(null);

  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<PaymentStatusResponse | null>(null);
  const [webViewLoading, setWebViewLoading] = useState(true);

  function resetForm() {
    setCustomerId('');
    setAmountNaira('');
    setSelectedBudgetCategoryId(null);
    setValidationResult(null);
  }

  function resetAll() {
    setSelectedCategory(null);
    setSelectedBiller(null);
    setSelectedItem(null);
    resetForm();
    setCheckoutUrl(null);
    setPendingRef(null);
    setPayResult(null);
    setWebViewLoading(true);
  }

  return (
    <BillsFlowContext.Provider
      value={{
        selectedCategory, setSelectedCategory,
        selectedBiller, setSelectedBiller,
        selectedItem, setSelectedItem,
        customerId, setCustomerId,
        amountNaira, setAmountNaira,
        selectedAccountId, setSelectedAccountId,
        selectedBudgetCategoryId, setSelectedBudgetCategoryId,
        validationResult, setValidationResult,
        checkoutUrl, setCheckoutUrl,
        pendingRef, setPendingRef,
        payResult, setPayResult,
        webViewLoading, setWebViewLoading,
        resetForm,
        resetAll,
      }}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="billers" />
        <Stack.Screen name="payment-items" />
        <Stack.Screen name="customer-form" />
        <Stack.Screen name="confirm" />
        <Stack.Screen name="checkout" />
        {/* Block back gestures on in-flight and terminal steps */}
        <Stack.Screen name="processing" options={{ gestureEnabled: false }} />
        <Stack.Screen name="receipt" options={{ gestureEnabled: false }} />
      </Stack>
    </BillsFlowContext.Provider>
  );
}
