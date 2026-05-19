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
 * Budget tab — YNAB-style zero-based budget for the selected month.
 *
 * Read-only view: shows assigned / available per category with target funding
 * indicators. Tap the pencil icon to enter edit mode (budget-edit screen).
 *
 * Architecture:
 *  - selectedMonth lives in Redux (budgetSlice)
 *  - Budget data comes from the API via React Query
 *  - FAB (Add Transaction) is rendered by the tab _layout.tsx
 */
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutoAssignSheet } from '@/components/AutoAssignSheet';
import { BudgetWalkthrough } from '@/components/BudgetWalkthrough';
import { TourTarget, useTour, type TourStep } from '@/components/tour';
import { ProgressBar } from '@/components/ui';
import { syncDatabase } from '@/database/sync';
import { useAssignCategory, useBudget, useMoveMoney, useUnhideCategory, useUnhideGroup } from '@/hooks/useBudget';
import { useTheme } from '@/lib/theme';
import { glass, layout, radius, spacing } from '@/lib/tokens';
import { ff, formatMoney, type_ } from '@/lib/typography';
import { nextMonth, prevMonth } from '@/store/budgetSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { BudgetCategory, BudgetGroup } from '@monimata/shared-types';

// ── Tour definition ───────────────────────────────────────────────────────────

const BUDGET_TOUR: TourStep[] = [
  {
    targetId: 'budget-tbb',
    title: 'To Be Budgeted (TBB)',
    body: 'This is money you\'ve received but haven\'t given a job yet. Your goal: get this to ₦0 every month.',
    tooltipSide: 'below',
    fallbackFullscreen: true,
  },
  {
    targetId: 'budget-first-group',
    title: 'Budget categories',
    body: 'Tap any category to assign money from your TBB. Green means funded. Red means overspent.',
    tooltipSide: 'below',
  },
  {
    targetId: 'budget-edit-btn',
    title: 'Customise your budget',
    body: 'Add groups, rename categories, set savings targets, and hide things you don\'t need.',
    tooltipSide: 'below',
  },
  {
    targetId: "budget-progress-bar",
    title: "Budget Activity",
    body: "The bar shows how much you've assigned (filled) and how much you've spent (grayed). When the bar turns red, you've spent more than you assigned.",
    tooltipSide: "below",
    fallbackFullscreen: true
  }
];


// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a user-typed naira string like "5,000.50" → kobo. */
function parseNairaInput(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ── Month navigator header (.bgt-hdr) ─────────────────────────────────────────

function MonthHeader({ month, tbb, onAutoAssign }: { month: string; tbb: number; onAutoAssign: () => void }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const [y, m] = month.split('-');
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-NG', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View
      style={[
        ms.hdr,
        { backgroundColor: colors.cardBg, paddingTop: insets.top + 10, borderBottomColor: colors.border },
      ]}
    >
      {/* Title row */}
      <View style={ms.titleRow}>
        <TouchableOpacity
          style={[ms.editBtn, { backgroundColor: colors.surface }]}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={type_.bodyXl.fontSize} color={colors.brand} />
        </TouchableOpacity>
        <Text style={[ms.title, { color: colors.textPrimary }]}>Budget</Text>
        <TourTarget id="budget-edit-btn">
          <TouchableOpacity
            style={[ms.editBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/budget-edit' as never)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Edit budget structure"
          >
            <Feather name='edit' size={type_.bodyXl.fontSize} color={colors.brand} />
          </TouchableOpacity>
        </TourTarget>
      </View>

      {/* Month navigator (.mnav) */}
      <View style={ms.mnav}>
        <TouchableOpacity
          style={[ms.mnavBtn, { backgroundColor: colors.surface }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch(prevMonth()); }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={type_.bodyXl.fontSize} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[ms.mnavLbl, { color: colors.textPrimary }]}>{label}</Text>
        <TouchableOpacity
          style={[ms.mnavBtn, { backgroundColor: colors.surface }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); dispatch(nextMonth()); }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={type_.bodyXl.fontSize} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* TBB card (.tbb-card) — hidden when fully assigned */}
      {tbb !== 0 && (
        <TourTarget id="budget-tbb">
          <View style={[ms.tbbCard, { backgroundColor: tbb < 0 ? colors.darkRed : colors.darkGreen }]}>
            <View style={{ gap: spacing.xxs }}>
              <Text style={ms.tbbLbl}>To Be Budgeted</Text>
              <Text style={[ms.tbbVal, { color: tbb < 0 ? colors.error : colors.lime }]}>
                {formatMoney(tbb)}
              </Text>
              <Text style={ms.tbbSub}>
                {tbb < 0 ? `Over-assigned by ${formatMoney(Math.abs(tbb))}` : 'Assign this to categories'}
              </Text>
            </View>
            {/* Auto-assign / Fix button */}
            <TouchableOpacity
              style={[ms.aaBtn, tbb < 0 && { borderColor: colors.errorBadgeBorder, backgroundColor: colors.errorBadgeBg }]}
              accessibilityRole="button"
              accessibilityLabel={tbb < 0 ? 'Fix over-assignment' : 'Auto-assign'}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onAutoAssign(); }}
            >
              <Ionicons name={tbb < 0 ? 'warning-outline' : 'flash-outline'} size={13} color={tbb < 0 ? colors.error : colors.lime} />
              <Text style={[ms.aaBtnTxt, { color: tbb < 0 ? colors.error : colors.lime }]}>
                {tbb < 0 ? 'Fix' : 'Auto-assign'}
              </Text>
            </TouchableOpacity>
          </View>
        </TourTarget>
      )}
    </View>
  );
}

