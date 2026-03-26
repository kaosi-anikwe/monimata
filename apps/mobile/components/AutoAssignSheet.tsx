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
 * AutoAssignSheet
 *
 * Two-step bottom sheet for auto-assigning TBB across budget categories.
 *
 * Step 1 — Strategy picker: shows the 5 YNAB-style strategies with a
 *   live computed total for each, so the user can choose with full context.
 *
 * Step 2 — Preview: shows exactly which categories will change and by
 *   how much. New TBB is shown at the bottom. The user confirms here.
 *
 * All computation happens locally via WatermelonDB — no network round-trip
 * for the preview. The apply step writes to WatermelonDB and syncs in bg.
 */

import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '@/lib/theme';
import { radius, spacing } from '@/lib/tokens';
import { ff, formatMoney } from '@/lib/typography';
import type { BudgetResponse } from '@/types/budget';
import {
  useApplyAutoAssign,
  useAutoAssignPreviews,
  type AutoAssignItem,
  type AutoAssignStrategy,
} from '@/hooks/useBudget';

// ── Strategy metadata ─────────────────────────────────────────────────────────

interface StrategyMeta {
  id: AutoAssignStrategy;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const ALL_STRATEGIES: StrategyMeta[] = [
  {
    id: 'underfunded',
    label: 'Underfunded',
    description: 'Top up categories that are behind their targets',
    icon: 'trending-up-outline',
  },
  {
    id: 'assigned_last_month',
    label: 'Assigned Last Month',
    description: 'Mirror what you assigned each category last month',
    icon: 'calendar-outline',
  },
  {
    id: 'spent_last_month',
    label: 'Spent Last Month',
    description: 'Assign what you actually spent last month',
    icon: 'receipt-outline',
  },
  {
    id: 'avg_assigned',
    label: 'Average Assigned',
    description: '3-month average of your past assignments',
    icon: 'bar-chart-outline',
  },
  {
    id: 'avg_spent',
    label: 'Average Spent',
    description: '3-month average of your past spending',
    icon: 'stats-chart-outline',
  },
];

// Fix mode: underfunded increases assignments — wrong direction for reducing TBB.
const FIX_STRATEGIES = ALL_STRATEGIES.filter((s) => s.id !== 'underfunded');

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AutoAssignSheetProps {
  visible: boolean;
  month: string;
  tbb: number;
  budgetData: BudgetResponse | undefined;
  onClose: () => void;
}

// ── AutoAssignSheet ────────────────────────────────────────────────────────────

export function AutoAssignSheet({
  visible,
  month,
  tbb,
  budgetData,
  onClose,
}: AutoAssignSheetProps) {
  const colors = useTheme();
  const [selectedStrategy, setSelectedStrategy] = useState<AutoAssignStrategy | null>(null);
  const mode: 'assign' | 'fix' = tbb < 0 ? 'fix' : 'assign';

  const { data: previews, isLoading: previewsLoading } = useAutoAssignPreviews(
    month,
    budgetData,
  );
  const apply = useApplyAutoAssign(month);

  // Reset strategy selection when sheet closes
  function handleClose() {
    setSelectedStrategy(null);
    onClose();
  }

  function handleApply(items: AutoAssignItem[]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    apply.mutate(items, { onSuccess: handleClose });
  }

  if (!visible) return null;

  const currentPreview = selectedStrategy ? previews?.[selectedStrategy] : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={[as.backdrop, { backgroundColor: colors.overlayNeutral }]}
        activeOpacity={1}
        onPress={handleClose}
      />

      <View style={as.outer}>
        <View style={[as.sheet, { backgroundColor: colors.cardBg }]}>
          {/* Drag handle */}
          <View style={[as.handle, { backgroundColor: colors.borderStrong }]} />

          {selectedStrategy && currentPreview ? (
            // ── Step 2: Preview ────────────────────────────────────────────────
            <PreviewStep
              preview={currentPreview}
              tbb={tbb}
              mode={mode}
              onBack={() => setSelectedStrategy(null)}
              onApply={handleApply}
              isApplying={apply.isPending}
              onClose={handleClose}
            />
          ) : (
            // ── Step 1: Strategy picker ────────────────────────────────────────
            <StrategyPickerStep
              tbb={tbb}
              mode={mode}
              previews={previews}
              isLoading={previewsLoading}
              onSelect={(s) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedStrategy(s);
              }}
              onClose={handleClose}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Step 1: Strategy picker ──────────────────────────────────────────────────

function StrategyPickerStep({
  tbb,
  mode,
  previews,
  isLoading,
  onSelect,
  onClose,
}: {
  tbb: number;
  mode: 'assign' | 'fix';
  previews: ReturnType<typeof useAutoAssignPreviews>['data'];
  isLoading: boolean;
  onSelect: (s: AutoAssignStrategy) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const strategies = mode === 'fix' ? FIX_STRATEGIES : ALL_STRATEGIES;
  const accentColor = mode === 'fix' ? colors.error : colors.brand;

  return (
    <>
      {/* Header */}
      <View style={sp.header}>
        <View style={{ flex: 1 }}>
          <Text style={[sp.title, { color: colors.textPrimary }]}>
            {mode === 'fix' ? 'Fix Over-Assignment' : 'Auto-Assign'}
          </Text>
          <Text style={[sp.subtitle, { color: colors.textMeta }]}>
            {mode === 'fix' ? (
              <>
                Recover{' '}
                <Text style={{ color: colors.error }}>{formatMoney(Math.abs(tbb))}</Text>
                {' '}back to TBB
              </>
            ) : (
              <>
                Distribute{' '}
                <Text style={{ color: colors.brand }}>{formatMoney(tbb)}</Text>
                {' '}to your budget
              </>
            )}
          </Text>
        </View>
        <TouchableOpacity
          style={[sp.xBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Strategy list */}
      <ScrollView
        style={sp.list}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}
        showsVerticalScrollIndicator={false}
      >
        {strategies.map((s, idx) => {
          const preview = previews?.[s.id];
          const count = preview?.items.length ?? 0;
          const delta = preview?.totalDelta ?? 0;

          return (
            <React.Fragment key={s.id}>
              <TouchableOpacity
                style={sp.stratRow}
                onPress={() => onSelect(s.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${s.label}: affects ${count} categories`}
              >
                {/* Icon badge */}
                <View style={[sp.iconBadge, { backgroundColor: colors.surface }]}>
                  <Ionicons name={s.icon} size={18} color={accentColor} />
                </View>

                {/* Labels */}
                <View style={sp.stratText}>
                  <Text style={[sp.stratLabel, { color: colors.textPrimary }]}>
                    {s.label}
                  </Text>
                  <Text style={[sp.stratDesc, { color: colors.textMeta }]}>
                    {s.description}
                  </Text>
                </View>

                {/* Amount + arrow */}
                <View style={sp.stratRight}>
                  {isLoading || !preview ? (
                    <ActivityIndicator size="small" color={accentColor} />
                  ) : count === 0 ? (
                    <View style={sp.stratCountRow}>
                      <Text style={[sp.noChange, { color: colors.textTertiary }]}>
                        No change
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                    </View>
                  ) : (
                    <>
                      <Text style={[sp.stratAmt, { color: accentColor }]}>
                        {mode === 'fix' ? '−' : '+'}{formatMoney(Math.abs(delta))}
                      </Text>
                      <View style={sp.stratCountRow}>
                        <Text style={[sp.stratCnt, { color: colors.textMeta }]}>
                          {count} cat{count === 1 ? '' : 's'}
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                      </View>
                    </>
                  )}
                </View>
              </TouchableOpacity>
              {idx < strategies.length - 1 && (
                <View style={[sp.divider, { backgroundColor: colors.separator }]} />
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </>
  );
}

const sp = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.mdn,
    paddingBottom: spacing.md,
  },
  title: { ...ff(700), fontSize: 17, letterSpacing: -0.3 },
  subtitle: { ...ff(400), fontSize: 13, marginTop: 3 },
  xBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { flexGrow: 0 },
  stratRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stratText: { flex: 1, minWidth: 0 },
  stratLabel: { ...ff(600), fontSize: 14 },
  stratDesc: { ...ff(400), fontSize: 12, marginTop: 2 },
  stratRight: { alignItems: 'flex-end', flexShrink: 0 },
  stratCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: "center", marginTop: spacing.xs, gap: 2 },
  stratAmt: { ...ff(700), fontSize: 14, letterSpacing: -0.3 },
  stratCnt: { ...ff(400), fontSize: 11, lineHeight: 14 },
  noChange: { ...ff(500), fontSize: 12, lineHeight: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
});

// ── Step 2: Preview ──────────────────────────────────────────────────────────

function PreviewStep({
  preview,
  tbb,
  mode,
  onBack,
  onApply,
  isApplying,
  onClose,
}: {
  preview: NonNullable<ReturnType<typeof useAutoAssignPreviews>['data']>[AutoAssignStrategy];
  tbb: number;
  mode: 'assign' | 'fix';
  onBack: () => void;
  onApply: (items: AutoAssignItem[]) => void;
  isApplying: boolean;
  onClose: () => void;
}) {
  const colors = useTheme();
  const stratMeta = ALL_STRATEGIES.find((s) => s.id === preview.strategy)!;
  // assign mode: warn if new TBB goes negative. fix mode: warn if TBB stays negative.
  const wouldOverAssign = mode === 'assign' && preview.newTbb < 0;
  const stillNegative = mode === 'fix' && preview.newTbb < 0;
  const n = preview.items.length;

  return (
    <>
      {/* Header */}
      <View style={pv.header}>
        <TouchableOpacity
          style={[pv.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to strategy picker"
        >
          <Ionicons name="arrow-back" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[pv.title, { color: colors.textPrimary }]}>
            {stratMeta.label}
          </Text>
          <Text style={[pv.subtitle, { color: colors.textMeta }]}>
            Preview
          </Text>
        </View>
        <TouchableOpacity
          style={[pv.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Summary bar */}
      <View style={[pv.summaryBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={pv.summaryCell}>
          <Text style={[pv.summaryLbl, { color: colors.textMeta }]}>CATEGORIES</Text>
          <Text style={[pv.summaryVal, { color: colors.textPrimary }]}>{n}</Text>
        </View>
        <View style={[pv.summaryDiv, { backgroundColor: colors.border }]} />
        <View style={pv.summaryCell}>
          <Text style={[pv.summaryLbl, { color: colors.textMeta }]}>
            {mode === 'fix' ? 'WILL RECOVER' : 'WILL ASSIGN'}
          </Text>
          <Text style={[pv.summaryVal, { color: mode === 'fix' ? colors.warning : colors.brand }]}>
            {mode === 'fix' ? '−' : '+'}{formatMoney(Math.abs(preview.totalDelta))}
          </Text>
        </View>
        <View style={[pv.summaryDiv, { backgroundColor: colors.border }]} />
        <View style={pv.summaryCell}>
          <Text style={[pv.summaryLbl, { color: colors.textMeta }]}>NEW TBB</Text>
          <Text
            style={[
              pv.summaryVal,
              { color: preview.newTbb < 0 ? colors.error : colors.successText },
            ]}
          >
            {formatMoney(preview.newTbb)}
          </Text>
        </View>
      </View>

      {/* Over-assign warning (assign mode only) */}
      {wouldOverAssign && (
        <View style={[pv.warning, { backgroundColor: colors.errorSubtle, borderColor: colors.error }]}>
          <Ionicons name="warning-outline" size={15} color={colors.error} />
          <Text style={[pv.warningTxt, { color: colors.error }]}>
            This will over-assign by{' '}
            <Text style={ff(700)}>{formatMoney(Math.abs(preview.newTbb))}</Text>
            . Your TBB will turn red.
          </Text>
        </View>
      )}

      {/* Partial-fix warning (fix mode: not enough to fully recover) */}
      {stillNegative && (
        <View style={[pv.warning, { backgroundColor: colors.warningSubtle, borderColor: colors.warning }]}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.warningText} />
          <Text style={[pv.warningTxt, { color: colors.warningText }]}>
            TBB will still be{' '}
            <Text style={ff(700)}>{formatMoney(preview.newTbb)}</Text>
            {' '}after applying. You may need to adjust manually.
          </Text>
        </View>
      )}

      {/* Empty state */}
      {n === 0 && (
        <View style={pv.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors.brand} />
          <Text style={[pv.emptyTxt, { color: colors.textSecondary }]}>
            {mode === 'fix'
              ? 'No categories can be reduced with this strategy.'
              : 'All categories are already on track!'}
          </Text>
          <Text style={[pv.emptySub, { color: colors.textMeta }]}>
            No assignments needed for this strategy.
          </Text>
        </View>
      )}

      {/* Category preview list */}
      {n > 0 && (
        <ScrollView
          style={pv.list}
          contentContainerStyle={pv.listContent}
          showsVerticalScrollIndicator={false}
        >
          {preview.items.map((item, idx) => {
            const delta = item.proposedAssigned - item.currentAssigned;
            const isIncrease = delta > 0;
            return (
              <React.Fragment key={item.categoryId}>
                <View style={pv.row}>
                  <View style={pv.rowLeft}>
                    <Text style={[pv.catName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.categoryName}
                    </Text>
                    <Text style={[pv.catCurrent, { color: colors.textMeta }]}>
                      Currently {formatMoney(item.currentAssigned)}
                    </Text>
                  </View>
                  <View style={pv.rowRight}>
                    <Text style={[pv.proposed, { color: colors.textPrimary }]}>
                      {formatMoney(item.proposedAssigned)}
                    </Text>
                    <View
                      style={[
                        pv.deltaBadge,
                        {
                          backgroundColor: isIncrease
                            ? colors.successSubtle
                            : colors.warningSubtle,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          pv.deltaTxt,
                          { color: isIncrease ? colors.successText : colors.warningText },
                        ]}
                      >
                        {isIncrease ? '+' : '−'}
                        {formatMoney(Math.abs(delta))}
                      </Text>
                    </View>
                  </View>
                </View>
                {idx < preview.items.length - 1 && (
                  <View style={[pv.divider, { backgroundColor: colors.separator }]} />
                )}
              </React.Fragment>
            );
          })}
        </ScrollView>
      )}

      {/* Footer */}
      <View
        style={[
          pv.footer,
          { paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
        ]}
      >
        <TouchableOpacity
          style={[pv.footBtn, { flex: 1, backgroundColor: colors.surface }]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[pv.footTxt, { color: colors.textSecondary }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            pv.footBtn,
            { flex: 2 },
            n === 0
              ? { backgroundColor: colors.surface }
              : mode === 'fix'
                ? { backgroundColor: colors.error }
                : { backgroundColor: colors.brand },
            (isApplying || n === 0) && { opacity: 0.6 },
          ]}
          onPress={() => onApply(preview.items)}
          disabled={isApplying || n === 0}
          accessibilityRole="button"
          accessibilityLabel={
            n === 0
              ? 'Nothing to apply'
              : `Apply ${n} change${n === 1 ? '' : 's'}`
          }
        >
          {isApplying ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[pv.footTxt, n === 0 ? { color: colors.textTertiary } : { color: colors.white }]}>
              {n === 0 ? 'Nothing to apply' : `Apply ${n} change${n === 1 ? '' : 's'}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

const pv = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.mdn,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: { ...ff(700), fontSize: 17, letterSpacing: -0.3 },
  subtitle: { ...ff(400), fontSize: 12 },
  summaryBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryLbl: {
    ...ff(600),
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  summaryVal: { ...ff(700), fontSize: 15, letterSpacing: -0.3, marginTop: 3 },
  summaryDiv: { width: 1 },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.sm,
  },
  warningTxt: { ...ff(400), fontSize: 13, flex: 1, lineHeight: 18 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: spacing.xl,
    gap: 8,
  },
  emptyTxt: { ...ff(600), fontSize: 15, textAlign: 'center' },
  emptySub: { ...ff(400), fontSize: 13, textAlign: 'center' },
  list: { flexShrink: 1, maxHeight: 320 },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    gap: 10,
  },
  rowLeft: { flex: 1, minWidth: 0 },
  catName: { ...ff(600), fontSize: 14 },
  catCurrent: { ...ff(400), fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', flexShrink: 0 },
  proposed: { ...ff(700), fontSize: 14, letterSpacing: -0.3 },
  deltaBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
    marginTop: 3,
  },
  deltaTxt: { ...ff(600), fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.mdn,
  },
  footBtn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footTxt: { ...ff(700), fontSize: 14 },
});

// ── Shared sheet styles ───────────────────────────────────────────────────────

const as = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  outer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 0, // individual steps control their own bottom padding
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
});
