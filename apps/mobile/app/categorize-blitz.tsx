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
 * Cluster Blitz workspace — Categorisation Mode A (spec §7.5).
 *
 * Presents all uncategorised transactions as Levenshtein-clustered merchant
 * groups.  Each group can be batch-assigned a category in a single tap.
 * Cards are removed optimistically with a spring animation; on mutation
 * error the card re-appears automatically.
 *
 * Navigation:
 *   Pushed from the Transactions tab uncategorised banner (Phase 4).
 *   Back button exits to the previous screen.
 *
 * Layout:
 *   ScreenHeader  (darkGreen)
 *   CategorizationProgress bar
 *   ScrollView
 *     Animated.View (LinearTransition — remaining cards spring into position)
 *       ClusterCard × N
 *   CategorySearchSheet (modal overlay, mounted once)
 */

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategorizationProgress } from '@/components/categorization/CategorizationProgress';
import { CategorySearchSheet } from '@/components/categorization/CategorySearchSheet';
import { ClusterCard, ClusterCardSkeleton } from '@/components/categorization/ClusterCard';
import { useToast } from '@/components/Toast';
import { EmptyState, ScreenHeader } from '@/components/ui';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useCategorizeCluster, useClusters } from '@/hooks/useCategorization';
import { useTheme } from '@/lib/theme';
import { spacing } from '@/lib/tokens';
import { Ionicons } from '@expo/vector-icons';

// ─── CategorizeBlitzScreen ───────────────────────────────────────────────────

