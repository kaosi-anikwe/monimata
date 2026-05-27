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
 * Category Transactions screen — shows all transactions in a specific category.
 *
 * Navigated to from:
 *  - Budget tab: tapping the Activity cell in the AssignSheet
 *  - Transaction list: long-pressing a category chip
 *  - Reports: tapping a month row in category-detail
 *
 * Local-first: fetches from WatermelonDB first, then falls back to server
 * for older (archived) transactions.
 *
 * Search filters the already-fetched transactions client-side.
 */

import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAccounts } from '@/hooks/useAccounts';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useCategoryTransactions } from '@/hooks/useTransactions';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { useTheme } from '@/lib/theme';
import { layout, radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { formatNaira } from '@/utils/money';
import { EmptyState, ScreenHeader } from '@/components/ui';
import type { BankAccount, Transaction } from '@monimata/shared-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-NG', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }).toUpperCase();
}

function txLocalDay(dateStr: string): string {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function txTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ─── Day group type ───────────────────────────────────────────────────────────

interface DayGroup {
    day: string;
    net: number;
    txs: Transaction[];
}

// ─── TxRow ────────────────────────────────────────────────────────────────────

interface TxRowProps {
    tx: Transaction;
    categoryName: string | null;
    accountLabel: string | null;
    onPress: () => void;
    isLast: boolean;
}

function TxRow({ tx, categoryName, accountLabel, onPress, isLast }: TxRowProps) {
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
            ]}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${tx.narration}, ${sign}${formatNaira(Math.abs(tx.amount))}`}
        >
            <View style={[ss.txIcon, { backgroundColor: iconBg }]}>
                <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                    {isDebit
                        ? <Path d="M12 19V5M5 12l7-7 7 7" stroke={amountColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                        : <Path d="M12 5v14M5 12l7 7 7-7" stroke={amountColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />}
                </Svg>
            </View>

            <View style={ss.txInfo}>
                <Text style={[type_.body, { color: colors.textPrimary, ...ff(500) }]} numberOfLines={2}>
                    {tx.narration}
                </Text>

                <View style={ss.txSecondRow}>
                    <View style={ss.txMetaCol}>
                        <View style={ss.txTagsRow}>
                            {tx.is_split ? (
                                <View style={[ss.txCatChip, { backgroundColor: colors.infoSubtle }]}>
                                    <Text style={[ss.txCatChipText, { color: colors.info }]}>Split ✦</Text>
                                </View>
                            ) : (
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
                                        {categoryName ?? (tx.type === 'credit' ? 'TBB' : 'Uncategorised')}
                                    </Text>
                                </View>
                            )}
                            {tx.source === 'manual' && (
                                <View style={[ss.txBadge, { backgroundColor: colors.infoSubtle }]}>
                                    <Text style={[ss.txBadgeText, { color: colors.info }]}>MANUAL</Text>
                                </View>
                            )}
                            {tx.categorization_source === 'llm' && (
                                <Ionicons name="sparkles" size={11} color={colors.textMeta} />
                            )}
                        </View>
                        <Text style={[type_.caption, { color: colors.textMeta, marginTop: spacing.xxs }]} numberOfLines={1}>
                            {[accountLabel, txTime(tx.date as unknown as string)].filter(Boolean).join(' · ')}
                        </Text>
                    </View>

                    <View style={ss.txAmt}>
                        <Text style={[ss.txAmtNum, { color: amountColor }]}>
                            {sign}{formatNaira(Math.abs(tx.amount))}
                        </Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

// ─── DayGroupCard ─────────────────────────────────────────────────────────────

interface DayGroupCardProps {
    group: DayGroup;
    categoryMap: Map<string, string>;
    accountMap: Map<string, BankAccount>;
    onTxPress: (id: string) => void;
}

function DayGroupCard({ group, categoryMap, accountMap, onTxPress }: DayGroupCardProps) {
    const colors = useTheme();
    const isNetPositive = group.net >= 0;
    const netColor = isNetPositive ? colors.success : colors.error;
    const netLabel = isNetPositive
        ? `+${formatNaira(group.net)}`
        : `−${formatNaira(Math.abs(group.net))}`;

    return (
        <View style={ss.dayBlock}>
            <View style={ss.dayHdrRow}>
                <Text style={[type_.labelSm, { color: colors.textMeta, letterSpacing: 0.8 }]}>
                    {formatDayLabel(group.day)}
                </Text>
                <Text style={[type_.small, { color: netColor }]}>
                    {netLabel}
                </Text>
            </View>

            <View style={[ss.dayCard, { borderColor: colors.border, backgroundColor: colors.cardBg }, shadow.sm]}>
                {group.txs.map((tx, i) => {
                    const account = accountMap.get(tx.account_id as string);
                    const accountLabel = account ? (account.alias ?? account.institution) : null;
                    return (
                        <TxRow
                            key={tx.id as string}
                            tx={tx}
                            categoryName={tx.category_id ? (categoryMap.get(tx.category_id as string) ?? null) : null}
                            accountLabel={accountLabel}
                            onPress={() => onTxPress(tx.id as string)}
                            isLast={i === group.txs.length - 1}
                        />
                    );
                })}
            </View>
        </View>
    );
}

// ─── CategoryTransactionsScreen ───────────────────────────────────────────────

export default function CategoryTransactionsScreen() {
    const colors = useTheme();
    const insets = useSafeAreaInsets();
    const { categoryId, categoryName, month } = useLocalSearchParams<{
        categoryId: string;
        categoryName: string;
        month: string; // optional 'YYYY-MM' — when set, only show transactions from this month
    }>();
    const resolvedId = categoryId ?? 'tbb';
    const isTbb = resolvedId === 'tbb';
    const baseName = categoryName ?? (isTbb ? 'Uncategorised' : 'Category');

    // Build title — append month label when filtering by month
    const title = month
        ? `${baseName} · ${new Date(Number(month.split('-')[0]), Number(month.split('-')[1]) - 1).toLocaleString('en-NG', { month: 'short', year: 'numeric' })}`
        : baseName;

    const [search, setSearch] = useState('');

    const { local, archived, localExhausted } = useCategoryTransactions(resolvedId);

    const { data: groups = [] } = useCategoryGroups();
    const { data: accounts = [] } = useAccounts();

    useStatusBarStyle('light');

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

    // Merge local + archived transactions
    const localTx = useMemo(
        () => local.data?.pages.flatMap((p) => p.items) ?? [],
        [local.data],
    );
    const archivedTx = useMemo(
        () => archived.data?.pages.flatMap((p) => p.items) ?? [],
        [archived.data],
    );
    const allTx = useMemo(() => [...localTx, ...archivedTx], [localTx, archivedTx]);

    // Month filter — keep only transactions within the specified YYYY-MM
    const monthFilteredTx = useMemo(() => {
        if (!month) return allTx;
        const [y, m] = month.split('-').map(Number);
        const start = new Date(y, m - 1, 1).getTime();
        const end = new Date(y, m, 1).getTime();
        return allTx.filter((tx) => {
            const t = new Date(tx.date).getTime();
            return t >= start && t < end;
        });
    }, [allTx, month]);

    // Client-side search within fetched transactions
    const filteredTx = useMemo(() => {
        if (!search.trim()) return monthFilteredTx;
        const q = search.toLowerCase();
        return monthFilteredTx.filter((tx) => {
            if (tx.narration.toLowerCase().includes(q)) return true;
            if (tx.memo?.toLowerCase().includes(q)) return true;
            if (tx.category_id) {
                const catName = categoryMap.get(tx.category_id as string);
                if (catName?.toLowerCase().includes(q)) return true;
            }
            const absNaira = (Math.abs(tx.amount) / 100).toFixed(2);
            if (absNaira.includes(q) || String(Math.abs(tx.amount)).includes(q)) return true;
            return false;
        });
    }, [monthFilteredTx, search, categoryMap]);

    // Group filtered transactions by day
    const dayGroups = useMemo(() => {
        const map = new Map<string, Transaction[]>();
        filteredTx.forEach((tx) => {
            const day = txLocalDay(tx.date as unknown as string);
            const list = map.get(day) ?? [];
            list.push(tx);
            map.set(day, list);
        });
        const result: DayGroup[] = [];
        map.forEach((txs, day) => {
            const net = txs.reduce((sum, tx) => {
                const signed = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
                return sum + signed;
            }, 0);
            result.push({ day, net, txs });
        });
        return result;
    }, [filteredTx]);

    const handleTxPress = useCallback((id: string) => {
        router.push(`/transaction/${id}` as never);
    }, []);

    const totalCount = monthFilteredTx.length;
    const isLoading = local.isLoading;
    const isError = local.isError;

    // Determine which page source to load next
    const handleEndReached = useCallback(() => {
        if (local.hasNextPage && !local.isFetchingNextPage) {
            local.fetchNextPage();
        } else if (localExhausted && archived.hasNextPage && !archived.isFetchingNextPage) {
            archived.fetchNextPage();
        }
    }, [local, archived, localExhausted]);

    const isFetchingMore = local.isFetchingNextPage || archived.isFetchingNextPage;

    return (
        <View style={[ss.root, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title={title}
                subtitle={`${totalCount} transaction${totalCount !== 1 ? 's' : ''}`}
                onBack={() => router.back()}
                paddingTop={insets.top + spacing.md}
            />

            {/* ── Search bar ── */}
            <View style={ss.searchContainer}>
                <View style={[ss.searchBar, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <Path
                            d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35"
                            stroke={colors.textTertiary}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </Svg>
                    <TextInput
                        style={[ss.searchInput, { color: colors.textPrimary }]}
                        placeholder="Search transactions…"
                        placeholderTextColor={colors.textTertiary}
                        value={search}
                        onChangeText={setSearch}
                        returnKeyType="search"
                    />
                </View>
            </View>

            {isLoading ? (
                <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />
            ) : isError ? (
                <EmptyState
                    icon={<Ionicons name="cloud-offline-outline" size={36} color={colors.textMeta} />}
                    title="Couldn't load transactions"
                    body="Check your connection and try again."
                    action={{
                        label: 'Retry',
                        onPress: () => local.refetch(),
                        variant: 'green',
                    }}
                    style={ss.emptyState}
                />
            ) : dayGroups.length === 0 ? (
                <EmptyState
                    icon={<Ionicons name="search-outline" size={36} color={colors.textMeta} />}
                    title="No transactions found"
                    body={search.trim() ? 'Try a different search term.' : `No transactions in ${title}.`}
                    style={ss.emptyState}
                />
            ) : (
                <FlashList
                    data={dayGroups}
                    keyExtractor={(g) => g.day}
                    renderItem={({ item: group }) => (
                        <DayGroupCard
                            group={group}
                            categoryMap={categoryMap}
                            accountMap={accountMap}
                            onTxPress={handleTxPress}
                        />
                    )}
                    onEndReached={handleEndReached}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={
                        isFetchingMore ? (
                            <ActivityIndicator style={{ padding: spacing.lg }} color={colors.brand} />
                        ) : null
                    }
                    contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
    root: { flex: 1 },
    searchContainer: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        height: layout.rowMinHeight,
        borderRadius: radius.md,
        borderWidth: 1.5,
        paddingHorizontal: spacing.md,
    },
    searchInput: {
        flex: 1,
        ...type_.body,
        padding: 0,
    },
    emptyState: {
        flex: 1,
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
    dayCard: {
        marginHorizontal: spacing.lg,
        borderRadius: radius.md,
        overflow: 'hidden',
        borderWidth: 1,
    },

    // Tx row
    txRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        paddingHorizontal: spacing.mdn,
        paddingVertical: spacing.smd,
        backgroundColor: 'transparent',
    },
    txRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    txIcon: {
        width: layout.avatarMd,
        height: layout.avatarMd,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    txInfo: { flex: 1, minWidth: 0 },
    txSecondRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
        gap: spacing.smd,
    },
    txMetaCol: {
        flex: 1,
        minWidth: 0,
    },
    txTagsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xxs,
        flexWrap: 'wrap',
    },
    txCatChip: {
        paddingHorizontal: spacing.xxs,
        paddingVertical: 1,
        borderRadius: radius.xxs,
    },
    txCatChipText: {
        ...type_.labelSm,
        textTransform: 'none',
        letterSpacing: 0,
    },
    txAmt: { alignItems: 'flex-end', flexShrink: 0 },
    txAmtNum: { ...type_.body },
    txBadge: {
        paddingHorizontal: spacing.xxs,
        paddingVertical: 1,
        borderRadius: radius.xxs,
    },
    txBadgeText: { ...type_.micro },
});
