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
 * Knowledge Hub screen — posts from Sanity CMS, proxied via /content/posts.
 *
 * Categories are derived from the fetched posts and drive the filter chips.
 * Cover images are rendered from Sanity CDN URLs; a greyed logo is shown
 * when a post has no cover image.
 *
 * Accessibility: every interactive element has accessibilityRole + accessibilityLabel.
 * Touch targets: all tappable rows/cards ≥ 44 pt.
 */

import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePosts } from '@/hooks/usePosts';
import { useTheme } from '@/lib/theme';
import { layout, radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import type { components } from '@monimata/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────

type PostSummary = components['schemas']['PostSummary'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format an ISO date string to a short human-readable date. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Skeleton placeholder for a single post card while loading */
function PostCardSkeleton({
  ss,
  colors,
}: {
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  const thumbSize = layout.avatarLg + spacing.smd;
  return (
    <View style={[ss.artCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <Skeleton width={thumbSize} height={thumbSize} borderRadius={radius.sm} />
      <View style={[ss.artContent, { gap: spacing.xs }]}>
        <Skeleton width="28%" height={11} />
        <Skeleton width="95%" height={15} />
        <Skeleton width="70%" height={15} />
        <Skeleton width="22%" height={11} />
      </View>
    </View>
  );
}

/** Single post card row */
function PostCard({
  post,
  onPress,
  ss,
  colors,
}: {
  post: PostSummary;
  onPress: () => void;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  return (
    <TouchableOpacity
      style={[ss.artCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Post: ${post.title}`}
    >
      {/* Cover image / greyed logo fallback */}
      <View style={[ss.artThumb, { backgroundColor: colors.surface, overflow: 'hidden' }]}>
        {post.cover_image ? (
          <Image
            source={{ uri: post.cover_image }}
            style={ss.coverImg}
            contentFit="cover"
            accessibilityLabel={post.title}
          />
        ) : (
          <Image
            source={require('@/assets/images/logo.png')}
            style={ss.logoFallback}
            contentFit="contain"
            tintColor={colors.borderStrong}
          />
        )}
      </View>

      {/* Content */}
      <View style={ss.artContent}>
        {post.category && (
          <Text style={[ss.artTag, { color: colors.brand }]}>{post.category.name}</Text>
        )}
        <Text
          style={[ss.artTitle, { color: colors.textPrimary, ...ff(700) }]}
          numberOfLines={2}
        >
          {post.title}
        </Text>
        {(post.author || post.published_at) && (
          <View style={ss.artMeta}>
            {post.author && (
              <Text style={[ss.artMetaTxt, { color: colors.textMeta }]} numberOfLines={1}>
                {post.author.name}
              </Text>
            )}
            {post.author && post.published_at && (
              <Text style={[ss.artMetaTxt, { color: colors.textMeta }]}> · </Text>
            )}
            {post.published_at && (
              <Text style={[ss.artMetaTxt, { color: colors.textMeta }]}>
                {formatDate(post.published_at)}
              </Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HubScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors, insets.bottom);

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = usePosts({ limit: 50 });
  const posts = useMemo(() => data?.items ?? [], [data?.items]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Derive unique category names from posts in the order they first appear
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = ['All'];
    for (const post of posts) {
      if (post.category && !seen.has(post.category.slug)) {
        seen.add(post.category.slug);
        list.push(post.category.name);
      }
    }
    return list;
  }, [posts]);

  const visiblePosts =
    activeCategory === 'All'
      ? posts
      : posts.filter((p) => p.category?.name === activeCategory);

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <ScreenHeader
        title="Knowledge Hub"
        subtitle="Financial knowledge made for Nigerians"
        onBack={() => router.back()}
        paddingTop={insets.top + spacing.lg}
      />

      {/* ── Content ─────────────────────────────────────────────────────────── */}

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {isLoading ? (
          /* Skeleton loading state */
          <View style={[ss.artList, { paddingTop: spacing.mdn }]}>
            {Array.from({ length: 5 }).map((_, i) => (
              <PostCardSkeleton key={i} ss={ss} colors={colors} />
            ))}
          </View>
        ) : isError ? (
          <View style={ss.centered}>
            <Text style={[ss.emptyTxt, { color: colors.textMeta, ...ff(500) }]}>
              Could not load posts. Pull down to retry.
            </Text>
          </View>
        ) : (
          <>
            {/* Category filter chips — only shown when there are categories */}
            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={ss.chips}
              >
                {categories.map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    selected={activeCategory === cat}
                    onPress={() => setActiveCategory(cat)}
                    accessibilityLabel={`Filter by ${cat}`}
                  />
                ))}
              </ScrollView>
            )}

            {/* Post list */}
            <View style={ss.artList}>
              {visiblePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onPress={() => router.push(`/hub/post/${post.slug}` as never)}
                  ss={ss}
                  colors={colors}
                />
              ))}
              {visiblePosts.length === 0 && (
                <View style={ss.emptyWrap}>
                  <Text style={[ss.emptyTxt, { color: colors.textMeta, ...ff(500) }]}>
                    No posts in this category yet.
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>, bottomInset: number) {
  return StyleSheet.create({
    // Layout
    root: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: Math.max(bottomInset, 4) + spacing.xl },
    centered: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxxl },

    // ── Category chips ────────────────────────────────────────────────────────
    chips: {
      flexDirection: 'row',
      gap: spacing.sm - 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },

    // ── Post list ─────────────────────────────────────────────────────────────
    artList: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
    artCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.md,
      ...shadow.sm,
    },
    artThumb: {
      width: layout.avatarLg + spacing.smd,
      height: layout.avatarLg + spacing.smd,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    coverImg: {
      width: '100%',
      height: '100%',
    },
    logoFallback: {
      width: '60%',
      height: '60%',
    },
    artContent: { flex: 1, minWidth: 0 },
    artTag: { ...type_.labelSm },
    artTitle: { ...type_.bodyReg, lineHeight: 21, marginTop: spacing.xxs },
    artMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.xxs },
    artMetaTxt: { ...type_.caption },
    emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
    emptyTxt: { ...type_.body },
  });
}
