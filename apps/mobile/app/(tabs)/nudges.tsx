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

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet, Badge, Button, EmptyState, ListRow, ScreenHeader } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
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

type BubbleBgToken = 'warningSubtle' | 'errorSubtle' | 'purpleSubtle' | 'successSubtle' | 'surface';
type IconColorToken = 'warning' | 'error' | 'purple' | 'brand' | 'textMeta';

interface TriggerMeta {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  bubbleBg: BubbleBgToken;
  iconColor: IconColorToken;
  label: string;
}

const TRIGGER_META: Record<string, TriggerMeta> = {
  threshold_80: {
    icon: 'warning-outline',
    bubbleBg: 'warningSubtle',
    iconColor: 'warning',
    label: 'Budget warning',
  },
  threshold_100: {
    icon: 'alert-circle-outline',
    bubbleBg: 'errorSubtle',
    iconColor: 'error',
    label: 'Budget exceeded',
  },
  large_single_tx: {
    icon: 'trending-down-outline',
    bubbleBg: 'purpleSubtle',
    iconColor: 'purple',
    label: 'Large transaction',
  },
  pay_received: {
    icon: 'cash-outline',
    bubbleBg: 'successSubtle',
    iconColor: 'brand',
    label: 'Money received',
  },
  bill_payment: {
    icon: 'checkmark-circle-outline',
    bubbleBg: 'successSubtle',
    iconColor: 'brand',
    label: 'Bill payment',
  },
};

const DEFAULT_META: TriggerMeta = {
  icon: 'notifications-outline',
  bubbleBg: 'surface',
  iconColor: 'textMeta',
  label: 'Nudge',
};

