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
 * components/ui/ScreenHeader.tsx
 *
 * Reusable dark-green header used on content screens (not the auth flow).
 * Matches the `.dk-hdr` style from the mockup:
 *   – dark green background, rounded bottom corners (26 pt)
 *   – frosted-glass back button (Button variant="icon" iconTheme="dark")
 *   – white title + optional subtitle
 *   – optional right slot (e.g. "Mark all read" button)
 *
 * Two layout modes (auto-selected):
 *   stack  (default)  — back btn, then title + titleBadge, then subtitle.
 *                       Used by notification-settings, challenge, target screens.
 *   row               — [back] [centered title + titleBadge] [rightSlot].
 *                       Activated when `rightSlot` is provided (e.g. nudges screen).
 *
 * Usage:
 *   // Stack mode — notification-settings style
 *   <ScreenHeader
 *     title="Nudge Settings"
 *     subtitle="Control how and when AI alerts reach you"
 *     onBack={() => router.back()}
 *     paddingTop={insets.top + 14}
 *   />
 *
 *   // Row mode — nudges screen style
 *   <ScreenHeader
 *     title="Nudges"
 *     titleBadge={<Badge variant="error" size="sm">{unreadCount}</Badge>}
 *     onBack={() => router.back()}
 *     rightSlot={<MarkAllButton />}
 *     paddingTop={insets.top + 16}
 *   />
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { ff } from '@/lib/typography';
import { Button } from './Button';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScreenHeaderProps {
  /** Main title text. */
  title: string;
  /** Optional subtitle shown below the title (stack mode only). */
  subtitle?: string;
  /** When provided, renders a frosted-glass back button. */
  onBack?: () => void;
  /**
   * Node rendered at the far-right edge (row mode only).
   * Providing this prop switches the layout to row mode.
   */
  rightSlot?: React.ReactNode;
  /** Inline node placed immediately after the title text (e.g. unread count badge). */
  titleBadge?: React.ReactNode;
  /** Extra content below the title/subtitle area (e.g. XP bar, filter strip). */
  children?: React.ReactNode;
  /**
   * Top padding — typically `insets.top + X`.
   * Defaults to 60 which accommodates most devices in the auth-screen style.
   */
  paddingTop?: number;
  style?: StyleProp<ViewStyle>;
}

// ─── ScreenHeader ─────────────────────────────────────────────────────────────

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightSlot,
  titleBadge,
  children,
  paddingTop = 60,
  style,
}: ScreenHeaderProps) {
  const colors = useTheme();
  const isRowLayout = !!rightSlot;

  return (
    <View
      style={[
        s.root,
        { backgroundColor: colors.darkGreen, paddingTop },
        style,
      ]}
    >
      {isRowLayout ? (
        /* ── Row layout: [back] [centered title + badge] [right] ── */
        <View style={s.row}>
          {onBack ? (
            <Button
              variant="icon"
              iconTheme="dark"
              onPress={onBack}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={18} color={colors.white} />
            </Button>
          ) : (
            <View style={s.iconPlaceholder} />
          )}

          <View style={s.centerSection}>
            <Text style={[s.title, { color: colors.white }]} numberOfLines={1}>
              {title}
            </Text>
            {titleBadge && <View style={s.titleBadgeSlot}>{titleBadge}</View>}
          </View>

          <View style={s.rightSlot}>{rightSlot}</View>
        </View>
      ) : (
        /* ── Stack layout: back btn, then title + badge, then subtitle ── */
        <>
          {onBack && (
            <Button
              variant="icon"
              iconTheme="dark"
              onPress={onBack}
              style={s.backBtnStack}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={18} color={colors.white} />
            </Button>
          )}

          <View style={s.titleRow}>
            <Text style={[s.title, { color: colors.white }]}>{title}</Text>
            {titleBadge && <View style={s.titleBadgeSlot}>{titleBadge}</View>}
          </View>

          {subtitle && (
            <Text style={[s.subtitle, { color: colors.textInverseFaint }]}>
              {subtitle}
            </Text>
          )}
        </>
      )}

      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: 'hidden',
  },
  // Row layout
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  centerSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  rightSlot: {
    flexShrink: 0,
  },
  iconPlaceholder: {
    width: 36,
    height: 36,
  },
  // Stack layout
  backBtnStack: {
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleBadgeSlot: {
    flexShrink: 0,
  },
  // Shared
  title: {
    ...ff(700),
    fontSize: 22,
    letterSpacing: -0.4,
  },
  subtitle: {
    ...ff(400),
    fontSize: 13,
    marginTop: 4,
  },
});
