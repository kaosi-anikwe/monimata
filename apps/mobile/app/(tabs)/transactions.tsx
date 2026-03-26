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
 * Transactions tab — shows transactions grouped by day.
 * Supports re-categorization via category picker bottom sheet.
 * Tapping a row navigates to the transaction details screen.
 * Pull-to-refresh triggers a WatermelonDB sync.
 * Search bar + filter chips (All / Uncategorised / Debits / Credits / per-account).
 */
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { syncDatabase } from '@/database/sync';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useRecategorize, useTransactions } from '@/hooks/useTransactions';
import { queryKeys } from '@/lib/queryKeys';
import { useTheme } from '@/lib/theme';
import { layout, radius, shadow, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import type { BankAccount } from '@/types/account';
import type { CategoryGroup } from '@/types/category';
import type { Transaction } from '@/types/transaction';
import { formatNaira } from '@/utils/money';

// ─── Filter type ──────────────────────────────────────────────────────────────

/** 'all' | 'uncategorised' | 'debits' | 'credits' | <accountId> */
type TxFilter = string;

// ─── Day group ────────────────────────────────────────────────────────────────

interface DayGroup {
  day: string;   // 'YYYY-MM-DD' local-date key
  net: number;   // kobo; positive = net credit day, negative = net debit day
  txs: Transaction[];
}

// ─── Category picker sheet ────────────────────────────────────────────────────

interface CategoryPickerSheetProps {
  visible: boolean;
  groups: CategoryGroup[];
  onSelect: (categoryId: string) => void;
  onClose: () => void;
}

function CategoryPickerSheet({ visible, groups, onSelect, onClose }: CategoryPickerSheetProps) {
  const colors = useTheme();
  const sections = groups.map((g) => ({ title: g.name, data: g.categories }));
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Choose Category"
      scrollable={false}
    >
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        style={{ maxHeight: 440 }}
        renderSectionHeader={({ section }) => (
          <View style={[ss.pickerGroupHeader, { backgroundColor: colors.surface }]}>
            <Text style={[type_.labelSm, { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 1.2 }]}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[ss.pickerCatRow, { borderBottomColor: colors.separator }]}
            onPress={() => { onSelect(item.id); onClose(); }}
            accessibilityRole="button"
            accessibilityLabel={item.name}
          >
            <Text style={[type_.body, { color: colors.textPrimary, flex: 1 }]}>{item.name}</Text>
            <View>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          </TouchableOpacity>
        )}
      />
    </BottomSheet>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Transaction row ─────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a 'YYYY-MM-DD' key into a readable day label, e.g. "WED, 19 MAR 2026" */
function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).toUpperCase();
}

