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
 * ReviewCard
 *
 * Single swipeable transaction card for the Review Queue (Mode B, spec §7.6).
 *
 * Gesture behaviour:
 *   Right (> SWIPE_X)   — Confirm: assign the top-ranked suggestion's category.
 *   Left  (< -SWIPE_X)  — Defer: push the transaction back to the end of the queue.
 *   Up    (< -SWIPE_Y)  — Search: return card to center, open category search sheet.
 *   Any other release   — Spring back to center.
 *
 * The card surface background interpolates while dragging:
 *   Right pull → colors.successSubtle  (green tint = "good")
 *   Left pull  → colors.surfaceElevated (neutral)
 *   Up pull    → colors.infoSubtle     (blue tint = "search")
 *
 * The card is an Animated.View driven by shared values, wrapped in a
 * GestureDetector from react-native-gesture-handler. GestureHandlerRootView
 * is already provided by the root layout.
 *
 * Entering animation: FadeInRight (provided via prop so the parent can key
 * the component on transaction id and always get the entering animation).
 */

import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Badge, Chip } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { formatMoney, type_ } from '@/lib/typography';
import type { components } from '@monimata/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewQueueItem = components['schemas']['ReviewQueueItem'];
type CategorySuggestion = components['schemas']['CategorySuggestion'];

export interface ReviewCardProps {
  item: ReviewQueueItem;
  /** Called when user confirms a category (right swipe or chip tap). */
  onConfirm: (txId: string, categoryId: string) => void;
  /** Called when user defers the transaction (left swipe). */
  onDefer: (txId: string) => void;
  /** Called when user swipes up — open the category search sheet. */
  onOpenSearch: () => void;
  /** Entering animation — pass FadeInRight from caller so the key prop triggers it. */
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Horizontal distance (px) required to trigger confirm/defer. */
const SWIPE_X = spacing.xxxl * 3; // 96
/** Vertical distance (px, negative = up) required to trigger search. */
const SWIPE_Y = spacing.xxxl * 2; // 64

/** Max chips shown for category suggestions. */
const MAX_SUGGESTION_CHIPS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function txDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function sourceName(src: string): string {
  return src.replace(/_/g, ' ');
}

function confidenceBadgeVariant(
  confidence: number,
): 'success' | 'warning' | 'neutral' {
  if (confidence >= 75) return 'success';
  if (confidence >= 50) return 'warning';
  return 'neutral';
}

// ─── ReviewCard ───────────────────────────────────────────────────────────────

export function ReviewCard({
  item,
  onConfirm,
  onDefer,
  onOpenSearch,
  entering,
}: ReviewCardProps) {
  const colors = useTheme();
  const { transaction: tx, suggestions } = item;

  const isDebit = tx.type === 'debit';
  const amountColor = isDebit ? colors.error : colors.success;
  const amountSign = isDebit ? '−' : '+';

  // ── Gesture shared values ───────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // ── JS-thread action dispatchers (called via runOnJS) ───────────────────
  function handleConfirmAction(categoryId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(tx.id, categoryId);
  }

  function handleDeferAction() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDefer(tx.id);
  }

  function handleSearchAction() {
    onOpenSearch();
  }

