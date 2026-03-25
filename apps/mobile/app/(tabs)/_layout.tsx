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
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainTabBar } from '@/components/ui/TabBar';
import { useTheme } from '@/lib/theme';
import { layout, shadow, spacing } from '@/lib/tokens';

/**
 * Floating lime "+" button — bottom-right, sits above the tab bar.
 * Visible on all tab screens. Navigates to /add-transaction.
 */
function SharedFAB() {
  const router = useRouter();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  // Only show at the root level of a tab (segments.length <= 2),
  // not when a stack screen is pushed on top.
  if (segments.length > 2) return null;

  const bottomOffset = layout.tabBarHeight + Math.max(insets.bottom, 4) + spacing.sm;

  return (
    <TouchableOpacity
      style={[
        s.fab,
        { backgroundColor: colors.lime, bottom: bottomOffset },
        shadow.fab,
      ]}
      onPress={() => router.push('/add-transaction')}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
    >
      <Ionicons name="add" size={26} color={colors.darkGreen} />
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName="index"
        tabBar={(props) => <MainTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        {/* ── Visible tabs (left → right) ───────────────────────────────── */}
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="budget" options={{ title: 'Budget' }} />
        <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
        <Tabs.Screen name="bills" options={{ title: 'Pay Bills' }} />
        <Tabs.Screen name="nudges" options={{ title: 'Nudges' }} />

        {/* ── Hidden — accessible via router.push() ────────────────────── */}
        <Tabs.Screen name="accounts" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>

      {/* Floating action button — bottom-right above the tab bar */}
      <SharedFAB />
    </View>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: layout.fabSize,
    height: layout.fabSize,
    borderRadius: layout.fabSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
