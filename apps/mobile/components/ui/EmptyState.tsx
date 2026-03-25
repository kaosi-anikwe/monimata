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
 * components/ui/EmptyState.tsx
 *
 * Full-area empty state with an emoji/icon, heading, sub-text, and optional CTA.
 * Used when lists have no data (no transactions, no nudges, etc.).
 *
 * Usage:
 *   <EmptyState
 *     emoji="🧺"
 *     title="No transactions yet"
 *     body="Your transactions will appear here once your bank syncs."
 *     action={{ label: 'Add a transaction', onPress: ... }}
 *   />
 */

import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import { Button } from './Button';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  variant?: 'green' | 'lime' | 'ghost';
}

export interface EmptyStateProps {
  emoji?: string;
  /** Ionicons name or custom node to render instead of an emoji. */
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: EmptyStateAction;
  style?: StyleProp<ViewStyle>;
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  emoji,
  icon,
  title,
  body,
  action,
  style,
}: EmptyStateProps) {
  const colors = useTheme();

  return (
    <View style={[s.root, style]}>
      {(emoji || icon) && (
        <View style={[s.iconWrap, { backgroundColor: colors.surface }]}>
          {emoji
            ? <Text style={s.emoji}>{emoji}</Text>
            : icon}
        </View>
      )}

      <Text style={[s.title, { color: colors.textPrimary }]}>{title}</Text>

      {body && (
        <Text style={[s.body, { color: colors.textMeta }]}>{body}</Text>
      )}

      {action && (
        <View style={s.actionWrap}>
          <Button
            variant={action.variant ?? 'green'}
            onPress={action.onPress}
            fullWidth={false}
            style={s.actionBtn}
          >
            {action.label}
          </Button>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emoji: {
    fontSize: 36,
  },
  title: {
    ...type_.h2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...type_.bodyReg,
    textAlign: 'center',
    lineHeight: 21,
  },
  actionWrap: {
    marginTop: spacing.xl,
  },
  actionBtn: {
    paddingHorizontal: spacing.xl,
    height: 48,
  },
});
