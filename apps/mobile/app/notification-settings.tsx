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
 * Design spec: MoniMata_V5.html — scr-notif-settings.
 *
 * Persisted to API: enabled, quiet_hours_start, quiet_hours_end, fatigue_limit.
 * Message Tone (Pidgin/Formal) is local state only — API support in a future phase.
 */

import { useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
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
import { useNudgeSettings, useUpdateNudgeSettings } from '@/hooks/useNudges';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import type { NudgeSettings } from '@/types/nudge';

// ── Setting section header ────────────────────────────────────────────────────
function SectionLabel({ label, colors }: { label: string; colors: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 6 }}>
      <Text
        style={[
          type_.caption,
          {
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 1,
            ...ff(700),
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const colors = useTheme();
  const ss = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { error: showError } = useToast();

  const { data: settings } = useNudgeSettings();
  const updateSettings = useUpdateNudgeSettings();

  const [draft, setDraft] = useState<NudgeSettings>(() =>
    settings ?? {
      enabled: true,
      quiet_hours_start: '23:00',
      quiet_hours_end: '07:00',
      fatigue_limit: 3,
    },
  );

  // Message Tone — visual only, API support in future phase
  const [tone, setTone] = useState<'pidgin' | 'formal'>('pidgin');

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
    updateSettings.mutate(draft, {
      onSuccess: () => router.back(),
      onError: () => showError('Error', 'Could not save settings. Please try again.'),
    });
  }

  return (
    <KeyboardAvoidingView
      style={[ss.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Dark-green header ─────────────────────────────────────────────── */}
      <View
        style={[
          ss.header,
          {
            paddingTop: insets.top + 14,
            backgroundColor: colors.darkGreen,
          },
        ]}
      >
        <TouchableOpacity
          style={ss.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={18} color={colors.white} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: colors.white, ...ff(700) }]}>Nudge Settings</Text>
        <Text style={[ss.headerSub, { color: colors.textInverseFaint }]}>
          Control how and when AI alerts reach you
        </Text>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Master settings card ──────────────────────────────────────── */}
        <View style={[ss.card, { backgroundColor: colors.white, borderColor: colors.border }]}>
          {/* Enable AI Nudges */}
          <View style={[ss.settingRow, { borderBottomColor: colors.border }]}>
            <View style={ss.settingLeft}>
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>
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
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>
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
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>
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
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>
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
                <Text style={[ss.stepBtnText, { color: colors.textSecondary, ...ff(700) }]}>
                  −
                </Text>
              </TouchableOpacity>
              <Text style={[ss.stepValue, { color: colors.textPrimary, ...ff(700) }]}>
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
                <Text style={[ss.stepBtnText, { color: colors.textSecondary, ...ff(700) }]}>
                  +
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Message Tone ──────────────────────────────────────────────── */}
        <SectionLabel label="Message Tone" colors={colors} />
        <View style={[ss.toneWrap, { paddingHorizontal: spacing.lg }]}>
          <TouchableOpacity
            style={[
              ss.toneOpt,
              {
                borderColor: tone === 'pidgin' ? colors.brand : colors.border,
                backgroundColor: tone === 'pidgin' ? colors.surface : colors.white,
              },
            ]}
            onPress={() => setTone('pidgin')}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ checked: tone === 'pidgin' }}
            accessibilityLabel="Pidgin tone"
          >
            <View
              style={[
                ss.toneRadio,
                {
                  borderColor: tone === 'pidgin' ? colors.brand : colors.borderStrong,
                },
              ]}
            >
              {tone === 'pidgin' && (
                <View style={[ss.toneRadioInner, { backgroundColor: colors.brand }]} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>Pidgin</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                E.g. &quot;You don use 82% of Groceries money this month&quot;
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              ss.toneOpt,
              {
                borderColor: tone === 'formal' ? colors.brand : colors.border,
                backgroundColor: tone === 'formal' ? colors.surface : colors.white,
              },
            ]}
            onPress={() => setTone('formal')}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ checked: tone === 'formal' }}
            accessibilityLabel="Formal English tone"
          >
            <View
              style={[
                ss.toneRadio,
                {
                  borderColor: tone === 'formal' ? colors.brand : colors.borderStrong,
                },
              ]}
            >
              {tone === 'formal' && (
                <View style={[ss.toneRadioInner, { backgroundColor: colors.brand }]} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>Formal</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                E.g. &quot;You&apos;ve used 82% of your Groceries budget for March&quot;
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Save button ───────────────────────────────────────────────── */}
        <View style={ss.saveWrap}>
          <TouchableOpacity
            style={[
              ss.saveBtn,
              { backgroundColor: colors.brand },
              updateSettings.isPending && ss.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={updateSettings.isPending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Save settings"
          >
            <Text style={[type_.body, { color: colors.white, ...ff(700) }]}>
              {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: { flex: 1 },
    // header
    header: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: 26,
      borderBottomRightRadius: 26,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 11,
      backgroundColor: colors.overlayGhost,
      borderWidth: 1,
      borderColor: colors.overlayGhostBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.mdn,
    },
    headerTitle: { fontSize: 22, letterSpacing: -0.4 },
    headerSub: { fontSize: 13, marginTop: 4 },
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
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
    },
    settingRowLast: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
    },
    settingLeft: { flex: 1, marginRight: spacing.md },
    // time input
    timeInput: {
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 10,
      fontSize: 13,
      textAlign: 'center',
      minWidth: 72,
    },
    // stepper
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stepBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { fontSize: 18, lineHeight: 22 },
    stepValue: {
      fontSize: 18,
      minWidth: 24,
      textAlign: 'center',
    },
    // tone selector
    toneWrap: { gap: spacing.sm },
    toneOpt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: radius.md,
      borderWidth: 1.5,
    },
    toneRadio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toneRadioInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    // save button
    saveWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxxl,
    },
    saveBtn: {
      height: 54,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnDisabled: { opacity: 0.6 },
  });
}
