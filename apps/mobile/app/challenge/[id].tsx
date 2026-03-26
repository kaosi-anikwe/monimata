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
 * Challenge Detail screen — gradient hero, progress, leaderboard, rules, CTA.
 *
 * Route: /challenge/[id]  (Expo Router dynamic segment)
 */

import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
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
import { hitSlop, layout, radius, shadow, spacing } from '@/lib/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChallengeColor = 'g' | 'a' | 'b' | 'p';

interface Rule {
  text: string;
}

interface Participant {
  initial: string;
  bgColor: string;
  textColor: string;
}

interface LeaderboardEntry {
  rank: number | '🥇' | '🥈' | '🥉';
  initial: string;
  bgColor: string;
  textColor: string;
  name: string;
  score: string;
  isYou?: boolean;
}

interface Milestone {
  icon: string;
  label: string;
  achieved: boolean;
}

interface ChallengeDetail {
  id: string;
  emoji: string;
  color: ChallengeColor;
  title: string;
  description: string;
  xp: number;
  badge: string;
  participants: number;
  endsIn: string;
  joined: boolean;
  progressPct: number;
  progressLabel: string;
  milestones: Milestone[];
  rules: Rule[];
  leaderboard: LeaderboardEntry[];
  avatars: Participant[];
}

// ── Fake seed data ────────────────────────────────────────────────────────────

