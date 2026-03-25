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
 * components/ui/TabBar.tsx
 *
 * Custom bottom tab bar for the main app shell.
 *
 * Visual layout — 5 equal slots:
 *   [ Home ] [ Budget ] [ Activity ] [ Pay Bills ] [ Nudges ]
 *
 * Matches mockup CSS `.bnav` / `.ni` / `.ni.on`:
 * - Height: layout.tabBarHeight (76 pt) + safe-area bottom inset.
 * - Active tab: icon stroke + label = colors.brand (--gp, #2D6A2D).
 * - Active label: weight 700.
 * - Inactive: colors.textMeta icon + label, weight 500.
 * - All icons are outline/stroke variants (fill:none in mockup).
 * - Nudges slot shows a red badge overlay when there are unread nudges.
 *
 * The FAB is NOT embedded here — it is a separate <SharedFAB> component
 * inside app/(tabs)/_layout.tsx, floating at the bottom-right.
 *
 * Usage (in app/(tabs)/_layout.tsx):
 *   <Tabs tabBar={(props) => <MainTabBar {...props} />}>
 */

import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNudgeUnreadCount } from '@/hooks/useNudges';
import { type ThemeColors, useTheme } from '@/lib/theme';
import { layout, shadow, spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  routeName: string;
  label: string;
  icon: IoniconName;
  iconActive: IoniconName;
}

// ─── Tab configuration ────────────────────────────────────────────────────────
// Matches the mockup home screen bnav (scr-home) from left to right.

const TABS: TabConfig[] = [
  { routeName: 'index', label: 'Home', icon: 'home-outline', iconActive: 'home-outline' },
  { routeName: 'budget', label: 'Budget', icon: 'card-outline', iconActive: 'card-outline' },
  { routeName: 'transactions', label: 'Transactions', icon: 'document-text-outline', iconActive: 'document-text-outline' },
  { routeName: 'bills', label: 'Pay Bills', icon: 'flash-outline', iconActive: 'flash-outline' },
  { routeName: 'nudges', label: 'Nudges', icon: 'notifications-outline', iconActive: 'notifications-outline' },
] as const;

// ─── Tab item ─────────────────────────────────────────────────────────────────

interface TabItemProps {
  config: TabConfig;
  isActive: boolean;
  badge?: number;
  onPress: () => void;
  colors: ThemeColors;
}

function TabItem({ config, isActive, badge, onPress, colors }: TabItemProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Active: brand green stroke + bold label (matches .ni.on in mockup)
  const iconColor = isActive ? colors.brand : colors.textMeta;
  const labelColor = isActive ? colors.brand : colors.textMeta;
  const labelWeight = isActive ? 700 : 500;

  return (
    <Pressable
      style={s.tabItem}
      onPressIn={() => {
        scale.value = withSpring(0.85, { damping: 14, stiffness: 260 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={config.label}
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View style={[s.tabInner, animStyle]}>
        {/* Icon + optional badge */}
        <View style={s.iconWrap}>
          <Ionicons
            name={isActive ? config.iconActive : config.icon}
            size={22}
            color={iconColor}
          />
          {badge != null && badge > 0 && (
            <View style={[s.badge, { backgroundColor: colors.error, borderColor: colors.white }]}>
              <Text style={[s.badgeText, { color: colors.textInverse }]}>
                {badge > 99 ? '99+' : String(badge)}
              </Text>
            </View>
          )}
        </View>

        {/* Label — weight 700 when active, 500 when inactive (matches .ni span / .ni.on span) */}
        <Text
          style={[s.label, { color: labelColor, fontFamily: labelWeight === 700 ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_500Medium' }]}
          numberOfLines={1}
        >
          {config.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Main tab bar ─────────────────────────────────────────────────────────────

export function MainTabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const nudgeUnread = useNudgeUnreadCount();

  const activeRouteName = state.routes[state.index]?.name ?? '';

  // Minimum bottom inset of 4 pt so the bar doesn't look cramped on devices
  // with no home indicator (Android).
  const bottomPad = Math.max(insets.bottom, 4);

  function handleTabPress(routeName: string) {
    const targetRoute = state.routes.find((r) => r.name === routeName);
    if (!targetRoute) return;

    const event = navigation.emit({
      type: 'tabPress',
      target: targetRoute.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      // Navigate if the tab isn't already focused, or pop-to-top if it is.
      if (activeRouteName !== routeName) {
        navigation.navigate(routeName);
      } else {
        navigation.emit({ type: 'tabLongPress', target: targetRoute.key });
      }
    }
  }

  return (
    <View
      style={[
        s.container,
        {
          paddingBottom: bottomPad,
          backgroundColor: colors.white,
          borderTopColor: colors.border,
        },
      ]}
    >
      {/* Drop-shadow surface layer */}
      <View style={[s.barSurface, { backgroundColor: colors.white }]} />

      {/* 5 equal tab slots */}
      <View style={s.row}>
        <TabItem
          config={TABS[0]}
          isActive={activeRouteName === 'index'}
          onPress={() => handleTabPress('index')}
          colors={colors}
        />
        <TabItem
          config={TABS[1]}
          isActive={activeRouteName === 'budget'}
          onPress={() => handleTabPress('budget')}
          colors={colors}
        />
        <TabItem
          config={TABS[2]}
          isActive={activeRouteName === 'transactions'}
          onPress={() => handleTabPress('transactions')}
          colors={colors}
        />
        <TabItem
          config={TABS[3]}
          isActive={activeRouteName === 'bills'}
          onPress={() => handleTabPress('bills')}
          colors={colors}
        />
        <TabItem
          config={TABS[4]}
          isActive={activeRouteName === 'nudges'}
          onPress={() => handleTabPress('nudges')}
          badge={nudgeUnread}
          colors={colors}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: layout.tabBarHeight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  /** Drop-shadow layer — needs a background colour to cast shadow on iOS. */
  barSurface: {
    ...StyleSheet.absoluteFillObject,
    ...shadow.sm,
  },

  row: {
    flexDirection: 'row',
    height: layout.tabBarHeight,
    alignItems: 'flex-start',
    paddingTop: spacing.smd,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },

  tabInner: {
    alignItems: 'center',
    gap: 3,
  },

  iconWrap: {
    position: 'relative',
  },

  /** Font family set inline per-item (active=700, inactive=500). fontSize only here. */
  label: {
    fontSize: 10,
  },

  /** Notification badge overlaid on the icon — matches .ni-badge in mockup. */
  badge: {
    position: 'absolute',
    top: 2,
    right: -8,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },

  badgeText: {
    ...ff(800),
    fontSize: 8,
    lineHeight: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
