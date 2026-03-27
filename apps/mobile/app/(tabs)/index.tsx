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
 * app/(tabs)/home.tsx — Home / Dashboard tab
 *
 * FAB note: the lime "+" FAB lives in (tabs)/_layout.tsx (bottom-right), not here.
 */

import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { ProgressBar } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '@/lib/theme';
import { useBudget } from '@/hooks/useBudget';
import { useAppSelector } from '@/store/hooks';
import { syncDatabase } from '@/database/sync';
import { useAccounts } from '@/hooks/useAccounts';
import { ff, formatMoney } from '@/lib/typography';
import { glass, layout, radius, shadow, spacing } from '@/lib/tokens';
import { useDismissNudge, useNudgeUnreadCount, useNudges } from '@/hooks/useNudges';
import { TourTarget, useTour, type TourStep } from '@/components/tour';
import { releasePrompt } from '@/lib/notifPromptBridge';
import { onWelcomeDone } from '@/lib/welcomeBridge';

// ── Tour definition ──────────────────────────────────────────────────────────────

const HOME_TOUR: TourStep[] = [
  {
    targetId: 'home-profile',
    title: 'Your profile',
    body: 'Tap here to view your profile, manage security settings, and sign out.',
    tooltipSide: 'below',
  },
  {
    targetId: 'home-net-worth',
    title: 'Your net worth',
    body: 'All your account balances added together. It updates automatically as you link accounts and record transactions.',
    tooltipSide: 'below',
    fallbackFullscreen: true,
  },
  {
    targetId: 'home-all-accounts',
    title: 'View your accounts',
    body: 'Tap here to see all your bank accounts, link a new one via Mono, or add a manual account. Accounts lives in the More tab.',
    tooltipSide: 'below',
    fallbackFullscreen: true,
  },
  {
    targetId: 'home-this-month',
    title: 'This month at a glance',
    body: 'Total In is all the money you received this month. Total Out is everything you spent. Keep an eye on the gap!',
    tooltipSide: 'below',
    fallbackFullscreen: true,
  },
  {
    targetId: 'home-first-goal',
    title: 'Track your goals',
    body: 'Categories with a custom savings deadline appear here. You can see progress at a glance and tap to adjust the target.',
    tooltipSide: 'above',
    fallbackFullscreen: true,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Streak (fake data) ────────────────────────────────────────────────────────
// Phase 14 will replace this with real data from the gamification service.
// See docs/UI_MIGRATION_PLAN.md Phase 14 for backend design notes.

const FAKE_STREAK = 5;
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
// Convert JS getDay() (0 = Sun) to Mon-indexed (0 = Mon … 6 = Sun)
const TODAY_IDX = (new Date().getDay() + 6) % 7;

function streakDayState(i: number): 'done' | 'today' | 'future' {
  if (i === TODAY_IDX) return 'today';
  const diff = TODAY_IDX - i;
  if (diff > 0 && diff < FAKE_STREAK) return 'done';
  return 'future';
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAppSelector((st) => st.auth.user);
  const startTourIfUnseen = useTour();

  useFocusEffect(
    useCallback(() => {
      // Wait for AppWelcome to be dismissed before starting the tour so they
      // don't overlap. onWelcomeDone fires immediately for returning users.
      onWelcomeDone(() => {
        startTourIfUnseen('home', HOME_TOUR, releasePrompt);
      });
    }, [startTourIfUnseen]),
  );

  // ── Data ──────────────────────────────────────────────────────────────────
  const currentMonth = useMemo(getCurrentMonth, []);
  const { data: accounts, isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useAccounts();
  const { data: budget, isLoading: budgetLoading, error: budgetError, refetch: refetchBudget } = useBudget(currentMonth);
  const isLoading = accountsLoading || budgetLoading;
  const fetchError = accountsError ?? budgetError;
  const { data: nudgesData, refetch: refetchNudges } = useNudges(false); // exclude dismissed
  const dismissNudge = useDismissNudge();
  const unreadCount = useNudgeUnreadCount();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await syncDatabase(); } catch (e) { console.warn('Sync error', e); }
    await Promise.all([refetchAccounts(), refetchBudget(), refetchNudges()]);
    setRefreshing(false);
  }, [refetchAccounts, refetchBudget, refetchNudges]);

  // ── Derivations ───────────────────────────────────────────────────────────
  const firstName = user?.first_name ?? 'there';
  const initials = [user?.first_name?.[0], user?.last_name?.[0]]
    .filter(Boolean).join('').toUpperCase() || '?';

  const netWorth = useMemo(
    () => (accounts ?? []).filter((a) => a.is_active).reduce((s, a) => s + a.balance, 0),
    [accounts],
  );

  const allCats = useMemo(
    () => budget?.groups.flatMap((g) => g.categories) ?? [],
    [budget],
  );

  // Expenses = ALL debit transactions this month (categorised + uncategorised)
  const totalExpenses = budget?.total_debit ?? 0;

  // Income = TBB + totalAssigned (fundamental ZBB identity)
  const totalIncome = useMemo(() => {
    const assigned = allCats.reduce((s, c) => s + c.assigned, 0);
    return (budget?.tbb ?? 0) + assigned;
  }, [allCats, budget]);

  // Categories with a custom (sinking fund / deadline) target → goals section
  const goals = useMemo(
    () => allCats.filter((c) => c.target_frequency === 'custom' && !c.is_hidden),
    [allCats],
  );

  // First unread (not yet opened) non-dismissed nudge for the pill
  const firstNudge = nudgesData?.nudges.find((n) => !n.is_opened);

  const bottomPad = layout.tabBarHeight + Math.max(insets.bottom, 4) + spacing.lg;

  if (isLoading && !accounts && !budget) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />
      </View>
    );
  }

  if (fetchError && !accounts && !budget) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={s.errorContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
        >
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textTertiary} />
          <Text style={[s.errorText, { color: colors.textSecondary }]}>Could not load dashboard.</Text>
          <Text style={[s.errorSub, { color: colors.textMeta }]}>Pull down to retry.</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ── Dark green header (.home-hdr) ─────────────────────────────────── */}
      <View
        style={[
          s.header,
          { paddingTop: insets.top + 20 },
        ]}
      >
        <LinearGradient
          colors={[colors.darkGreen, colors.darkGreenMid]}
          style={StyleSheet.absoluteFill}
        />
        {/* Top row: avatar + greeting | notification bell */}
        <View style={s.topRow}>
          <TourTarget id="home-profile">
            <TouchableOpacity
              style={s.userRow}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Go to profile"
            >
              <View style={[s.avatar, { backgroundColor: colors.brand }]}>
                <Text style={[s.avatarText, { color: colors.lime }]}>{initials}</Text>
              </View>
              <View>
                <Text style={s.greetTxt}>{getGreeting()} 👋🏽</Text>
                <Text style={[s.nameTxt, { color: colors.white }]}>{firstName}</Text>
              </View>
            </TouchableOpacity>
          </TourTarget>

          <TouchableOpacity
            style={s.notifBtn}
            onPress={() => router.push('/(tabs)/nudges')}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
            }
          >
            <Ionicons name="notifications-outline" size={18} color={colors.white} />
            {unreadCount > 0 && (
              <View style={[s.notifDot, { backgroundColor: colors.error, borderColor: colors.darkGreen }]} />
            )}
          </TouchableOpacity>
        </View>

        {/* Balance card (.bal-card) — frosted glass, top-rounded only */}
        <TourTarget id="home-net-worth">
          <View style={s.balCard}>
            <View style={s.balTop}>
              <Text style={s.balLbl}>NET WORTH</Text>
              <TourTarget id="home-all-accounts">
                <TouchableOpacity
                  style={s.balChip}
                  onPress={() => router.push('/(tabs)/accounts')}
                  activeOpacity={0.75}
                  accessibilityRole="link"
                  accessibilityLabel="View all accounts"
                >
                  <Text style={[s.balChipTxt, { color: colors.lime }]}>All accounts</Text>
                </TouchableOpacity>
              </TourTarget>
            </View>
            <Text style={[s.balAmt, { color: colors.white }]}>
              {formatMoney(netWorth)}
            </Text>
            <View style={s.balActions}>
              <TouchableOpacity
                style={s.balBtnGhost}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/budget' as never); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Go to budget"
              >
                <Ionicons name="card-outline" size={14} color={colors.white} />
                <Text style={[s.balBtnTxt, { color: colors.white }]}>Budget</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.balBtnGhost, s.balBtnPrimary, { backgroundColor: colors.lime, borderColor: colors.lime }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/add-transaction'); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
              >
                <Ionicons name="add" size={14} color={colors.darkGreen} />
                <Text style={[s.balBtnTxt, { color: colors.darkGreen }]}>Add Tx</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TourTarget>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >

        {/* Stats: This Month */}
        <View style={s.sec}>
          <View style={s.secRow}>
            <Text style={[s.secTitle, { color: colors.textPrimary }]}>This Month</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')} accessibilityRole="link">
              <Text style={[s.secLink, { color: colors.brand }]}>See all</Text>
            </TouchableOpacity>
          </View>
          <TourTarget id="home-this-month">
            <View style={s.statGrid}>
              {/* Income */}
              <View style={[s.statCard, { backgroundColor: colors.cardBg, borderColor: colors.border }, shadow.sm]}>
                <View style={s.statTop}>
                  <View style={[s.statIcon, { backgroundColor: colors.successSubtle }]}>
                    <Ionicons name="arrow-down-outline" size={17} color={colors.successText} />
                  </View>
                  <View style={[s.statBadge, { backgroundColor: colors.successSubtle }]}>
                    <Text style={[s.statBadgeTxt, { color: colors.successText }]}>Income</Text>
                  </View>
                </View>
                <Text style={[s.statLbl, { color: colors.textMeta }]}>Total in</Text>
                <Text style={[s.statVal, { color: colors.textPrimary }]}>{formatMoney(totalIncome)}</Text>
              </View>

              {/* Expenses */}
              <View style={[s.statCard, { backgroundColor: colors.cardBg, borderColor: colors.border }, shadow.sm]}>
                <View style={s.statTop}>
                  <View style={[s.statIcon, { backgroundColor: colors.errorSubtle }]}>
                    <Ionicons name="arrow-up-outline" size={17} color={colors.error} />
                  </View>
                  <View style={[s.statBadge, { backgroundColor: colors.errorSubtle }]}>
                    <Text style={[s.statBadgeTxt, { color: colors.error }]}>Spent</Text>
                  </View>
                </View>
                <Text style={[s.statLbl, { color: colors.textMeta }]}>Total out</Text>
                <Text style={[s.statVal, { color: colors.textPrimary }]}>{formatMoney(totalExpenses)}</Text>
              </View>
            </View>
          </TourTarget>
        </View>

        {/* Nudge pill — first unread nudge */}
        {firstNudge ? (
          <View style={s.sec}>
            <TouchableOpacity
              style={[s.nudgePill, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorderLight }]}
              onPress={() => router.push('/(tabs)/nudges')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="View nudge"
            >
              <Ionicons name="bulb-outline" size={15} color={colors.warning} style={{ marginTop: 1, flexShrink: 0 }} />
              <View style={{ flex: 1 }}>
                <Text style={[s.nudgeTxt, { color: colors.warningText }]} numberOfLines={2}>
                  {firstNudge.title
                    ? <Text style={ff(700)}>{firstNudge.title}: </Text>
                    : null}
                  {firstNudge.message}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => dismissNudge.mutate(firstNudge.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss nudge"
              >
                <Ionicons name="close-outline" size={18} color={colors.warning} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Streak card (.streak-c) — 7-day budgeting streak */}
        <View style={s.sec}>
          <View style={[s.streakCard, { backgroundColor: colors.darkGreen }]}>
            <View style={s.streakTop}>
              <View>
                <Text style={[s.streakNum, { color: colors.white }]}>
                  {FAKE_STREAK}
                  <Text style={[s.streakNumSm, { color: colors.lime }]}> day streak</Text>
                </Text>
                <Text style={[s.streakDesc, { color: glass.textFaint }]}>
                  Budgeting streak 🔥
                </Text>
              </View>
              <View style={s.streakBadge}>
                <Text style={[s.streakBadgeTxt, { color: colors.lime }]}>Keep it up!</Text>
              </View>
            </View>

            <View style={s.streakDays}>
              {DAY_LABELS.map((label, i) => {
                const state = streakDayState(i);
                return (
                  <View
                    key={label}
                    style={[
                      s.sd,
                      state === 'done' && s.sdDone,
                      state === 'today' && { backgroundColor: colors.lime, borderColor: colors.lime },
                    ]}
                  >
                    <Text
                      style={[
                        s.sdLbl,
                        state === 'done' && { color: colors.lime },
                        state === 'today' && { color: colors.darkGreen },
                      ]}
                    >
                      {label}
                    </Text>
                    <Text
                      style={[
                        s.sdSym,
                        state === 'done' && { color: colors.lime, fontSize: 13 },
                        state === 'today' && { color: colors.darkGreen, fontSize: 13 },
                      ]}
                    >
                      {state === 'today' ? '●' : state === 'done' ? '✓' : '·'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Goals section */}
        <View style={[s.sec, { paddingBottom: spacing.md }]}>
          <View style={s.secRow}>
            <Text style={[s.secTitle, { color: colors.textPrimary }]}>Goals</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/budget')} accessibilityRole="link">
              <Text style={[s.secLink, { color: colors.brand }]}>Budget →</Text>
            </TouchableOpacity>
          </View>

          {goals.length === 0 ? (
            <Text style={[s.emptyGoals, { color: colors.textMeta }]}>
              Create a custom target with a deadline on a budget category to track your savings goals here.
            </Text>
          ) : (
            goals.map((goal, goalIdx) => {
              const pct = goal.target_amount
                ? Math.min(1, Math.max(0, goal.available / goal.target_amount))
                : 0;

              const card = (
                <TouchableOpacity
                  key={goal.id}
                  style={[s.goalRow, { backgroundColor: colors.cardBg, borderColor: colors.border }, shadow.sm]}
                  onPress={() => router.push(`/target/${goal.id}`)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${goal.name} goal`}
                >
                  <View style={[s.goalJar, { backgroundColor: colors.surface }]}>
                    <Text style={s.goalJarTxt}>🎯</Text>
                  </View>
                  <View style={s.goalInfo}>
                    <Text style={[s.goalName, { color: colors.textPrimary }]}>{goal.name}</Text>
                    <ProgressBar
                      animate
                      progress={pct}
                      state="brand"
                      gradient
                      size="md"
                      trackStyle={{ marginVertical: 6 }}
                    />
                    <Text style={[s.goalAmt, { color: colors.textMeta }]}>
                      <Text style={{ color: colors.brand, ...ff(700) }}>{formatMoney(goal.available)}</Text>
                      {' '}of {formatMoney(goal.target_amount ?? 0)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[s.goalAdd, { backgroundColor: colors.brand }]}
                    onPress={() => router.push('/(tabs)/budget')}
                    accessibilityRole="button"
                    accessibilityLabel={`Add to ${goal.name}`}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="add" size={14} color={colors.white} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );

              // Wrap the first goal in a TourTarget so the spotlight lands on it.
              return goalIdx === 0 ? (
                <TourTarget key={goal.id} id="home-first-goal">{card}</TourTarget>
              ) : card;
            })
          )}
        </View>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 0,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: glass.borderLimeBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...ff(800), fontSize: 16 },
  greetTxt: { ...ff(400), fontSize: 12, color: glass.textDim },
  nameTxt: { ...ff(700), fontSize: 15 },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: glass.control,
    borderWidth: 1,
    borderColor: glass.borderWhite,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },

  // Balance card
  balCard: {
    backgroundColor: glass.card,
    borderWidth: 1,
    borderColor: glass.borderLime,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: 18,
  },
  balTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  balLbl: {
    ...ff(600),
    fontSize: 11,
    color: glass.labelDim,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  balChip: {
    backgroundColor: glass.chip,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  balChipTxt: { ...ff(700), fontSize: 11 },
  balAmt: {
    ...ff(800),
    fontSize: 36,
    letterSpacing: -1.5,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  balActions: { flexDirection: 'row', gap: 10 },
  balBtnGhost: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.borderWhite,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  balBtnPrimary: {},
  balBtnTxt: { ...ff(600), fontSize: 13 },

  // Scroll
  scroll: { flex: 1 },

  // Sections
  sec: { paddingHorizontal: spacing.xl, paddingTop: 14 },
  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  secTitle: { ...ff(800), fontSize: 16, letterSpacing: -0.3 },
  secLink: { ...ff(600), fontSize: 13 },

  // Stats grid
  statGrid: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statBadgeTxt: { ...ff(700), fontSize: 10 },
  statLbl: { ...ff(500), fontSize: 11 },
  statVal: { ...ff(800), fontSize: 20, letterSpacing: -0.5, marginTop: 3 },

  // Nudge pill
  nudgePill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    paddingHorizontal: 14,
  },
  nudgeTxt: { ...ff(400), fontSize: 12, lineHeight: 18 },

  // Streak card
  streakCard: {
    borderRadius: radius.lg,
    padding: 18,
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  streakTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  streakNum: { ...ff(800), fontSize: 30, letterSpacing: -1, lineHeight: 34 },
  streakNumSm: { ...ff(500), fontSize: 13 },
  streakDesc: { ...ff(400), fontSize: 13, marginTop: 3 },
  streakBadge: {
    backgroundColor: glass.badge,
    borderWidth: 1,
    borderColor: glass.borderLimeStrong,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakBadgeTxt: { ...ff(700), fontSize: 12 },
  streakDays: { flexDirection: 'row', gap: 5 },
  sd: {
    flex: 1,
    height: 37,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: glass.streakDay,
    borderWidth: 1,
    borderColor: glass.streakDayBorder,
  },
  sdDone: {
    backgroundColor: glass.streakDone,
    borderColor: glass.streakDoneBorder,
  },
  sdLbl: {
    ...ff(700),
    fontSize: 9,
    color: glass.labelDim,
    textTransform: 'uppercase',
  },
  sdSym: { fontSize: 12, color: glass.streakDay },

  // Goals
  emptyGoals: {
    ...ff(400),
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    padding: 13,
    paddingHorizontal: 15,
    borderWidth: 1,
    marginBottom: 9,
  },
  goalJar: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalJarTxt: { fontSize: 24 },
  goalInfo: { flex: 1, minWidth: 0 },
  goalName: { ...ff(700), fontSize: 14 },
  goalAmt: { ...ff(400), fontSize: 12 },
  goalAdd: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error state
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorText: { ...ff(600), fontSize: 16, textAlign: 'center' },
  errorSub: { ...ff(400), fontSize: 13, textAlign: 'center' },
});