const CHALLENGES: Record<string, ChallengeDetail> = {
  nospend: {
    id: 'nospend',
    emoji: '🎯',
    color: 'g',
    title: 'No-Spend Weekend',
    description:
      'Can you resist non-essential spending this weekend? Every Naira saved is a Naira working for your goals.',
    xp: 150,
    badge: 'Weekend Warrior',
    participants: 846,
    endsIn: 'Ends in 2 days',
    joined: true,
    progressPct: 0.5,
    progressLabel: 'Saturday done ✓ · Sunday remaining',
    milestones: [
      { icon: '✓', label: 'Day 1', achieved: true },
      { icon: '🎯', label: 'Day 2', achieved: false },
      { icon: '🏆', label: 'Complete', achieved: false },
    ],
    rules: [
      { text: 'No spending on restaurants, entertainment, or shopping Sat & Sun' },
      { text: 'Essentials only: food at home, transport to work, medication' },
      { text: 'Log all transactions — the app verifies spending automatically' },
      { text: "If you slip, own it — honesty earns respect from the community" },
    ],
    leaderboard: [
      { rank: '🥇', initial: 'K', bgColor: '#FEF3C7', textColor: '#78350F', name: 'KudaKing_Emeka', score: 'Day 2 ✓' },
      { rank: '🥈', initial: 'T', bgColor: '#EFF6FF', textColor: '#1D4ED8', name: 'TemiSaves2026', score: 'Day 2 ✓' },
      { rank: 7, initial: 'P', bgColor: 'rgba(168,224,99,0.2)', textColor: '#2D6A2D', name: 'MoneyWarrior_P (You)', score: 'Day 1 ✓', isYou: true },
    ],
    avatars: [
      { initial: 'A', bgColor: '#4CAF50', textColor: '#fff' },
      { initial: 'T', bgColor: '#2563EB', textColor: '#fff' },
      { initial: 'K', bgColor: '#7C3AED', textColor: '#fff' },
      { initial: 'E', bgColor: '#D97706', textColor: '#fff' },
      { initial: 'F', bgColor: '#D93025', textColor: '#fff' },
    ],
  },
  literacy: {
    id: 'literacy',
    emoji: '📚',
    color: 'a',
    title: 'Financial Literacy Week',
    description: 'Expand your money knowledge — read 3 articles in the Knowledge Hub this week.',
    xp: 200,
    badge: 'Bookworm',
    participants: 1203,
    endsIn: '5 days left',
    joined: false,
    progressPct: 0,
    progressLabel: 'Not started yet',
    milestones: [
      { icon: '📖', label: 'Article 1', achieved: false },
      { icon: '📖', label: 'Article 2', achieved: false },
      { icon: '📖', label: 'Article 3', achieved: false },
    ],
    rules: [
      { text: 'Read 3 different articles in the Knowledge Hub' },
      { text: 'Each article must be fully read (scroll to bottom)' },
      { text: 'Articles from any category count' },
      { text: 'Starts counting from the day you join' },
    ],
    leaderboard: [
      { rank: '🥇', initial: 'A', bgColor: '#E8F5E9', textColor: '#2E7D32', name: 'AdeniyiReads', score: '3/3 ✓' },
      { rank: '🥈', initial: 'B', bgColor: '#EFF6FF', textColor: '#1D4ED8', name: 'Bukola_Learns', score: '2/3' },
      { rank: '🥉', initial: 'C', bgColor: '#F5F3FF', textColor: '#7C3AED', name: 'ChisomoMoney', score: '1/3' },
    ],
    avatars: [
      { initial: 'A', bgColor: '#4CAF50', textColor: '#fff' },
      { initial: 'B', bgColor: '#2563EB', textColor: '#fff' },
      { initial: 'C', bgColor: '#7C3AED', textColor: '#fff' },
      { initial: 'D', bgColor: '#D97706', textColor: '#fff' },
      { initial: 'E', bgColor: '#D93025', textColor: '#fff' },
    ],
  },
  save10k: {
    id: 'save10k',
    emoji: '💸',
    color: 'b',
    title: 'Save ₦10,000 This Week',
    description: 'Add ₦10,000 to any goal category before Sunday and earn a big XP bonus.',
    xp: 300,
    badge: 'Super Saver',
    participants: 542,
    endsIn: 'Ends Sunday',
    joined: true,
    progressPct: 0.75,
    progressLabel: '₦7,500/₦10,000 saved',
    milestones: [
      { icon: '₦', label: '₦2,500', achieved: true },
      { icon: '₦', label: '₦5,000', achieved: true },
      { icon: '🏆', label: '₦10,000', achieved: false },
    ],
    rules: [
      { text: 'Add money to a savings goal category before Sunday midnight' },
      { text: 'Multiple contributions to the same goal count' },
      { text: 'Manual transactions count — bank sync is not required' },
      { text: 'The ₦10,000 must stay assigned (not reallocated)' },
    ],
    leaderboard: [
      { rank: '🥇', initial: 'F', bgColor: '#FEF3C7', textColor: '#78350F', name: 'FemiSavings', score: '₦10,000 ✓' },
      { rank: '🥈', initial: 'G', bgColor: '#EFF6FF', textColor: '#1D4ED8', name: 'GraceInvests', score: '₦9,200' },
      { rank: 5, initial: 'P', bgColor: 'rgba(168,224,99,0.2)', textColor: '#2D6A2D', name: 'MoneyWarrior_P (You)', score: '₦7,500', isYou: true },
    ],
    avatars: [
      { initial: 'F', bgColor: '#4CAF50', textColor: '#fff' },
      { initial: 'G', bgColor: '#2563EB', textColor: '#fff' },
      { initial: 'H', bgColor: '#7C3AED', textColor: '#fff' },
      { initial: 'I', bgColor: '#D97706', textColor: '#fff' },
      { initial: 'J', bgColor: '#D93025', textColor: '#fff' },
    ],
  },
  zero: {
    id: 'zero',
    emoji: '🧩',
    color: 'p',
    title: 'Budget Zero Hero',
    description: 'Bring your To Be Budgeted balance to exactly ₦0 this month.',
    xp: 500,
    badge: 'Zero Hero',
    participants: 389,
    endsIn: '10 days left',
    joined: false,
    progressPct: 0.88,
    progressLabel: '₦45,200 remaining to assign',
    milestones: [
      { icon: '📋', label: '50%', achieved: true },
      { icon: '📋', label: '75%', achieved: true },
      { icon: '🧩', label: 'Zero!', achieved: false },
    ],
    rules: [
      { text: 'Assign every Naira of income received this month to a category' },
      { text: 'TBB must reach exactly ₦0 before month end' },
      { text: 'You may rebalance categories — the only rule is TBB = 0' },
      { text: 'Verified automatically at midnight on the last day of the month' },
    ],
    leaderboard: [
      { rank: '🥇', initial: 'Z', bgColor: '#F5F3FF', textColor: '#7C3AED', name: 'ZeroBudgetKing', score: '₦0 ✓' },
      { rank: '🥈', initial: 'N', bgColor: '#E8F5E9', textColor: '#2E7D32', name: 'NairaZeroNgo', score: '₦1,200' },
      { rank: 8, initial: 'P', bgColor: 'rgba(168,224,99,0.2)', textColor: '#2D6A2D', name: 'MoneyWarrior_P (You)', score: '₦45,200', isYou: true },
    ],
    avatars: [
      { initial: 'Z', bgColor: '#7C3AED', textColor: '#fff' },
      { initial: 'N', bgColor: '#4CAF50', textColor: '#fff' },
      { initial: 'O', bgColor: '#2563EB', textColor: '#fff' },
      { initial: 'P', bgColor: '#D97706', textColor: '#fff' },
      { initial: 'Q', bgColor: '#D93025', textColor: '#fff' },
    ],
  },
};