const ms = StyleSheet.create({
  hdr: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { ...type_.h1 },
  editBtn: {
    width: layout.iconBtnSize,
    height: layout.iconBtnSize,
    borderRadius: radius.smd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mnav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.mdn,
    marginBottom: spacing.md,
  },
  mnavBtn: {
    width: layout.avatarSm,
    height: layout.avatarSm,
    borderRadius: radius.smd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mnavLbl: { ...type_.h3 },
  tbbCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tbbLbl: {
    ...type_.label,
    color: glass.labelDim,
  },
  tbbVal: { ...type_.displayNum, marginTop: 1 },
  tbbSub: { ...type_.caption, color: glass.textFaint, marginTop: 1 },
  aaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: glass.badge,
    borderWidth: 1.5,
    borderColor: glass.borderLimeStrong,
    borderRadius: radius.smd,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  aaBtnTxt: { ...type_.small },
});

// ── Category row (.bgt-row) ───────────────────────────────────────────────────

type FillState = 'ok' | 'warn' | 'over' | 'empty';

function getCatState(c: BudgetCategory): FillState {
  if (c.available < 0) return 'over';
  if (c.assigned <= 0) return 'empty';
  const remaining = c.available / c.assigned;
  if (remaining < 0.15) return 'warn';
  return 'ok';
}

function getCatAssignedProgress(c: BudgetCategory): number {
  if (c.assigned <= 0) return 0;
  if (!c.target_amount) return 1; // assigned is the full capacity when no target
  return Math.min(1, c.assigned / c.target_amount);
}

function getCatSpentProgress(c: BudgetCategory): number {
  if (c.assigned <= 0) return 0;
  const capacity = c.target_amount ?? c.assigned;
  const spent = c.assigned - c.available;
  return Math.min(1, Math.max(0, spent / capacity));
}

function CategoryRow({
  category,
  onPress,
  showTourTarget,
}: {
  category: BudgetCategory;
  onPress: () => void;
  showTourTarget?: boolean;
}) {
  const colors = useTheme();

  if (category.is_hidden) {
    return (
      <TouchableOpacity
        style={[cr.wrap, { backgroundColor: colors.cardBg, borderBottomColor: colors.separator, opacity: 0.45 }]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${category.name}, hidden. Tap to unhide.`}
      >
        <View style={cr.left}>
          <Text style={[cr.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {category.name}
          </Text>
          <Text style={[cr.assignedTxt, { color: colors.textMeta, marginTop: spacing.xxs }]}>Hidden</Text>
        </View>
        <Ionicons name="eye-off-outline" size={type_.bodyXl.fontSize} color={colors.textMeta} />
      </TouchableOpacity>
    );
  }

  const state = getCatState(category);

  const availColor =
    state === 'over' ? colors.error :
      state === 'warn' ? colors.warningText :
        state === 'ok' ? colors.successText :
          colors.textMeta;

  return (
    <TouchableOpacity
      style={[cr.wrap, { backgroundColor: colors.cardBg, borderBottomColor: colors.separator }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, available ${formatMoney(category.available)}`}
    >
      {/* .bgt-ri — name + spend bar */}
      <View style={cr.left}>
        <TourTarget id={showTourTarget ? 'budget-progress-bar' : `cat-${category.id}`}>
          <Text style={[cr.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {category.name}
          </Text>
          <ProgressBar
            animate
            progress={getCatAssignedProgress(category)}
            secondProgress={getCatSpentProgress(category)}
            state={state === 'empty' ? 'neutral' : state}
            size="md"
            trackStyle={{ marginTop: 5 }}
          />
        </TourTarget>
      </View>
      {/* .bgt-ra — available + assigned */}
      <View style={cr.right}>
        <Text style={[cr.avail, { color: availColor }]}>{formatMoney(category.available)}</Text>
        <Text style={[cr.assignedTxt, { color: colors.textMeta }]}>
          {formatMoney(category.assigned)} assigned
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const cr = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    paddingHorizontal: spacing.mdn,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: { flex: 1, minWidth: 0 },
  name: { ...type_.body },
  right: { alignItems: 'flex-end', minWidth: 86 },
  avail: { ...type_.mono },
  assignedTxt: { ...type_.caption, marginTop: 1 },
});

// ── Custom numpad (.assign-numpad) ───────────────────────────────────────────

function NumpadGrid({ onKey, onDel }: { onKey: (k: string) => void; onDel: () => void }) {
  const colors = useTheme();
  const keyStyle = [np.key, { backgroundColor: colors.cardBg }];
  const K = (v: string) => (
    <TouchableOpacity
      key={v}
      style={keyStyle}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onKey(v); }}
      activeOpacity={0.5
      }>
      <Text style={[np.keyTxt, { color: colors.textPrimary }]}>{v}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[np.grid, { backgroundColor: colors.border }]}>
      {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row) => (
        <View key={row[0]} style={np.row}>
          {row.map((k) => K(k))}
        </View>
      ))}
      {/* Bottom row: 0 (wide) + backspace — no decimal key, integers only */}
      <View style={np.row}>
        <TouchableOpacity style={[keyStyle, { flex: 2 }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onKey('0'); }} activeOpacity={0.5}>
          <Text style={[np.keyTxt, { color: colors.textPrimary }]}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={keyStyle} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDel(); }} activeOpacity={0.5}>
          <Ionicons name="backspace-outline" size={19} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const np = StyleSheet.create({
  grid: { marginHorizontal: spacing.xl, marginTop: spacing.mdn, borderRadius: radius.md, overflow: 'hidden', gap: 1 },
  row: { flexDirection: 'row', gap: 1 },
  key: { flex: 1, height: layout.btnHeightSm, alignItems: 'center', justifyContent: 'center' },
  keyTxt: { ...type_.numpad },
});

