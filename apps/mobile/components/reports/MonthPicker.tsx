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
 * components/reports/MonthPicker.tsx
 *
 * Horizontal scrollable month pill selector shared across report screens.
 * Current month is pre-selected and centred on mount.
 */

import React, { useCallback, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface MonthPickerProps {
  /** Currently selected month in YYYY-MM format. */
  selected: string;
  /** Called when user taps a month pill. */
  onSelect: (month: string) => void;
  /** How many months back to show. Default 12. */
  monthCount?: number;
}

function generateMonths(count: number): { label: string; value: string }[] {
  const now = new Date();
  const months: { label: string; value: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const value = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = i === 0 && count <= 12
      ? MONTH_LABELS[m]
      : `${MONTH_LABELS[m]} ${y}`;
    months.push({ label, value });
  }
  return months;
}

const PILL_WIDTH = 72;
const PILL_GAP = spacing.xxs;

export function MonthPicker({ selected, onSelect, monthCount = 12 }: MonthPickerProps) {
  const colors = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const months = generateMonths(monthCount);

  const selectedIdx = months.findIndex((m) => m.value === selected);

  const handleLayout = useCallback(() => {
    if (selectedIdx >= 0 && scrollRef.current) {
      const x = selectedIdx * (PILL_WIDTH + PILL_GAP) - PILL_WIDTH;
      scrollRef.current.scrollTo({ x: Math.max(0, x), animated: false });
    }
  }, [selectedIdx]);

  return (
    <View style={ss.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ss.scrollContent}
        onLayout={handleLayout}
      >
        {months.map((m) => {
          const isSelected = m.value === selected;
          return (
            <TouchableOpacity
              key={m.value}
              style={[
                ss.pill,
                {
                  backgroundColor: isSelected ? colors.brand : colors.surface,
                  borderColor: isSelected ? colors.brand : colors.border,
                },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(m.value);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={m.label}
            >
              <Text
                style={[
                  ss.pillText,
                  { color: isSelected ? colors.white : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const ss = StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: PILL_GAP,
  },
  pill: {
    width: PILL_WIDTH,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    ...type_.caption,
  },
});
