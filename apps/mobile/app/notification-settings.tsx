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

import { useState } from 'react';

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
import { Button, SectionHeader, ScreenHeader } from '@/components/ui';
import { useNudgeSettings, useUpdateNudgeSettings } from '@/hooks/useNudges';
import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import type { NudgeSettings } from '@/types/nudge';

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
                backgroundColor: draft.language === 'pidgin' ? colors.surface : colors.white,
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
                borderColor: draft.language === 'formal' ? colors.brand : colors.border,
                backgroundColor: draft.language === 'formal' ? colors.surface : colors.white,
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
              <Text style={[type_.body, { color: colors.textPrimary, ...ff(600) }]}>Formal</Text>
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
  });
}
