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
import {
  View,
  Text,
  ScrollView,
  SectionList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatNaira } from '@/utils/money';
import { useBudget, useAssignCategory, useMoveMoney } from '@/hooks/useBudget';
import { syncDatabase } from '@/database/sync';
import { prevMonth, nextMonth } from '@/store/budgetSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { BudgetCategory, BudgetGroup } from '@/types/budget';

// ─── Month nav header ─────────────────────────────────────────────────────────

function MonthHeader({ month, tbb }: { month: string; tbb: number }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [y, m] = month.split('-');
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-NG', {
    month: 'long',
    year: 'numeric',
  });

  const tbbColor = tbb < 0 ? '#EF4444' : tbb === 0 ? '#6B7280' : '#10B981';

  return (
    <View style={s.monthHeader}>
      <TouchableOpacity onPress={() => dispatch(prevMonth())} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color="#374151" />
      </TouchableOpacity>
      <View style={s.monthCenter}>
        <Text style={s.monthLabel}>{label}</Text>
        <Text style={[s.tbb, { color: tbbColor }]}>
          {formatNaira(tbb)} to budget
        </Text>
      </View>
      <View style={s.monthRight}>
        <TouchableOpacity onPress={() => dispatch(nextMonth())} hitSlop={12}>
          <Ionicons name="chevron-forward" size={24} color="#374151" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/budget-edit' as never)} hitSlop={12}>
          <Ionicons name="pencil-outline" size={20} color="#374151" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Category row (read-only) ─────────────────────────────────────────────────

/**
 * Funding dot: green = fully funded, amber = underfunded, none = no target.
 */
function FundingDot({ category }: { category: BudgetCategory }) {
  if (category.required_this_month === null) return null;
  const funded = category.available >= category.required_this_month;
  return (
    <View
      style={[
        s.fundingDot,
        { backgroundColor: funded ? '#10B981' : '#F59E0B' },
      ]}
    />
  );
}

function CategoryRow({ category, onPress }: { category: BudgetCategory; onPress: () => void }) {
  const availColor =
    category.available < 0
      ? '#EF4444'
      : category.available === 0
        ? '#9CA3AF'
        : '#10B981';

  return (
    <TouchableOpacity style={s.catRow} onPress={onPress} activeOpacity={0.7}>
      <FundingDot category={category} />
      <Text style={s.catName} numberOfLines={1}>
        {category.name}
      </Text>
      <View style={s.catRight}>
        <Text style={s.catAssigned}>{formatNaira(category.assigned)}</Text>
        <Text style={[s.catAvail, { color: availColor }]}>
          {formatNaira(category.available)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Assign / Move sheet ──────────────────────────────────────────────────────

/** Parse a user-typed naira string like "5,000.50" → kobo. */
function parseNairaInput(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

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
  const [input, setInput] = useState('');
  const [showMove, setShowMove] = useState(false);
  const [moveTarget, setMoveTarget] = useState<BudgetCategory | null>(null);
  const [moveInput, setMoveInput] = useState('');

  const assign = useAssignCategory(month);
  const move = useMoveMoney(month);

  // Sync input when a new category is opened
  const [lastId, setLastId] = useState<string | null>(null);
  if (category && category.id !== lastId) {
    setLastId(category.id);
    setInput((category.assigned / 100).toFixed(2));
    setShowMove(false);
    setMoveTarget(null);
    setMoveInput('');
  }

  if (!category) return null;

  const availColor =
    category.available < 0
      ? '#EF4444'
      : category.available === 0
        ? '#9CA3AF'
        : '#10B981';

  const otherCategories = allCategories.filter((c) => c.id !== category.id);

  function handleSave() {
    assign.mutate(
      { categoryId: category!.id, assigned: parseNairaInput(input) },
      { onSuccess: onClose },
    );
  }

  function handleMove() {
    if (!moveTarget) return;
    const kobo = parseNairaInput(moveInput);
    if (kobo <= 0) return;
    move.mutate(
      { fromCategoryId: category!.id, toCategoryId: moveTarget.id, amount: kobo },
      {
        onSuccess: () => {
          setShowMove(false);
          onClose();
        },
      },
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      {/* Dimmed backdrop tap-to-close */}
      <TouchableOpacity
        style={s.sheetBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.sheetOuter}
      >
        <View style={s.sheet}>
          <View style={s.sheetHandle} />

          {/* Header */}
          <View style={s.sheetHeader}>
            <TouchableOpacity
              onPress={showMove ? () => setShowMove(false) : onClose}
              hitSlop={12}
            >
              <Ionicons
                name={showMove ? 'arrow-back' : 'close'}
                size={22}
                color="#374151"
              />
            </TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>
              {showMove ? `Move from ${category.name}` : category.name}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          {!showMove ? (
            // ── Assign screen ───────────────────────────────────────────────
            <>
              {/* Stats strip */}
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={s.statLabel}>Ready to assign</Text>
                  <Text style={[s.statValue, { color: tbb < 0 ? '#EF4444' : '#10B981' }]}>
                    {formatNaira(tbb)}
                  </Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statLabel}>Activity</Text>
                  <Text style={s.statValue}>{formatNaira(category.activity)}</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statLabel}>Available</Text>
                  <Text style={[s.statValue, { color: availColor }]}>
                    {formatNaira(category.available)}
                  </Text>
                </View>
              </View>

              {/* Amount input */}
              <View style={s.amountRow}>
                <Text style={s.amountCurrency}>₦</Text>
                <TextInput
                  style={s.amountInput}
                  value={input}
                  onChangeText={setInput}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  autoFocus
                  placeholder="0.00"
                  placeholderTextColor="#D1D5DB"
                />
              </View>

              {/* Quick-fill chips */}
              <View style={s.chipsRow}>
                {category.required_this_month !== null && (
                  <TouchableOpacity
                    style={s.chip}
                    onPress={() => {
                      // Set assigned to exactly cover the requirement
                      const needed = Math.max(
                        0,
                        category.assigned + category.required_this_month! - category.available,
                      );
                      setInput((needed / 100).toFixed(2));
                    }}
                  >
                    <Text style={s.chipText}>Fill to required</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.chip} onPress={() => setInput('0.00')}>
                  <Text style={s.chipText}>Zero out</Text>
                </TouchableOpacity>
              </View>

              {/* Move money link */}
              <TouchableOpacity
                style={s.moveLink}
                onPress={() => {
                  setMoveTarget(null);
                  setMoveInput('');
                  setShowMove(true);
                }}
              >
                <Ionicons name="swap-horizontal" size={16} color="#6B7280" />
                <Text style={s.moveLinkText}>Move money to another category</Text>
                <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Save */}
              <TouchableOpacity
                style={[s.saveBtn, assign.isPending && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={assign.isPending}
              >
                {assign.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            // ── Move screen ─────────────────────────────────────────────────
            <>
              {/* Available-to-move strip */}
              <View style={s.moveAvailRow}>
                <Text style={s.moveAvailLabel}>Available in {category.name}</Text>
                <Text style={[s.moveAvailValue, { color: availColor }]}>
                  {formatNaira(category.available)}
                </Text>
              </View>

              {/* Amount to move */}
              <View style={s.amountRow}>
                <Text style={s.amountCurrency}>₦</Text>
                <TextInput
                  style={s.amountInput}
                  value={moveInput}
                  onChangeText={setMoveInput}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  autoFocus
                  placeholder="0.00"
                  placeholderTextColor="#D1D5DB"
                />
              </View>

              {/* Quick-fill: move all available */}
              <View style={s.chipsRow}>
                <TouchableOpacity
                  style={s.chip}
                  onPress={() =>
                    setMoveInput((Math.max(0, category.available) / 100).toFixed(2))
                  }
                >
                  <Text style={s.chipText}>Move all available</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.moveSectionLabel}>TO</Text>

              {/* Destination list */}
              <ScrollView style={s.moveList} keyboardShouldPersistTaps="handled">
                {otherCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      s.moveCatRow,
                      moveTarget?.id === cat.id && s.moveCatRowSelected,
                    ]}
                    onPress={() => setMoveTarget(cat)}
                  >
                    <Text
                      style={[
                        s.moveCatName,
                        moveTarget?.id === cat.id && { color: '#fff' },
                      ]}
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                    <Text
                      style={[
                        s.moveCatAvail,
                        moveTarget?.id === cat.id && { color: 'rgba(255,255,255,0.75)' },
                      ]}
                    >
                      {formatNaira(cat.available)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Move button */}
              <TouchableOpacity
                style={[
                  s.saveBtn,
                  (!moveTarget || parseNairaInput(moveInput) <= 0 || move.isPending) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={handleMove}
                disabled={!moveTarget || parseNairaInput(moveInput) <= 0 || move.isPending}
              >
                {move.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.saveBtnText}>
                    Move{moveInput ? ` ₦${moveInput}` : ''}
                    {moveTarget ? ` → ${moveTarget.name}` : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Group header ─────────────────────────────────────────────────────────────

function GroupHeader({ group }: { group: BudgetGroup }) {
  const totalAssigned = group.categories.reduce((a, c) => a + c.assigned, 0);
  return (
    <View style={s.groupHeader}>
      <Text style={s.groupName}>{group.name}</Text>
      <Text style={s.groupTotal}>{formatNaira(totalAssigned)}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const { selectedMonth } = useAppSelector((s) => s.budget);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<BudgetCategory | null>(null);

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

  // All visible categories — used as the destination picker in MoveSheet
  const allCategories = useMemo(
    () =>
      data?.groups
        .filter((g) => !g.is_hidden)
        .flatMap((g) => g.categories.filter((c) => !c.is_hidden)) ?? [],
    [data],
  );

  const sections =
    data?.groups
      .filter((g) => !g.is_hidden)
      .map((g) => ({ ...g, data: g.categories.filter((c) => !c.is_hidden) })) ?? [];

  if (isLoading && !data) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color="#10B981" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView
          contentContainerStyle={s.errorContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
          }
        >
          <Ionicons name="cloud-offline-outline" size={40} color="#D1D5DB" />
          <Text style={s.errorText}>Could not load budget.</Text>
          <Text style={s.errorSub}>Pull down to retry.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <MonthHeader month={selectedMonth} tbb={data?.tbb ?? 0} />

      <View style={s.colHeaders}>
        <Text style={s.colHdrCategory}>CATEGORY</Text>
        <View style={s.colHdrRight}>
          <Text style={s.colHdrText}>ASSIGNED</Text>
          <Text style={s.colHdrText}>AVAILABLE</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CategoryRow category={item} onPress={() => setSelectedCategory(item)} />
        )}
        renderSectionHeader={({ section }) => <GroupHeader group={section} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <AssignSheet
        category={selectedCategory}
        tbb={data?.tbb ?? 0}
        month={selectedMonth}
        allCategories={allCategories}
        onClose={() => setSelectedCategory(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  monthCenter: { alignItems: 'center' },
  monthRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#111827' },
  tbb: { fontSize: 13, fontWeight: '500', marginTop: 2 },

  colHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
  },
  colHdrCategory: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  colHdrRight: { flexDirection: 'row', gap: 32 },
  colHdrText: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },

  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E5E7EB',
  },
  groupName: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
  groupTotal: { fontSize: 13, fontWeight: '600', color: '#6B7280' },

  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  fundingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  catName: { flex: 1, fontSize: 15, color: '#111827' },
  catRight: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  catAssigned: { fontSize: 14, color: '#6B7280', minWidth: 80, textAlign: 'right' },
  catAvail: { fontSize: 14, fontWeight: '600', minWidth: 80, textAlign: 'right' },

  errorContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 6 },
  errorText: { fontSize: 16, fontWeight: '600', color: '#374151', textAlign: 'center' },
  errorSub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  // ── Assign / Move sheet ─────────────────────────────────────────────────────
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginHorizontal: 8,
  },

  statsRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
  statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  statValue: { fontSize: 14, fontWeight: '700', color: '#111827' },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  amountCurrency: { fontSize: 28, fontWeight: '700', color: '#6B7280', marginRight: 4 },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    padding: 0,
  },

  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },

  moveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  moveLinkText: { flex: 1, fontSize: 14, color: '#6B7280' },

  saveBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  moveAvailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  moveAvailLabel: { fontSize: 13, color: '#6B7280' },
  moveAvailValue: { fontSize: 14, fontWeight: '700' },

  moveSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  moveList: { maxHeight: 200, marginHorizontal: 12, marginBottom: 8 },
  moveCatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginVertical: 2,
  },
  moveCatRowSelected: { backgroundColor: '#10B981' },
  moveCatName: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500' },
  moveCatAvail: { fontSize: 13, color: '#6B7280' },
});

