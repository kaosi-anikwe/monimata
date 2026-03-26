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
 * Rewards & Gamification screen — XP bar, streak, badges, active challenges.
 *
 * Phase 14 — all data is static seed (fake). Phase 16 will connect to
 * the Gamification service endpoints listed in the migration plan.
 * See docs/UI_MIGRATION_PLAN.md Phase 14 for full backend design notes.
 *
 * Tapping a challenge navigates to /challenge/[id].
 */

import { router } from 'expo-router';
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ff } from '@/lib/typography';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/Toast';
import { Badge, Button, ProgressBar } from '@/components/ui';
import { hitSlop, layout, radius, shadow, spacing } from '@/lib/tokens';

// ── Fake seed data ────────────────────────────────────────────────────────────
// Phase 16 replaces with useGamification() / useStreak() / useBadges() / useChallenges().

const FAKE_LEVEL = 7;
const FAKE_LEVEL_TITLE = 'Consistent Saver';
const FAKE_XP_CURRENT = 2840;
const FAKE_XP_NEXT_LEVEL = 4200;
const FAKE_XP_TO_NEXT = 1360;
const FAKE_STREAK = 14;

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const TODAY_IDX = (new Date().getDay() + 6) % 7; // Mon-indexed

function streakDayState(i: number): 'done' | 'today' | 'future' {
  if (i === TODAY_IDX) return 'today';
  const diff = TODAY_IDX - i;
  // Show last 4 days as done (capped by streak count)
  if (diff > 0 && diff <= Math.min(FAKE_STREAK - 1, 6)) return 'done';
  return 'future';
}

// ── Badge data type ───────────────────────────────────────────────────────────

interface Badge {
  slug: string;
  emoji: string;
  name: string;
  earned: boolean;
  isNew?: boolean;
  lockHint?: string;          // shown when locked
}

const BADGES: Badge[] = [
  { slug: 'first_budget', emoji: '🥇', name: 'First Budget', earned: true, isNew: true },
  { slug: 'streak_7', emoji: '🔥', name: '7-Day Streak', earned: true },
  { slug: 'goal_setter', emoji: '🎯', name: 'Goal Setter', earned: true },
  { slug: 'streak_30', emoji: '🏆', name: '30-Day Streak', earned: false, lockHint: '16 left' },
  { slug: 'diamond', emoji: '💎', name: 'Diamond Saver', earned: false, lockHint: 'Save ₦1M' },
  { slug: 'scholar', emoji: '📚', name: 'Scholar', earned: false, lockHint: '5 courses' },
];

// ── Challenge data type ───────────────────────────────────────────────────────

type ChallengeColor = 'g' | 'a' | 'b' | 'p';

interface Challenge {
  id: string;
  emoji: string;
  color: ChallengeColor;
  title: string;
  description: string;
  xp: number;
  progressPct: number;
  progressLabel: string;     // e.g. "Ends in 2 days" or "₦7,500/₦10,000"
  joined: boolean;
}