// ── Gradient stops ─────────────────────────────────────────────────────────────
// Matches .cd2-hero.g / .a / .b / .p in the mockup

function heroGradient(color: ChallengeColor): [string, string] {
  switch (color) {
    case 'g': return ['#0D1F0D', '#2D6A2D'];
    case 'a': return ['#1C0A00', '#D97706'];
    case 'b': return ['#0C1B4D', '#2563EB'];
    case 'p': return ['#1E0A3C', '#7C3AED'];
  }
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const ss = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { info, confirm } = useToast();

  const challengeSeed = id ? CHALLENGES[id] : undefined;
  const [joined, setJoined] = useState(challengeSeed?.joined ?? false);

  // Fallback for unknown id
  if (!challengeSeed) {
    return (
      <View style={[ss.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[{ color: colors.textMeta, ...ff(500) }]}>Challenge not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={[{ color: colors.brand, ...ff(600) }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const challenge = { ...challengeSeed, joined };
  const [from, to] = heroGradient(challenge.color);

  function handleJoin() {
    setJoined(true);
    info('🎯', `You joined "${challenge.title}"! Good luck!`);
  }

  function handleLeave() {
    confirm({
      title: 'Leave challenge?',
      message: `Your progress in "${challenge.title}" will be lost.`,
      confirmText: 'Leave',
      confirmStyle: 'destructive',
      onConfirm: () => {
        setJoined(false);
        router.back();
      },
    });
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── Gradient hero ──────────────────────────────────────────────────── */}
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={[ss.hero, { paddingTop: insets.top + spacing.lg }]}
      >
        {/* Back button */}
        <TouchableOpacity
          style={[ss.backBtn, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}
          onPress={() => router.back()}
          hitSlop={hitSlop(36)}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={layout.iconMd} color={colors.white} />
        </TouchableOpacity>

        {/* Emoji */}
        <Text style={ss.heroEmoji}>{challenge.emoji}</Text>

        {/* Status pills */}
        <View style={ss.statusRow}>
          <View style={ss.pillActive}>
            <Text style={[ss.pillTxt, { color: colors.lime, ...ff(700) }]}>● Active</Text>
          </View>
          <View style={ss.pillEnds}>
            <Text style={[ss.pillTxt, { color: colors.warning, ...ff(700) }]}>{challenge.endsIn}</Text>
          </View>
        </View>

        {/* Title + description */}
        <Text style={[ss.heroTitle, { color: colors.white, ...ff(800) }]}>{challenge.title}</Text>
        <Text style={[ss.heroDesc, { color: colors.textInverseFaint }]}>{challenge.description}</Text>

        {/* Reward row */}
        <View style={ss.rewardRow}>
          <View style={[ss.rewardCell, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}>
            <Ionicons name="star-outline" size={16} color={colors.lime} />
            <View>
              <Text style={[ss.rewardVal, { color: colors.white, ...ff(700) }]}>{challenge.xp} XP</Text>
              <Text style={[ss.rewardSub, { color: colors.textInverseFaint }]}>On completion</Text>
            </View>
          </View>
          <View style={[ss.rewardCell, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}>
            <Text style={ss.rewardEmoji}>🏅</Text>
            <View>
              <Text style={[ss.rewardVal, { color: colors.white, ...ff(700) }]}>Badge</Text>
              <Text style={[ss.rewardSub, { color: colors.textInverseFaint }]}>{challenge.badge}</Text>
            </View>
          </View>
          <View style={[ss.rewardCell, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}>
            <Ionicons name="people-outline" size={16} color={colors.lime} />
            <View>
              <Text style={[ss.rewardVal, { color: colors.white, ...ff(700) }]}>{challenge.participants.toLocaleString()}</Text>
              <Text style={[ss.rewardSub, { color: colors.textInverseFaint }]}>Participants</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Your progress card (only when joined) */}
        {joined && (
          <View style={[ss.progCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={ss.progHeader}>
              <Text style={[ss.progLbl, { color: colors.textPrimary, ...ff(700) }]}>Your Progress</Text>
              <Text style={[ss.progPct, { color: colors.brand, ...ff(700) }]}>
                {Math.round(challenge.progressPct * 100)}%
              </Text>
            </View>
            <View style={[ss.progBarBg, { backgroundColor: colors.surfaceElevated }]}>
              <View
                style={[ss.progBarFill, { width: `${challenge.progressPct * 100}%` }]}
              />
            </View>
            <Text style={[ss.progSubLbl, { color: colors.textMeta }]}>{challenge.progressLabel}</Text>
            <View style={ss.milestoneRow}>
              {challenge.milestones.map((m, i) => (
                <View
                  key={i}
                  style={[
                    ss.milestone,
                    {
                      backgroundColor: colors.surface,
                      borderColor: m.achieved ? colors.brand : 'transparent',
                    },
                  ]}
                >
                  <Text style={ss.milestoneIcon}>{m.icon}</Text>
                  <Text
                    style={[
                      ss.milestoneLbl,
                      { color: m.achieved ? colors.brand : colors.textMeta, ...ff(700) },
                    ]}
                  >
                    {m.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Leaderboard */}
        <View style={ss.lbHeader}>
          <Text style={[ss.lbTitle, { color: colors.textPrimary, ...ff(700) }]}>
            Challenge Leaderboard
          </Text>
          <TouchableOpacity
            onPress={() => info('🏆', 'Full leaderboard coming soon!')}
            accessibilityRole="button"
            accessibilityLabel="View all leaderboard entries"
          >
            <Text style={[ss.lbLink, { color: colors.brand, ...ff(600) }]}>View all →</Text>
          </TouchableOpacity>
        </View>
        {challenge.leaderboard.map((entry, i) => (
          <View
            key={i}
            style={[
              ss.lbRow,
              {
                backgroundColor: entry.isYou ? colors.surface : colors.cardBg,
                borderColor: entry.isYou ? colors.brand : colors.border,
              },
            ]}
          >
            <Text style={[ss.lbRank, { color: typeof entry.rank === 'number' ? colors.textPrimary : colors.warning, ...ff(800) }]}>
              {entry.rank}
            </Text>
            <View style={[ss.lbAv, { backgroundColor: entry.bgColor }]}>
              <Text style={[ss.lbAvTxt, { color: entry.textColor, ...ff(800) }]}>{entry.initial}</Text>
            </View>
            <Text style={[ss.lbName, { color: colors.textPrimary, ...ff(600) }]} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={[ss.lbScore, { color: colors.brand, ...ff(700) }]}>{entry.score}</Text>
          </View>
        ))}

        {/* ── Rules card ──────────────────────────────────────────────────── */}
        <View style={[ss.rulesCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={ss.rulesTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand} />
            <Text style={[ss.rulesTitle, { color: colors.textPrimary, ...ff(700) }]}>
              Challenge Rules
            </Text>
          </View>
          {challenge.rules.map((rule, i) => (
            <View key={i} style={ss.ruleItem}>
              <View style={[ss.ruleBullet, { backgroundColor: colors.surface }]}>
                <Text style={[ss.ruleBulletTxt, { color: colors.brand, ...ff(700) }]}>{i + 1}</Text>
              </View>
              <Text style={[ss.ruleTxt, { color: colors.textSecondary, ...ff(400) }]}>
                {rule.text}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Participants ─────────────────────────────────────────────────── */}
        <View style={[ss.partCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[ss.partTitle, { color: colors.textPrimary, ...ff(700) }]}>
            Who&apos;s in this challenge
          </Text>
          <View style={ss.avatarStrip}>
            {challenge.avatars.map((av, i) => (
              <View
                key={i}
                style={[
                  ss.partAv,
                  {
                    backgroundColor: av.bgColor,
                    borderColor: colors.white,
                    marginLeft: i === 0 ? 0 : -8,
                  },
                ]}
              >
                <Text style={[ss.partAvTxt, { color: av.textColor, ...ff(700) }]}>{av.initial}</Text>
              </View>
            ))}
            <View
              style={[
                ss.partAvCount,
                { backgroundColor: colors.surface, borderColor: colors.white, marginLeft: -8 },
              ]}
            >
              <Text style={[ss.partCountTxt, { color: colors.brand, ...ff(700) }]}>
                +{challenge.participants - challenge.avatars.length}
              </Text>
            </View>
          </View>
          <Text style={[ss.partTxt, { color: colors.textMeta }]}>
            {challenge.participants.toLocaleString()} people are doing this challenge right now 🔥
          </Text>
        </View>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <View style={ss.ctaRow}>
          {joined ? (
            <>
              <TouchableOpacity
                style={[ss.ctaGreen, { backgroundColor: colors.successSubtle, borderColor: colors.borderBrand }]}
                accessibilityRole="button"
                accessibilityLabel="You are in this challenge"
              >
                <Text style={[ss.ctaGreenTxt, { color: colors.successText, ...ff(700) }]}>
                  ✓ You&apos;re In — Keep Going!
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ss.ctaLeave, { borderColor: colors.errorSubtle }]}
                onPress={handleLeave}
                accessibilityRole="button"
                accessibilityLabel="Leave this challenge"
              >
                <Text style={[ss.ctaLeaveTxt, { color: colors.error, ...ff(600) }]}>
                  Leave Challenge
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[ss.ctaJoin, { backgroundColor: colors.brand }]}
              onPress={handleJoin}
              accessibilityRole="button"
              accessibilityLabel={`Join ${challenge.title}`}
            >
              <Text style={[ss.ctaJoinTxt, { color: colors.white, ...ff(700) }]}>
                Join Challenge 🎯
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxxl + spacing.xl },

    // ── Hero ─────────────────────────────────────────────────────────────────
    hero: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      overflow: 'hidden',
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 11,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.mdn,
    },
    heroEmoji: { fontSize: 52, marginBottom: 10 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    pillActive: {
      backgroundColor: 'rgba(168,224,99,0.20)',
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    pillEnds: {
      backgroundColor: 'rgba(245,158,11,0.20)',
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    pillTxt: { fontSize: 11 },
    heroTitle: { fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
    heroDesc: { fontSize: 14, marginTop: 8, lineHeight: 22 },
    rewardRow: { flexDirection: 'row', gap: spacing.smd, marginTop: spacing.lg },
    rewardCell: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: radius.sm,
      borderWidth: 1,
      padding: 10,
    },
    rewardVal: { fontSize: 13 },
    rewardSub: { fontSize: 11, marginTop: 1 },
    rewardEmoji: { fontSize: 18 },

    // ── Progress card ─────────────────────────────────────────────────────────
    progCard: {
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.lg,
      marginHorizontal: spacing.xl,
      marginTop: spacing.mdn,
      marginBottom: spacing.md,
      ...shadow.sm,
    },
    progHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    progLbl: { fontSize: 13 },
    progPct: { fontSize: 13 },
    progBarBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginVertical: 10 },
    progBarFill: {
      height: '100%',
      borderRadius: 5,
      // gradient approximated with brand color; Phase 16 replaces with LinearGradient
      backgroundColor: colors.brand,
    },
    progSubLbl: { fontSize: 12, marginTop: 4 },
    milestoneRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
    milestone: {
      flex: 1,
      borderRadius: 8,
      borderWidth: 1,
      padding: 8,
      alignItems: 'center',
    },
    milestoneIcon: { fontSize: 18, marginBottom: 2 },
    milestoneLbl: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },

    // ── Leaderboard ───────────────────────────────────────────────────────────
    lbHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: spacing.xl,
      marginTop: spacing.mdn,
      marginBottom: 8,
    },
    lbTitle: { fontSize: 13 },
    lbLink: { fontSize: 12 },
    lbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.mdn,
      paddingVertical: 11,
      marginHorizontal: spacing.xl,
      marginBottom: 6,
    },
    lbRank: { fontSize: 14, minWidth: 24, textAlign: 'center' },
    lbAv: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    lbAvTxt: { fontSize: 14 },
    lbName: { flex: 1, fontSize: 13 },
    lbScore: { fontSize: 12 },

    // ── Rules card ─────────────────────────────────────────────────────────────
    rulesCard: {
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.lg,
      marginHorizontal: spacing.xl,
      marginTop: spacing.smd,
      ...shadow.sm,
    },
    rulesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    rulesTitle: { fontSize: 13 },
    ruleItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 8,
    },
    ruleBullet: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1,
    },
    ruleBulletTxt: { fontSize: 10 },
    ruleTxt: { flex: 1, fontSize: 13, lineHeight: 20 },

    // ── Participants ───────────────────────────────────────────────────────────
    partCard: {
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.mdn,
      marginHorizontal: spacing.xl,
      marginTop: spacing.smd,
      ...shadow.sm,
    },
    partTitle: { fontSize: 13, marginBottom: 10 },
    avatarStrip: { flexDirection: 'row', alignItems: 'center' },
    partAv: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    partAvTxt: { fontSize: 13 },
    partAvCount: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    partCountTxt: { fontSize: 10 },
    partTxt: { fontSize: 12, marginTop: 8 },

    // ── CTA ────────────────────────────────────────────────────────────────────
    ctaRow: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      gap: 10,
    },
    ctaGreen: {
      height: 50,
      borderRadius: radius.md,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaGreenTxt: { fontSize: 14 },
    ctaLeave: {
      height: 46,
      borderRadius: radius.md,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    ctaLeaveTxt: { fontSize: 13 },
    ctaJoin: {
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaJoinTxt: { fontSize: 15 },
  });
}
