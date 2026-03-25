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
 *
 * Design spec: MoniMata_V5.html — scr-profile.
 * XP, Level, Streak, and Badge count are HARDCODED for now.
 * Phase 14 will replace them with real data from the gamification service.
 */

import { useMemo, useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { useAccounts } from '@/hooks/useAccounts';
import { useBiometricLock } from '@/hooks/useBiometricLock';
import { useNudgeUnreadCount } from '@/hooks/useNudges';
import { useTheme, useThemePreference } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { logout } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { formatNairaCompact } from '@/utils/money';

// ── Hardcoded gamification constants (Phase 14 will fetch from API) ──────────
const FAKE_LEVEL = 7;
const FAKE_XP = 2840;
const FAKE_STREAK = 14;
const FAKE_BADGES = 8;
const FAKE_XP_TO_NEXT = 1360;

// ── Helper: initials from name ────────────────────────────────────────────────
function getInitials(firstName?: string | null, lastName?: string | null): string {
  return [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

// ── ProfileRow — reusable menu row ────────────────────────────────────────────
interface ProfileRowProps {
  iconBg: string;
  iconColor: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  onPress?: () => void;
  rightBadge?: React.ReactNode;
  rightSwitch?: React.ReactNode;
  isLast?: boolean;
  colors: ReturnType<typeof useTheme>;
}

function ProfileRow({
  iconBg,
  iconColor,
  icon,
  label,
  sub,
  onPress,
  rightBadge,
  rightSwitch,
  isLast,
  colors,
}: ProfileRowProps) {
  const ss = makeStyles(colors);
  return (
    <TouchableOpacity
      style={[ss.profRow, isLast && ss.profRowLast]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
    >
      <View style={[ss.profRowIc, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={ss.profRowTxt}>
        <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>{label}</Text>
        {sub ? (
          <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>{sub}</Text>
        ) : null}
      </View>
      <View style={ss.profRowEnd}>
        {rightBadge}
        {rightSwitch ?? (
          onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} /> : null
        )}
      </View>
    </TouchableOpacity>
  );
}

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
  // Nudge language preference (visual only — wired in Phase 16)
  const [nudgeLang, setNudgeLang] = useState<'pidgin' | 'formal'>('pidgin');

  const netWorth = useMemo(
    () => (accounts ?? []).filter((a) => a.is_active).reduce((s, a) => s + a.balance, 0),
    [accounts],
  );

  const initials = getInitials(user?.first_name, user?.last_name);

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
    <View style={[ss.root, { backgroundColor: colors.background }]}>      <StatusBar style="light" />      {/* ── Dark-green header ─────────────────────────────────────────────── */}
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
          <View style={ss.avatar}>
            <Text style={[ss.avatarText, { color: colors.lime, ...ff(800) }]}>{initials}</Text>
          </View>
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
          <View style={ss.badge}>
            <Text style={[ss.badgeText, { color: colors.lime, ...ff(700) }]}>
              Level {FAKE_LEVEL} ⚔️
            </Text>
          </View>
          <View style={ss.badge}>
            <Text style={[ss.badgeText, { color: colors.lime, ...ff(700) }]}>
              {FAKE_STREAK}-day streak 🔥
            </Text>
          </View>
          <View style={ss.badge}>
            <Text style={[ss.badgeText, { color: colors.lime, ...ff(700) }]}>
              {FAKE_BADGES} badges 🏅
            </Text>
          </View>
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
          <View style={[ss.statCell, { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm }]}>
            <Text style={[ss.statNum, { color: colors.textPrimary, ...ff(800) }]}>
              {formatNairaCompact(netWorth)}
            </Text>
            <Text style={[ss.statLbl, { color: colors.textMeta, ...ff(600) }]}>Net Worth</Text>
          </View>
          <View style={[ss.statCell, { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm }]}>
            <Text style={[ss.statNum, { color: colors.textPrimary, ...ff(800) }]}>
              {FAKE_XP.toLocaleString()}
            </Text>
            <Text style={[ss.statLbl, { color: colors.textMeta, ...ff(600) }]}>Total XP</Text>
          </View>
          <View style={[ss.statCell, { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm }]}>
            <Text style={[ss.statNum, { color: colors.textPrimary, ...ff(800) }]}>{FAKE_STREAK}</Text>
            <Text style={[ss.statLbl, { color: colors.textMeta, ...ff(600) }]}>Day Streak</Text>
          </View>
        </View>

        {/* ── Activity section ──────────────────────────────────────────── */}
        <Text style={[ss.sectionLbl, { color: colors.textMeta, ...ff(700) }]}>Activity</Text>
        <View style={[ss.menu, { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm }]}>
          <ProfileRow
            iconBg={colors.warningSubtle}
            iconColor={colors.warning}
            icon="star-outline"
            label="Rewards & XP"
            sub={`Level ${FAKE_LEVEL} · ${FAKE_XP.toLocaleString()} XP · ${FAKE_XP_TO_NEXT.toLocaleString()} to Level ${FAKE_LEVEL + 1}`}
            onPress={() => router.push('/(tabs)/rewards')}
            colors={colors}
          />
          <ProfileRow
            iconBg={colors.warningSubtle}
            iconColor={colors.warning}
            icon="stats-chart-outline"
            label="Leaderboard"
            sub="See how you rank this week"
            onPress={() => comingSoon('Leaderboard')}
            colors={colors}
          />
          <ProfileRow
            iconBg={colors.errorSubtle}
            iconColor={colors.error}
            icon="notifications-outline"
            label="Nudges"
            sub="AI-powered spending alerts"
            onPress={() => router.push('/(tabs)/nudges')}
            rightBadge={
              nudgeUnread > 0 ? (
                <View style={[ss.pill, { backgroundColor: colors.errorSubtle }]}>
                  <Text style={[ss.pillText, { color: colors.error, ...ff(700) }]}>
                    {nudgeUnread > 99 ? '99+' : nudgeUnread} new
                  </Text>
                </View>
              ) : undefined
            }
            isLast
            colors={colors}
          />
        </View>

        {/* ── Learn & Reports section ──────────────────────────────────── */}
        <Text style={[ss.sectionLbl, { color: colors.textMeta, ...ff(700) }]}>Learn & Reports</Text>
        <View style={[ss.menu, { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm }]}>
          <ProfileRow
            iconBg={colors.infoSubtle}
            iconColor={colors.info}
            icon="book-outline"
            label="Knowledge Hub"
            sub="Articles, courses, quizzes"
            onPress={() => router.push('/(tabs)/hub')}
            colors={colors}
          />
          <ProfileRow
            iconBg={colors.purpleSubtle}
            iconColor={colors.purple}
            icon="bar-chart-outline"
            label="Reports"
            sub="Spending, income, and net worth"
            onPress={() => comingSoon('Reports')}
            isLast
            colors={colors}
          />
        </View>

        {/* ── Account & Security section ───────────────────────────────── */}
        <Text style={[ss.sectionLbl, { color: colors.textMeta, ...ff(700) }]}>Account & Security</Text>
        <View style={[ss.menu, { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm }]}>
          {user?.identity_verified ? (
            <ProfileRow
              iconBg={colors.surface}
              iconColor={colors.brand}
              icon="shield-checkmark-outline"
              label="Identity Verified ✓"
              sub="BVN verified · bank sync enabled"
              rightBadge={
                <View style={[ss.pill, { backgroundColor: colors.surface }]}>
                  <Text style={[ss.pillText, { color: colors.brand, ...ff(700) }]}>✓</Text>
                </View>
              }
              colors={colors}
            />
          ) : (
            <ProfileRow
              iconBg={colors.warningSubtle}
              iconColor={colors.warning}
              icon="shield-outline"
              label="Verify Identity"
              sub="Tap to complete BVN verification"
              onPress={() => router.push('/(auth)/verify-bvn')}
              colors={colors}
            />
          )}
          <ProfileRow
            iconBg={colors.surface}
            iconColor={colors.brand}
            icon="person-outline"
            label="Edit Profile"
            sub="Name, email, avatar"
            onPress={() => comingSoon('Edit Profile')}
            colors={colors}
          />
          <ProfileRow
            iconBg={colors.infoSubtle}
            iconColor={colors.info}
            icon="notifications-outline"
            label="Notification Settings"
            sub="Tone, frequency, quiet hours"
            onPress={() => router.push('/notification-settings')}
            colors={colors}
          />
          {isEnrolled && (
            <ProfileRow
              iconBg={colors.surface}
              iconColor={colors.brand}
              icon="finger-print-outline"
              label="Biometric Lock"
              sub={biometricEnabled ? 'Enabled' : 'Disabled'}
              onPress={toggleBiometric}
              rightSwitch={
                <Switch
                  value={biometricEnabled}
                  onValueChange={toggleBiometric}
                  trackColor={{ false: colors.surfaceHigh, true: colors.brand }}
                  thumbColor={colors.white}
                  accessibilityLabel="Toggle biometric lock"
                  pointerEvents="none"
                />
              }
              isLast
              colors={colors}
            />
          )}
          {/* If biometric not enrolled, the last row above (Notification Settings) is last */}
          {!isEnrolled && (
            <View style={ss.profRowLast} />
          )}
        </View>

        {/* ── Preferences section ──────────────────────────────────────── */}
        <Text style={[ss.sectionLbl, { color: colors.textMeta, ...ff(700) }]}>Preferences</Text>
        <View style={[ss.menu, { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm }]}>
          {/* Dark Mode toggle */}
          <View style={[ss.prefRow, { borderBottomColor: colors.border }]}>
            <View style={ss.prefRowLeft}>
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>Dark Mode</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                Switch between light and dark theme
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={setIsDark}
              trackColor={{ false: colors.surfaceHigh, true: colors.brand }}
              thumbColor={colors.white}
              accessibilityLabel="Toggle dark mode"
            />
          </View>
          {/* Nudge Language — wired in Phase 16 */}
          <View style={ss.prefRowLast}>
            <View style={ss.prefRowLeft}>
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>Nudge Language</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                Pidgin or formal English
              </Text>
            </View>
            <View style={[ss.langToggle, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                style={[
                  ss.langBtn,
                  nudgeLang === 'pidgin' && { backgroundColor: colors.brand },
                ]}
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
                style={[
                  ss.langBtn,
                  nudgeLang === 'formal' && { backgroundColor: colors.brand },
                ]}
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
          </View>
        </View>

        {/* Log out */}
        <View style={ss.logoutWrap}>
          <TouchableOpacity
            style={[ss.logoutBtn, { borderColor: colors.errorBorder }]}
            onPress={handleLogout}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={[type_.body, { color: colors.error, ...ff(700) }]}>Log Out</Text>
          </TouchableOpacity>
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
    avatar: {
      width: 58,
      height: 58,
      borderRadius: 17,
      backgroundColor: colors.brand,
      borderWidth: 2.5,
      borderColor: colors.limeBorderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    avatarText: { fontSize: 23, lineHeight: 28 },
    profName: { fontSize: 19, letterSpacing: -0.3 },
    profEmail: { fontSize: 13, marginTop: 1 },
    badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    badge: {
      backgroundColor: colors.limeBadgeBg,
      borderWidth: 1,
      borderColor: colors.limeGlow,
      borderRadius: radius.xs,
      paddingHorizontal: spacing.smd,
      paddingVertical: 4,
    },
    badgeText: { fontSize: 11 },
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
    // section
    sectionLbl: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.mdn,
      paddingBottom: 6,
    },
    menu: {
      borderRadius: radius.md,
      marginHorizontal: spacing.lg,
      overflow: 'hidden',
      borderWidth: 1,
    },
    // profile rows
    profRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    profRowLast: { borderBottomWidth: 0 },
    profRowIc: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    profRowTxt: { flex: 1 },
    profRowEnd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pill: {
      borderRadius: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    pillText: { fontSize: 11 },
    // preferences
    prefRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
    },
    prefRowLast: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
    },
    prefRowLeft: { flex: 1, marginRight: spacing.md },
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
    logoutBtn: {
      borderWidth: 1.5,
      borderRadius: radius.md,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