function getMeta(triggerType: string): TriggerMeta {
  return TRIGGER_META[triggerType] ?? DEFAULT_META;
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
  const colors = useTheme();
  const router = useRouter();
  const dismiss = useDismissNudge();

  const meta = nudge ? getMeta(nudge.trigger_type) : DEFAULT_META;
  const why = nudge ? buildWhySummary(nudge) : '';
  const actions = nudge ? getActions(nudge.trigger_type) : [];

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
    <BottomSheet
      visible={!!nudge}
      onClose={onClose}
      scrollable
      contentStyle={{ paddingHorizontal: spacing.xl }}
    >
      {/* Header */}
      <View style={ss.sheetHeaderRow}>
        <View style={[ss.sheetIconBubble, { backgroundColor: colors[meta.bubbleBg] }]}>
          <Ionicons name={meta.icon} size={28} color={colors[meta.iconColor]} />
        </View>
        <View style={ss.sheetHeaderText}>
          <Text style={[type_.caption, { color: colors.textMeta, fontWeight: '600', marginBottom: 3 }]}>
            {meta.label}
          </Text>
          <Text style={[type_.h3, { color: colors.textPrimary, lineHeight: 24 }]} numberOfLines={2}>
            {nudge?.title ?? 'Nudge'}
          </Text>
        </View>
      </View>

      {/* Message */}
      <View style={ss.sheetSection}>
        <Text style={[type_.body, { color: colors.textSecondary, lineHeight: 22 }]}>
          {nudge?.message}
        </Text>
      </View>

      {/* Why you got this */}
      {why ? (
        <View style={ss.sheetSection}>
          <Text
            style={[
              type_.labelSm,
              { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
            ]}
          >
            Why you got this
          </Text>
          <View style={[ss.whyCard, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.textMeta}
              style={{ marginTop: 1 }}
            />
            <Text style={[ss.whyText, { color: colors.textSecondary }]}>{why}</Text>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      {actions.length > 0 ? (
        <View style={ss.sheetSection}>
          <Text
            style={[
              type_.labelSm,
              { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
            ]}
          >
            What you can do
          </Text>
          {actions.map((action, index) => (
            <ListRow
              key={action.label}
              leftIcon={<Ionicons name={action.icon} size={20} color={colors.brand} />}
              iconBg={colors.surface}
              title={action.label}
              onPress={() => handleAction(action.route)}
              showChevron
              separator={index < actions.length - 1}
            />
          ))}
        </View>
      ) : null}

      {/* Dismiss */}
      <Button
        variant="ghost"
        onPress={handleDismiss}
        style={{ borderColor: colors.border, marginHorizontal: spacing.xl, marginTop: spacing.mdn }}
        textStyle={{ color: colors.textMeta }}
      >
        Dismiss
      </Button>
    </BottomSheet>
  );
}

// ── NudgeCard ─────────────────────────────────────────────────────────────

interface NudgeCardProps {
  nudge: Nudge;
  onPress: (nudge: Nudge) => void;
}

function NudgeCard({ nudge, onPress }: NudgeCardProps) {
  const colors = useTheme();
  const meta = getMeta(nudge.trigger_type);
  const isUnread = !nudge.is_opened && !nudge.is_dismissed;

  return (
    <TouchableOpacity
      style={[
        ss.card,
        { backgroundColor: colors.white, borderColor: colors.border, ...shadow.sm },
        nudge.is_dismissed && ss.cardDismissed,
      ]}
      onPress={() => onPress(nudge)}
      activeOpacity={0.8}
    >
      {/* Unread left-edge accent bar */}
      {isUnread && (
        <View style={[ss.unreadBar, { backgroundColor: colors.brand }]} />
      )}

      {/* Icon bubble — 42×42, borderRadius 13 per mockup */}
      <View style={[ss.iconBubble, { backgroundColor: colors[meta.bubbleBg] }]}>
        <Ionicons name={meta.icon} size={22} color={colors[meta.iconColor]} />
      </View>

      {/* Content */}
      <View style={ss.cardContent}>
        <View style={ss.cardTopRow}>
          <Text
            style={[
              ss.cardTitle,
              { color: nudge.is_dismissed ? colors.textMeta : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {nudge.title ?? meta.label}
          </Text>
          <Text style={[type_.caption, { color: colors.textTertiary }]}>
            {timeAgo(nudge.created_at)}
          </Text>
        </View>
        <Text
          style={[
            ss.cardMessage,
            { color: nudge.is_dismissed ? colors.textMeta : colors.textSecondary },
          ]}
          numberOfLines={2}
        >
          {nudge.message}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMeta} />
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

export default function NudgesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useNudges();
  const openNudge = useOpenNudge();
  const markAllRead = useMarkAllNudgesRead();

  const [activeNudge, setActiveNudge] = useState<Nudge | null>(null);

  const handleCardPress = useCallback(
    (nudge: Nudge) => {
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
    <View style={[ss.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      {/* Dark-green header */}
      <ScreenHeader
        title="Nudges"
        titleBadge={
          unreadCount > 0
            ? <Badge variant="error" size="sm">{unreadCount > 99 ? '99+' : unreadCount}</Badge>
            : undefined
        }
        onBack={() => router.back()}
        rightSlot={
          <TouchableOpacity
            onPress={() => markAllRead.mutate()}
            style={[ss.markAllBtn, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Mark all nudges as read"
          >
            <Text style={[ss.markAllText, { color: colors.lime }]}>Mark all</Text>
          </TouchableOpacity>
        }
        paddingTop={insets.top + 16}
      >
        <Text style={[type_.small, { color: colors.textMeta, marginTop: spacing.sm }]}>
          Your AI-powered spending insights
        </Text>
      </ScreenHeader>

      {/* Content */}
      {isLoading ? (
        <View style={ss.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : nudges.length === 0 ? (
        <ScrollView
          contentContainerStyle={ss.empty}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        >
          <EmptyState
            icon={<Ionicons name="notifications-off-outline" size={36} color={colors.border} />}
            title="No nudges yet"
            body="MoniMata will notify you here when you hit budget milestones or receive money."
          />
        </ScrollView>
      ) : (
        <FlatList
          data={nudges}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NudgeCard nudge={item} onPress={handleCardPress} />
          )}
          contentContainerStyle={ss.list}
          ItemSeparatorComponent={() => <View style={ss.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        />
      )}

      {/* Detail sheet */}
      <NudgeDetailSheet
        nudge={activeNudge}
        onClose={() => setActiveNudge(null)}
      />
    </View>
  );
}

// ── Styles (layout only — no raw colours) ────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },
  markAllBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  markAllText: { fontSize: 12, fontWeight: '600' },
  // body states
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  list: { paddingTop: 14, paddingBottom: 32, paddingHorizontal: 16 },
  separator: { height: 9 },
  // card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardDismissed: { opacity: 0.5 },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderRadius: 2,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardContent: { flex: 1 },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', flex: 1, marginRight: 8 },
  cardMessage: { fontSize: 12, lineHeight: 17 },
  // detail sheet content (rendered inside BottomSheet's scroll area)
  sheetHeaderRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  sheetIconBubble: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sheetHeaderText: { flex: 1, justifyContent: 'center' },
  sheetSection: { marginBottom: 20 },
  whyCard: { flexDirection: 'row', gap: 10, padding: 12 },
  whyText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