// ── Assign / Move sheet ────────────────────────────────────────────────────────

function AssignSheet({
  category,
  tbb,
  month,
  allCategories,
  onClose,
}: {
  category: BudgetCategory | null;
  tbb: number;
  month: string;
  allCategories: BudgetCategory[];
  onClose: () => void;
}) {
  const colors = useTheme();
  const [assignStr, setAssignStr] = useState('0');
  const [showMove, setShowMove] = useState(false);
  const [moveTarget, setMoveTarget] = useState<BudgetCategory | null>(null);
  const [moveStr, setMoveStr] = useState('0');

  const assign = useAssignCategory(month);
  const move = useMoveMoney(month);

  // Reset state when category changes
  const [lastId, setLastId] = useState<string | null>(null);
  if (category && category.id !== lastId) {
    setLastId(category.id);
    setAssignStr(String(Math.round(category.assigned / 100)));
    setShowMove(false);
    setMoveTarget(null);
    setMoveStr('0');
  }

  if (!category) return null;

  // Numpad input handler — integers only, shared between assign and move modes
  const activeSet = showMove ? setMoveStr : setAssignStr;
  function handleNumKey(k: string) {
    activeSet((prev) => {
      if (prev === '0') return k; // replace leading zero
      if (prev.length >= 10) return prev; // cap at 10 digits
      return prev + k;
    });
  }
  function handleBackspace() {
    activeSet((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }

  // Derived values
  const assignKobo = parseNairaInput(assignStr);
  const availableAfter = assignKobo + category.activity; // kobo, reflects new assignment
  const moveKobo = parseNairaInput(moveStr);
  const otherCategories = allCategories.filter((c) => c.id !== category.id);

  // Format raw numStr for display: "80000" → "80,000"
  function fmtStr(s: string): string {
    if (!s || s === '0') return '0';
    const [int, dec] = s.split('.');
    const formatted = parseInt(int || '0', 10).toLocaleString('en-NG');
    return dec !== undefined ? `${formatted}.${dec}` : formatted;
  }

  function handleSave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    assign.mutate({ categoryId: category!.id, assigned: assignKobo }, { onSuccess: onClose });
  }

  function handleMove() {
    if (!moveTarget || moveKobo <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    move.mutate(
      { fromCategoryId: category!.id, toCategoryId: moveTarget.id, amount: moveKobo },
      { onSuccess: () => { setShowMove(false); onClose(); } },
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={[sh.backdrop, { backgroundColor: colors.overlayNeutral }]} activeOpacity={1} onPress={onClose} />
      <View style={sh.outer}>
        <View style={[sh.sheet, { backgroundColor: colors.cardBg }]}>
          {/* Handle */}
          <View style={[sh.handle, { backgroundColor: colors.borderStrong }]} />

          {!showMove ? (
            // ── Assign mode ───────────────────────────────────────────────────
            <>
              {/* .sheet-top: left = title + subtitle, right = × */}
              <View style={sh.top}>
                <View style={{ flex: 1 }}>
                  <Text style={[sh.topTitle, { color: colors.textPrimary }]}>
                    Assign to {category.name}
                  </Text>
                  <Text style={[sh.topSub, { color: colors.textMeta }]}>
                    Set how much to assign this month
                  </Text>
                </View>
                <TouchableOpacity
                  style={[sh.xBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={type_.bodyXl.fontSize} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* .assign-stats: TBB | Activity | Available after */}
              <View style={[sh.statsBox, { borderColor: colors.border }]}>
                <View style={sh.statCell}>
                  <Text style={[sh.statLbl, { color: colors.textMeta }]}>TBB</Text>
                  <Text style={[sh.statVal, { color: tbb < 0 ? colors.error : colors.brand }]}>
                    {formatMoney(tbb)}
                  </Text>
                </View>
                <View style={[sh.statDiv, { backgroundColor: colors.border }]} />
                <View style={sh.statCell}>
                  <Text style={[sh.statLbl, { color: colors.textMeta }]}>Activity</Text>
                  <Text style={[sh.statVal, { color: colors.textPrimary }]}>
                    {formatMoney(category.activity)}
                  </Text>
                </View>
                <View style={[sh.statDiv, { backgroundColor: colors.border }]} />
                <View style={sh.statCell}>
                  <Text style={[sh.statLbl, { color: colors.textMeta }]}>After</Text>
                  <Text style={[sh.statVal, { color: availableAfter < 0 ? colors.error : colors.info }]}>
                    {formatMoney(availableAfter)}
                  </Text>
                </View>
              </View>

              {/* .assign-amt: large display card */}
              <View style={[sh.amtCard, { backgroundColor: colors.surface }]}>
                <Text style={[sh.amtSym, { color: colors.textMeta }]}>₦</Text>
                <Text style={[sh.amtNum, { color: colors.textPrimary }]}>{fmtStr(assignStr)}</Text>
              </View>

              {/* .quickfills: horizontal scrollable chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={sh.qfRow}
                style={sh.qfScroll}
              >
                {category.required_this_month !== null && (
                  <TouchableOpacity
                    style={[sh.qfChip, { backgroundColor: colors.cardBg, borderColor: colors.borderStrong }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const needed = Math.max(0, category.assigned + category.required_this_month! - category.available);
                      setAssignStr(String(Math.round(needed / 100)));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Fill to required amount"
                  >
                    <Text style={[sh.qfTxt, { color: colors.textSecondary }]} numberOfLines={1}>Fill to required</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[sh.qfChip, { backgroundColor: colors.cardBg, borderColor: colors.borderStrong }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAssignStr(String(Math.round(Math.max(0, tbb) / 100))); }}
                  accessibilityRole="button"
                  accessibilityLabel="Assign all available to budget"
                >
                  <Text style={[sh.qfTxt, { color: colors.textSecondary }]} numberOfLines={1}>Assign all TBB</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sh.qfChip, { backgroundColor: colors.cardBg, borderColor: colors.borderStrong }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAssignStr('0'); }}
                  accessibilityRole="button"
                  accessibilityLabel="Zero out assignment"
                >
                  <Text style={[sh.qfTxt, { color: colors.textSecondary }]} numberOfLines={1}>Zero out</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sh.qfChip, { backgroundColor: colors.cardBg, borderColor: colors.borderStrong }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMove(true); setMoveStr('0'); setMoveTarget(null); }}
                  accessibilityRole="button"
                  accessibilityLabel="Move money to another category instead"
                >
                  <Text style={[sh.qfTxt, { color: colors.textSecondary }]} numberOfLines={1}>Move money instead →</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* .assign-numpad */}
              <NumpadGrid onKey={handleNumKey} onDel={handleBackspace} />

              {/* .assign-footer: Cancel (flex 1) | Save (flex 2) */}
              <View style={sh.footer}>
                <TouchableOpacity
                  style={[sh.footBtn, { flex: 1, backgroundColor: colors.surface }]}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[sh.footTxt, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sh.footBtn, { flex: 2, backgroundColor: colors.brand }, assign.isPending && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={assign.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Save assignment"
                >
                  {assign.isPending
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={[sh.footTxt, { color: colors.white }]}>Save</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // ── Move mode ────────────────────────────────────────────────────
            <>
              {/* Header: title + back arrow */}
              <View style={sh.top}>
                <View style={{ flex: 1 }}>
                  <Text style={[sh.topTitle, { color: colors.textPrimary }]}>
                    Move from {category.name}
                  </Text>
                  <Text style={[sh.topSub, { color: colors.textMeta }]}>
                    {formatMoney(category.available)} available
                  </Text>
                </View>
                <TouchableOpacity
                  style={[sh.xBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setShowMove(false)}
                  hitSlop={8}
                  accessibilityLabel="Back"
                >
                  <Ionicons name="arrow-back" size={type_.bodyXl.fontSize} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Amount display */}
              <View style={[sh.amtCard, { backgroundColor: colors.surface }]}>
                <Text style={[sh.amtSym, { color: colors.textMeta }]}>₦</Text>
                <Text style={[sh.amtNum, { color: colors.textPrimary }]}>{fmtStr(moveStr)}</Text>
              </View>

              {/* Quick fills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sh.qfRow} style={sh.qfScroll}>
                <TouchableOpacity
                  style={[sh.qfChip, { backgroundColor: colors.cardBg, borderColor: colors.borderStrong }]}
                  onPress={() => setMoveStr(String(Math.round(Math.max(0, category.available) / 100)))}
                >
                  <Text style={[sh.qfTxt, { color: colors.textSecondary }]}>Move all available</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Numpad */}
              <NumpadGrid onKey={handleNumKey} onDel={handleBackspace} />

              {/* Destination picker */}
              <Text style={[sh.toLabel, { color: colors.textMeta }]}>TO</Text>
              <ScrollView style={sh.destList} keyboardShouldPersistTaps="handled">
                {otherCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[sh.destRow, moveTarget?.id === cat.id && { backgroundColor: colors.brand }]}
                    onPress={() => setMoveTarget(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={`Move to ${cat.name}, ${formatMoney(cat.available)} available`}
                    accessibilityState={{ selected: moveTarget?.id === cat.id }}
                  >
                    <Text
                      style={[sh.destName, { color: colors.textPrimary }, moveTarget?.id === cat.id && { color: colors.white }]}
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                    <Text style={[sh.destAvail, { color: colors.textMeta }, moveTarget?.id === cat.id && { color: 'rgba(255,255,255,0.75)' }]}>
                      {formatMoney(cat.available)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Footer */}
              <View style={sh.footer}>
                <TouchableOpacity
                  style={[sh.footBtn, { flex: 1, backgroundColor: colors.surface }]}
                  onPress={() => setShowMove(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Back to assign"
                >
                  <Text style={[sh.footTxt, { color: colors.textSecondary }]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    sh.footBtn,
                    { flex: 2, backgroundColor: colors.brand },
                    (!moveTarget || moveKobo <= 0 || move.isPending) && { opacity: 0.5 },
                  ]}
                  onPress={handleMove}
                  disabled={!moveTarget || moveKobo <= 0 || move.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={moveTarget ? `Confirm move to ${moveTarget.name}` : 'Move money'}
                >
                  {move.isPending
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={[sh.footTxt, { color: colors.white }]}>
                      Move{moveTarget ? ` → ${moveTarget.name}` : ''}
                    </Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const sh = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  // outer fills the entire Modal so % values on sheet resolve against full screen height
  outer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxxl : spacing.xl,
    maxHeight: '92%',
  },
  handle: {
    width: layout.sheetHandle.width,
    height: layout.sheetHandle.height,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  // .sheet-top
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.mdn,
  },
  topTitle: { ...type_.h2 },
  topSub: { ...type_.bodyReg, marginTop: spacing.xxs },
  xBtn: {
    width: layout.iconBtnSize,
    height: layout.iconBtnSize,
    borderRadius: radius.smd,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  // .assign-stats
  statsBox: {
    flexDirection: 'row',
    marginHorizontal: spacing.xl,
    marginTop: spacing.mdn,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statCell: { flex: 1, paddingVertical: spacing.smd, paddingHorizontal: spacing.xxs, alignItems: 'center' },
  statLbl: { ...type_.label },
  statVal: { ...type_.body, ...ff(800), letterSpacing: -0.5, marginTop: spacing.xs },
  statDiv: { width: 1 },
  // .assign-amt
  amtCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginHorizontal: spacing.xl,
    marginTop: spacing.mdn,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  amtSym: { ...type_.displayXs, lineHeight: layout.fabSize, marginRight: 2 },
  amtNum: { ...type_.displayLg },
  // .quickfills
  qfScroll: { marginTop: spacing.mdn, flexGrow: 0 },
  qfRow: { paddingHorizontal: spacing.xl, gap: spacing.xxs },
  qfChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'center',
  },
  qfTxt: { ...type_.small },
  // .assign-footer
  footer: {
    flexDirection: 'row',
    gap: spacing.smd,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.mdn,
  },
  footBtn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footTxt: { ...type_.btnSm },
  // Move mode extras
  toLabel: {
    ...type_.label,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.smd,
    paddingBottom: spacing.xs,
  },
  destList: { maxHeight: 140, marginHorizontal: spacing.md, marginBottom: spacing.xs },
  destRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd,
    borderRadius: radius.xs,
    marginVertical: 2,
  },
  destName: { flex: 1, ...type_.body },
  destAvail: { ...type_.bodyReg },
});

// ── Group header (.bgt-grp-h) ─────────────────────────────────────────────────

function GroupHeader({
  group,
  isCollapsed,
  onPress,
}: {
  group: BudgetGroup;
  isCollapsed: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();

  if (group.is_hidden) {
    return (
      <TouchableOpacity
        style={[gh.row, { backgroundColor: colors.surface, borderBottomColor: colors.border, opacity: 0.45 }]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${group.name}, hidden group. Tap to unhide.`}
      >
        <Text style={[gh.name, { color: colors.textSecondary }]}>{group.name}</Text>
        <Ionicons name="eye-off-outline" size={15} color={colors.textMeta} />
      </TouchableOpacity>
    );
  }

  const totalAssigned = group.categories
    .filter(c => !c.is_hidden)
    .reduce((a, c) => a + c.assigned, 0);
  return (
    <TouchableOpacity
      style={[
        gh.row,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          borderBottomWidth: isCollapsed ? 0 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${isCollapsed ? 'collapsed' : 'expanded'}`}
    >
      <Text style={[gh.name, { color: colors.textSecondary }]}>{group.name}</Text>
      <View style={gh.right}>
        <Text style={[gh.total, { color: colors.textPrimary }]}>{formatMoney(totalAssigned)}</Text>
        <Ionicons
          name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
          size={15}
          color={colors.textMeta}
        />
      </View>
    </TouchableOpacity>
  );
}

const gh = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.mdn,
    paddingRight: spacing.mdn,
    paddingVertical: spacing.smd,
  },
  name: { ...type_.label, flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  total: { ...type_.bodyReg },
});

// ── Unhide sheet (.unhide-sheet) ──────────────────────────────────────────────

type UnhideTarget = { id: string; name: string; type: 'category' | 'group' };

function UnhideSheet({
  item,
  month,
  onClose,
}: {
  item: UnhideTarget | null;
  month: string;
  onClose: () => void;
}) {
  const colors = useTheme();
  const unhideCat = useUnhideCategory(month);
  const unhideGrp = useUnhideGroup(month);

  if (!item) return null;

  const mutation = item.type === 'category' ? unhideCat : unhideGrp;

  function handleUnhide() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    mutation.mutate(item!.id, { onSuccess: onClose });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={[sh.backdrop, { backgroundColor: colors.overlayNeutral }]}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={sh.outer}>
        <View style={[uh.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[sh.handle, { backgroundColor: colors.borderStrong }]} />
          <View style={uh.content}>
            <Ionicons name="eye-outline" size={28} color={colors.brand} style={uh.icon} />
            <Text style={[uh.title, { color: colors.textPrimary }]}>
              Unhide {item.type === 'category' ? 'Category' : 'Group'}?
            </Text>
            <Text style={[uh.sub, { color: colors.textMeta }]}>
              &quot;{item.name}&quot; will appear in your budget again.
            </Text>
          </View>
          <View style={[sh.footer, { paddingBottom: Platform.OS === 'ios' ? 34 : 20 }]}>
            <TouchableOpacity
              style={[sh.footBtn, { flex: 1, backgroundColor: colors.surface }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[sh.footTxt, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sh.footBtn, { flex: 2, backgroundColor: colors.brand }, mutation.isPending && { opacity: 0.6 }]}
              onPress={handleUnhide}
              disabled={mutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Unhide ${item.name}`}
            >
              {mutation.isPending
                ? <ActivityIndicator color={colors.white} />
                : <Text style={[sh.footTxt, { color: colors.white }]}>Unhide</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const uh = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.smd,
    gap: spacing.sm,
  },
  icon: { marginBottom: spacing.xs },
  title: { ...type_.h2 },
  sub: { ...type_.body, textAlign: 'center', lineHeight: 20 },
});

// ── Main screen ────────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { selectedMonth } = useAppSelector((st) => st.budget);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<BudgetCategory | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [unhideTarget, setUnhideTarget] = useState<UnhideTarget | null>(null);
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [walkthroughReady, setWalkthroughReady] = useState(false);

  const startTourIfUnseen = useTour();
  useFocusEffect(
    useCallback(() => { startTourIfUnseen('budget', BUDGET_TOUR, () => setWalkthroughReady(true)); }, [startTourIfUnseen]),
  );
  useStatusBarStyle('dark');

  function toggleGroup(id: string) {
    LayoutAnimation.configureNext({
      duration: 300,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data, isLoading, error, refetch } = useBudget(selectedMonth);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncDatabase();
    } catch (e) {
      console.warn('Sync error', e);
    }
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const allCategories = useMemo(
    () =>
      data?.groups
        .filter((g) => !g.is_hidden)
        .flatMap((g) => g.categories.filter((c) => !c.is_hidden)) ?? [],
    [data],
  );

  const groups = useMemo(() => {
    if (!data?.groups) return [];
    return data.groups
      .filter((g) => showHidden || !g.is_hidden)
      .map((g) => ({
        ...g,
        categories: g.categories.filter((c) => showHidden || !c.is_hidden),
      }));
  }, [data, showHidden]);

  const hiddenCount = useMemo(() => {
    if (!data?.groups) return 0;
    const hiddenGroups = data.groups.filter((g) => g.is_hidden).length;
    const hiddenCats = data.groups
      .filter((g) => !g.is_hidden)
      .flatMap((g) => g.categories)
      .filter((c) => c.is_hidden).length;
    return hiddenGroups + hiddenCats;
  }, [data]);

  const bottomPad = layout.tabBarHeight + Math.max(insets.bottom, 4) + spacing.lg;

  if (isLoading && !data) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={s.errorContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
        >
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textTertiary} />
          <Text style={[s.errorText, { color: colors.textSecondary }]}>Could not load budget.</Text>
          <Text style={[s.errorSub, { color: colors.textMeta }]}>Pull down to retry.</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <MonthHeader month={selectedMonth} tbb={data?.tbb ?? 0} onAutoAssign={() => setShowAutoAssign(true)} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad, paddingTop: spacing.sm }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* Each group is a rounded card (.bgt-grp) */}
        {groups.map((group, idx) => (
          <TourTarget key={group.id} id={idx === 0 ? 'budget-first-group' : `group-${group.id}`}>
            <View
              style={[s.grpCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
            >
              <GroupHeader
                group={group}
                isCollapsed={collapsedGroups.has(group.id)}
                onPress={() => {
                  if (group.is_hidden) {
                    setUnhideTarget({ id: group.id, name: group.name, type: 'group' });
                  } else {
                    toggleGroup(group.id);
                  }
                }}
              />
              {!group.is_hidden && !collapsedGroups.has(group.id) && group.categories.map((cat, catIdx) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  showTourTarget={idx === 0 && catIdx === 0}
                  onPress={() => {
                    if (cat.is_hidden) {
                      setUnhideTarget({ id: cat.id, name: cat.name, type: 'category' });
                    } else {
                      Haptics.selectionAsync();
                      setSelectedCategory(cat);
                    }
                  }}
                />
              ))}
            </View>
          </TourTarget>
        ))}

        {groups.length === 0 && !showHidden && (
          <View style={s.emptyState}>
            <Ionicons name="grid-outline" size={40} color={colors.textTertiary} />
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>No budget groups yet.</Text>
            <TouchableOpacity onPress={() => router.push('/budget-edit' as never)}>
              <Text style={[s.emptyLink, { color: colors.brand }]}>Set up your budget →</Text>
            </TouchableOpacity>
          </View>
        )}

        {hiddenCount > 0 && (
          <TouchableOpacity
            style={s.hiddenToggle}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowHidden(v => !v); }}
            accessibilityRole="button"
            accessibilityLabel={showHidden ? 'Hide hidden items' : `Show ${hiddenCount} hidden item${hiddenCount === 1 ? '' : 's'}`}
          >
            <Ionicons name={showHidden ? 'eye-off-outline' : 'eye-outline'} size={13} color={colors.textMeta} />
            <Text style={[s.hiddenToggleTxt, { color: colors.textMeta }]}>
              {showHidden ? 'Hide hidden items' : `Show hidden (${hiddenCount})`}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <AssignSheet
        category={selectedCategory}
        tbb={data?.tbb ?? 0}
        month={selectedMonth}
        allCategories={allCategories}
        onClose={() => setSelectedCategory(null)}
      />

      <UnhideSheet
        item={unhideTarget}
        month={selectedMonth}
        onClose={() => setUnhideTarget(null)}
      />

      {showAutoAssign && (
        <AutoAssignSheet
          visible={showAutoAssign}
          month={selectedMonth}
          tbb={data?.tbb ?? 0}
          budgetData={data}
          onClose={() => setShowAutoAssign(false)}
        />
      )}

      {/* First-time onboarding walkthrough — shown only after the spotlight tour is done */}
      {walkthroughReady && <BudgetWalkthrough />}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  errorContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.xxs,
  },
  errorText: { ...type_.h3, textAlign: 'center' },
  errorSub: { ...type_.bodyReg, textAlign: 'center' },
  grpCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.smd,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: spacing.sm,
  },
  emptyText: { ...type_.h3 },
  emptyLink: { ...type_.body, marginTop: spacing.xs },
  hiddenToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.mdn,
    marginTop: spacing.xs,
  },
  hiddenToggleTxt: { ...type_.bodyReg },
});

