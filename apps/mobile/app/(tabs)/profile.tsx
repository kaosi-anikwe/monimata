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

import { useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { logout } from '@/store/authSlice';
import { useToast } from '@/components/Toast';
import type { NudgeSettings } from '@/types/nudge';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useNudgeUnreadCount, useNudgeSettings, useUpdateNudgeSettings } from '@/hooks/useNudges';

export default function ProfileScreen() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const nudgeUnread = useNudgeUnreadCount();
  const { data: settings } = useNudgeSettings();
  const updateSettings = useUpdateNudgeSettings();
  const { error, confirm } = useToast();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [draft, setDraft] = useState<NudgeSettings | null>(null);

  function openSettings() {
    setDraft(
      settings
        ? { ...settings }
        : { enabled: true, quiet_hours_start: '23:00', quiet_hours_end: '07:00', fatigue_limit: 3 },
    );
    setSettingsVisible(true);
  }

  function saveSettings() {
    if (!draft) return;
    if (
      !/^\d{2}:\d{2}$/.test(draft.quiet_hours_start) ||
      !/^\d{2}:\d{2}$/.test(draft.quiet_hours_end)
    ) {
      error('Invalid time', 'Please enter times in HH:MM format (e.g. 23:00).');
      return;
    }
    updateSettings.mutate(draft, {
      onSuccess: () => setSettingsVisible(false),
      onError: () => error('Error', 'Could not save settings. Please try again.'),
    });
  }

  function handleLogout() {
    confirm({
      title: 'Log out',
      message: 'Are you sure?',
      confirmText: 'Log Out',
      confirmStyle: 'destructive',
      onConfirm: () => {
        dispatch(logout()).then(() => router.replace('/(auth)'));
      },
    });
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.c}>
        <Text style={s.name}>{user?.first_name ?? 'Hey there'} 👋</Text>
        <Text style={s.email}>{user?.email}</Text>
        {!user?.identity_verified && (
          <TouchableOpacity style={s.bvnBanner} onPress={() => router.push('/(auth)/verify-bvn')}>
            <Text style={s.bvnText}>⚠️ Complete BVN verification to link a bank account</Text>
          </TouchableOpacity>
        )}

        {/* ── Menu rows ─────────────────────────────────────── */}
        <View style={s.menu}>
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => router.push('/(tabs)/nudges')}
            activeOpacity={0.75}
          >
            <View style={s.menuLeft}>
              <Ionicons name="notifications-outline" size={20} color="#374151" style={s.menuIcon} />
              <Text style={s.menuLabel}>Nudges</Text>
            </View>
            <View style={s.menuRight}>
              {nudgeUnread > 0 && (
                <View style={s.nudgeBadge}>
                  <Text style={s.nudgeBadgeText}>
                    {nudgeUnread > 99 ? '99+' : nudgeUnread}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
          <View style={s.menuDivider} />
          <TouchableOpacity
            style={s.menuRow}
            onPress={openSettings}
            activeOpacity={0.75}
          >
            <View style={s.menuLeft}>
              <Ionicons name="moon-outline" size={20} color="#374151" style={s.menuIcon} />
              <Text style={s.menuLabel}>Notification Settings</Text>
            </View>
            <View style={s.menuRight}>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={settingsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setSettingsVisible(false)}
          />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Notification Settings</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>

            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Enable nudges</Text>
                <Text style={s.settingHint}>Receive spending insights and alerts</Text>
              </View>
              <Switch
                value={draft?.enabled ?? true}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, enabled: v } : d))}
                trackColor={{ false: '#D1D5DB', true: '#10B981' }}
                thumbColor="#fff"
              />
            </View>

            <View style={s.sheetDivider} />

            <Text style={s.sectionLabel}>Quiet hours (WAT)</Text>
            <Text style={s.sectionHint}>No nudges will be sent during this window</Text>
            <View style={s.timeRow}>
              <View style={s.timeField}>
                <Text style={s.timeLabel}>From</Text>
                <TextInput
                  style={s.timeInput}
                  value={draft?.quiet_hours_start ?? '23:00'}
                  onChangeText={(t) =>
                    setDraft((d) => (d ? { ...d, quiet_hours_start: t } : d))
                  }
                  placeholder="23:00"
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <Ionicons
                name="arrow-forward"
                size={16}
                color="#9CA3AF"
                style={{ alignSelf: 'flex-end', marginBottom: 10, marginHorizontal: 8 }}
              />
              <View style={s.timeField}>
                <Text style={s.timeLabel}>To</Text>
                <TextInput
                  style={s.timeInput}
                  value={draft?.quiet_hours_end ?? '07:00'}
                  onChangeText={(t) =>
                    setDraft((d) => (d ? { ...d, quiet_hours_end: t } : d))
                  }
                  placeholder="07:00"
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>

            <View style={s.sheetDivider} />

            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Daily nudge limit</Text>
                <Text style={s.settingHint}>Maximum nudges sent per day</Text>
              </View>
              <View style={s.stepper}>
                <TouchableOpacity
                  style={s.stepBtn}
                  onPress={() =>
                    setDraft((d) =>
                      d && d.fatigue_limit > 1
                        ? { ...d, fatigue_limit: d.fatigue_limit - 1 }
                        : d,
                    )
                  }
                >
                  <Text style={s.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.stepValue}>{draft?.fatigue_limit ?? 3}</Text>
                <TouchableOpacity
                  style={s.stepBtn}
                  onPress={() =>
                    setDraft((d) =>
                      d && d.fatigue_limit < 10
                        ? { ...d, fatigue_limit: d.fatigue_limit + 1 }
                        : d,
                    )
                  }
                >
                  <Text style={s.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[s.saveBtn, updateSettings.isPending && { opacity: 0.6 }]}
              onPress={saveSettings}
              disabled={updateSettings.isPending}
            >
              <Text style={s.saveBtnText}>
                {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  c: { flex: 1, padding: 24 },
  name: { fontSize: 26, fontWeight: '800', color: '#111827', marginTop: 24 },
  email: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  bvnBanner: {
    backgroundColor: '#FEF3C7', padding: 14, borderRadius: 10, marginBottom: 24,
  },
  bvnText: { color: '#92400E', fontSize: 13, fontWeight: '600' },
  menu: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { marginRight: 12 },
  menuLabel: { fontSize: 15, color: '#111827', fontWeight: '500' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nudgeBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  nudgeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  menuDivider: { height: 1, backgroundColor: '#E5E7EB' },
  logoutBtn: {
    borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 'auto',
  },
  logoutText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
  // ── Settings modal ─────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingLabel: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  settingHint: { fontSize: 12, color: '#6B7280' },
  sheetDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 2, marginTop: 8 },
  sectionHint: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  timeField: { flex: 1 },
  timeLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: '600' },
  timeInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 18, fontWeight: '700', color: '#374151', lineHeight: 22 },
  stepValue: { fontSize: 18, fontWeight: '700', color: '#111827', minWidth: 24, textAlign: 'center' },
  saveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
