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
 * Standalone stack screen for Accounts — used when navigating from the
 * Profile page so that the back button correctly returns to Profile.
 *
 * NOTE: This must NOT be named accounts.tsx — Expo Router treats layout
 * groups as transparent in URLs, so (tabs)/accounts.tsx also resolves to
 * /accounts, causing a conflict that makes push() do a tab-switch instead.
 *
 * The tab bar version at (tabs)/accounts.tsx renders the same component
 * without the back button.
 */

import AccountsScreen from './(tabs)/accounts';

export default function AccountsStackScreen() {
  return <AccountsScreen showBackButton />;
}
