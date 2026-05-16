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
 * CategorizationProgress
 *
 * Animated header progress bar for the Cluster Blitz workspace (spec §7.1).
 * Shows remaining merchant count and a filled progress bar that animates as
 * clusters are dismissed.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategorizationProgressProps {
  /** Number of merchant clusters still to be categorised. */
  remaining: number;
  /** Total clusters on entry (denominator for % calculation). */
  total: number;
}

// ─── CategorizationProgress ──────────────────────────────────────────────────

export function CategorizationProgress({ remaining, total }: CategorizationProgressProps) {
  const colors = useTheme();

  const progress = total > 0 ? (total - remaining) / total : 0;
  const pct = Math.round(progress * 100);

  const label =
    remaining === 0
      ? 'All caught up!'
      : `${remaining} merchant${remaining === 1 ? '' : 's'} remaining`;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <View style={ss.labelRow}>
        <Text style={[type_.caption, { color: colors.textMeta }]}>{label}</Text>
        {total > 0 && (
          <Text style={[type_.caption, { color: colors.textMeta }]}>{pct}%</Text>
        )}
      </View>
      <ProgressBar
        progress={progress}
        state="brand"
        size="md"
        gradient
        animate
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
});
