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
 * React Query hooks for the Interswitch bill payment feature.
 *
 * Read hooks (useQuery): billers categories, billers by category,
 * payment items for a specific biller, and bill payment history.
 *
 * Mutation hooks (useMutation): customer validation (read-only ISW call)
 * and the actual payment.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import api from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';
import type {
  BillerCategory,
  Biller,
  PaymentItem,
  ValidateCustomerRequest,
  CustomerValidationResponse,
  BillPayRequest,
  BillPayInitiateResponse,
  PaymentStatusResponse,
  BillHistoryItem,
} from '@/types/bills';

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useBillCategories() {
  return useQuery({
    queryKey: queryKeys.billCategories(),
    queryFn: async () => {
      const { data } = await api.get<BillerCategory[]>('/bills/categories');
      return data;
    },
    staleTime: 10 * 60 * 1000, // categories rarely change — cache for 10 min
  });
}

export function useBillers(categoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.billers(categoryId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<Biller[]>('/bills/billers', {
        params: { category_id: categoryId },
      });
      return data;
    },
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBillPaymentItems(billerId: string | null) {
  return useQuery({
    queryKey: queryKeys.billPaymentItems(billerId ?? ''),
    queryFn: async () => {
      const { data } = await api.get<PaymentItem[]>(
        `/bills/billers/${billerId}/items`,
      );
      return data;
    },
    enabled: !!billerId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBillHistory() {
  return useQuery({
    queryKey: queryKeys.billHistory(),
    queryFn: async () => {
      const { data } = await api.get<BillHistoryItem[]>('/bills/history');
      return data;
    },
  });
}

/**
 * Poll the state-machine status of a pending bill payment by its ref.
 *
 * Polling runs every 5 s until state reaches a terminal value
 * (COMPLETED, FAILED, or REFUNDED).  Pass `ref: null` to disable entirely.
 */
export function usePaymentStatus(ref: string | null) {
  return useQuery({
    queryKey: ['bill-payment-status', ref],
    queryFn: async () => {
      const { data } = await api.get<PaymentStatusResponse>(
        `/bills/pay/${ref}/status`,
      );
      return data;
    },
    enabled: !!ref,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && ['COMPLETED', 'FAILED', 'REFUNDED'].includes(state)
        ? false
        : 5_000;
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Validate a customer ID against an Interswitch biller before payment.
 * This is a read-only ISW call — it does NOT create any transaction.
 */
export function useValidateCustomer() {
  return useMutation({
    mutationFn: async (
      payload: ValidateCustomerRequest,
    ): Promise<CustomerValidationResponse> => {
      const { data } = await api.post<CustomerValidationResponse>(
        '/bills/validate',
        payload,
      );
      return data;
    },
  });
}

/**
 * Submit a bill payment through Interswitch.
 * Returns a checkout_url and ref for the 3-phase Web Checkout flow.
 * The bill history query is NOT invalidated here — it's invalidated once
 * the payment reaches COMPLETED state (after dispatch_bill_phase3 runs).
 */
export function usePayBill() {
  return useMutation({
    mutationFn: async (payload: BillPayRequest): Promise<BillPayInitiateResponse> => {
      const { data } = await api.post<BillPayInitiateResponse>('/bills/pay', payload);
      return data;
    },
  });
}

/**
 * Trigger Phase 3 dispatch after the WebView detects the callback redirect.
 * Call once when transitioning to the processing step.
 */
export function useVerifyBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ref: string): Promise<void> => {
      await api.post(`/bills/verify/${ref}`);
    },
    onSuccess: (_data, ref) => {
      // Kick off polling by invalidating the status query for this ref.
      qc.invalidateQueries({ queryKey: ['bill-payment-status', ref] });
    },
  });
}
