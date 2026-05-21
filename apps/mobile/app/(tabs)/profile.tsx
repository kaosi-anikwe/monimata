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

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { Avatar, Badge, Button, ListRow, SectionHeader } from '@/components/ui';
import { useBiometricLock } from '@/hooks/useBiometricLock';
import { useAiCredentials } from '@/hooks/useCategorization';
import { useNudgeSettings, useUpdateNudgeSettings } from '@/hooks/useNudges';
import { useTheme, useThemePreference } from '@/lib/theme';
import { layout, radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { logout } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

// ── ProfileRow — reusable menu row ────────────────────────────────────────────
// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useTheme();
  const ss = makeStyles(colors);

  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const { confirm, info } = useToast();
  const { isEnrolled, isEnabled: biometricEnabled, toggleEnabled: toggleBiometric } = useBiometricLock();

  const streakScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(streakScale, { toValue: 1.2, duration: 500, useNativeDriver: true }),
      Animated.spring(streakScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [streakScale]);

  const { isDark, setIsDark } = useThemePreference();
  const { data: nudgeSettings } = useNudgeSettings();
  const updateNudgeSettings = useUpdateNudgeSettings();
  const nudgeLang = nudgeSettings?.language ?? 'pidgin';

  const { data: aiCredentials = [] } = useAiCredentials();
  const activeAiCount = aiCredentials.filter((c) => c.is_active).length;

  function setNudgeLang(lang: 'pidgin' | 'formal') {
    updateNudgeSettings.mutate({ body: { language: lang } });
  }


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
        <View style={ss.hdrTopRow}>
          <View style={ss.avWrap}>
            <Avatar
              name={user ? `${user.first_name} ${user.last_name}` : undefined}
              size="lg"
            />
            <View>
              <Text style={[ss.profName, { color: colors.white }]}>
                {user ? `${user.first_name} ${user.last_name}` : 'Hey there'}
              </Text>
              {user?.email ? (
                <Text style={[ss.profEmail, { color: colors.textInverseFaint }]}>{user.email}</Text>
              ) : null}
            </View>
          </View>
          {navigation.canGoBack() && (
            <TouchableOpacity
              style={ss.backBtn}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={type_.bodyXl.fontSize} color={colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {/* Gamification badge pills */}
        <View style={ss.badges}>
          <Animated.View style={{ transform: [{ scale: streakScale }] }}>
            <Badge variant="lime">{(user?.streak ?? 1)}-day streak 🔥</Badge>
          </Animated.View>
        </View>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Categorisation section ───────────────────────────────────── */}
        <SectionHeader
          title="Categorisation"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: spacing.xxs }}
        />
        <View style={[ss.menu, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <ListRow
            iconBg={colors.surface}
            leftIcon={<Ionicons name="sparkles-outline" size={17} color={colors.brand} />}
            title="AI Auto-Categorisation"
            subtitle="Manage AI providers & usage"
            onPress={() => router.push('/ai-settings' as never)}
            showChevron
            separator={false}
            right={
              activeAiCount > 0 ? (
                <Badge variant="success" size="sm">{activeAiCount} active</Badge>
              ) : (
                <Text style={[type_.small, { color: colors.textTertiary }]}>Off</Text>
              )
            }
          />
        </View>

        {/* ── Account & Security section ───────────────────────────────── */}
        <SectionHeader
          title="Account & Security"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: spacing.xxs }}
        />
        <View style={[ss.menu, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <ListRow
            iconBg={colors.surface}
            leftIcon={<Ionicons name="business-outline" size={17} color={colors.brand} />}
            title="Accounts"
            subtitle="Connected bank accounts"
            onPress={() => router.push('/bank-accounts')}
            showChevron
          />
          <ListRow
            iconBg={colors.surface}
            leftIcon={<Ionicons name="person-outline" size={17} color={colors.brand} />}
            title="Edit Profile"
            subtitle="Name, email, avatar"
            onPress={() => router.push('/edit-profile')}
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

        {/* ── Learn & Reports section ──────────────────────────────────── */}
        <SectionHeader
          title="Learn & Reports"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: spacing.xxs }}
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
          style={{ paddingTop: spacing.mdn, marginBottom: spacing.xxs }}
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
                        : { color: colors.textMeta },
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
                        : { color: colors.textMeta },
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

        {/* ── About section ────────────────────────────────────────────── */}
        <SectionHeader
          title="About"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.mdn, marginBottom: spacing.xxs }}
        />
        <View style={[ss.menu, { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm }]}>
          <ListRow
            iconBg={colors.successSubtle}
            leftIcon={<Ionicons name="information-circle-outline" size={17} color={colors.successText} />}
            title="About MoniMata"
            subtitle="Version, open source & licence"
            onPress={() => router.push('/about')}
            showChevron
          />
          <ListRow
            iconBg={colors.infoSubtle}
            leftIcon={<Ionicons name="document-text-outline" size={17} color={colors.info} />}
            title="Terms of Service"
            onPress={() => Linking.openURL('https://moni-mata.ng/terms-of-service')}
            showChevron
          />
          <ListRow
            iconBg={colors.purpleSubtle}
            leftIcon={<Ionicons name="shield-checkmark-outline" size={17} color={colors.purple} />}
            title="Privacy Policy"
            onPress={() => Linking.openURL('https://moni-mata.ng/privacy-policy')}
            showChevron
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
          <Text style={[type_.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg }]}>
            v{Constants.expoConfig?.version ?? '—'}
          </Text>
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
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
    },
    avWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    hdrTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    backBtn: {
      width: layout.iconBtnSize,
      height: layout.iconBtnSize,
      borderRadius: radius.sm,
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    profName: { ...type_.h1Xs },
    profEmail: { ...type_.bodyReg, marginTop: 1 },
    badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    // scroll
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxxl + spacing.xl },
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
    statNum: { ...type_.h1, letterSpacing: -0.5 },
    statLbl: {
      ...type_.labelSm,
      marginTop: 2,
    },
    menu: {
      borderRadius: radius.md,
      marginHorizontal: spacing.lg,
      overflow: 'hidden',
      borderWidth: 1,
    },
    langToggle: {
      flexDirection: 'row',
      borderRadius: radius.smd,
      padding: 2,
      gap: 2,
    },
    langBtn: {
      paddingHorizontal: spacing.smd,
      paddingVertical: spacing.xxs,
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