/** Extract the local calendar day as a 'YYYY-MM-DD' key from an ISO datetime. */
function txLocalDay(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format just the time portion — e.g. "2:14 PM" */
function txTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ─── Transaction row ─────────────────────────────────────────────────────────

interface TxRowProps {
  tx: Transaction;
  categoryName: string | null;
  accountLabel: string | null;
  onPress: () => void;
  onCategoryPress: () => void;
  isLast: boolean;
}

function TxRow({ tx, categoryName, accountLabel, onPress, onCategoryPress, isLast }: TxRowProps) {
  const colors = useTheme();
  const isDebit = tx.type === 'debit';
  const amountColor = isDebit ? colors.error : colors.success;
  const sign = isDebit ? '−' : '+';
  const iconBg = isDebit ? colors.errorSubtle : colors.successSubtle;

  return (
    <TouchableOpacity
      style={[
        ss.txRow,
        { borderBottomColor: colors.separator },
        !isLast && ss.txRowBorder,
        tx.is_manual && { borderLeftColor: colors.info, borderLeftWidth: 3 },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${tx.narration}, ${sign}${formatNaira(Math.abs(tx.amount))}`}
    >
      {/* Icon bubble */}
      <View style={[ss.txIcon, { backgroundColor: iconBg }]}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          {isDebit
            ? <Path d="M12 19V5M5 12l7-7 7 7" stroke={amountColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            : <Path d="M12 5v14M5 12l7 7 7-7" stroke={amountColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />}
        </Svg>
      </View>

      {/* Info column */}
      <View style={ss.txInfo}>
        <Text style={[type_.small, { color: colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
          {tx.narration}
        </Text>
        <View style={ss.txMeta}>
          {/* Category chip */}
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); onCategoryPress(); }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Change category"
          >
            <View style={[
              ss.txCatChip,
              tx.category_id
                ? { backgroundColor: colors.surface }
                : { backgroundColor: colors.warningSubtle },
            ]}>
              <Text style={[
                ss.txCatChipText,
                { color: tx.category_id ? colors.brand : colors.warningText },
              ]}>
                {categoryName ?? 'Uncategorised'}
              </Text>
            </View>
          </TouchableOpacity>
          {/* Account · time */}
          {accountLabel && (
            <Text style={[type_.caption, { color: colors.textMeta }]}>{accountLabel} · {txTime(tx.date)}</Text>
          )}
          {!accountLabel && (
            <Text style={[type_.caption, { color: colors.textMeta }]}>{txTime(tx.date)}</Text>
          )}
          {/* Recurring badge */}
          {tx.recurrence_id && (
            <Text style={[type_.caption, { color: colors.textMeta }]}>↻ Recurring</Text>
          )}
        </View>
      </View>

      {/* Amount column */}
      <View style={ss.txAmt}>
        <Text style={[ss.txAmtNum, { color: amountColor }]}>
          {sign}{formatNaira(Math.abs(tx.amount))}
        </Text>
        {/* <Text style={[type_.caption, { color: colors.textMeta }]}>{isDebit ? 'Debit' : 'Credit'}</Text> */}
        {tx.is_manual && (
          <View style={[ss.manualBadge, { backgroundColor: colors.infoSubtle }]}>
            <Text style={[ss.manualBadgeText, { color: colors.info }]}>MANUAL</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Day group card ───────────────────────────────────────────────────────────

interface DayGroupCardProps {
  group: DayGroup;
  categoryMap: Map<string, string>;
  accountMap: Map<string, BankAccount>;
  onTxPress: (id: string) => void;
  onCategoryPress: (id: string) => void;
}

function DayGroupCard({ group, categoryMap, accountMap, onTxPress, onCategoryPress }: DayGroupCardProps) {
  const colors = useTheme();
  const isNetPositive = group.net >= 0;
  const netColor = isNetPositive ? colors.success : colors.error;
  const netLabel = isNetPositive
    ? `+${formatNaira(group.net)}`
    : `−${formatNaira(Math.abs(group.net))}`;

  return (
    <View style={ss.dayBlock}>
      {/* Day header row */}
      <View style={ss.dayHdrRow}>
        <Text style={[type_.labelSm, { color: colors.textMeta, letterSpacing: 0.8 }]}>
          {formatDayLabel(group.day)}
        </Text>
        <Text style={[type_.small, { color: netColor, fontWeight: '700' }]}>
          {netLabel}
        </Text>
      </View>

      {/* Day card */}
      <View style={[ss.dayCard, { borderColor: colors.border, backgroundColor: colors.white }, shadow.sm]}>
        {group.txs.map((tx, i) => {
          const account = accountMap.get(tx.account_id);
          const accountLabel = account ? (account.alias ?? account.institution) : null;
          return (
            <TxRow
              key={tx.id}
              tx={tx}
              categoryName={tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null}
              accountLabel={accountLabel}
              onPress={() => onTxPress(tx.id)}
              onCategoryPress={() => onCategoryPress(tx.id)}
              isLast={i === group.txs.length - 1}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TransactionsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [pickerTxId, setPickerTxId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<TxFilter>('all');

  const {
    data: txPages,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTransactions();

  const { data: groups = [] } = useCategoryGroups();
  const { data: accounts = [] } = useAccounts();
  const recategorizeMutation = useRecategorize();

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    groups.forEach((g) => g.categories.forEach((c) => m.set(c.id, c.name)));
    return m;
  }, [groups]);

  const accountMap = useMemo(() => {
    const m = new Map<string, BankAccount>();
    accounts.forEach((a) => m.set(a.id, a));
    return m;
  }, [accounts]);

  const filterOptions = useMemo(() => [
    { key: 'all', label: 'All' },
    { key: 'uncategorised', label: 'Uncategorised' },
    { key: 'debits', label: 'Debits' },
    { key: 'credits', label: 'Credits' },
    ...accounts.map((a) => ({ key: a.id, label: a.alias ?? a.institution })),
  ], [accounts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncDatabase();
    } catch (e) {
      console.warn('Sync error', e);
    }
    await qc.invalidateQueries({ queryKey: queryKeys.transactions() });
    setRefreshing(false);
  }, [qc]);

  const allTx = useMemo(
    () => txPages?.pages.flatMap((p) => p.items) ?? [],
    [txPages],
  );

  const filteredTx = useMemo(() => {
    let result = allTx;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((tx) => {
        if (tx.narration.toLowerCase().includes(q)) return true;
        if (tx.memo?.toLowerCase().includes(q)) return true;
        // Match amount: strip currency symbols/commas and compare against kobo or naira string
        const absNaira = (Math.abs(tx.amount) / 100).toFixed(2);
        if (absNaira.includes(q) || String(Math.abs(tx.amount)).includes(q)) return true;
        return false;
      });
    }
    if (activeFilter === 'uncategorised') {
      result = result.filter((tx) => !tx.category_id);
    } else if (activeFilter === 'debits') {
      result = result.filter((tx) => tx.type === 'debit');
    } else if (activeFilter === 'credits') {
      result = result.filter((tx) => tx.type === 'credit');
    } else if (activeFilter !== 'all') {
      result = result.filter((tx) => tx.account_id === activeFilter);
    }
    return result;
  }, [allTx, search, activeFilter]);

  const dayGroups = useMemo((): DayGroup[] => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filteredTx) {
      const day = txLocalDay(tx.date);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(tx);
    }
    return Array.from(map.entries()).map(([day, txs]) => ({
      day,
      net: txs.reduce((sum, t) => sum + t.amount, 0),
      txs,
    }));
  }, [filteredTx]);

  if (isLoading) {
    return (
      <View style={[ss.safe, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[ss.safe, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={ss.errorContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
        >
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textTertiary} />
          <Text style={[ss.errorText, { color: colors.textSecondary }]}>Could not load transactions.</Text>
          <Text style={[ss.errorSub, { color: colors.textMeta }]}>Pull down to retry.</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[ss.safe, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      {/* ── Header ── */}
      <View style={[ss.header, { backgroundColor: colors.white, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
        {/* Title row */}
        <View style={ss.hdrTopRow}>
          <TouchableOpacity
            style={[ss.hdrIconBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={16} color={colors.brand} />
          </TouchableOpacity>
          <Text style={[ss.hdrTitle, { color: colors.textPrimary }]}>Transactions</Text>
          <TouchableOpacity
            style={[ss.hdrIconBtn, { backgroundColor: colors.surface }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Bulk categorise info"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={10} stroke={colors.textMeta} strokeWidth={1.8} />
              <Path d="M12 8v4M12 16h.01" stroke={colors.textMeta} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={[ss.searchBar, { backgroundColor: colors.white, borderColor: colors.border }]}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={11} cy={11} r={8} stroke={colors.textTertiary} strokeWidth={2} />
            <Path d="M21 21l-4.35-4.35" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <TextInput
            style={[ss.searchInput, { color: colors.textPrimary }]}
            placeholder="Search transactions…"
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            accessibilityLabel="Search transactions"
          />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          style={{ marginTop: spacing.md }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={ss.filterChips}
        >
          {filterOptions.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              selected={activeFilter === opt.key}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveFilter(opt.key); }}
              style={{ marginRight: spacing.sm }}
            />
          ))}
        </ScrollView>
      </View>

      {/* ── List ── */}
      <FlashList
        data={dayGroups}
        keyExtractor={(g) => g.day}
        renderItem={({ item: group }) => (
          <DayGroupCard
            group={group}
            categoryMap={categoryMap}
            accountMap={accountMap}
            onTxPress={(id) => router.push(`/transaction/${id}` as never)}
            onCategoryPress={(id) => setPickerTxId(id)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ padding: spacing.lg }} color={colors.brand} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon={
              <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
                <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={colors.textTertiary} strokeWidth={1.5} strokeLinecap="round" />
                <Polyline points="14 2 14 8 20 8" stroke={colors.textTertiary} strokeWidth={1.5} strokeLinecap="round" />
              </Svg>
            }
            title="No transactions"
            body={
              search || activeFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Sync a bank account or add a transaction manually.'
            }
          />
        }
        contentContainerStyle={{ paddingBottom: layout.tabBarHeight + spacing.lg }}
        accessibilityLabel="Transactions list"
      />

      {/* ── Category picker sheet ── */}
      <CategoryPickerSheet
        visible={pickerTxId !== null}
        groups={groups}
        onClose={() => setPickerTxId(null)}
        onSelect={(catId) => {
          if (pickerTxId) {
            recategorizeMutation.mutate({ txId: pickerTxId, categoryId: catId });
          }
          setPickerTxId(null);
        }}
      />
    </View>
  );
}

// ─── Static styles ────────────────────────────────────────────────────────────
// Non-color layout values only — colors are applied via inline style with useTheme().

const ss = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  hdrTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  hdrTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'PlusJakartaSans-Bold', letterSpacing: -0.3 },
  hdrIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
    fontFamily: 'PlusJakartaSans-Regular',
  },

  // Filter chips row
  filterChips: {
    paddingBottom: spacing.md,
  },

  // Day block
  dayBlock: {
    marginTop: spacing.sm,
  },
  dayHdrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.smd,
  },

  // Day card (wraps all tx rows for one day)
  dayCard: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
  },

  // Tx row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.mdn,
    paddingVertical: 11,
    backgroundColor: 'transparent',
  },
  txRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txInfo: { flex: 1, minWidth: 0 },
  txMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  txCatChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  txCatChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  txAmt: { alignItems: 'flex-end', flexShrink: 0 },
  txAmtNum: { fontSize: 14, fontWeight: '700' },

  // Manual badge
  manualBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  manualBadgeText: { fontSize: 9, fontWeight: '700' },

  // Category picker sheet rows
  pickerGroupHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  pickerCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Error state
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  errorSub: { fontSize: 13, textAlign: 'center' },
});

