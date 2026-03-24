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
  BillPayResponse,
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
 * Poll the status of a specific Interswitch payment by reference.
 *
 * Polling is active only while the status is "pending" (ISW async path).
 * Once the status resolves to "success" or "failed" the interval stops
 * automatically via `refetchInterval` returning false.
 *
 * Pass `reference: null` to disable the query entirely (e.g. before payment).
 */
export function usePaymentStatus(reference: string | null) {
  return useQuery({
    queryKey: ['bill-payment-status', reference],
    queryFn: async () => {
      const { data } = await api.get<PaymentStatusResponse>(
        `/bills/pay/${reference}/status`,
      );
      return data;
    },
    enabled: !!reference,
    // Keep polling every 5 s while the payment is still pending.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' ? 5_000 : false;
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
 * On success the bill history query is invalidated so the history tab
 * reflects the new transaction immediately.
 */
export function usePayBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BillPayRequest): Promise<BillPayResponse> => {
      const { data } = await api.post<BillPayResponse>('/bills/pay', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.billHistory() });
      // Budget data also changes when category_id is supplied — invalidate so
      // the Budget tab stays consistent without needing a manual refresh.
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}
