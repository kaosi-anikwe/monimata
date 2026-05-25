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
 * Post detail screen — renders a single Sanity CMS post.
 *
 * Route: /post/[slug]
 *
 * Sections (top → bottom):
 *   1. Full-bleed cover image with overlaid back button
 *   2. Category · title · author row
 *   3. Tags
 *   4. Portable Text body
 *
 * Skeleton loading replaces the entire screen until data is ready.
 * Pull-to-refresh re-fetches from /content/posts/{slug}.
 *
 * Accessibility: back button has accessibilityRole="button".
 * Touch targets: all tappable elements ≥ 44 pt.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePost } from '@/hooks/usePosts';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';

// ── Portable Text types ───────────────────────────────────────────────────────

type PTSpan = { _type: 'span'; _key?: string; text: string; marks?: string[] };
type PTMarkDef = { _key: string; _type: string; href?: string };

/** Standard text / heading / blockquote block */
type PTBlock = {
  _type: 'block';
  _key: string;
  style: 'normal' | 'h2' | 'h3' | 'h4' | 'blockquote';
  listItem?: undefined;
  children: PTSpan[];
  markDefs?: PTMarkDef[];
};

/** Bullet or numbered list item block */
type PTListBlock = {
  _type: 'block';
  _key: string;
  style: 'normal';
  listItem: 'bullet' | 'number';
  level: number;
  children: PTSpan[];
  markDefs?: PTMarkDef[];
};

type PTImage = {
  _type: 'image';
  _key: string;
  asset?: { url?: string };
  alt?: string;
  caption?: string;
};

type PTCodeBlock = {
  _type: 'codeBlock';
  _key: string;
  code?: string;
  language?: string;
  filename?: string;
};

type PTCallout = {
  _type: 'callout';
  _key: string;
  type?: 'info' | 'warning' | 'tip' | 'note';
  text?: string;
};

type PTVideoEmbed = {
  _type: 'videoEmbed';
  _key: string;
  url?: string;
  caption?: string;
};

type PTBodyBlock = PTBlock | PTListBlock | PTImage | PTCodeBlock | PTCallout | PTVideoEmbed;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Portable Text renderer ────────────────────────────────────────────────────

function renderSpans(
  children: PTSpan[],
  markDefs: PTMarkDef[],
  colors: ReturnType<typeof useTheme>,
  ss: ReturnType<typeof makeStyles>,
): React.ReactNode[] {
  return children.map((span, i) => {
    if (span._type !== 'span') return null;

    const marks = span.marks ?? [];
    const isCode = marks.includes('code');
    const linkKey = marks.find((m) => markDefs.some((md) => md._key === m));
    const linkDef = linkKey ? markDefs.find((md) => md._key === linkKey) : null;

    const inlineStyle: TextStyle = {};
    if (marks.includes('strong')) inlineStyle.fontWeight = '700';
    if (marks.includes('em')) inlineStyle.fontStyle = 'italic';
    if (marks.includes('underline')) inlineStyle.textDecorationLine = 'underline';
    if (marks.includes('strike-through')) inlineStyle.textDecorationLine = 'line-through';

    const key = span._key ?? String(i);

    if (isCode) {
      return (
        <Text
          key={key}
          style={[ss.inlineCode, { color: colors.brand, backgroundColor: colors.surface }]}
        >
          {span.text}
        </Text>
      );
    }

    if (linkDef?.href) {
      return (
        <Text
          key={key}
          style={[{ color: colors.brand, textDecorationLine: 'underline' }, inlineStyle]}
          onPress={() => linkDef.href && Linking.openURL(linkDef.href)}
          accessibilityRole="link"
          accessibilityLabel={span.text}
        >
          {span.text}
        </Text>
      );
    }

    if (Object.keys(inlineStyle).length > 0) {
      return (
        <Text key={key} style={inlineStyle}>
          {span.text}
        </Text>
      );
    }

    return span.text;
  });
}

