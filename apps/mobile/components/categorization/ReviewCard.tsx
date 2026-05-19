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

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
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

  // ── Action handlers ────────────────────────────────────────────────────────────
  // Gesture runs on the JS thread (.runOnJS(true) below) so these can be
  // called directly without any runOnJS wrapper.
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
  // When there are no suggestions right-swipe opens the search sheet rather
  // than trying to confirm with an empty category id.
  const hasSuggestion = suggestions.length > 0;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_X) {
        if (hasSuggestion) {
          // Right — confirm with top suggestion
          translateX.value = withTiming(600, { duration: 280 });
          handleConfirmAction(topCategoryId);
        } else {
          // No suggestions — right swipe opens search instead
          translateX.value = withSpring(0, { damping: 28 });
          translateY.value = withSpring(0, { damping: 28 });
          handleSearchAction();
        }
      } else if (e.translationX < -SWIPE_X) {
        // Left — defer
        translateX.value = withTiming(-600, { duration: 280 });
        handleDeferAction();
      } else if (e.translationY < -SWIPE_Y) {
        // Up — open search, spring back to center
        translateX.value = withSpring(0, { damping: 28 });
        translateY.value = withSpring(0, { damping: 28 });
        handleSearchAction();
      } else {
        // No threshold reached — spring back
        translateX.value = withSpring(0, { damping: 28 });
        translateY.value = withSpring(0, { damping: 28 });
      }
    });

  // ── Animated styles ─────────────────────────────────────────────────────
  const animStyle = useAnimatedStyle(() => {
    // Determine background tint from drag direction.
    let bgColor: string;
    if (translateX.value > 0) {
      // Right pull → green tint when confirming, info tint when no suggestion
      bgColor = interpolateColor(
        translateX.value,
        [0, SWIPE_X],
        [colors.cardBg, hasSuggestion ? colors.successSubtle : colors.infoSubtle],
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
  // Two separate Animated.View nodes so Reanimated never has to drive both
  // an entering animation and a useAnimatedStyle transform on the same node:
  //   outer — owns `entering` (FadeInRight)
  //   inner — owns `animStyle` (drag translateX/Y + background tint)
  return (
    <Animated.View entering={entering} style={[ss.shadowWrap, shadow.md, { backgroundColor: colors.cardBg }]}>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[ss.card, animStyle]}
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
            style={[type_.subHead, { color: colors.textPrimary, marginTop: spacing.lg }]}
            numberOfLines={2}
          >
            {tx.narration}
          </Text>

          {/* ── Meta line (source + date) ── */}
          <Text
            style={[type_.body, { color: colors.textMeta, marginTop: spacing.sm }]}
            numberOfLines={1}
          >
            {sourceName(tx.source)} · {txDate(tx.date)}
          </Text>

          {/* ── Existing categorization source badge (if auto-categorised) ── */}
          {tx.categorization_source && (
            <View style={ss.sourcePillRow}>
              {tx.categorization_source === 'llm' ? (
                <View style={[ss.llmChip, { backgroundColor: colors.successSubtle, borderColor: colors.successBorder }]}>
                  <Ionicons name="sparkles" size={11} color={colors.success} />
                  <Text style={[type_.labelSm, { color: colors.success }]}>AI</Text>
                </View>
              ) : (
                <Badge variant="lime" size="sm">
                  {sourceName(tx.categorization_source)}
                </Badge>
              )}
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
    </Animated.View>
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
  // Outer wrapper: owns the shadow so it's never on the same node as a
  // transform (avoids the elevation/borderRadius artefact on Android).
  shadowWrap: {
    marginHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.xxl,
  },
  sourcePillRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  llmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipsSection: {
    marginTop: spacing.xl,
  },
  chipsRow: {
    gap: spacing.md,
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

// ─── ReviewCardSkeleton ───────────────────────────────────────────────────────

/** Pulsing placeholder shown while the review queue is loading. */
export function ReviewCardSkeleton() {
  const colors = useTheme();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View
      style={[
        skelSs.card,
        shadow.md,
        { backgroundColor: colors.cardBg, marginHorizontal: spacing.xl },
      ]}
    >
      <Animated.View style={pulseStyle}>
        {/* Amount placeholder */}
        <View style={[skelSs.line, { width: '45%', height: spacing.xxxl, backgroundColor: colors.surfaceElevated }]} />
        {/* Narration placeholder */}
        <View style={[skelSs.line, { width: '90%', height: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surface }]} />
        <View style={[skelSs.line, { width: '65%', height: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.surface }]} />
        {/* Meta placeholder */}
        <View style={[skelSs.line, { width: '50%', height: spacing.md, marginTop: spacing.sm, backgroundColor: colors.surface }]} />
        {/* Suggestion chips placeholder */}
        <View style={[skelSs.chipsRow, { marginTop: spacing.xl }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[skelSs.chip, { backgroundColor: colors.surface }]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const skelSs = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  line: {
    borderRadius: radius.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    height: spacing.xl + spacing.sm,
    width: spacing.xxxl + spacing.xxxl,
    borderRadius: radius.xs,
  },
});