  // ── Pan gesture ─────────────────────────────────────────────────────────
  const topCategoryId = suggestions[0]?.category_id ?? '';

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_X) {
        // Right — confirm with top suggestion
        translateX.value = withSpring(600, { damping: 15 });
        runOnJS(handleConfirmAction)(topCategoryId);
      } else if (e.translationX < -SWIPE_X) {
        // Left — defer
        translateX.value = withSpring(-600, { damping: 15 });
        runOnJS(handleDeferAction)();
      } else if (e.translationY < -SWIPE_Y) {
        // Up — open search, spring back to center
        translateX.value = withSpring(0, { damping: 18 });
        translateY.value = withSpring(0, { damping: 18 });
        runOnJS(handleSearchAction)();
      } else {
        // No threshold reached — spring back
        translateX.value = withSpring(0, { damping: 18 });
        translateY.value = withSpring(0, { damping: 18 });
      }
    });

  // ── Animated styles ─────────────────────────────────────────────────────
  const animStyle = useAnimatedStyle(() => {
    // Determine background tint from drag direction.
    let bgColor: string;
    if (translateX.value > 0) {
      // Right pull → green tint
      bgColor = interpolateColor(
        translateX.value,
        [0, SWIPE_X],
        [colors.cardBg, colors.successSubtle],
      );
    } else if (translateX.value < 0) {
      // Left pull → neutral elevated tint
      bgColor = interpolateColor(
        -translateX.value,
        [0, SWIPE_X],
        [colors.cardBg, colors.surfaceElevated],
      );
    } else if (translateY.value < 0) {
      // Up pull → info tint
      bgColor = interpolateColor(
        -translateY.value,
        [0, SWIPE_Y],
        [colors.cardBg, colors.infoSubtle],
      );
    } else {
      bgColor = colors.cardBg;
    }

    return {
      backgroundColor: bgColor,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        entering={entering}
        style={[ss.card, shadow.md, animStyle]}
        accessibilityRole="button"
        accessibilityLabel={`${tx.narration}, ${amountSign}${formatMoney(Math.abs(tx.amount))}`}
        accessibilityHint="Swipe right to confirm, left to defer, up to search categories"
      >
        {/* ── Amount ── */}
        <Text style={[type_.displayHero, { color: amountColor }]}>
          {amountSign}{formatMoney(Math.abs(tx.amount))}
        </Text>

        {/* ── Narration ── */}
        <Text
          style={[type_.body, { color: colors.textPrimary, marginTop: spacing.xs }]}
          numberOfLines={2}
        >
          {tx.narration}
        </Text>

        {/* ── Meta line (source + date) ── */}
        <Text
          style={[type_.caption, { color: colors.textMeta, marginTop: spacing.xs }]}
          numberOfLines={1}
        >
          {sourceName(tx.source)} · {txDate(tx.date)}
        </Text>

        {/* ── Existing categorization source badge (if auto-categorised) ── */}
        {tx.categorization_source && (
          <View style={ss.sourcePillRow}>
            <Badge variant="lime" size="sm">
              {sourceName(tx.categorization_source)}
            </Badge>
          </View>
        )}

        {/* ── Category suggestion chips ── */}
        {suggestions.length > 0 && (
          <View style={ss.chipsSection}>
            <Text
              style={[type_.labelSm, { color: colors.textMeta, marginBottom: spacing.sm }]}
            >
              SUGGESTIONS
            </Text>
            <View style={ss.chipsRow}>
              {suggestions.slice(0, MAX_SUGGESTION_CHIPS).map((s) => (
                <SuggestionChip
                  key={s.category_id}
                  suggestion={s}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onConfirm(tx.id, s.category_id);
                  }}
                />
              ))}
            </View>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── SuggestionChip ───────────────────────────────────────────────────────────

interface SuggestionChipProps {
  suggestion: CategorySuggestion;
  onPress: () => void;
}

function SuggestionChip({ suggestion, onPress }: SuggestionChipProps) {
  const colors = useTheme();
  const pct = Math.round(suggestion.confidence);

  return (
    <TouchableOpacity
      style={ss.suggestionChipWrap}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${suggestion.category_name}, ${pct}% confidence`}
    >
      <Chip
        label={suggestion.category_name}
        onPress={onPress}
        style={ss.chip}
      />
      <Badge
        variant={confidenceBadgeVariant(suggestion.confidence)}
        size="sm"
      >
        {pct}%
      </Badge>
      <Text style={[type_.caption, { color: colors.textTertiary, fontStyle: 'italic' }]}>
        {sourceName(suggestion.source)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginHorizontal: spacing.xl,
  },
  sourcePillRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  chipsSection: {
    marginTop: spacing.lg,
  },
  chipsRow: {
    gap: spacing.sm,
  },
  suggestionChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    // Chip sizes itself by content.
  },
});
