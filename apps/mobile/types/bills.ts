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
 * TypeScript types for the /bills Interswitch Quickteller endpoints.
 * Money values are always in kobo.
 */

export interface BillerCategory {
  id: string;
  name: string;
  description: string | null;
  picture_id: string | null;
}

export interface Biller {
  id: string;
  name: string;
  short_name: string | null;
  category_id: string | null;
  picture_id: string | null;
}

export interface PaymentItem {
  id: string;
  name: string;
  payment_code: string;
  is_amount_fixed: boolean;
  /** kobo; null means the user enters a free amount */
  fixed_amount: number | null;
  currency_code: string;
}

export interface ValidateCustomerRequest {
  payment_code: string;
  customer_id: string;
}

export interface CustomerValidationResponse {
  customer_id: string;
  customer_name: string;
  is_amount_fixed: boolean;
  /** kobo; present only when the biller fixes the amount */
  fixed_amount: number | null;
  biller_name: string | null;
  response_code: string;
  response_description: string;
}

export interface BillPayRequest {
  payment_code: string;
  customer_id: string;
  /** kobo */
  amount: number;
  account_id: string;
  customer_mobile?: string;
  customer_email?: string;
  category_id?: string;
}

export interface BillPayResponse {
  id: string;
  reference: string;
  status: 'success' | 'pending' | 'failed';
  /** kobo (negative = debit) */
  amount: number;
  narration: string;
  date: string;
  category_id: string | null;
  account_id: string;
}

export interface PaymentStatusResponse {
  reference: string;
  status: string;
  response_code: string;
  response_description: string;
}

export interface BillHistoryItem {
  id: string;
  reference: string;
  narration: string;
  /** kobo (negative) */
  amount: number;
  date: string;
  category_id: string | null;
  account_id: string;
}
