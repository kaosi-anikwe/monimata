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
 * Accounts tab — manage bank accounts (manual and Mono-linked).
 *
 * Manual accounts:   user sets the balance; can be linked to Mono later.
 * Mono-linked:       balance synced from Mono automatically; can be unlinked.
 * Both types can be deleted (soft-delete, history preserved).
 */
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatNaira } from '@/utils/money';
import { useToast } from '@/components/Toast';
import type { BankAccount } from '@/types/account';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  useAccounts,
  useTriggerSync,
  useUnlinkMono,
  useDeleteAccount,
  useAddManualAccount,
  useUpdateBalance,
  useUpdateAlias,
  type AddManualAccountPayload,
} from '@/hooks/useAccounts';

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

function formatBalanceDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return `as of ${new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`;
}

// ─── Add Manual Account Sheet ─────────────────────────────────────────────────

interface AddManualSheetProps {
  visible: boolean;
  onClose: () => void;
}

function AddManualSheet({ visible, onClose }: AddManualSheetProps) {
  const addMutation = useAddManualAccount();
  const { error } = useToast();
  const [alias, setAlias] = useState('');
  const [institution, setInstitution] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<'SAVINGS' | 'CURRENT'>('SAVINGS');
  const [balance, setBalance] = useState('');

  function reset() {
    setAlias('');
    setInstitution('');
    setBankCode('');
    setAccountNumber('');
    setAccountType('SAVINGS');
    setBalance('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!alias.trim() || !institution.trim() || !bankCode.trim() || accountNumber.length !== 10) {
      error('Missing details', 'Please fill in all required fields. Account number must be 10 digits.');
      return;
    }

    const payload: AddManualAccountPayload = {
      alias: alias.trim(),
      institution: institution.trim(),
      bank_code: bankCode.trim(),
      account_number: accountNumber.trim(),
      account_type: accountType,
      balance: balance ? Math.round(parseFloat(balance) * 100) : 0,
    };

    addMutation.mutate(payload, {
      onSuccess: () => {
        handleClose();
      },
    });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#F9FAFB' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>Add Account Manually</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={ms.sheetBody}>
            <Text style={ms.label}>Account Nickname *</Text>
            <TextInput
              style={ms.input}
              value={alias}
              onChangeText={setAlias}
              placeholder="e.g. My Salary Account"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />

            <Text style={ms.label}>Bank Name *</Text>
            <TextInput
              style={ms.input}
              value={institution}
              onChangeText={setInstitution}
              placeholder="e.g. First Bank"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={ms.label}>CBN Bank Code *</Text>
            <TextInput
              style={ms.input}
              value={bankCode}
              onChangeText={setBankCode}
              placeholder="e.g. 011"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={6}
            />

            <Text style={ms.label}>Account Number *</Text>
            <TextInput
              style={ms.input}
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="10-digit NUBAN"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={10}
            />

            <Text style={ms.label}>Account Type</Text>
            <View style={ms.segmentRow}>
              {(['SAVINGS', 'CURRENT'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[ms.segment, accountType === t && ms.segmentActive]}
                  onPress={() => setAccountType(t)}
                >
                  <Text style={[ms.segmentText, accountType === t && ms.segmentTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={ms.label}>Opening Balance (₦) — optional</Text>
            <TextInput
              style={ms.input}
              value={balance}
              onChangeText={setBalance}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
            />

            <TouchableOpacity
              style={[ms.submitBtn, addMutation.isPending && ms.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={addMutation.isPending}
              activeOpacity={0.8}
            >
              {addMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={ms.submitBtnText}>Add Account</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Update Balance Sheet ─────────────────────────────────────────────────────

interface UpdateBalanceSheetProps {
  account: BankAccount | null;
  onClose: () => void;
}

function UpdateBalanceSheet({ account, onClose }: UpdateBalanceSheetProps) {
  const updateMutation = useUpdateBalance();
  const { error } = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  function handleClose() {
    setAmount('');
    setNote('');
    onClose();
  }

  function handleSubmit() {
    if (!account) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      error('Invalid amount', 'Please enter a valid balance.');
      return;
    }
    updateMutation.mutate(
      { accountId: account.id, balance: Math.round(parsed * 100), note: note.trim() || undefined },
      { onSuccess: handleClose },
    );
  }

  if (!account) return null;

  return (
    <Modal visible={!!account} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#F9FAFB' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>Update Balance</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={ms.sheetBody}>
            <Text style={ms.sheetSub}>
              {account.institution} · {account.alias ?? account.account_name}
            </Text>
            <Text style={ms.sheetCurrentBalance}>
              Current: {formatNaira(account.balance)}
            </Text>

            <Text style={ms.label}>New Balance (₦) *</Text>
            <TextInput
              style={ms.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={ms.label}>Note — optional</Text>
            <TextInput
              style={ms.input}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Monthly reconciliation"
              placeholderTextColor="#9CA3AF"
            />

            <TouchableOpacity
              style={[ms.submitBtn, updateMutation.isPending && ms.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={updateMutation.isPending}
              activeOpacity={0.8}
            >
              {updateMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={ms.submitBtnText}>Save Balance</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Account card ─────────────────────────────────────────────────────────────

interface AccountCardProps {
  account: BankAccount;
  isSyncing: boolean;
  onSync: () => void;
  onUnlink: () => void;
  onDelete: () => void;
  onUpdateBalance: () => void;
  onRename: () => void;
}

function AccountCard({
  account,
  isSyncing,
  onSync,
  onUnlink,
  onDelete,
  onUpdateBalance,
  onRename,
}: AccountCardProps) {
  const isLinked = account.is_mono_linked;
  const { actionSheet } = useToast();

  function handleMoreActions() {
    actionSheet({
      title: account.alias ?? account.account_name,
      options: [
        { label: 'Rename', onPress: onRename },
        { label: 'Remove Account', onPress: onDelete, style: 'destructive' as const },
        ...(isLinked
          ? [{ label: 'Disconnect Mono', onPress: onUnlink, style: 'destructive' as const }]
          : [
            { label: 'Update Balance', onPress: onUpdateBalance },
            {
              label: 'Link to Mono',
              onPress: () => router.push({ pathname: '/(auth)/link-bank', params: { accountId: account.id } }),
            },
          ]),
      ],
    });
  }

  return (
    <View style={s.card}>
      {account.requires_reauth && isLinked && (
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
        <View style={[s.cardIconWrap, !isLinked && s.cardIconWrapManual]}>
          <Ionicons
            name={isLinked ? 'business' : 'wallet-outline'}
            size={20}
            color={isLinked ? '#0F7B3F' : '#6B7280'}
          />
        </View>
        <View style={s.cardHeaderText}>
          <Text style={s.institutionName}>{account.institution}</Text>
          <Text style={s.accountType}>{account.account_type}</Text>
        </View>
        <View style={[s.badge, isLinked ? s.badgeLinked : s.badgeManual]}>
          <Text style={[s.badgeText, isLinked ? s.badgeTextLinked : s.badgeTextManual]}>
            {isLinked ? 'Mono' : 'Manual'}
          </Text>
        </View>
      </View>

      <Text style={s.accountName}>{account.alias ?? account.account_name}</Text>
      <Text style={s.balance}>{formatNaira(account.balance)}</Text>
      {!isLinked && account.balance_as_of && (
        <Text style={s.balanceAsOf}>{formatBalanceDate(account.balance_as_of)}</Text>
      )}

      <View style={s.divider} />

      <View style={s.cardFooter}>
        <View style={s.syncInfo}>
          <Ionicons name="time-outline" size={13} color="#9CA3AF" />
          <Text style={s.syncText}>
            {isLinked ? formatLastSynced(account.last_synced_at) : 'Manual account'}
          </Text>
        </View>

        <View style={s.footerActions}>
          {isLinked && (
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
          )}

          <TouchableOpacity style={s.moreBtn} onPress={handleMoreActions} activeOpacity={0.75}>
            <Ionicons name="ellipsis-horizontal" size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Rename Sheet ────────────────────────────────────────────────────────────

interface RenameSheetProps {
  account: BankAccount | null;
  onClose: () => void;
}

function RenameSheet({ account, onClose }: RenameSheetProps) {
  const renameMutation = useUpdateAlias();
  const { error } = useToast();
  const [alias, setAlias] = useState('');

  useEffect(() => {
    if (account) setAlias(account.alias ?? account.account_name);
  }, [account]);

  function handleClose() {
    setAlias('');
    onClose();
  }

  function handleSubmit() {
    if (!account) return;
    if (!alias.trim()) {
      error('Required', 'Please enter a name for this account.');
      return;
    }
    renameMutation.mutate(
      { accountId: account.id, alias: alias.trim() },
      { onSuccess: handleClose },
    );
  }

  if (!account) return null;

  return (
    <Modal visible={!!account} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#F9FAFB' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={ms.sheetHeader}>
            <Text style={ms.sheetTitle}>Rename Account</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={ms.sheetBody}>
            <Text style={ms.sheetSub}>{account.institution}</Text>

            <Text style={ms.label}>Nickname *</Text>
            <TextInput
              style={ms.input}
              value={alias}
              onChangeText={setAlias}
              placeholder="e.g. My Salary Account"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />

            <TouchableOpacity
              style={[ms.submitBtn, renameMutation.isPending && ms.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={renameMutation.isPending}
              activeOpacity={0.8}
            >
              {renameMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={ms.submitBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onAddManual: () => void;
}

function EmptyState({ onAddManual }: EmptyStateProps) {
  return (
    <View style={s.emptyContainer}>
      <Ionicons name="business-outline" size={52} color="#D1FAE5" />
      <Text style={s.emptyTitle}>No accounts yet</Text>
      <Text style={s.emptySub}>
        Add a bank account manually, or link one via Mono to sync transactions automatically.
      </Text>
      <View style={s.emptyActions}>
        <TouchableOpacity style={s.emptyBtnPrimary} onPress={onAddManual} activeOpacity={0.8}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={s.emptyBtnPrimaryText}>Add Manually</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.emptyBtnSecondary}
          onPress={() => router.push('/(auth)/link-bank')}
          activeOpacity={0.8}
        >
          <Text style={s.emptyBtnSecondaryText}>Link via Mono</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

function AccountsContent() {
  const { confirm } = useToast();
  const { data: accounts = [], isLoading, refetch } = useAccounts();
  const syncMutation = useTriggerSync();
  const unlinkMutation = useUnlinkMono();
  const deleteMutation = useDeleteAccount();

  const [refreshing, setRefreshing] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [balanceAccount, setBalanceAccount] = useState<BankAccount | null>(null);
  const [renameAccount, setRenameAccount] = useState<BankAccount | null>(null);

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
    confirm({
      title: 'Disconnect Mono',
      message: `Remove the Mono connection from ${account.institution}? Your account and transaction history will be kept, but auto-sync will stop.`,
      confirmText: 'Disconnect',
      confirmStyle: 'destructive',
      onConfirm: () => unlinkMutation.mutate(account.id),
    });
  }

  function handleDelete(account: BankAccount) {
    confirm({
      title: 'Remove Account',
      message: `Remove ${account.institution} from MoniMata? Your transaction history will be preserved.`,
      confirmText: 'Remove',
      confirmStyle: 'destructive',
      onConfirm: () => deleteMutation.mutate(account.id),
    });
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
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.addManualBtn}
            onPress={() => setShowAddSheet(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#0F7B3F" />
            <Text style={s.addManualBtnText}>Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.linkBtn}
            onPress={() => router.push('/(auth)/link-bank')}
            activeOpacity={0.8}
          >
            <Ionicons name="link-outline" size={16} color="#fff" />
            <Text style={s.linkBtnText}>Link Mono</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, accounts.length === 0 && s.scrollEmpty]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {accounts.length === 0 ? (
          <EmptyState onAddManual={() => setShowAddSheet(true)} />
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
                onDelete={() => handleDelete(account)}
                onUpdateBalance={() => setBalanceAccount(account)}
                onRename={() => setRenameAccount(account)}
              />
            ))}
          </>
        )}
      </ScrollView>

      <AddManualSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />
      <UpdateBalanceSheet account={balanceAccount} onClose={() => setBalanceAccount(null)} />
      <RenameSheet account={renameAccount} onClose={() => setRenameAccount(null)} />
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
  headerActions: { flexDirection: 'row', gap: 8 },
  addManualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addManualBtnText: { color: '#0F7B3F', fontSize: 13, fontWeight: '600' },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F7B3F',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  linkBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

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
  cardIconWrapManual: { backgroundColor: '#F3F4F6' },
  cardHeaderText: { flex: 1 },
  institutionName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  accountType: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeLinked: { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' },
  badgeManual: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextLinked: { color: '#065F46' },
  badgeTextManual: { color: '#374151' },

  accountName: { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  balance: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  balanceAsOf: { fontSize: 11, color: '#9CA3AF', marginTop: 2, marginBottom: 10 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginVertical: 12 },

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
  moreBtn: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },

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
  emptySub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyActions: { flexDirection: 'row', gap: 12 },
  emptyBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F7B3F',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  emptyBtnSecondary: {
    borderWidth: 1,
    borderColor: '#D1FAE5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyBtnSecondaryText: { color: '#0F7B3F', fontSize: 14, fontWeight: '600' },
});

// ─── Sheet styles ─────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetBody: { padding: 20, gap: 4 },
  sheetSub: { fontSize: 14, color: '#6B7280', marginBottom: 4 },
  sheetCurrentBalance: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 16 },

  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  segmentActive: { borderColor: '#0F7B3F', backgroundColor: '#F0FDF4' },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  segmentTextActive: { color: '#0F7B3F' },

  submitBtn: {
    backgroundColor: '#0F7B3F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
