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
 * Review Queue workspace — Categorisation Mode B (spec §7.7).
 *
 * Card-stack interface: one uncategorised transaction at a time, oldest-first.
 * Users resolve each card via gesture (right = confirm, left = defer,
 * up = search) or by tapping a suggestion chip directly on the card face.
 *
 * Depth effect: two static "peek" cards scaled at 0.96 / 0.92 are rendered
 * behind the active card to give a physical card-deck feel.
 *
 * Navigation:
 *   Pushed from the Transactions tab uncategorised banner (Phase 4) when all
 *   clusters have count === 1 (i.e. no batching is possible).
 *   Back button exits to the previous screen.
 *
 * Layout:
 *   ScreenHeader  (darkGreen) + remaining count badge
 *   View (flex: 1)
 *     deck area: peek cards + active ReviewCard
 *     static hint strip below deck (← Later · ↑ Search · Confirm →)
 *   SwipeDirectionHint  (first-session overlay)
 *   CategorySearchSheet (modal)
 */

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategorySearchSheet } from '@/components/categorization/CategorySearchSheet';
import { ReviewCard, ReviewCardSkeleton } from '@/components/categorization/ReviewCard';
import { SwipeDirectionHint } from '@/components/categorization/SwipeDirectionHint';
import { useToast } from '@/components/Toast';
import { Badge, EmptyState, ScreenHeader } from '@/components/ui';
import { useConfirmCategory, useReviewQueue, useUncategorisedQueue } from '@/hooks/useCategorization';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import { Ionicons } from '@expo/vector-icons';
import type { components } from '@monimata/shared-types';

type TransactionResponse = components['schemas']['TransactionResponse'];
type ReviewQueueItem = components['schemas']['ReviewQueueItem'];

// ─── CategorizeQueueScreen ────────────────────────────────────────────────────

