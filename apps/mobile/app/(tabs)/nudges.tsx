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

import { Badge, BottomSheet, Button, EmptyState, ListRow, ScreenHeader } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { layout, radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { formatNaira } from '@/utils/money';
import type { DSLNudgeContext, Nudge, NudgeTriggerType, OperationalNudgeContext } from '@monimata/shared-types';
import {
  useDismissNudge,
  useMarkAllNudgesRead,
  useNudges,
  useOpenNudge,
} from '../../hooks/useNudges';


// ── Trigger type / GID metadata ───────────────────────────────────────────
// GID-based theming for DSL nudges, trigger_type-based for operational ones.

type BubbleBgToken = 'warningSubtle' | 'errorSubtle' | 'purpleSubtle' | 'successSubtle' | 'surface' | 'infoSubtle';
type IconColorToken = 'warning' | 'error' | 'purple' | 'brand' | 'textMeta' | 'info';

interface TriggerMeta {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  bubbleBg: BubbleBgToken;
  iconColor: IconColorToken;
  label: string;
}

/** GID-based theming for DSL nudges (trigger_type === "nudge"). */
const GID_META: Record<string, TriggerMeta> = {
  spend_alerts: {
    icon: 'warning-outline',
    bubbleBg: 'warningSubtle',
    iconColor: 'warning',
    label: 'Spending alert',
  },
  income: {
    icon: 'cash-outline',
    bubbleBg: 'successSubtle',
    iconColor: 'brand',
    label: 'Money received',
  },
  budget: {
    icon: 'wallet-outline',
    bubbleBg: 'infoSubtle',
    iconColor: 'info',
    label: 'Budget insight',
  },
  streaks: {
    icon: 'flame-outline',
    bubbleBg: 'purpleSubtle',
    iconColor: 'purple',
    label: 'Streak',
  },
};

/** Trigger-type theming for operational notifications. */
const OPERATIONAL_META: Record<string, TriggerMeta> = {
  statement_received: {
    icon: 'document-outline',
    bubbleBg: 'surface',
    iconColor: 'textMeta',
    label: 'Statement received',
  },
  statement_processed: {
    icon: 'checkmark-done-outline',
    bubbleBg: 'successSubtle',
    iconColor: 'brand',
    label: 'Statement imported',
  },
  statement_failed: {
    icon: 'alert-circle-outline',
    bubbleBg: 'errorSubtle',
    iconColor: 'error',
    label: 'Import failed',
  },
  receipt_received: {
    icon: 'receipt-outline',
    bubbleBg: 'surface',
    iconColor: 'textMeta',
    label: 'Receipt received',
  },
  receipt_processed: {
    icon: 'checkmark-circle-outline',
    bubbleBg: 'successSubtle',
    iconColor: 'brand',
    label: 'Receipt imported',
  },
  receipt_duplicate: {
    icon: 'copy-outline',
    bubbleBg: 'warningSubtle',
    iconColor: 'warning',
    label: 'Already recorded',
  },
  receipt_failed: {
    icon: 'alert-circle-outline',
    bubbleBg: 'errorSubtle',
    iconColor: 'error',
    label: 'Receipt failed',
  },
  transaction_received: {
    icon: 'swap-vertical-outline',
    bubbleBg: 'successSubtle',
    iconColor: 'brand',
    label: 'Transaction received',
  },
  llm_categorization_complete: {
    icon: 'sparkles-outline',
    bubbleBg: 'successSubtle',
    iconColor: 'brand',
    label: 'AI categorisation done',
  },
  llm_categorization_failed: {
    icon: 'alert-circle-outline',
    bubbleBg: 'errorSubtle',
    iconColor: 'error',
    label: 'AI categorisation failed',
  },
  ai_credential_invalid: {
    icon: 'key-outline',
    bubbleBg: 'warningSubtle',
    iconColor: 'warning',
    label: 'AI key issue',
  },
};

const DEFAULT_META: TriggerMeta = {
  icon: 'notifications-outline',
  bubbleBg: 'surface',
  iconColor: 'textMeta',
  label: 'Nudge',
};

function getMeta(nudge: Nudge): TriggerMeta {
  if (nudge.trigger_type === 'nudge') {
    // DSL nudge — theme by GID from context
    const ctx = nudge.context as DSLNudgeContext | null;
    if (ctx?.gid) {
      // Match exact GID first, then match by prefix (e.g. "spend_high" → "spend")
      const exact = GID_META[ctx.gid];
      if (exact) return exact;
      const prefix = Object.keys(GID_META).find((k) => ctx.gid.startsWith(k));
      if (prefix) return GID_META[prefix];
    }
    return DEFAULT_META;
  }
  // Operational — theme by trigger_type
  return OPERATIONAL_META[nudge.trigger_type] ?? DEFAULT_META;
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
  if (!nudge.context) return '';

  if (nudge.trigger_type === 'nudge') {
    const ctx = nudge.context as DSLNudgeContext;
    const parts: string[] = [];

    if (ctx.category_name && ctx.spend_pct != null) {
      const pct = Math.round(ctx.spend_pct * 100);
      parts.push(
        `You've used ${pct}% of your ${ctx.category_name} budget.`,
      );
    }

    if (ctx.amount_kobo) {
      parts.push(
        `Transaction amount: ${formatNaira(Math.abs(ctx.amount_kobo))}.`,
      );
    }

    if (ctx.budget_remaining_kobo != null) {
      parts.push(
        `Remaining: ${formatNaira(ctx.budget_remaining_kobo)}.`,
      );
    }

    return parts.join(' ') || '';
  }

  // Operational
  const ctx = nudge.context as OperationalNudgeContext;
  switch (nudge.trigger_type as NudgeTriggerType) {
    case 'receipt_processed':
      return ctx.amount_naira
        ? `Done! ${formatNaira(ctx.amount_kobo ?? 0)} ${ctx.direction ?? 'debit'} imported from your ${ctx.bank_name ?? 'bank'} receipt.`
        : `A transaction was imported from your ${ctx.bank_name ?? 'bank'} receipt.`;
    case 'receipt_duplicate':
      return `That ${ctx.amount_naira ? formatNaira(ctx.amount_kobo ?? 0) : ''} ${ctx.bank_name ?? ''} transaction is already in your records — no need to import again.`;
    case 'receipt_failed':
      return ctx.reason === 'unrecognised'
        ? `We couldn't recognise the receipt format. Try a clearer photo.`
        : ctx.reason === 'no_account'
          ? `No matching account found for this receipt. Add the account first.`
          : `Failed to process the receipt. Please try again.`;
    case 'statement_processed':
      return `${ctx.imported ?? 0} new transaction${(ctx.imported ?? 0) !== 1 ? 's' : ''} imported from your ${ctx.bank_name ?? 'bank'} statement.${ctx.updated ? ` ${ctx.updated} existing updated.` : ''}`;
    case 'statement_received':
      return `${ctx.bank_name ?? 'Bank'} statement received — importing your transactions in the background.`;
    case 'statement_failed':
      return `Failed to process your ${ctx.bank_name ?? 'bank'} statement. Please try re-uploading.`;
    case 'transaction_received':
      return `A new transaction was received from ${ctx.bank_name ?? 'your bank'}.`;
    case 'llm_categorization_complete':
      return `AI categorised ${(ctx as any).success_count ?? 0} transaction${((ctx as any).success_count ?? 0) !== 1 ? 's' : ''} via ${(ctx as any).provider ?? 'your AI provider'}.${(ctx as any).failed_count ? ` ${(ctx as any).failed_count} could not be categorised.` : ''}`;
    case 'llm_categorization_failed':
      return 'Automated categorisation failed after multiple retries. Your transactions are still in the review queue.';
    case 'ai_credential_invalid':
      return 'Your AI API key is invalid or has run out of credit. Update it to resume automatic categorisation.';
    default:
      return '';
  }
}

// ── Actionable steps ─────────────────────────────────────────────────────

interface NudgeAction {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route: string;
}

function getActions(nudge: Nudge): NudgeAction[] {
  if (nudge.trigger_type === 'nudge') {
    const ctx = nudge.context as DSLNudgeContext | null;
    const actions: NudgeAction[] = [];

    // If there's a transaction, offer to view it
    if (ctx?.transaction_id) {
      actions.push({
        label: 'View transaction',
        icon: 'receipt-outline',
        route: `/transaction/${ctx.transaction_id}`,
      });
    }

    // If budget-related (has spend_pct), offer budget adjustment
    if (ctx?.spend_pct != null) {
      actions.push({
        label: 'Adjust your budget',
        icon: 'wallet-outline',
        route: '/(tabs)/budget',
      });
    }

    // If category-linked, offer to review that category's transactions
    if (ctx?.category_id) {
      actions.push({
        label: 'Review transactions',
        icon: 'list-outline',
        route: '/(tabs)/transactions',
      });
    }

    // Fallback — at minimum offer to view budget
    if (actions.length === 0) {
      actions.push({
        label: 'Go to budget',
        icon: 'wallet-outline',
        route: '/(tabs)/budget',
      });
    }

    return actions;
  }

  // Operational
  const ctx = nudge.context as OperationalNudgeContext | null;
  switch (nudge.trigger_type as NudgeTriggerType) {
    case 'receipt_processed':
    case 'receipt_duplicate':
      return ctx?.transaction_id
        ? [{ label: 'View transaction', icon: 'receipt-outline', route: `/transaction/${ctx.transaction_id}` }]
        : [{ label: 'View transactions', icon: 'list-outline', route: '/(tabs)/transactions' }];
    case 'receipt_failed':
      return [{ label: 'Try again', icon: 'camera-outline', route: '/upload-receipt' }];
    case 'statement_processed':
      return [{ label: 'View transactions', icon: 'list-outline', route: '/(tabs)/transactions' }];
    case 'statement_received':
    case 'statement_failed':
      return [{ label: 'View accounts', icon: 'wallet-outline', route: '/(tabs)/accounts' }];
    case 'transaction_received':
      return [{ label: 'View transactions', icon: 'list-outline', route: '/(tabs)/transactions' }];
    case 'llm_categorization_complete':
      return [{ label: 'View transactions', icon: 'list-outline', route: '/(tabs)/transactions' }];
    case 'llm_categorization_failed':
      return [{ label: 'Review queue', icon: 'list-outline', route: '/(tabs)/transactions' }];
    case 'ai_credential_invalid':
      return [{ label: 'Update AI key', icon: 'key-outline', route: '/ai-settings' }];
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

  const meta = nudge ? getMeta(nudge) : DEFAULT_META;
  const why = nudge ? buildWhySummary(nudge) : '';
  const actions = nudge ? getActions(nudge) : [];

  function handleAction(route: string) {
    onClose();
    router.push(route as Parameters<typeof router.push>[0]);
  }

  function handleDismiss() {
    if (!nudge) return;
    dismiss.mutate({ params: { path: { nudge_id: nudge.id } } });
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
          <Text style={[type_.caption, { color: colors.textMeta, marginBottom: spacing.xxs }]}>
            {meta.label}
          </Text>
          <Text style={[type_.h3, { color: colors.textPrimary, lineHeight: 27 }]} numberOfLines={2}>
            {nudge?.title ?? 'Nudge'}
          </Text>
        </View>
      </View>

      {/* Message */}
      <View style={ss.sheetSection}>
        <Text style={[type_.body, { color: colors.textSecondary, lineHeight: 25, flexShrink: 1, flexWrap: 'wrap' }]}>
          {nudge?.message}
        </Text>
      </View>

      {/* Why you got this */}
      {why ? (
        <View style={ss.sheetSection}>
          <Text
            style={[
              type_.labelSm,
              { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.smd },
            ]}
          >
            Why you got this
          </Text>
          <View style={[ss.whyCard, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
            <Ionicons
              name="information-circle-outline"
              size={type_.bodyXl.fontSize}
              color={colors.textMeta}
              style={{ marginTop: 1 }}
            />
            <Text style={[type_.bodyReg, { color: colors.textSecondary }]}>{why}</Text>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      {actions.length > 0 ? (
        <View style={ss.sheetSection}>
          <Text
            style={[
              type_.labelSm,
              { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.smd },
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
        style={{ borderColor: colors.border, marginHorizontal: "auto", marginTop: spacing.mdn }}
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
  const meta = getMeta(nudge);
  const isUnread = !nudge.is_opened && !nudge.is_dismissed;

  return (
    <TouchableOpacity
      style={[
        ss.card,
        { backgroundColor: colors.cardBg, borderColor: colors.border, ...shadow.sm },
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
              type_.body, ff(700),
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
            type_.small, ff(400),
            { color: nudge.is_dismissed ? colors.textMeta : colors.textSecondary, flexWrap: 'wrap' },
          ]}
        >
          {nudge.message}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={type_.bodyXl.fontSize} color={colors.textMeta} />
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
        openNudge.mutate({ params: { path: { nudge_id: nudge.id } } });
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
            onPress={() => markAllRead.mutate({})}
            style={[ss.markAllBtn, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Mark all nudges as read"
          >
            <Text style={[ss.markAllText, { color: colors.lime }]}>Read all</Text>
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
          contentContainerStyle={[ss.list, { paddingBottom: layout.tabBarHeight + Math.max(insets.bottom, 4) + spacing.lg }]}
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
    borderRadius: radius.smd,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xxs,
    flexShrink: 0,
  },
  markAllText: { ...type_.small },
  // body states
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl + spacing.sm,
    gap: spacing.md,
  },
  list: { paddingTop: spacing.mdn, paddingHorizontal: spacing.lg },
  separator: { height: spacing.smd },
  // card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.mdn,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardDismissed: { opacity: 0.5 },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: spacing.sm,
    bottom: spacing.sm,
    width: spacing.sm - spacing.xs,
    borderRadius: 2,
  },
  iconBubble: {
    width: layout.avatarMd + spacing.xs,
    height: layout.avatarMd + spacing.xs,
    borderRadius: radius.smd,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardContent: { flex: 1 },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xxs,
  },
  cardTitle: { ...type_.bodyReg, ...ff(700), flex: 1, marginRight: spacing.sm },
  cardMessage: { ...type_.small, lineHeight: 20 },
  // detail sheet content (rendered inside BottomSheet's scroll area)
  sheetHeaderRow: { flexDirection: 'row', gap: spacing.mdn, marginBottom: spacing.lg },
  sheetIconBubble: {
    width: layout.avatarLg,
    height: layout.avatarLg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sheetHeaderText: { flex: 1, justifyContent: 'center' },
  sheetSection: { marginBottom: spacing.xl },
  whyCard: { flexDirection: 'row', gap: spacing.smd, padding: spacing.md },
  whyText: { flex: 1, ...type_.body },
});