export default function CategorizeBlitzScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { error: showError } = useToast();

  const { data, isLoading, isError, refetch } = useClusters();
  const { data: groups = [] } = useCategoryGroups();
  const categorizeMutation = useCategorizeCluster();

  // ── Optimistic state ────────────────────────────────────────────────────
  // dismissedKeys: clusters removed from the list (either confirmed or failed & pending revert)
  // pendingMap:    clusterKey → categoryId for in-flight mutations (chip shows selected state)
  // skippedKeys:   clusters moved to the bottom without an API call
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(new Set());
  const [pendingMap, setPendingMap] = useState<ReadonlyMap<string, string>>(new Map());
  const [skippedKeys, setSkippedKeys] = useState<ReadonlySet<string>>(new Set());

  // Capture the initial total (multi-transaction clusters only) once so the
  // progress denominator stays stable.
  const initialTotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (data && initialTotalRef.current === null) {
      initialTotalRef.current = data.clusters.filter((c) => c.count > 1).length;
    }
  }, [data]);

  // ── Search sheet state ──────────────────────────────────────────────────
  const [searchVisible, setSearchVisible] = useState(false);
  const [activeClusterKey, setActiveClusterKey] = useState<string | null>(null);

  // ── Derived lists ───────────────────────────────────────────────────────
  const allClusters = useMemo(() => data?.clusters ?? [], [data]);

  const visibleClusters = useMemo(() => {
    // Only show clusters with more than one transaction — singletons are handled by the queue.
    const base = allClusters.filter((c) => !dismissedKeys.has(c.key) && c.count > 1);
    // Non-skipped first, then skipped (moved to bottom on Skip tap).
    return [
      ...base.filter((c) => !skippedKeys.has(c.key)),
      ...base.filter((c) => skippedKeys.has(c.key)),
    ];
  }, [allClusters, dismissedKeys, skippedKeys]);

  const initialTotal = initialTotalRef.current ?? allClusters.filter((c) => c.count > 1).length;

  // When data has loaded and no multi-clusters remain but singletons still exist,
  // hand off to the queue screen automatically.
  const noMultiClustersLeft = !isLoading && !isError && data !== undefined && visibleClusters.length === 0;
  const allCategorised = noMultiClustersLeft && (data?.total_uncategorised ?? 0) === 0;
  useEffect(() => {
    if (noMultiClustersLeft && !allCategorised) {
      router.replace('/categorize-queue');
    }
  }, [noMultiClustersLeft, allCategorised]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleCategorize = useCallback(
    (clusterKey: string, categoryId: string) => {
      // Optimistic dismiss.
      setDismissedKeys((prev) => new Set([...prev, clusterKey]));
      setPendingMap((prev) => new Map(prev).set(clusterKey, categoryId));

      categorizeMutation.mutate(
        { body: { cluster_key: clusterKey, category_id: categoryId } },
        {
          onSuccess: () => {
            setPendingMap((prev) => {
              const next = new Map(prev);
              next.delete(clusterKey);
              return next;
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
          onError: () => {
            // Revert optimistic dismiss so the card re-appears.
            setDismissedKeys((prev) => {
              const next = new Set(prev);
              next.delete(clusterKey);
              return next;
            });
            setPendingMap((prev) => {
              const next = new Map(prev);
              next.delete(clusterKey);
              return next;
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showError('Error', 'Could not categorise. Please try again.');
          },
        },
      );
    },
    [categorizeMutation, showError],
  );

  const handleSkip = useCallback((clusterKey: string) => {
    setSkippedKeys((prev) => new Set([...prev, clusterKey]));
  }, []);

  const handleSearchSelect = useCallback(
    (categoryId: string) => {
      if (activeClusterKey) {
        handleCategorize(activeClusterKey, categoryId);
        setActiveClusterKey(null);
      }
    },
    [activeClusterKey, handleCategorize],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  const isEmpty =
    !isLoading &&
    !isError &&
    allCategorised;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <ScreenHeader
        title="Categorise Transactions"
        onBack={() => router.back()}
        paddingTop={insets.top + spacing.md}
      />

      {isLoading ? (
        /* ── Loading state ── */
        <ScrollView contentContainerStyle={ss.scrollContent}>
          <CategorizationProgress remaining={0} total={0} />
          {[0, 1, 2].map((i) => (
            <ClusterCardSkeleton key={i} />
          ))}
        </ScrollView>
      ) : isError ? (
        /* ── Network error state ── */
        <EmptyState
          icon={<Ionicons name="cloud-offline-outline" size={36} color={colors.textMeta} />}
          title="Couldn't load clusters"
          body="Check your connection and try again."
          action={{
            label: 'Retry',
            onPress: () => refetch(),
            variant: 'green',
          }}
          style={ss.emptyState}
        />
      ) : isEmpty ? (
        /* ── Empty / all-done state ── */
        <EmptyState
          icon={<Ionicons name="checkmark-circle-outline" size={36} color={colors.success} />}
          title="All caught up!"
          body="Every merchant has been categorised."
          action={{
            label: 'Back to Transactions',
            onPress: () => router.back(),
            variant: 'green',
          }}
          style={ss.emptyState}
        />
      ) : (
        /* ── Cluster list ── */
        <ScrollView
          contentContainerStyle={[
            ss.scrollContent,
            { paddingBottom: insets.bottom + spacing.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <CategorizationProgress
            remaining={visibleClusters.length}
            total={initialTotal}
          />

          {/* Each card gets its own layout wrapper so LinearTransition's
               transform never conflicts with the card's entering/exiting
               transforms (Reanimated requires separate nodes for each). */}
          <View>
            {visibleClusters.map((cluster) => (
              <Animated.View
                key={cluster.key}
                layout={LinearTransition.springify().damping(28)}
              >
                <ClusterCard
                  cluster={cluster}
                  groups={groups}
                  onCategorize={handleCategorize}
                  onSkip={() => handleSkip(cluster.key)}
                  pendingCategoryId={pendingMap.get(cluster.key)}
                  onMorePress={() => {
                    setActiveClusterKey(cluster.key);
                    setSearchVisible(true);
                  }}
                />
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Category search sheet (mounted once, toggled by state) ── */}
      <CategorySearchSheet
        visible={searchVisible}
        onClose={() => {
          setSearchVisible(false);
          setActiveClusterKey(null);
        }}
        onSelect={(categoryId) => handleSearchSelect(categoryId)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingTop: spacing.lg,
  },
  emptyState: {
    flex: 1,
  },
});