const CHALLENGES: Challenge[] = [
  {
    id: 'nospend',
    emoji: '🎯',
    color: 'g',
    title: 'No-Spend Weekend',
    description: 'No non-essentials Sat & Sun',
    xp: 150,
    progressPct: 0.6,
    progressLabel: 'Ends in 2 days',
    joined: true,
  },
  {
    id: 'literacy',
    emoji: '📚',
    color: 'a',
    title: 'Financial Literacy Week',
    description: 'Read 3 articles in the Hub',
    xp: 200,
    progressPct: 0,
    progressLabel: '5 days left',
    joined: false,
  },
  {
    id: 'save10k',
    emoji: '💸',
    color: 'b',
    title: 'Save ₦10,000 This Week',
    description: 'Add to any goal by Sunday',
    xp: 300,
    progressPct: 0.75,
    progressLabel: '₦7,500/₦10,000',
    joined: true,
  },
  {
    id: 'zero',
    emoji: '🧩',
    color: 'p',
    title: 'Budget Zero Hero',
    description: 'Bring TBB to ₦0 this month',
    xp: 500,
    progressPct: 0.88,
    progressLabel: '₦45,200 left',
    joined: false,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

type SubtleToken = 'successSubtle' | 'warningSubtle' | 'infoSubtle' | 'purpleSubtle';

const CHALLENGE_BG_TOKEN: Record<ChallengeColor, SubtleToken> = {
  g: 'successSubtle',
  a: 'warningSubtle',
  b: 'infoSubtle',
  p: 'purpleSubtle',
};

function challengeProgressColor(
  color: ChallengeColor,
  colors: ReturnType<typeof useTheme>,
): string {
  switch (color) {
    case 'g': return colors.brandBright;
    case 'b': return colors.info;
    case 'a': return colors.warning;
    case 'p': return colors.purple;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BadgeCell({
  badge,
  ss,
  colors,
}: {
  badge: Badge;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  return (
    <TouchableOpacity
      style={[
        ss.bdgCell,
        {
          backgroundColor: colors.cardBg,
          borderColor: colors.border,
          opacity: badge.earned ? 1 : 0.55,
        },
      ]}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${badge.name} badge${badge.earned ? ', earned' : `, locked: ${badge.lockHint ?? ''}`}`}
    >
      {/* "New!" pip */}
      {badge.isNew && (
        <View style={[ss.bdgNewPip, { backgroundColor: colors.error, borderColor: colors.white }]}>
          <Text style={[ss.bdgNewTxt, { color: colors.white, ...ff(800) }]}>N</Text>
        </View>
      )}
      <Text style={ss.bdgIcon}>{badge.emoji}</Text>
      <Text style={[ss.bdgName, { color: colors.textPrimary, ...ff(700) }]} numberOfLines={2}>
        {badge.name}
      </Text>
      <Text
        style={[
          ss.bdgStatus,
          { color: badge.earned ? colors.brand : colors.textMeta, ...ff(600) },
        ]}
      >
        {badge.earned ? 'Earned!' : (badge.lockHint ?? 'Locked')}
      </Text>
    </TouchableOpacity>
  );
}

function ChallengeCard({
  challenge,
  onPress,
  onJoin,
  ss,
  colors,
}: {
  challenge: Challenge;
  onPress: () => void;
  onJoin: () => void;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  const icBg = colors[CHALLENGE_BG_TOKEN[challenge.color]];
  const progColor = challengeProgressColor(challenge.color, colors);

  return (
    <TouchableOpacity
      style={[ss.chalCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`Challenge: ${challenge.title}`}
    >
      {/* Icon */}
      <View style={[ss.chalIc, { backgroundColor: icBg }]}>
        <Text style={ss.chalEmoji}>{challenge.emoji}</Text>
      </View>

      {/* Info */}
      <View style={ss.chalInfo}>
        <Text style={[ss.chalTtl, { color: colors.textPrimary, ...ff(700) }]}>
          {challenge.title}
        </Text>
        <Text style={[ss.chalDesc, { color: colors.textMeta }]}>
          {challenge.description}
        </Text>
        <View style={ss.chalFoot}>
          <Badge variant="neutral" size="sm">+{challenge.xp} XP</Badge>
          <Text style={[ss.chalProgTxt, { color: colors.textMeta }]}>
            {challenge.progressLabel}
          </Text>
        </View>
        {challenge.progressPct > 0 && (
          <ProgressBar
            progress={challenge.progressPct}
            fillColor={progColor}
            size="sm"
            animate
            style={{ marginTop: 7 }}
          />
        )}
      </View>

      {/* Right badge / join button */}
      {challenge.joined ? (
        <Badge variant="success" style={{ alignSelf: 'center' }}>✓ Joined</Badge>
      ) : (
        <TouchableOpacity
          style={[ss.joinBtn, { backgroundColor: colors.brand }]}
          onPress={(e) => { e.stopPropagation?.(); onJoin(); }}
          accessibilityRole="button"
          accessibilityLabel={`Join ${challenge.title}`}
          hitSlop={hitSlop(36)}
        >
          <Text style={[ss.joinBtnTxt, { color: colors.white, ...ff(700) }]}>Join</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── XP progress bar ───────────────────────────────────────────────────────────

function XpBar({
  currentXp,
  nextLevelXp,
  level,
  levelTitle,
  toNext,
  ss,
  colors,
}: {
  currentXp: number;
  nextLevelXp: number;
  level: number;
  levelTitle: string;
  toNext: number;
  ss: ReturnType<typeof makeStyles>;
  colors: ReturnType<typeof useTheme>;
}) {
  const pct = Math.min(currentXp / nextLevelXp, 1);
  return (
    <View style={ss.xpWrap}>
      <View style={ss.xpRow}>
        <Text style={[ss.xpLev, { color: colors.lime, ...ff(700) }]}>
          Level {level} · {levelTitle}
        </Text>
        <Text style={[ss.xpPts, { color: colors.textInverseFaint }]}>
          {currentXp.toLocaleString()}/{nextLevelXp.toLocaleString()} XP
        </Text>
      </View>
      <ProgressBar
        progress={pct}
        fillColor={colors.lime}
        size="lg"
        animate
        style={{ backgroundColor: colors.overlayGhost }}
      />
      <View style={ss.xpMetaRow}>
        <Text style={[ss.xpMetaTxt, { color: colors.textInverseFaint }]}>Current level</Text>
        <Text style={[ss.xpMetaTxt, { color: colors.textInverseFaint }]}>
          {toNext.toLocaleString()} XP to Level {level + 1}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RewardsScreen() {
  const colors = useTheme();
  const ss = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { info } = useToast();

  const [challenges, setChallenges] = useState<Challenge[]>(CHALLENGES);

  function handleJoin(id: string) {
    setChallenges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, joined: true } : c)),
    );
    const ch = challenges.find((c) => c.id === id);
    if (ch) info('🎯', `You joined "${ch.title}"! Good luck!`);
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── Dark-green header ─────────────────────────────────────────────── */}
      <View style={[ss.header, { paddingTop: insets.top + spacing.lg, backgroundColor: colors.darkGreen }]}>
        {/* Decorative radial glow */}
        <View style={ss.headerGlow} pointerEvents="none" />

        <View style={ss.headerTop}>
          <View>
            <Text style={[ss.levelTitle, { color: colors.white, ...ff(800) }]}>
              Money Warrior ⚔️
            </Text>
            <Text style={[ss.levelSub, { color: colors.textInverseFaint }]}>
              Level {FAKE_LEVEL} · {FAKE_XP_CURRENT.toLocaleString()} XP
            </Text>
          </View>
          <Button
            variant="icon"
            iconTheme="dark"
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={layout.iconMd} color={colors.white} />
          </Button>
        </View>

        <XpBar
          currentXp={FAKE_XP_CURRENT}
          nextLevelXp={FAKE_XP_NEXT_LEVEL}
          level={FAKE_LEVEL}
          levelTitle={FAKE_LEVEL_TITLE}
          toNext={FAKE_XP_TO_NEXT}
          ss={ss}
          colors={colors}
        />
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Streak banner ─────────────────────────────────────────────── */}
        <View
          style={[ss.streakBanner, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
        >
          {/* Left: fire + big number */}
          <View style={ss.streakLeft}>
            <Text style={ss.streakFire}>🔥</Text>
            <Text style={[ss.streakNum, { color: colors.textPrimary, ...ff(800) }]}>
              {FAKE_STREAK}
            </Text>
            <Text style={[ss.streakDays, { color: colors.textMeta }]}>days</Text>
          </View>

          {/* Right: label + dots */}
          <View style={ss.streakRight}>
            <Text style={[ss.streakLbl, { color: colors.warning, ...ff(700) }]}>STREAK</Text>
            <Text style={[ss.streakVal, { color: colors.textPrimary, ...ff(700) }]}>
              Daily Budget Check-in
            </Text>
            <Text style={[ss.streakSub, { color: colors.textMeta }]}>
              Log daily to keep chain alive!
            </Text>

            {/* 7-day dots */}
            <View style={ss.wkDots}>
              {DAY_LABELS.map((lbl, i) => {
                const state = streakDayState(i);
                const dotBg =
                  state === 'today'
                    ? colors.brand
                    : state === 'done'
                      ? colors.successSubtle
                      : colors.surfaceElevated;
                const dotColor =
                  state === 'today'
                    ? colors.white
                    : state === 'done'
                      ? colors.successText
                      : colors.textMeta;
                const sym = state === 'today' ? '★' : state === 'done' ? '✓' : '·';
                return (
                  <View key={i} style={ss.wkDot}>
                    <View style={[ss.wkDotCircle, { backgroundColor: dotBg }]}>
                      <Text style={[ss.wkDotSym, { color: dotColor, ...ff(700) }]}>{sym}</Text>
                    </View>
                    <Text style={[ss.wkDotLbl, { color: colors.textMeta, ...ff(600) }]}>{lbl}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Badges section ────────────────────────────────────────────── */}
        <View style={ss.secRow}>
          <Text style={[ss.secTtl, { color: colors.textPrimary, ...ff(800) }]}>Badges</Text>
          <Text style={[ss.secLnk, { color: colors.brand, ...ff(600) }]}>
            {BADGES.filter((b) => b.earned).length}/{BADGES.length}
          </Text>
        </View>
        <View style={ss.badgesGrid}>
          {BADGES.map((badge) => (
            <BadgeCell key={badge.slug} badge={badge} ss={ss} colors={colors} />
          ))}
        </View>

        {/* ── Active challenges section ──────────────────────────────────── */}
        <View style={ss.secRow}>
          <Text style={[ss.secTtl, { color: colors.textPrimary, ...ff(800) }]}>
            Active Challenges
          </Text>
          <TouchableOpacity
            onPress={() => info('🎯', 'All challenges coming soon!')}
            accessibilityRole="button"
            accessibilityLabel="View all challenges"
          >
            <Text style={[ss.secLnk, { color: colors.brand, ...ff(600) }]}>View all</Text>
          </TouchableOpacity>
        </View>

        <View style={ss.chalList}>
          {challenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              onPress={() => router.push(`/challenge/${ch.id}` as never)}
              onJoin={() => handleJoin(ch.id)}
              ss={ss}
              colors={colors}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: layout.tabBarHeight + spacing.xl },

    // ── Header ───────────────────────────────────────────────────────────────
    header: {
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      overflow: 'hidden',
    },
    headerGlow: {
      position: 'absolute',
      bottom: -40,
      left: '50%',
      marginLeft: -90,
      width: 180,
      height: 90,
      borderRadius: 90,
      backgroundColor: 'rgba(168,224,99,0.15)',
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.mdn,
    },
    levelTitle: { fontSize: 22, letterSpacing: -0.3 },
    levelSub: { fontSize: 13, marginTop: 3 },

    // ── XP bar ───────────────────────────────────────────────────────────────
    xpWrap: { marginTop: 2 },
    xpRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    xpLev: { fontSize: 13 },
    xpPts: { fontSize: 12 },
    xpMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    xpMetaTxt: { fontSize: 10 },
    textInverseFaint: { opacity: 0.4 },

    // ── Streak banner ─────────────────────────────────────────────────────────
    streakBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.mdn,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: spacing.lg,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      ...shadow.sm,
    },
    streakLeft: { alignItems: 'center', flexShrink: 0 },
    streakFire: { fontSize: 38, lineHeight: 42 },
    streakNum: { fontSize: 42, letterSpacing: -2, lineHeight: 42 },
    streakDays: { fontSize: 13, marginTop: 2 },
    streakRight: { flex: 1 },
    streakLbl: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
    streakVal: { fontSize: 14, marginTop: 2 },
    streakSub: { fontSize: 12, marginTop: 1, lineHeight: 17 },
    wkDots: { flexDirection: 'row', gap: 4, marginTop: spacing.smd },
    wkDot: { alignItems: 'center', gap: 3 },
    wkDotCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wkDotSym: { fontSize: 13 },
    wkDotLbl: { fontSize: 9 },

    // ── Section row ──────────────────────────────────────────────────────────
    secRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.smd,
    },
    secTtl: { fontSize: 16, letterSpacing: -0.3 },
    secLnk: { fontSize: 13 },

    // ── Badges grid ───────────────────────────────────────────────────────────
    badgesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
      paddingHorizontal: spacing.lg,
    },
    bdgCell: {
      width: '30.5%',
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 13,
      alignItems: 'center',
      position: 'relative',
      ...shadow.sm,
    },
    bdgNewPip: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bdgNewTxt: { fontSize: 7 },
    bdgIcon: { fontSize: 28, marginBottom: 6 },
    bdgName: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
    bdgStatus: { fontSize: 10, marginTop: 2, textAlign: 'center' },

    // ── Challenge cards ───────────────────────────────────────────────────────
    chalList: { paddingHorizontal: spacing.lg, gap: spacing.smd },
    chalCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 14,
      ...shadow.sm,
    },
    chalIc: {
      width: 46,
      height: 46,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    chalEmoji: { fontSize: 22 },
    chalInfo: { flex: 1, minWidth: 0 },
    chalTtl: { fontSize: 13 },
    chalDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
    chalFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    chalProgTxt: { fontSize: 11 },

    // Joined badge → replaced by <Badge variant="success">

    // Join button
    joinBtn: {
      flexShrink: 0,
      alignSelf: 'center',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    joinBtnTxt: { fontSize: 12 },
  });
}