function renderBlock(
  block: PTBlock,
  colors: ReturnType<typeof useTheme>,
  ss: ReturnType<typeof makeStyles>,
): React.ReactNode {
  const markDefs = block.markDefs ?? [];
  const spans = renderSpans(block.children, markDefs, colors, ss);

  switch (block.style) {
    case 'h2':
      return (
        <Text key={block._key} style={[ss.bodyH2, { color: colors.textPrimary, ...ff(800) }]}>
          {spans}
        </Text>
      );
    case 'h3':
      return (
        <Text key={block._key} style={[ss.bodyH3, { color: colors.textPrimary, ...ff(700) }]}>
          {spans}
        </Text>
      );
    case 'h4':
      return (
        <Text key={block._key} style={[ss.bodyH4, { color: colors.textPrimary, ...ff(600) }]}>
          {spans}
        </Text>
      );
    case 'blockquote':
      return (
        <View key={block._key} style={[ss.blockquote, { borderLeftColor: colors.brand }]}>
          <Text style={[ss.bodyQuote, { color: colors.textSecondary }]}>{spans}</Text>
        </View>
      );
    default:
      return (
        <Text key={block._key} style={[ss.bodyP, { color: colors.textPrimary }]}>
          {spans}
        </Text>
      );
  }
}

function renderListGroup(
  blocks: PTListBlock[],
  colors: ReturnType<typeof useTheme>,
  ss: ReturnType<typeof makeStyles>,
): React.ReactNode {
  const isNumbered = blocks[0].listItem === 'number';
  // Track per-level counters for numbered lists
  const levelCount: Record<number, number> = {};
  return (
    <View key={blocks[0]._key} style={ss.list}>
      {blocks.map((block) => {
        const level = block.level ?? 1;
        const indent = (level - 1) * spacing.lg;
        let bullet: string;
        if (isNumbered) {
          levelCount[level] = (levelCount[level] ?? 0) + 1;
          // Reset deeper levels when going back up
          Object.keys(levelCount).forEach((l) => {
            if (Number(l) > level) delete levelCount[Number(l)];
          });
          bullet = `${levelCount[level]}.`;
        } else {
          bullet = level === 1 ? '\u2022' : level === 2 ? '\u25E6' : '\u2013';
        }
        const spans = renderSpans(block.children, block.markDefs ?? [], colors, ss);
        return (
          <View key={block._key} style={[ss.listItem, { paddingLeft: indent }]}>
            <Text style={[ss.listBullet, { color: colors.brand, ...ff(isNumbered ? 600 : 800) }]}>
              {bullet}
            </Text>
            <Text style={[ss.listContent, { color: colors.textPrimary }]}>{spans}</Text>
          </View>
        );
      })}
    </View>
  );
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

function extractVimeoId(url: string): string | null {
  const m = url.match(
    /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/|ondemand\/[^/]+\/)?([0-9]+)/,
  );
  return m ? m[1] : null;
}

