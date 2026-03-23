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

export interface TxSplit {
  id: string;
  amount: number;
  category_id: string | null;
  memo: string | null;
}

export interface Transaction {
  id: string;
  account_id: string;
  date: string;
  narration: string;
  amount: number;
  type: 'debit' | 'credit';
  category_id: string | null;
  memo: string | null;
  is_split: boolean;
  is_manual: boolean;
  source: string;
  recurrence_id: string | null;
  splits: TxSplit[];
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
}
