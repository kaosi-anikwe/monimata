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
 * Notification Settings screen — full-page promoted from the old modal.
 *
 * Persisted to API: enabled, quiet_hours_start, quiet_hours_end, fatigue_limit, language.
 */

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { Button, ScreenHeader, SectionHeader } from '@/components/ui';
import { useNudgeSettings, useRegisterDevice, useUpdateNudgeSettings } from '@/hooks/useNudges';
import { lightColors, useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { Ionicons } from '@expo/vector-icons';
import type { NudgeSettings } from '@monimata/shared-types';
import * as Notifications from 'expo-notifications';

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const colors = useTheme();
  const ss = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { error: showError, success: showSuccess } = useToast();

  const { data: settings } = useNudgeSettings();
  const updateSettings = useUpdateNudgeSettings();
  const registerDevice = useRegisterDevice();

  // ── Push notification OS permission ──────────────────────────────────────
  type PermState = { granted: boolean; canAskAgain: boolean } | null;
  const [perm, setPerm] = useState<PermState>(null);
  const [permBusy, setPermBusy] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    // Check permissions on mount and whenever the app returns to the foreground
    // (e.g. after the user changes the setting in the OS Settings app).
    const check = () =>
      Notifications.getPermissionsAsync().then(({ granted, canAskAgain }) =>
        setPerm({ granted, canAskAgain }),
      );

    check();

    const sub = AppState.addEventListener('change', (state) => {
      if (appStateRef.current.match(/inactive|background/) && state === 'active') check();
      appStateRef.current = state;
    });
    return () => sub.remove();
  }, []);

  // Silently re-register the push token whenever we confirm permission is granted.
  const prevGranted = useRef<boolean | null>(null);
  useEffect(() => {
    if (perm?.granted && prevGranted.current !== true) {
      registerPushToken().catch(() => { });
    }
    prevGranted.current = perm?.granted ?? null;
  }, [perm?.granted]); // eslint-disable-line react-hooks/exhaustive-deps

  async function registerPushToken() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'MoniMata Nudges',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: lightColors.brand,
      });
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: '6f68cf17-0eea-4815-8e6c-e821e0823fe6',
    });
    registerDevice.mutate({ body: { token } });
  }

  async function handleEnableNotifications() {
    if (perm?.granted) return;
    if (perm?.canAskAgain === false) {
      await Linking.openSettings();
      return;
    }
    setPermBusy(true);
    try {
      const { granted, canAskAgain } = await Notifications.requestPermissionsAsync();
      setPerm({ granted, canAskAgain });
      if (granted) {
        await registerPushToken();
        showSuccess('Notifications enabled!', "You'll now receive spending alerts.");
      }
    } catch {
      // silently ignore — user may have dismissed the OS dialog
    } finally {
      setPermBusy(false);
    }
  }

  const [draft, setDraft] = useState<NudgeSettings>(() =>
    settings ?? {
      enabled: true,
      quiet_hours_start: '23:00',
      quiet_hours_end: '07:00',
      fatigue_limit: 3,
      language: 'formal',
    },
  );

  // Message Tone — persisted via draft.language

  // Sync draft when settings load from API (first mount)
  // Using a ref to only do this once
  const [synced, setSynced] = useState(false);
  if (!synced && settings) {
    setDraft({ ...settings });
    setSynced(true);
  }

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

  function handleSave() {
    if (!timeRegex.test(draft.quiet_hours_start) || !timeRegex.test(draft.quiet_hours_end)) {
      showError('Invalid time', 'Please use HH:MM format (e.g. 23:00).');
      return;
    }
    updateSettings.mutate({ body: draft as never }, {
      onSuccess: () => router.back(),
      onError: () => showError('Error', 'Could not save settings. Please try again.'),
    });
  }

  return (
    <KeyboardAvoidingView
      style={[ss.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="Nudge Settings"
        subtitle="Control how and when AI alerts reach you"
        onBack={() => router.back()}
        paddingTop={insets.top + 14}
      />

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── OS push permission card ───────────────────────────────────── */}
        <View style={[ss.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={ss.settingRowLast}>
            <View style={ss.settingLeft}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>Push Notifications</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2 }]}>
                {perm === null
                  ? 'Checking…'
                  : perm.granted
                    ? 'Active — this device will receive nudges'
                    : perm.canAskAgain
                      ? 'Not yet enabled on this device'
                      : 'Blocked — tap to open system settings'}
              </Text>
            </View>
            {perm?.granted ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            ) : (
              <TouchableOpacity
                style={[
                  ss.permBtn,
                  {
                    backgroundColor: perm?.canAskAgain !== false ? colors.brand : colors.surface,
                    borderColor: colors.brand,
                  },
                ]}
                onPress={handleEnableNotifications}
                disabled={permBusy || perm === null}
                accessibilityRole="button"
                accessibilityLabel={perm?.canAskAgain !== false ? 'Enable push notifications' : 'Open system settings'}
              >
                <Text style={[ss.permBtnText, { color: perm?.canAskAgain !== false ? colors.white : colors.brand }]}>
                  {perm?.canAskAgain !== false ? 'Enable' : 'Open Settings'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Master settings card ──────────────────────────────────────── */}
        <View style={[ss.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          {/* Enable AI Nudges */}
          <View style={[ss.settingRow, { borderBottomColor: colors.border }]}>
            <View style={ss.settingLeft}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>
                Enable AI Nudges
              </Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2 }]}>
                Push notifications for spending alerts
              </Text>
            </View>
            <Switch
              value={draft.enabled}
              onValueChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
              trackColor={{ false: colors.surfaceHigh, true: colors.brand }}
              thumbColor={colors.white}
              accessibilityLabel="Toggle AI nudges"
              accessibilityRole="switch"
              accessibilityState={{ checked: draft.enabled }}
            />
          </View>

          {/* Quiet Hours: From */}
          <View style={[ss.settingRow, { borderBottomColor: colors.border }]}>
            <View style={ss.settingLeft}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>
                Quiet Hours: From
              </Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2 }]}>
                No nudges during this window (WAT)
              </Text>
            </View>
            <TextInput
              style={[
                ss.timeInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  ...ff(700),
                },
              ]}
              value={draft.quiet_hours_start}
              onChangeText={(t) => setDraft((d) => ({ ...d, quiet_hours_start: t }))}
              placeholder="23:00"
              placeholderTextColor={colors.textTertiary}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Quiet hours start time"
            />
          </View>

          {/* Quiet Hours: To */}
          <View style={[ss.settingRow, { borderBottomColor: colors.border }]}>
            <View style={ss.settingLeft}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>
                Quiet Hours: To
              </Text>
            </View>
            <TextInput
              style={[
                ss.timeInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  ...ff(700),
                },
              ]}
              value={draft.quiet_hours_end}
              onChangeText={(t) => setDraft((d) => ({ ...d, quiet_hours_end: t }))}
              placeholder="07:00"
              placeholderTextColor={colors.textTertiary}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Quiet hours end time"
            />
          </View>

          {/* Daily nudge limit */}
          <View style={ss.settingRowLast}>
            <View style={ss.settingLeft}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>
                Daily nudge limit
              </Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2 }]}>
                Max alerts per day
              </Text>
            </View>
            <View style={ss.stepper}>
              <TouchableOpacity
                style={[ss.stepBtn, { backgroundColor: colors.surface }]}
                onPress={() =>
                  setDraft((d) =>
                    d.fatigue_limit > 1 ? { ...d, fatigue_limit: d.fatigue_limit - 1 } : d,
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="Decrease nudge limit"
              >
                <Text style={[ss.stepBtnText, { color: colors.textSecondary }]}>
                  −
                </Text>
              </TouchableOpacity>
              <Text style={[ss.stepValue, { color: colors.textPrimary }]}>
                {draft.fatigue_limit}
              </Text>
              <TouchableOpacity
                style={[ss.stepBtn, { backgroundColor: colors.surface }]}
                onPress={() =>
                  setDraft((d) =>
                    d.fatigue_limit < 10 ? { ...d, fatigue_limit: d.fatigue_limit + 1 } : d,
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="Increase nudge limit"
              >
                <Text style={[ss.stepBtnText, { color: colors.textSecondary }]}>
                  +
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Message Tone ──────────────────────────────────────────────── */}
        <SectionHeader
          title="Message Tone"
          variant="group"
          paddingHorizontal={spacing.lg}
          style={{ paddingTop: spacing.lg, marginBottom: 6 }}
        />
        <View style={[ss.toneWrap, { paddingHorizontal: spacing.lg }]}>
          <TouchableOpacity
            style={[
              ss.toneOpt,
              {
                borderColor: draft.language === 'pidgin' ? colors.brand : colors.border,
                backgroundColor: draft.language === 'pidgin' ? colors.surface : colors.cardBg,
              },
            ]}
            onPress={() => setDraft((d) => ({ ...d, language: 'pidgin' }))}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.language === 'pidgin' }}
            accessibilityLabel="Pidgin tone"
          >
            <View
              style={[
                ss.toneRadio,
                {
                  borderColor: draft.language === 'pidgin' ? colors.brand : colors.borderStrong,
                },
              ]}
            >
              {draft.language === 'pidgin' && (
                <View style={[ss.toneRadioInner, { backgroundColor: colors.brand }]} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>Pidgin</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                E.g. &quot;You don use 82% of Groceries money this month&quot;
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              ss.toneOpt,
              {
                borderColor: draft.language === 'formal' ? colors.brand : colors.border,
                backgroundColor: draft.language === 'formal' ? colors.surface : colors.cardBg,
              },
            ]}
            onPress={() => setDraft((d) => ({ ...d, language: 'formal' }))}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ checked: draft.language === 'formal' }}
            accessibilityLabel="Formal English tone"
          >
            <View
              style={[
                ss.toneRadio,
                {
                  borderColor: draft.language === 'formal' ? colors.brand : colors.borderStrong,
                },
              ]}
            >
              {draft.language === 'formal' && (
                <View style={[ss.toneRadioInner, { backgroundColor: colors.brand }]} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>Formal</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                E.g. &quot;You&apos;ve used 82% of your Groceries budget for March&quot;
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Save button ───────────────────────────────────────────────── */}
        <View style={ss.saveWrap}>
          <Button
            variant="green"
            onPress={handleSave}
            disabled={updateSettings.isPending}
            loading={updateSettings.isPending}
            accessibilityLabel="Save settings"
          >
            Save Settings
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: { flex: 1 },
    // scroll
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxxl + spacing.xl },
    // settings card
    card: {
      borderRadius: radius.md,
      marginHorizontal: spacing.lg,
      marginTop: spacing.mdn,
      overflow: 'hidden',
      borderWidth: 1,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.mdn,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
    },
    settingRowLast: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.mdn,
      paddingHorizontal: spacing.lg,
    },
    settingLeft: { flex: 1, marginRight: spacing.md },
    // time input
    timeInput: {
      borderWidth: 1.5,
      borderRadius: radius.smd,
      paddingVertical: spacing.xxs,
      paddingHorizontal: spacing.smd,
      ...type_.bodyReg,
      ...ff(700),
      textAlign: 'center',
      minWidth: 72,
    },
    // stepper
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stepBtn: {
      width: layout.iconBtnSize,
      height: layout.iconBtnSize,
      borderRadius: radius.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { ...type_.subHead, lineHeight: 25 },
    stepValue: { ...type_.subHead, minWidth: 24, textAlign: 'center' },
    // tone selector
    toneWrap: { gap: spacing.sm },
    toneOpt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.smd,
      paddingVertical: spacing.smd,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
    },
    toneRadio: {
      width: 18,
      height: 18,
      borderRadius: spacing.smd,
      borderWidth: 2,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toneRadioInner: {
      width: spacing.sm,
      height: spacing.sm,
      borderRadius: spacing.xs,
    },
    // save button
    saveWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxxl,
    },
    // push permission
    permBtn: {
      borderRadius: radius.xs,
      borderWidth: 1.5,
      paddingVertical: spacing.xxs,
      paddingHorizontal: spacing.md,
    },
    permBtnText: { ...type_.small },
  });
}
