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
 * Profile tab — user card, gamification stats, settings links, and log-out.
 */

import { useMemo } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logout } from '@/store/authSlice';
import { ff, type_ } from '@/lib/typography';
import { useToast } from '@/components/Toast';
import { useAccounts } from '@/hooks/useAccounts';
import { radius, shadow, spacing } from '@/lib/tokens';
import { useTheme, useThemePreference } from '@/lib/theme';
import { useBiometricLock } from '@/hooks/useBiometricLock';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { AmountDisplay, Avatar, Badge, Button, ListRow, SectionHeader } from '@/components/ui';
import { useNudgeSettings, useNudgeUnreadCount, useUpdateNudgeSettings } from '@/hooks/useNudges';

// ── Hardcoded gamification constants (Phase 14 will fetch from API) ──────────
const FAKE_LEVEL = 7;
const FAKE_XP = 2840;
const FAKE_STREAK = 14;
const FAKE_BADGES = 8;
const FAKE_XP_TO_NEXT = 1360;

// ── ProfileRow — reusable menu row ────────────────────────────────────────────
// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useTheme();
  const ss = makeStyles(colors);

  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const nudgeUnread = useNudgeUnreadCount();
  const { data: accounts } = useAccounts();
  const { confirm, info } = useToast();
  const { isEnrolled, isEnabled: biometricEnabled, toggleEnabled: toggleBiometric } = useBiometricLock();

  const { isDark, setIsDark } = useThemePreference();
  const { data: nudgeSettings } = useNudgeSettings();
  const updateNudgeSettings = useUpdateNudgeSettings();
  const nudgeLang = nudgeSettings?.language ?? 'pidgin';

  function setNudgeLang(lang: 'pidgin' | 'formal') {
    updateNudgeSettings.mutate({ language: lang });
  }

  const netWorth = useMemo(
    () => (accounts ?? []).filter((a) => a.is_active).reduce((s, a) => s + a.balance, 0),
    [accounts],
  );

  function handleLogout() {
    confirm({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirmText: 'Log Out',
      confirmStyle: 'destructive',
      onConfirm: () => {
        dispatch(logout()).then(() => router.replace('/(auth)'));
      },
    });
  }

  function comingSoon(feature: string) {
    info(feature, 'This feature is coming soon!');
  }

  return (
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      {/* ── Dark-green header ─────────────────────────────────────────────── */}
      <View
        style={[
          ss.header,
          {
            paddingTop: insets.top + 16,
            backgroundColor: colors.darkGreen,
          },
        ]}
      >
        {/* Avatar + name + email */}
        <View style={ss.avWrap}>
          <Avatar
            name={user ? `${user.first_name} ${user.last_name}` : undefined}
            size="lg"
          />
          <View>
            <Text style={[ss.profName, { color: colors.white, ...ff(800) }]}>
              {user ? `${user.first_name} ${user.last_name}` : 'Hey there'}
            </Text>
            {user?.email ? (
              <Text style={[ss.profEmail, { color: colors.textInverseFaint }]}>{user.email}</Text>
            ) : null}
          </View>
        </View>

        {/* Gamification badge pills */}
        <View style={ss.badges}>
          <Badge variant="lime">Level {FAKE_LEVEL} ⚔️</Badge>
          <Badge variant="lime">{FAKE_STREAK}-day streak 🔥</Badge>
          <Badge variant="lime">{FAKE_BADGES} badges 🏅</Badge>
        </View>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* BVN warning banner */}
        {!user?.identity_verified && (
          <TouchableOpacity
            style={[ss.bvnBanner, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }]}
            onPress={() => router.push('/(auth)/verify-bvn')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Complete BVN verification"
          >
            <Ionicons name="warning-outline" size={18} color={colors.warning} style={ss.bvnIcon} />
            <View style={ss.bvnTxt}>
              <Text style={[type_.body, { color: colors.warningText, ...ff(600) }]}>
                Complete BVN verification
              </Text>
              <Text style={[type_.caption, { color: colors.warningText, marginTop: 2 }]}>
                Required to link your bank accounts
              </Text>
            </View>
            <TouchableOpacity
              style={[ss.bvnBtn, { backgroundColor: colors.warning }]}
              onPress={() => router.push('/(auth)/verify-bvn')}
              accessibilityRole="button"
              accessibilityLabel="Verify now"
            >
              <Text style={[type_.caption, { color: colors.white, ...ff(700) }]}>Verify now</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* Stats grid */}
        <View style={ss.statsGrid}>
          <View style={[ss.statCell, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
            <AmountDisplay
              kobo={netWorth}
              size="md"
              compact
              style={{ fontSize: 22, letterSpacing: -0.5 }}
            />
            <Text style={[ss.statLbl, { color: colors.textMeta, ...ff(600) }]}>Net Worth</Text>
          </View>
          <View style={[ss.statCell, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
            <Text style={[ss.statNum, { color: colors.textPrimary, ...ff(800) }]}>
              {FAKE_XP.toLocaleString()}
            </Text>
            <Text style={[ss.statLbl, { color: colors.textMeta, ...ff(600) }]}>Total XP</Text>
          </View>
          <View style={[ss.statCell, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
            <Text style={[ss.statNum, { color: colors.textPrimary, ...ff(800) }]}>{FAKE_STREAK}</Text>
            <Text style={[ss.statLbl, { color: colors.textMeta, ...ff(600) }]}>Day Streak</Text>
          </View>
        </View>

        {/* ── Account & Security section ───────────────────────────────── */}
        <SectionHeader
          title="Account & Security"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: 6 }}
        />
        <View style={[ss.menu, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          {user?.identity_verified ? (
            <ListRow
              iconBg={colors.surface}
              leftIcon={<Ionicons name="shield-checkmark-outline" size={17} color={colors.brand} />}
              title="Identity Verified ✓"
              subtitle="BVN verified · bank sync enabled"
              right={<Badge variant="success" size="sm">✓</Badge>}
            />
          ) : (
            <ListRow
              iconBg={colors.warningSubtle}
              leftIcon={<Ionicons name="shield-outline" size={17} color={colors.warning} />}
              title="Verify Identity"
              subtitle="Tap to complete BVN verification"
              onPress={() => router.push('/(auth)/verify-bvn')}
              showChevron
            />
          )}
          <ListRow
            iconBg={colors.surface}
            leftIcon={<Ionicons name="business-outline" size={17} color={colors.brand} />}
            title="Accounts"
            subtitle="Connected bank accounts"
            onPress={() => router.push('/(tabs)/accounts')}
            showChevron
          />
          <ListRow
            iconBg={colors.surface}
            leftIcon={<Ionicons name="person-outline" size={17} color={colors.brand} />}
            title="Edit Profile"
            subtitle="Name, email, avatar"
            onPress={() => comingSoon('Edit Profile')}
            showChevron
          />
          <ListRow
            iconBg={colors.infoSubtle}
            leftIcon={<Ionicons name="notifications-outline" size={17} color={colors.info} />}
            title="Notification Settings"
            subtitle="Tone, frequency, quiet hours"
            onPress={() => router.push('/notification-settings')}
            showChevron
            separator={isEnrolled}
          />
          {isEnrolled && (
            <ListRow
              iconBg={colors.surface}
              leftIcon={<Ionicons name="finger-print-outline" size={17} color={colors.brand} />}
              title="Biometric Lock"
              subtitle={biometricEnabled ? 'Enabled' : 'Disabled'}
              onPress={toggleBiometric}
              right={
                <Switch
                  value={biometricEnabled}
                  onValueChange={toggleBiometric}
                  trackColor={{ false: colors.surfaceHigh, true: colors.brand }}
                  thumbColor={colors.white}
                  accessibilityLabel="Toggle biometric lock"
                  pointerEvents="none"
                />
              }
              separator={false}
            />
          )}
        </View>

        {/* ── Activity section ──────────────────────────────────────────── */}
        <SectionHeader
          title="Activity"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: 6 }}
        />
        <View style={[ss.menu, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <ListRow
            iconBg={colors.warningSubtle}
            leftIcon={<Ionicons name="star-outline" size={17} color={colors.warning} />}
            title="Rewards & XP"
            subtitle={`Level ${FAKE_LEVEL} · ${FAKE_XP.toLocaleString()} XP · ${FAKE_XP_TO_NEXT.toLocaleString()} to Level ${FAKE_LEVEL + 1}`}
            onPress={() => router.push('/(tabs)/rewards')}
            showChevron
          />
          <ListRow
            iconBg={colors.warningSubtle}
            leftIcon={<Ionicons name="stats-chart-outline" size={17} color={colors.warning} />}
            title="Leaderboard"
            subtitle="See how you rank this week"
            onPress={() => comingSoon('Leaderboard')}
            showChevron
          />
          <ListRow
            iconBg={colors.errorSubtle}
            leftIcon={<Ionicons name="notifications-outline" size={17} color={colors.error} />}
            title="Nudges"
            subtitle="AI-powered spending alerts"
            onPress={() => router.push('/(tabs)/nudges')}
            right={
              nudgeUnread > 0
                ? <Badge variant="error" size="sm">{nudgeUnread > 99 ? '99+' : nudgeUnread} new</Badge>
                : undefined
            }
            showChevron={nudgeUnread === 0}
            separator={false}
          />
        </View>

        {/* ── Learn & Reports section ──────────────────────────────────── */}
        <SectionHeader
          title="Learn & Reports"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: 6 }}
        />
        <View style={[ss.menu, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <ListRow
            iconBg={colors.infoSubtle}
            leftIcon={<Ionicons name="book-outline" size={17} color={colors.info} />}
            title="Knowledge Hub"
            subtitle="Articles, courses, quizzes"
            onPress={() => router.push('/(tabs)/hub')}
            showChevron
          />
          <ListRow
            iconBg={colors.purpleSubtle}
            leftIcon={<Ionicons name="bar-chart-outline" size={17} color={colors.purple} />}
            title="Reports"
            subtitle="Spending, income, and net worth"
            onPress={() => comingSoon('Reports')}
            showChevron
            separator={false}
          />
        </View>

        {/* ── Preferences section ──────────────────────────────────────── */}
        <SectionHeader
          title="Preferences"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: 6 }}
        />
        <View style={[ss.menu, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          {/* Dark Mode toggle */}
          <ListRow
            title="Dark Mode"
            subtitle="Switch between light and dark theme"
            right={
              <Switch
                value={isDark}
                onValueChange={setIsDark}
                trackColor={{ false: colors.surfaceHigh, true: colors.brand }}
                thumbColor={colors.white}
                accessibilityLabel="Toggle dark mode"
              />
            }
          />
          {/* Nudge Language */}
          <ListRow
            title="Nudge Language"
            subtitle="Pidgin or formal English"
            right={
              <View style={[ss.langToggle, { backgroundColor: colors.surface }]}>
                <TouchableOpacity
                  style={[ss.langBtn, nudgeLang === 'pidgin' && { backgroundColor: colors.brand }]}
                  onPress={() => setNudgeLang('pidgin')}
                  accessibilityRole="button"
                  accessibilityLabel="Pidgin language"
                  accessibilityState={{ selected: nudgeLang === 'pidgin' }}
                >
                  <Text
                    style={[
                      type_.caption,
                      nudgeLang === 'pidgin'
                        ? { color: colors.white, ...ff(700) }
                        : { color: colors.textMeta, ...ff(600) },
                    ]}
                  >
                    Pidgin
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ss.langBtn, nudgeLang === 'formal' && { backgroundColor: colors.brand }]}
                  onPress={() => setNudgeLang('formal')}
                  accessibilityRole="button"
                  accessibilityLabel="Formal English language"
                  accessibilityState={{ selected: nudgeLang === 'formal' }}
                >
                  <Text
                    style={[
                      type_.caption,
                      nudgeLang === 'formal'
                        ? { color: colors.white, ...ff(700) }
                        : { color: colors.textMeta, ...ff(600) },
                    ]}
                  >
                    Formal
                  </Text>
                </TouchableOpacity>
              </View>
            }
            separator={false}
          />
        </View>

        {/* Log out */}
        <View style={ss.logoutWrap}>
          <Button
            variant="destructive"
            onPress={handleLogout}
            accessibilityLabel="Log out"
          >
            Log Out
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: { flex: 1 },
    // header
    header: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xxl,
      borderBottomLeftRadius: 26,
      borderBottomRightRadius: 26,
    },
    avWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    profName: { fontSize: 19, letterSpacing: -0.3 },
    profEmail: { fontSize: 13, marginTop: 1 },
    badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    // scroll
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxxl + spacing.xl },
    // BVN banner
    bvnBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.smd,
      borderRadius: radius.md,
      borderWidth: 1,
      margin: spacing.mdn,
      marginTop: spacing.mdn,
      padding: spacing.md,
    },
    bvnIcon: { flexShrink: 0, marginTop: 1 },
    bvnTxt: { flex: 1 },
    bvnBtn: {
      borderRadius: radius.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      flexShrink: 0,
      alignSelf: 'center',
    },
    // stats grid
    statsGrid: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginTop: spacing.mdn,
    },
    statCell: {
      flex: 1,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
    },
    statNum: { fontSize: 22, letterSpacing: -0.5 },
    statLbl: {
      fontSize: 10,
      marginTop: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    menu: {
      borderRadius: radius.md,
      marginHorizontal: spacing.lg,
      overflow: 'hidden',
      borderWidth: 1,
    },
    langToggle: {
      flexDirection: 'row',
      borderRadius: 10,
      padding: 2,
      gap: 2,
    },
    langBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.xs,
    },
    // log out
    logoutWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxxl,
    },
  });
}
