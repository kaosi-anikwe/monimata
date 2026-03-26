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
 * components/ui/ListRow.tsx
 *
 * Generic tappable list row with a left slot, main content area, and right slot.
 * Used for transaction rows, account rows, settings rows, etc.
 *
 * Props:
 *   leftIcon     — 36×36 icon bubble (ash-ic style). Pass an <Ionicons>.
 *   iconBg       — background colour for the icon bubble.
 *   title        — primary text
 *   subtitle     — secondary text below title
 *   right        — arbitrary node rendered at the trailing edge
 *   showChevron  — show a right-arrow chevron (default false)
 *   separator    — show a bottom separator line (default true)
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Override the title text colour/style (e.g. error red for destructive rows). */
  titleStyle?: StyleProp<import('react-native').TextStyle>;
  /** Node rendered in the 36×36 icon bubble. */
  leftIcon?: React.ReactNode;
  /** Background colour of the icon bubble. Defaults to surface. */
  iconBg?: string;
  /** Arbitrary node at the trailing edge (badge, toggle, amount, etc.). */
  right?: React.ReactNode;
  /** Show a standard chevron at the trailing edge. */
  showChevron?: boolean;
  onPress?: () => void;
  separator?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Indent used for grouped list rows (adds left padding). */
  indented?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
}

// ─── AnimatedTouchable ────────────────────────────────────────────────────────

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// ─── ListRow ──────────────────────────────────────────────────────────────────

export function ListRow({
  title,
  subtitle,
  titleStyle,
  leftIcon,
  iconBg,
  right,
  showChevron = false,
  onPress,
  separator = true,
  style,
  indented = false,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
}: ListRowProps) {
  const colors = useTheme();
  const bg = useSharedValue(0);

  const animBg = useAnimatedStyle(() => ({
    backgroundColor: bg.value === 1 ? colors.surface : 'transparent',
  }));

  function handlePressIn() {
    bg.value = withTiming(1, { duration: 80 });
  }
  function handlePressOut() {
    bg.value = withTiming(0, { duration: 160 });
  }

  const content = (
    <>
      {leftIcon && (
        <View
          style={[
            s.iconBubble,
            { backgroundColor: iconBg ?? colors.surface },
          ]}
        >
          {leftIcon}
        </View>
      )}

      <View style={[s.textArea, indented && s.indentedText]}>
        <Text
          style={[s.title, { color: colors.textPrimary }, titleStyle]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={[s.subtitle, { color: colors.textMeta }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {right && <View style={s.rightSlot}>{right}</View>}

      {showChevron && (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textTertiary}
          style={s.chevron}
        />
      )}
    </>
  );

  if (onPress) {
    return (
      <AnimatedTouchable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
        style={[
          s.row,
          animBg,
          separator && { borderBottomWidth: 1, borderBottomColor: colors.separator },
          disabled && s.disabled,
          style,
        ]}
      >
        {content}
      </AnimatedTouchable>
    );
  }

  return (
    <View
      style={[
        s.row,
        separator && { borderBottomWidth: 1, borderBottomColor: colors.separator },
        style,
      ]}
    >
      {content}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    minHeight: 44,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.sm - 2, // 10
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  indentedText: {
    paddingLeft: spacing.sm,
  },
  title: {
    ...type_.body,
  },
  subtitle: {
    ...type_.small,
    lineHeight: 17,
  },
  rightSlot: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  chevron: {
    flexShrink: 0,
    marginLeft: 2,
  },
  disabled: {
    opacity: 0.45,
  },
});
