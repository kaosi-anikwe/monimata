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
 * app/(tabs)/home.tsx  — Home / Dashboard tab (stub)
 *
 * Full implementation is in Phase 5. For now this screen acts as a placeholder
 * so the tab bar route resolves without error.
 *
 * Phase 5 will replace this with:
 *  - Dark green LinearGradient header with net-worth balance card
 *  - Stats grid (income / spend / saved this month)
 *  - Nudge pill + streak card
 *  - Savings goals / targets section
 */

import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';
import { layout, spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';

export default function HomeScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        s.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: layout.tabBarHeight + insets.bottom + spacing.lg,
        },
      ]}
    >
      <Text style={[s.title, { color: colors.textPrimary }]}>Home</Text>
      <Text style={[s.sub, { color: colors.textMeta }]}>
        Dashboard coming in Phase 5.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...ff(800),
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  sub: {
    ...ff(400),
    fontSize: 14,
    textAlign: 'center',
  },
});
