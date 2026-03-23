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
 * Supports re-categorization via category picker modal.
 * Tapping a row navigates to the transaction details screen.
 * Pull-to-refresh triggers a WatermelonDB sync.
 */
import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ActivityIndicator,
  StyleSheet,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { formatNaira } from '@/utils/money';
import { queryKeys } from '@/lib/queryKeys';
import { syncDatabase } from '@/database/sync';
import type { CategoryGroup } from '@/types/category';
import type { Transaction } from '@/types/transaction';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useTransactions, useRecategorize } from '@/hooks/useTransactions';

// ─── Category picker modal ────────────────────────────────────────────────────

interface CategoryPickerProps {
  visible: boolean;
  groups: CategoryGroup[];
  onSelect: (categoryId: string) => void;
  onClose: () => void;
}

function CategoryPicker({ visible, groups, onSelect, onClose }: CategoryPickerProps) {
  const sections = groups.map((g) => ({ title: g.name, data: g.categories }));
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={s.pickerHeader}>
          <Text style={s.pickerTitle}>Choose Category</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={s.pickerGroupHeader}>
              <Text style={s.pickerGroupName}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.pickerCatRow} onPress={() => onSelect(item.id)}>
              <Text style={s.pickerCatName}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ─── Transaction row ─────────────────────────────────────────────────────────

interface TxRowProps {
  tx: Transaction;
  categoryName: string | null;
  onPress: () => void;
  onCategoryPress: () => void;
}

function TxRow({ tx, categoryName, onPress, onCategoryPress }: TxRowProps) {
  const isDebit = tx.type === 'debit';
  const amountColor = isDebit ? '#EF4444' : '#10B981';
  const sign = isDebit ? '-' : '+';

  return (
    <TouchableOpacity style={s.txRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.txLeft}>
        <Text style={s.txNarration} numberOfLines={1}>
          {tx.narration}
        </Text>
        <TouchableOpacity onPress={onCategoryPress}>
          <Text style={tx.category_id ? s.txCategorySet : s.txCategoryUnset}>
            {categoryName ?? 'Uncategorized'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={s.txRight}>
        <Text style={[s.txAmount, { color: amountColor }]}>
          {sign}{formatNaira(Math.abs(tx.amount))}
        </Text>
        <Text style={s.txTime}>{txTime(tx.date)}</Text>
        {tx.is_manual && (
          <Text style={s.txManualBadge}>manual</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

/** Format an ISO datetime string's day portion — e.g. "Tue, 10 Mar 2025" */
function formatDayLabel(dateStr: string): string {
  // dateStr is a "YYYY-MM-DD" local-date key; append T00:00:00 so JS parses it
  // as local midnight (not UTC) to avoid off-by-one at timezone boundaries.
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Extract the local calendar day as a "YYYY-MM-DD" key from an ISO datetime. */
function txLocalDay(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format just the time portion for display in transaction rows. */
function txTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

export default function TransactionsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [pickerTxId, setPickerTxId] = useState<string | null>(null);

  const {
    data: txPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTransactions();

  const { data: groups = [] } = useCategoryGroups();
  const recategorizeMutation = useRecategorize();

  // Build a flat category id → name map
  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    groups.forEach((g) => g.categories.forEach((c) => m.set(c.id, c.name)));
    return m;
  }, [groups]);

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

  // Group transactions by local calendar day, preserve server sort (newest first)
  const sections = useMemo(() => {
    const dayMap = new Map<string, Transaction[]>();
    for (const tx of allTx) {
      const day = txLocalDay(tx.date); // local YYYY-MM-DD key
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(tx);
    }
    // Map is insertion-ordered; allTx already sorted newest-first from the API
    return Array.from(dayMap.entries()).map(([day, data]) => ({ title: day, data }));
  }, [allTx]);

  if (isLoading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color="#10B981" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Transactions</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => {
          return (
            <View style={s.dayHeader}>
              <Text style={s.dayLabel}>{formatDayLabel(section.title)}</Text>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <TxRow
            tx={item}
            categoryName={item.category_id ? (categoryMap.get(item.category_id) ?? null) : null}
            onPress={() => router.push(`/transaction/${item.id}` as never)}
            onCategoryPress={() => setPickerTxId(item.id)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        stickySectionHeadersEnabled
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ padding: 16 }} color="#10B981" />
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>No transactions yet.</Text>
            <Text style={s.emptySub}>Sync a bank account to see them here.</Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
      />

      <CategoryPicker
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
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },

  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  txLeft: { flex: 1, marginRight: 12 },
  txNarration: { fontSize: 15, color: '#111827', marginBottom: 2 },
  txCategorySet: { fontSize: 12, color: '#10B981', fontWeight: '500' },
  txCategoryUnset: { fontSize: 12, color: '#F59E0B', fontWeight: '500' },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 15, fontWeight: '600' },
  txTime: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  txManualBadge: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },

  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#F3F4F6',
  },
  dayLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  dayNet: { fontSize: 12, fontWeight: '600' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#6B7280', textAlign: 'center' },

  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  pickerGroupHeader: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#F3F4F6',
  },
  pickerGroupName: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  pickerCatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  pickerCatName: { fontSize: 15, color: '#111827' },
});

