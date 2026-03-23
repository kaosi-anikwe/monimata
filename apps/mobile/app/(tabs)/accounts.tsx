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
 * Accounts tab — displays linked bank accounts with balances and sync controls.
 *
 * Each card shows: institution name, account type, account holder name, current
 * balance (in Naira), last-synced time, and per-account sync + unlink actions.
 *
 * The Mono Connect flow lives in (auth)/link-bank.tsx. This screen is purely
 * a management view for already-linked accounts.
 */
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatNaira } from '@/utils/money';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAccounts, useTriggerSync, useUnlinkAccount } from '@/hooks/useAccounts';
import type { BankAccount } from '@/types/account';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastSynced(dateStr: string | null): string {
  if (!dateStr) return 'Never synced';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

// ─── Account card ─────────────────────────────────────────────────────────────

interface AccountCardProps {
  account: BankAccount;
  isSyncing: boolean;
  onSync: () => void;
  onUnlink: () => void;
}

function AccountCard({ account, isSyncing, onSync, onUnlink }: AccountCardProps) {
  return (
    <View style={s.card}>
      {account.requires_reauth && (
        <TouchableOpacity
          style={s.reauthBanner}
          onPress={() => router.push('/(auth)/link-bank')}
          activeOpacity={0.8}
        >
          <Ionicons name="warning-outline" size={15} color="#92400E" />
          <Text style={s.reauthText}>Reconnection needed — tap to reauthorize</Text>
        </TouchableOpacity>
      )}

      <View style={s.cardHeader}>
        <View style={s.cardIconWrap}>
          <Ionicons name="business" size={20} color="#0F7B3F" />
        </View>
        <View style={s.cardHeaderText}>
          <Text style={s.institutionName}>{account.institution}</Text>
          <Text style={s.accountType}>{account.account_type}</Text>
        </View>
      </View>

      <Text style={s.accountName}>{account.account_name}</Text>
      <Text style={s.balance}>{formatNaira(account.balance)}</Text>

      <View style={s.divider} />

      <View style={s.cardFooter}>
        <View style={s.syncInfo}>
          <Ionicons name="time-outline" size={13} color="#9CA3AF" />
          <Text style={s.syncText}>{formatLastSynced(account.last_synced_at)}</Text>
        </View>

        <View style={s.footerActions}>
          <TouchableOpacity
            style={[s.syncBtn, isSyncing && s.syncBtnDisabled]}
            onPress={onSync}
            disabled={isSyncing}
            activeOpacity={0.75}
          >
            {isSyncing ? (
              <ActivityIndicator size={14} color="#0F7B3F" />
            ) : (
              <Ionicons name="refresh-outline" size={14} color="#0F7B3F" />
            )}
            <Text style={s.syncBtnText}>{isSyncing ? 'Syncing…' : 'Sync'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.unlinkBtn} onPress={onUnlink} activeOpacity={0.75}>
            <Text style={s.unlinkBtnText}>Unlink</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={s.emptyContainer}>
      <Ionicons name="business-outline" size={52} color="#D1FAE5" />
      <Text style={s.emptyTitle}>No accounts linked</Text>
      <Text style={s.emptySub}>
        Link a Nigerian bank account to start syncing transactions automatically.
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

function AccountsContent() {
  const { data: accounts = [], isLoading, refetch } = useAccounts();
  const syncMutation = useTriggerSync();
  const unlinkMutation = useUnlinkAccount();
  const [refreshing, setRefreshing] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function handleSync(account: BankAccount) {
    setSyncingId(account.id);
    syncMutation.mutate(account.id, {
      onSettled: () => setSyncingId(null),
    });
  }

  function handleUnlink(account: BankAccount) {
    Alert.alert(
      'Unlink Account',
      `Remove ${account.institution} from MoniMata? Your transaction history will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => unlinkMutation.mutate(account.id),
        },
      ],
    );
  }

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
        <Text style={s.headerTitle}>Accounts</Text>
        <TouchableOpacity
          style={s.linkBtn}
          onPress={() => router.push('/(auth)/link-bank')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.linkBtnText}>Link Account</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, accounts.length === 0 && s.scrollEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {accounts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <View style={s.totalCard}>
              <Text style={s.totalLabel}>Total Balance</Text>
              <Text style={s.totalAmount}>{formatNaira(totalBalance)}</Text>
              <Text style={s.totalSub}>
                across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isSyncing={syncingId === account.id}
                onSync={() => handleSync(account)}
                onUnlink={() => handleUnlink(account)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AccountsScreen() {
  return (
    <ErrorBoundary>
      <AccountsContent />
    </ErrorBoundary>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F7B3F',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  linkBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  scroll: { padding: 16, gap: 12 },
  scrollEmpty: { flex: 1 },

  totalCard: {
    backgroundColor: '#0F7B3F',
    borderRadius: 16,
    padding: 20,
    marginBottom: 4,
  },
  totalLabel: { fontSize: 13, fontWeight: '500', color: '#D1FAE5', marginBottom: 4 },
  totalAmount: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  totalSub: { fontSize: 12, color: '#A7F3D0', marginTop: 4 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  reauthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  reauthText: { fontSize: 12, color: '#92400E', fontWeight: '500', flex: 1 },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderText: { flex: 1 },
  institutionName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  accountType: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  accountName: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  balance: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 14,
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginBottom: 12 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncText: { fontSize: 12, color: '#9CA3AF' },

  footerActions: { flexDirection: 'row', gap: 8 },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F0FDF4',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { fontSize: 13, fontWeight: '600', color: '#0F7B3F' },
  unlinkBtn: {
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF5F5',
  },
  unlinkBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
});
