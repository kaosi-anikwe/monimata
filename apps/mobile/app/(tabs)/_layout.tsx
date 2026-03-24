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

import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { useNudgeUnreadCount } from '../../hooks/useNudges';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(outline: IoniconsName, filled: IoniconsName) {
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <Ionicons name={focused ? filled : outline} size={24} color={color} />;
  }
  return TabIcon;
}

/** Floating action button shown on Budget and Transactions tabs only. */
function SharedFAB() {
  const router = useRouter();
  const segments = useSegments();
  // segments[1] is the tab name: 'index' (Budget), 'transactions', etc.
  const activeTab: string | undefined = segments[1];
  const visible =
    (segments.length === 1 || activeTab === 'transactions') &&
    activeTab !== 'bills';
  if (!visible) return null;

  return (
    <TouchableOpacity
      style={s.fab}
      onPress={() => router.push('/add-transaction')}
      activeOpacity={0.85}
    >
      <Ionicons name="add" size={28} color="#fff" />
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const nudgeUnread = useNudgeUnreadCount();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#0F7B3F',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: { borderTopColor: '#E5E7EB' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Budget',
            tabBarLabel: 'Budget',
            tabBarIcon: tabIcon('wallet-outline', 'wallet'),
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Transactions',
            tabBarLabel: 'Transactions',
            tabBarIcon: tabIcon('receipt-outline', 'receipt'),
          }}
        />
        <Tabs.Screen
          name="accounts"
          options={{
            title: 'Accounts',
            tabBarLabel: 'Accounts',
            tabBarIcon: tabIcon('business-outline', 'business'),
          }}
        />
        <Tabs.Screen
          name="bills"
          options={{
            title: 'Pay Bills',
            tabBarLabel: 'Bills',
            tabBarIcon: tabIcon('flash-outline', 'flash'),
          }}
        />
        <Tabs.Screen
          name="nudges"
          options={{
            title: 'Nudges',
            // Hidden from the tab bar — accessible via router.push('/(tabs)/nudges')
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarLabel: 'Profile',
            tabBarIcon: tabIcon('person-outline', 'person'),
            tabBarBadge: nudgeUnread > 0 ? nudgeUnread : undefined,
            tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 10 },
          }}
        />
      </Tabs>
      <SharedFAB />
    </View>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 82, // sits above the tab bar (~56 px) + 26 px breathing room
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0F7B3F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
});
