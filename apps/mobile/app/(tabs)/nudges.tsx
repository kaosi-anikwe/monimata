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
 * Nudges screen — the in-app notification centre.
 *
 * Each nudge card can be tapped to open a detail sheet that shows:
 *   - A "why you got this" explanation derived from nudge.context
 *   - Actionable steps specific to the trigger type
 *   - Deep-link buttons that navigate to the relevant screen
 *
 * This lives at /(tabs)/nudges and is accessible from the bottom tab bar,
 * which also shows an unread count badge (managed in _layout.tsx).
 */

import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useDismissNudge,
  useMarkAllNudgesRead,
  useNudges,
  useOpenNudge,
} from '../../hooks/useNudges';
import type {
  BillPaymentContext,
  LargeSingleTxContext,
  Nudge,
  NudgeTriggerType,
  PayReceivedContext,
  Threshold100Context,
  Threshold80Context,
} from '../../types/nudge';


// ── Trigger type metadata ─────────────────────────────────────────────────

interface TriggerMeta {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
}

const TRIGGER_META: Record<string, TriggerMeta> = {
  threshold_80: {
    icon: 'warning-outline',
    color: '#F59E0B',
    label: 'Budget warning',
  },
  threshold_100: {
    icon: 'alert-circle-outline',
    color: '#EF4444',
    label: 'Budget exceeded',
  },
  large_single_tx: {
    icon: 'trending-down-outline',
    color: '#8B5CF6',
    label: 'Large transaction',
  },
  pay_received: {
    icon: 'cash-outline',
    color: '#0F7B3F',
    label: 'Money received',
  },
  bill_payment: {
    icon: 'checkmark-circle-outline',
    color: '#0F7B3F',
    label: 'Bill payment',
  },
};

function getMeta(triggerType: string): TriggerMeta {
  return (
    TRIGGER_META[triggerType] ?? {
      icon: 'notifications-outline',
      color: '#6B7280',
      label: 'Nudge',
    }
  );
}

// ── Helper: time ago ──────────────────────────────────────────────────────

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoDate).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  });
}

// ── "Why you got this" summary ────────────────────────────────────────────

function buildWhySummary(nudge: Nudge): string {
  const ctx = nudge.context as unknown as Record<string, unknown> | null;
  if (!ctx) return '';

  switch (nudge.trigger_type as NudgeTriggerType) {
    case 'threshold_80': {
      const c = ctx as unknown as Threshold80Context;
      return (
        `You've used ${c.percentage}% of your ${c.category_name} budget for ` +
        `${_monthLabel(c.month)}. Only ₦${c.remaining_naira} of ₦${c.assigned_naira} remains.`
      );
    }
    case 'threshold_100': {
      const c = ctx as unknown as Threshold100Context;
      return (
        `Your ${c.category_name} budget for ${_monthLabel(c.month)} is fully used. ` +
        `You overspent by ₦${c.overage_naira} (${c.percentage}% of assigned).`
      );
    }
    case 'large_single_tx': {
      const c = ctx as unknown as LargeSingleTxContext;
      return (
        `A single transaction of ₦${c.amount_naira} ("${c.narration}") consumed ` +
        `${c.percentage}% of your ${c.category_name} budget.`
      );
    }
    case 'pay_received': {
      const c = ctx as unknown as PayReceivedContext;
      return `₦${c.amount_naira} credit was received: "${c.narration}".`;
    }
    case 'bill_payment': {
      const c = ctx as unknown as BillPaymentContext;
      return (
        `Your ${c.biller_name} payment of ₦${c.amount_naira} was processed ` +
        `successfully.${c.category_name ? ` Your ${c.category_name} budget has been updated.` : ''}`
      );
    }
    default:
      return '';
  }
}

function _monthLabel(month: string): string {
  if (!month) return 'this month';
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
}

// ── Actionable steps per trigger type ────────────────────────────────────

interface NudgeAction {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route: string;
}

function getActions(triggerType: string): NudgeAction[] {
  switch (triggerType as NudgeTriggerType) {
    case 'threshold_80':
    case 'threshold_100':
      return [
        {
          label: 'Adjust your budget',
          icon: 'wallet-outline',
          route: '/(tabs)/',
        },
        {
          label: 'Review transactions',
          icon: 'receipt-outline',
          route: '/(tabs)/transactions',
        },
      ];
    case 'large_single_tx':
      return [
        {
          label: 'Review transactions',
          icon: 'receipt-outline',
          route: '/(tabs)/transactions',
        },
        {
          label: 'Adjust your budget',
          icon: 'wallet-outline',
          route: '/(tabs)/',
        },
      ];
    case 'pay_received':
      return [
        {
          label: 'Assign to your budget',
          icon: 'wallet-outline',
          route: '/(tabs)/',
        },
      ];
    case 'bill_payment':
      return [
        {
          label: 'View bill history',
          icon: 'flash-outline',
          route: '/(tabs)/bills',
        },
      ];
    default:
      return [];
  }
}

// ── NudgeDetailSheet ──────────────────────────────────────────────────────

interface DetailSheetProps {
  nudge: Nudge | null;
  onClose: () => void;
}

