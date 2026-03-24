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

export interface BankAccount {
  id: string;
  institution: string;
  account_name: string;
  alias: string | null; // user-defined display name
  account_number: string | null;
  bank_code: string | null;
  account_type: string;
  currency: string;
  balance: number; // kobo
  balance_as_of: string | null; // ISO datetime — last manual balance update
  last_synced_at: string | null; // ISO datetime string
  is_mono_linked: boolean;
  linked_at: string | null;
  unlinked_at: string | null;
  is_active: boolean;
  requires_reauth: boolean;
  deleted_at: string | null;
  created_at: string;
}