/** Renders a video thumbnail; tapping opens the video in the YouTube / Vimeo app or browser. */
function VideoCard({
  block,
  colors,
  ss,
}: {
  block: PTVideoEmbed;
  colors: ReturnType<typeof useTheme>;
  ss: ReturnType<typeof makeStyles>;
}) {
  if (!block.url) return null;

  const ytId = extractYouTubeId(block.url);
  const vimeoId = !ytId ? extractVimeoId(block.url) : null;
  const isYouTube = !!ytId;

  // youtu.be short links open the YouTube app on mobile; vimeo.com links open the Vimeo app
  const openUrl = ytId
    ? `https://youtu.be/${ytId}`
    : vimeoId
      ? `https://vimeo.com/${vimeoId}`
      : block.url;

  return (
    <TouchableOpacity
      style={[ss.videoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => Linking.openURL(openUrl)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={block.caption ? `Play video: ${block.caption}` : 'Play video'}
    >
      <View style={ss.videoThumbWrap}>
        {isYouTube ? (
          <Image
            source={{ uri: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.darkGreen, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name={vimeoId ? 'logo-vimeo' : 'videocam-outline'} size={44} color="rgba(255,255,255,0.65)" />
          </View>
        )}
        <View style={ss.videoPlayOverlay}>
          <View style={ss.videoPlayBtn}>
            <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
          </View>
        </View>
      </View>
      {block.caption && (
        <Text style={[ss.videoCaption, { color: colors.textMeta }]}>{block.caption}</Text>
      )}
    </TouchableOpacity>
  );
}

function renderImageBlock(
  block: PTImage,
  colors: ReturnType<typeof useTheme>,
  ss: ReturnType<typeof makeStyles>,
): React.ReactNode {
  const uri = block.asset?.url;
  if (!uri) return null;
  return (
    <View key={block._key} style={ss.imageBlock}>
      <Image
        source={{ uri }}
        style={ss.imageBlockImg}
        contentFit="cover"
        accessibilityLabel={block.alt ?? ''}
      />
      {block.caption && (
        <Text style={[ss.imageCaption, { color: colors.textMeta }]}>{block.caption}</Text>
      )}
    </View>
  );
}

function renderCodeBlock(
  block: PTCodeBlock,
  colors: ReturnType<typeof useTheme>,
  ss: ReturnType<typeof makeStyles>,
): React.ReactNode {
  return (
    <View key={block._key} style={[ss.codeBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {(block.filename || block.language) && (
        <View style={[ss.codeHeader, { borderBottomColor: colors.border }]}>
          <Text style={[ss.codeLang, { color: colors.textMeta }]}>
            {block.filename ?? block.language}
          </Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={[ss.codeText, { color: colors.textPrimary }]}>{block.code}</Text>
      </ScrollView>
    </View>
  );
}

const CALLOUT_CONFIG: Record<
  string,
  { icon: React.ComponentProps<typeof Ionicons>['name']; getColors: (c: ReturnType<typeof useTheme>) => { bg: string; border: string; fg: string } }
> = {
  info: { icon: 'information-circle', getColors: (c) => ({ bg: c.infoSubtle, border: c.infoBorder, fg: c.info }) },
  warning: { icon: 'warning', getColors: (c) => ({ bg: c.warningSubtle, border: c.warningBorder, fg: c.warning }) },
  tip: { icon: 'bulb', getColors: (c) => ({ bg: c.successSubtle, border: c.successBorder, fg: c.successText }) },
  note: { icon: 'document-text', getColors: (c) => ({ bg: c.surface, border: c.border, fg: c.textMeta }) },
};

function renderCalloutBlock(
  block: PTCallout,
  colors: ReturnType<typeof useTheme>,
  ss: ReturnType<typeof makeStyles>,
): React.ReactNode {
  if (!block.text) return null;
  const cfg = CALLOUT_CONFIG[block.type ?? 'info'] ?? CALLOUT_CONFIG.info;
  const cv = cfg.getColors(colors);
  return (
    <View key={block._key} style={[ss.callout, { backgroundColor: cv.bg, borderColor: cv.border }]}>
      <Ionicons name={cfg.icon} size={17} color={cv.fg} style={{ marginTop: 2 }} />
      <Text style={[ss.calloutText, { color: colors.textPrimary }]}>{block.text}</Text>
    </View>
  );
}

/**
 * Top-level body renderer — groups consecutive list items then dispatches
 * each block to the appropriate render function.
 */
function renderBody(
  blocks: PTBodyBlock[],
  colors: ReturnType<typeof useTheme>,
  ss: ReturnType<typeof makeStyles>,
): React.ReactNode[] {
  const output: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block._type === 'block' && block.listItem) {
      // Collect consecutive list items of the same listItem type
      const listType = block.listItem;
      const group: PTListBlock[] = [];
      while (i < blocks.length) {
        const b = blocks[i];
        if (b._type === 'block' && b.listItem === listType) {
          group.push(b as PTListBlock);
          i++;
        } else break;
      }
      output.push(renderListGroup(group, colors, ss));
    } else {
      switch (block._type) {
        case 'block': output.push(renderBlock(block, colors, ss)); break;
        case 'image': output.push(renderImageBlock(block, colors, ss)); break;
        case 'codeBlock': output.push(renderCodeBlock(block, colors, ss)); break;
        case 'callout': output.push(renderCalloutBlock(block, colors, ss)); break;
        case 'videoEmbed': output.push(<VideoCard key={block._key} block={block as PTVideoEmbed} colors={colors} ss={ss} />); break;
      }
      i++;
    }
  }
  return output;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function PostDetailSkeleton({
  ss,
  colors,
}: {
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Hero image placeholder */}
      <Skeleton width="100%" height={220} borderRadius={0} />

      <View style={ss.content}>
        {/* Category */}
        <Skeleton width="25%" height={12} />
        {/* Title */}
        <View style={ss.skTitleBlock}>
          <Skeleton width="95%" height={22} />
          <Skeleton width="72%" height={22} style={{ marginTop: spacing.xs }} />
        </View>
        {/* Author row */}
        <View style={ss.skAuthorRow}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <View style={ss.skAuthorText}>
            <Skeleton width={110} height={13} />
            <Skeleton width={76} height={11} style={{ marginTop: spacing.xxs }} />
          </View>
        </View>
        {/* Body lines */}
        <View style={ss.skBody}>
          {[100, 95, 82, 100, 90, 60, 100, 88, 74].map((w, i) => (
            <Skeleton key={i} width={`${w}%`} height={14} style={{ marginBottom: spacing.sm }} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const ss = makeStyles(colors, insets.bottom);

  const [refreshing, setRefreshing] = useState(false);
  const { data: post, isLoading, isError, refetch } = usePost(slug ?? '');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={[ss.root, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <ScreenHeader
          title="Knowledge Hub"
          onBack={() => router.back()}
          paddingTop={insets.top + spacing.lg}
        />
        <PostDetailSkeleton ss={ss} colors={colors} />
      </View>
    );
  }

  if (isError || !post) {
    return (
      <View style={[ss.root, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <ScreenHeader
          title="Knowledge Hub"
          onBack={() => router.back()}
          paddingTop={insets.top + spacing.lg}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flex: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
        >
          <View style={ss.errCenter}>
            <Text style={[ss.errTxt, { color: colors.textMeta, ...ff(500) }]}>
              Could not load post. Pull down to retry.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  const hasCover = !!post.cover_image;

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <ScreenHeader
        title={post.category?.name ?? 'Knowledge Hub'}
        onBack={() => router.back()}
        paddingTop={insets.top + spacing.lg}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 4) + spacing.xxxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* ── Hero image ──────────────────────────────────────────────────── */}
        <View style={ss.hero}>
          {hasCover ? (
            <Image
              source={{ uri: post.cover_image! }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={post.title}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.darkGreen, alignItems: 'center', justifyContent: 'center' }]}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={ss.heroLogoFallback}
                contentFit="contain"
                tintColor="rgba(255,255,255,0.2)"
              />
            </View>
          )}
        </View>

        {/* ── Metadata ────────────────────────────────────────────────────── */}
        <View style={ss.content}>
          {post.category && (
            <Text style={[ss.category, { color: colors.brand }]}>
              {post.category.name.toUpperCase()}
            </Text>
          )}

          <Text style={[ss.title, { color: colors.textPrimary, ...ff(800) }]}>
            {post.title}
          </Text>

          {/* Author row */}
          {post.author && (
            <View style={ss.authorRow}>
              {post.author.avatar ? (
                <Image
                  source={{ uri: post.author.avatar }}
                  style={ss.authorAvatar}
                  contentFit="cover"
                  accessibilityLabel={post.author.name}
                />
              ) : (
                <View style={[ss.authorAvatar, ss.authorAvatarFallback, { backgroundColor: colors.surface }]}>
                  <Ionicons name="person" size={16} color={colors.textMeta} />
                </View>
              )}
              <View>
                <Text style={[ss.authorName, { color: colors.textPrimary, ...ff(600) }]}>
                  {post.author.name}
                </Text>
                {post.published_at && (
                  <Text style={[ss.authorDate, { color: colors.textMeta }]}>
                    {formatDate(post.published_at)}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <View style={ss.tagsRow}>
              {post.tags.map((tag) => (
                <View key={tag} style={[ss.tagPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[ss.tagTxt, { color: colors.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Divider */}
          <View style={[ss.divider, { backgroundColor: colors.separator }]} />

          {/* Body */}
          {post.body && post.body.length > 0 && (
            <View style={ss.body}>
              {renderBody(post.body as PTBodyBlock[], colors, ss)}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>, _bottomInset: number) {
  return StyleSheet.create({
    root: { flex: 1 },
    scroll: { flex: 1 },

    // ── Hero ──────────────────────────────────────────────────────────────────
    hero: {
      width: '100%',
      height: 220,
      overflow: 'hidden',
    },
    heroLogoFallback: {
      width: 120,
      height: 120,
      opacity: 0.3,
    },

    // ── Metadata + body container ─────────────────────────────────────────────
    content: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
    },
    category: {
      ...type_.labelSm,
      letterSpacing: 0.8,
      marginBottom: spacing.xs,
    },
    title: {
      ...type_.h2,
      lineHeight: 32,
      marginBottom: spacing.md,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    authorAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    authorAvatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    authorName: {
      ...type_.bodyReg,
    },
    authorDate: {
      ...type_.caption,
      marginTop: 2,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    tagPill: {
      borderRadius: radius.xs,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    tagTxt: { ...type_.caption },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginBottom: spacing.xl,
    },

    // ── Portable Text body ────────────────────────────────────────────────────
    body: { gap: spacing.md, paddingBottom: spacing.lg },
    bodyP: { ...type_.body, lineHeight: 26 },
    // Article headings use a purpose-built scale, not the UI token sizes
    bodyH2: { fontSize: 24, lineHeight: 31, letterSpacing: -0.5, marginTop: spacing.lg, marginBottom: spacing.xs },
    bodyH3: { fontSize: 20, lineHeight: 27, letterSpacing: -0.3, marginTop: spacing.md, marginBottom: spacing.xxs },
    bodyH4: { fontSize: 17, lineHeight: 23, letterSpacing: -0.2, marginTop: spacing.sm },
    blockquote: {
      borderLeftWidth: 3,
      paddingLeft: spacing.md,
      marginVertical: spacing.sm,
    },
    bodyQuote: { ...type_.body, lineHeight: 26, fontStyle: 'italic' },
    inlineCode: {
      fontFamily: 'monospace',
      fontSize: 13,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: radius.xxs,
    },

    // ── Lists ─────────────────────────────────────────────────────────────────
    list: { gap: spacing.xs },
    listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    listBullet: { ...type_.body, lineHeight: 26, minWidth: spacing.lg, textAlign: 'right' },
    listContent: { ...type_.body, lineHeight: 26, flex: 1 },

    // ── Video embed ───────────────────────────────────────────────────────────
    videoCard: {
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: 'hidden',
    },
    videoThumbWrap: {
      width: '100%',
      aspectRatio: 16 / 9,
      position: 'relative',
    },
    videoPlayOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoPlayBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoCaption: { ...type_.caption, padding: spacing.sm, paddingTop: spacing.xs },

    // ── Inline image ──────────────────────────────────────────────────────────
    imageBlock: { borderRadius: radius.md, overflow: 'hidden' },
    imageBlockImg: { width: '100%', aspectRatio: 16 / 9 },
    imageCaption: { ...type_.caption, marginTop: spacing.xs, textAlign: 'center' },

    // ── Code block ───────────────────────────────────────────────────────────
    codeBlock: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
    codeHeader: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
    codeLang: { fontFamily: 'monospace', fontSize: 12 },
    codeText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20, padding: spacing.md },

    // ── Callout ───────────────────────────────────────────────────────────────
    callout: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    calloutText: { ...type_.bodyReg, lineHeight: 22, flex: 1 },

    // ── Skeleton helpers ──────────────────────────────────────────────────────
    skTitleBlock: { marginTop: spacing.xs },
    skAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
    skAuthorText: { gap: spacing.xxs },
    skBody: { marginTop: spacing.xl },

    // ── Error state ───────────────────────────────────────────────────────────
    errCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    errTxt: { ...type_.body, textAlign: 'center' },
  });
}