function NudgeDetailSheet({ nudge, onClose }: DetailSheetProps) {
  const router = useRouter();
  const dismiss = useDismissNudge();

  if (!nudge) return null;

  const meta = getMeta(nudge.trigger_type);
  const why = buildWhySummary(nudge);
  const actions = getActions(nudge.trigger_type);

  function handleAction(route: string) {
    onClose();
    router.push(route as Parameters<typeof router.push>[0]);
  }

  function handleDismiss() {
    if (!nudge) return;
    dismiss.mutate(nudge.id);
    onClose();
  }

  return (
    <Modal
      visible={!!nudge}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={ds.overlay} onPress={onClose}>
        <Pressable
          style={ds.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <View style={ds.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={ds.scrollContent}
          >
            {/* Header */}
            <View style={ds.headerRow}>
              <View
                style={[ds.iconBubble, { backgroundColor: meta.color + '20' }]}
              >
                <Ionicons name={meta.icon} size={28} color={meta.color} />
              </View>
              <View style={ds.headerText}>
                <Text style={ds.typeLabel}>{meta.label}</Text>
                <Text style={ds.title}>
                  {nudge.title ?? 'Nudge'}
                </Text>
              </View>
            </View>

            {/* Message */}
            <View style={ds.section}>
              <Text style={ds.message}>{nudge.message}</Text>
            </View>

            {/* Why you got this */}
            {why ? (
              <View style={ds.section}>
                <Text style={ds.sectionTitle}>Why you got this</Text>
                <View style={ds.whyCard}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color="#6B7280"
                    style={{ marginTop: 1 }}
                  />
                  <Text style={ds.whyText}>{why}</Text>
                </View>
              </View>
            ) : null}

            {/* Actions */}
            {actions.length > 0 ? (
              <View style={ds.section}>
                <Text style={ds.sectionTitle}>What you can do</Text>
                {actions.map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    style={ds.actionButton}
                    onPress={() => handleAction(action.route)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={action.icon}
                      size={20}
                      color={'#0F7B3F'}
                      style={ds.actionIcon}
                    />
                    <Text style={ds.actionLabel}>{action.label}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* Dismiss */}
            <TouchableOpacity
              style={ds.dismissButton}
              onPress={handleDismiss}
              activeOpacity={0.75}
            >
              <Text style={ds.dismissLabel}>Dismiss</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── NudgeCard ─────────────────────────────────────────────────────────────

interface NudgeCardProps {
  nudge: Nudge;
  onPress: (nudge: Nudge) => void;
}

function NudgeCard({ nudge, onPress }: NudgeCardProps) {
  const meta = getMeta(nudge.trigger_type);
  const isUnread = !nudge.is_opened && !nudge.is_dismissed;

  return (
    <TouchableOpacity
      style={[nc.card, nudge.is_dismissed && nc.dismissed]}
      onPress={() => onPress(nudge)}
      activeOpacity={0.8}
    >
      {/* Unread dot */}
      {isUnread && <View style={nc.unreadDot} />}

      {/* Icon */}
      <View style={[nc.iconWrap, { backgroundColor: meta.color + '15' }]}>
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>

      {/* Content */}
      <View style={nc.content}>
        <View style={nc.topRow}>
          <Text style={[nc.title, nudge.is_dismissed && nc.dimmedText]} numberOfLines={1}>
            {nudge.title ?? meta.label}
          </Text>
          <Text style={nc.time}>{timeAgo(nudge.created_at)}</Text>
        </View>
        <Text
          style={[nc.message, nudge.is_dismissed && nc.dimmedText]}
          numberOfLines={2}
        >
          {nudge.message}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

export default function NudgesScreen() {
  const { data, isLoading, refetch, isRefetching } = useNudges();
  const openNudge = useOpenNudge();
  const markAllRead = useMarkAllNudgesRead();

  const [activeNudge, setActiveNudge] = useState<Nudge | null>(null);

  const handleCardPress = useCallback(
    (nudge: Nudge) => {
      // Mark opened if not already
      if (!nudge.is_opened) {
        openNudge.mutate(nudge.id);
      }
      setActiveNudge(nudge);
    },
    [openNudge],
  );

  const nudges = data?.nudges ?? [];
  const unreadCount = data?.unread_count ?? 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.heading}>Nudges</Text>
          {unreadCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={() => markAllRead.mutate()}
            style={s.markAllBtn}
          >
            <Ionicons name="checkmark-done-outline" size={20} color={'#0F7B3F'} />
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={'#0F7B3F'} size="large" />
        </View>
      ) : nudges.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="notifications-off-outline" size={56} color="#D1D5DB" />
          <Text style={s.emptyTitle}>No nudges yet</Text>
          <Text style={s.emptyBody}>
            MoniMata will notify you here when you hit budget milestones or
            receive money.
          </Text>
        </View>
      ) : (
        <FlatList
          data={nudges}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NudgeCard nudge={item} onPress={handleCardPress} />
          )}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={'#0F7B3F'}
              colors={['#0F7B3F']}
            />
          }
        />
      )}

      {/* Detail sheet */}
      <NudgeDetailSheet
        nudge={activeNudge}
        onClose={() => setActiveNudge(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827' },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markAllText: { color: '#0F7B3F', fontSize: 13, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptyBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: { paddingVertical: 8, paddingHorizontal: 16 },
  separator: { height: 8 },
});

const nc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dismissed: { opacity: 0.55 },
  unreadDot: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F7B3F',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  time: { fontSize: 11, color: '#9CA3AF' },
  message: { fontSize: 13, color: '#4B5563', lineHeight: 18 },
  dimmedText: { color: '#9CA3AF' },
});

const ds = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginTop: 10,
    marginBottom: 16,
  },
  scrollContent: { paddingBottom: 8 },
  headerRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  iconBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: { flex: 1, justifyContent: 'center' },
  typeLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 3 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', lineHeight: 24 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  message: { fontSize: 15, color: '#374151', lineHeight: 22 },
  whyCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
  },
  whyText: { flex: 1, fontSize: 14, color: '#4B5563', lineHeight: 20 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionIcon: { width: 24, textAlign: 'center' },
  actionLabel: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  dismissButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dismissLabel: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
});
