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
 * Main tabs layout — placeholder for Day 1.
 * Full budget/transactions/accounts screens are implemented in Phase 1.
 */
import { Tabs } from 'expo-router';

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: '#0F7B3F',
                tabBarInactiveTintColor: '#9CA3AF',
            }}
        >
            <Tabs.Screen name="index" options={{ title: 'Budget', tabBarLabel: 'Budget' }} />
            <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarLabel: 'Transactions' }} />
            <Tabs.Screen name="accounts" options={{ title: 'Accounts', tabBarLabel: 'Accounts' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile' }} />
        </Tabs>
    );
}
