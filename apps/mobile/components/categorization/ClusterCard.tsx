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
 * ClusterCard
 *
 * The primary visual unit for the Cluster Blitz workspace (spec §7.4).
 * Each card represents one Levenshtein-clustered merchant group.
 *
 * Layout (top → bottom):
 *   1. Merchant name  + transaction count / aggregate badge
 *   2. Variant narration preview (up to 3 examples, so the user can verify the grouping)
 *   3. CategoryChipRow  — quick-assign top categories
 *   4. "Skip" text button — moves the card to the bottom of the blitz list
 *
 * Entering animation: FadeInDown spring (plays when the card mounts).
 * Exiting animation:  FadeOutUp (plays when the card is removed after a
 *                     successful categorisation or optimistic dismiss).
 *
 * Also exports ClusterCardSkeleton for the loading state.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Badge } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { formatMoney, type_ } from '@/lib/typography';
import type { CategoryGroup } from '@/types/category';
import type { components } from '@monimata/shared-types';

import { CategoryChipRow } from './CategoryChipRow';

// ─── Types ────────────────────────────────────────────────────────────────────

type ClusterItem = components['schemas']['ClusterItem'];

export interface ClusterCardProps {
  cluster: ClusterItem;
  groups: CategoryGroup[];
  /** Called when the user taps a chip or selects from the search sheet. */
  onCategorize: (clusterKey: string, categoryId: string | null) => void;
  /** Moves this cluster to the bottom of the visible list without an API call. */
  onSkip: () => void;
  /**
   * Category id whose mutation is currently in-flight for this cluster.
   * Passed through to CategoryChipRow to render the pending chip as selected.
   */
  pendingCategoryId?: string;
  /** Opens the CategorySearchSheet with this cluster pre-selected. */
  onMorePress: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Title-case the cleaned narration key for display. */
function toDisplayName(key: string): string {
  return key
    .split(/[\s_\-/]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const MAX_NARRATIONS = 3;

// ─── ClusterCard ─────────────────────────────────────────────────────────────

export function ClusterCard({
  cluster,
  groups,
  onCategorize,
  onSkip,
  pendingCategoryId,
  onMorePress,
}: ClusterCardProps) {
  const colors = useTheme();

  const displayName = toDisplayName(cluster.key);

  const narrationPreview = cluster.member_narrations
    .slice(0, MAX_NARRATIONS)
    .join(' · ');

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(26)}
      exiting={FadeOutUp.duration(220)}
    >
      <View
        style={[
          ss.card,
          shadow.sm,
          { backgroundColor: colors.cardBg },
        ]}
      >
        {/* ── Header ── */}
        <View style={ss.headerRow}>
          <Text
            style={[type_.h1Sm, { color: colors.textPrimary, flex: 1 }]}
          >
            {displayName}
          </Text>
          <Badge variant="neutral" size="sm">
            {cluster.count} · {formatMoney(cluster.total_amount, { compact: true })}
          </Badge>
        </View>

        {/* ── Narration preview ── */}
        {narrationPreview.length > 0 && (
          <Text
            style={[type_.body, { color: colors.textMeta, marginBottom: spacing.xl }]}
            numberOfLines={2}
          >
            {narrationPreview}
          </Text>
        )}

        {/* ── Quick-assign chips ── */}
        <CategoryChipRow
          groups={groups}
          onSelect={(catId) => onCategorize(cluster.key, catId)}
          onMorePress={onMorePress}
          pendingCategoryId={pendingCategoryId}
        />

        {/* ── Skip ── */}
        <TouchableOpacity
          style={ss.skipBtn}
          onPress={onSkip}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Skip this merchant for now"
        >
          <Text style={[type_.small, { color: colors.textTertiary }]}>Skip</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── ClusterCardSkeleton ──────────────────────────────────────────────────────

/** Placeholder shown while clusters are loading. Pulses with opacity animation. */
export function ClusterCardSkeleton() {
  const colors = useTheme();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={[ss.card, shadow.sm, { backgroundColor: colors.cardBg }]}>
      <Animated.View style={pulseStyle}>
        <View style={[ss.skelLine, { width: '55%', backgroundColor: colors.surfaceElevated }]} />
        <View
          style={[
            ss.skelLine,
            { width: '80%', marginTop: spacing.sm, backgroundColor: colors.surface },
          ]}
        />
        <View style={[ss.skelChips, { marginTop: spacing.lg }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[ss.skelChip, { backgroundColor: colors.surface }]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  // Skeleton shapes
  skelLine: {
    height: spacing.lg,
    borderRadius: radius.xs,
  },
  skelChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  skelChip: {
    height: spacing.xl + spacing.sm,
    width: spacing.xxxl + spacing.xxxl,
    borderRadius: radius.xs,
  },
});