export default function CategorizeQueueScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { error: showError } = useToast();

  // ── Data ──────────────────────────────────────────────────────────────────────────────
  // Full list of uncategorised transactions — fetched once, managed locally.
  const { data: txListData, isLoading } = useUncategorisedQueue();
  // Review-queue endpoint is kept for AI suggestions only (matched by tx ID).
  const { data: queueData } = useReviewQueue();
  const confirmMutation = useConfirmCategory();

  // ── Local queue state ───────────────────────────────────────────────────────────────
  // Array of TransactionResponse sorted oldest-first. Defer moves to back;
  // confirm removes from front. No server refetch needed for queue advancement.
  const [queue, setQueue] = useState<TransactionResponse[]>([]);
  const [initialised, setInitialised] = useState(false);
  // Ref mirrors queue state so callbacks can read latest value without
  // being re-created on every queue change (avoids stale-closure bugs).
  const queueRef = useRef<TransactionResponse[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Initialise the queue once from the fetched list (oldest-first).
  useEffect(() => {
    if (!initialised && txListData?.items) {
      const sorted = [...txListData.items].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      setQueue(sorted);
      setInitialised(true);
    }
  }, [txListData, initialised]);

  // ── Derived current item ───────────────────────────────────────────────────────────
  const currentTx = queue[0] ?? null;

  // AI suggestions are available when the server’s “next oldest” matches the
  // local queue head. After confirms they naturally align again; for deferred
  // items that bubble up they may be absent (→ user falls back to “Assign →”).
  const suggestions = useMemo(
    () =>
      queueData?.transaction?.id === currentTx?.id
        ? (queueData?.suggestions ?? [])
        : [],
    [queueData, currentTx?.id],
  );
  // For credit transactions TBB is always prepended as the top suggestion.
  type EffectiveSuggestion = { category_id: string | null; category_name: string };
  const effectiveSuggestions = useMemo((): EffectiveSuggestion[] => {
    const base = suggestions as EffectiveSuggestion[];
    if ((currentTx?.amount ?? 0) > 0) {
      return [{ category_id: null, category_name: 'To Be Budgeted' }, ...base];
    }
    return base;
  }, [currentTx?.amount, suggestions]);
  const currentItem = useMemo<ReviewQueueItem | null>(
    () =>
      currentTx
        ? { transaction: currentTx, suggestions, remaining_count: queue.length }
        : null,
    [currentTx, suggestions, queue.length],
  );

  const [searchVisible, setSearchVisible] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(
    (txId: string, categoryId: string | null) => {
      // Capture tx before removing for potential revert on API error.
      const tx = queueRef.current.find((t) => t.id === txId);
      setQueue((prev) => prev.filter((t) => t.id !== txId));
      confirmMutation.mutate(
        { params: { path: { tx_id: txId } }, body: { category_id: categoryId as string } },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
          onError: () => {
            // Revert: put the transaction back at the front of the queue.
            if (tx) setQueue((prev) => [tx, ...prev.filter((t) => t.id !== txId)]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showError('Error', 'Could not save category. Please try again.');
          },
        },
      );
    },
    [confirmMutation, showError],
  );

  /**
   * Defer: move this transaction to the back of the local queue.
   * No server call — the queue is managed entirely client-side.
   */
  const handleDefer = useCallback((txId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQueue((prev) => {
      const tx = prev.find((t) => t.id === txId);
      if (!tx) return prev;
      return [...prev.filter((t) => t.id !== txId), tx];
    });
  }, []);

  const handleSearchSelect = useCallback(
    (categoryId: string | null) => {
      const id = queueRef.current[0]?.id;
      if (id) handleConfirm(id, categoryId);
    },
    [handleConfirm],
  );

  // ── Derived values ──────────────────────────────────────────────────────
  const remainingCount = queue.length;
  const isEmpty = !isLoading && initialised && queue.length === 0;

  useStatusBarStyle('light');

  // ── Render ────────────────────────────────────────────────────────
  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>

      <ScreenHeader
        title="Review Transactions"
        titleBadge={
          remainingCount > 0 ? (
            <Badge variant="neutral" size="sm">
              {remainingCount}
            </Badge>
          ) : undefined
        }
        onBack={() => router.back()}
        paddingTop={insets.top + spacing.md}
      />

      {isLoading ? (
        /* ── Loading state ── */
        <View style={[ss.deckContainer, { paddingBottom: insets.bottom + spacing.xl }]}>
          <ReviewCardSkeleton />
        </View>
      ) : isEmpty ? (
        /* ── Empty / all-done state ── */
        <EmptyState
          icon={<Ionicons name="checkmark-circle-outline" size={36} color={colors.success} />}
          title="Queue clear!"
          body="Every transaction in your queue has been reviewed."
          action={{
            label: 'Back to Transactions',
            onPress: () => router.back(),
            variant: 'green',
          }}
          style={ss.emptyState}
        />
      ) : (
        /* ── Card deck ── */
        <View style={[ss.deckContainer, { paddingBottom: insets.bottom + spacing.xl }]}>
          {currentItem && (
            <>
              {/* ── Prompt above deck ── */}
              <Text
                style={[
                  type_.h2,
                  { color: colors.textMeta, textAlign: 'center', marginBottom: spacing.xl },
                ]}
              >
                {(currentItem.transaction.amount ?? 0) > 0
                  ? 'Where did this money come from?'
                  : 'What is this money for?'}
              </Text>

              {/* ── Card stack: all three cards share the same wrapper so peek
                   cards automatically match the active card’s bounds. Cards
                   rendered earlier sit behind cards rendered later. ── */}
              <View style={ss.stack}>
                {/* Back card — peeks 16 px from the bottom edge */}
                <View
                  style={[
                    ss.stackCard,
                    shadow.sm,
                    {
                      backgroundColor: colors.cardBg,
                      opacity: 0.45,
                      transform: [{ translateY: 16 }, { scale: 0.92 }],
                    },
                  ]}
                />
                {/* Middle card — peeks 8 px from the bottom edge */}
                <View
                  style={[
                    ss.stackCard,
                    shadow.sm,
                    {
                      backgroundColor: colors.cardBg,
                      opacity: 0.7,
                      transform: [{ translateY: 8 }, { scale: 0.96 }],
                    },
                  ]}
                />
                {/* Active card — rendered last so it sits on top */}
                <ReviewCard
                  key={currentItem.transaction.id}
                  item={currentItem}
                  entering={FadeInRight.springify().damping(26)}
                  onConfirm={handleConfirm}
                  onDefer={handleDefer}
                  onOpenSearch={() => setSearchVisible(true)}
                />
              </View>
            </>
          )}

          {/* ── Action hint buttons below the deck ── */}
          <View style={ss.hintStrip}>
            <TouchableOpacity
              style={[ss.hintBtn, { borderColor: colors.brand }]}
              onPress={() => currentItem && handleDefer(currentItem.transaction.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Defer transaction"
            >
              <Text style={[type_.small, { color: colors.brand }]}>← Later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ss.hintBtn, { borderColor: colors.brand }]}
              onPress={() => setSearchVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Search categories"
            >
              <Text style={[type_.small, { color: colors.brand }]}>↑ Search</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ss.hintBtn, { borderColor: colors.brand }]}
              onPress={() => {
                if (!currentItem) return;
                const top = effectiveSuggestions[0];
                if (top) {
                  handleConfirm(currentItem.transaction.id, top.category_id);
                } else {
                  setSearchVisible(true);
                }
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${effectiveSuggestions.length > 0 ? 'Confirm' : 'Assign'} category`}
            >
              <Text style={[type_.small, { color: colors.brand }]}>
                {effectiveSuggestions.length > 0
                  ? effectiveSuggestions[0].category_id === null
                    ? 'TBB →'
                    : 'Confirm →'
                  : 'Assign →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── First-session gesture overlay ── */}
      <SwipeDirectionHint />

      {/* ── Category search sheet ── */}
      <CategorySearchSheet
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onSelect={(categoryId) => {
          setSearchVisible(false);
          handleSearchSelect(categoryId);
        }}
        disableTBB={(currentTx?.amount ?? 0) < 0}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },

  emptyState: { flex: 1 },

  deckContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: spacing.xl,
  },

  // Stack wrapper — sized by the ReviewCard (normal flow). Peek cards fill
  // this same area via absoluteFillObject and shift down with translateY so
  // they peek from behind the active card's bottom edge.
  stack: {
    marginBottom: spacing.lg, // space for the deepest card's 16 px peek
  },
  stackCard: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: spacing.xl,  // matches ReviewCard's marginHorizontal
    right: spacing.xl,
    borderRadius: radius.lg,
  },

  hintStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxxl,
    marginTop: spacing.xl,
  },
  hintBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
