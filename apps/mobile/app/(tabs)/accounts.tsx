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
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useToast } from '@/components/Toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  useAccounts,
  useAddManualAccount,
  useDeleteAccount,
  useTriggerSync,
  useUnlinkMono,
  useUpdateAlias,
  useUpdateBalance,
  type AddManualAccountPayload,
} from '@/hooks/useAccounts';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import type { BankAccount } from '@/types/account';
import { formatNaira } from '@/utils/money';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  const colors = useTheme();
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
    addMutation.mutate(payload, { onSuccess: handleClose });
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Add Account Manually" scrollable>
      <View style={ss.sheetBody}>
        <Input
          label="Account Nickname *"
          value={alias}
          onChangeText={setAlias}
          placeholder="e.g. My Salary Account"
          autoFocus
          accessibilityLabel="Account nickname"
        />
        <Input
          label="Bank Name *"
          value={institution}
          onChangeText={setInstitution}
          placeholder="e.g. First Bank"
          accessibilityLabel="Bank name"
        />
        <Input
          label="CBN Bank Code *"
          value={bankCode}
          onChangeText={setBankCode}
          placeholder="e.g. 011"
          keyboardType="number-pad"
          maxLength={6}
          accessibilityLabel="CBN bank code"
        />
        <Input
          label="Account Number *"
          value={accountNumber}
          onChangeText={setAccountNumber}
          placeholder="10-digit NUBAN"
          keyboardType="number-pad"
          maxLength={10}
          accessibilityLabel="Account number"
        />

        {/* Account type segment */}
        <View style={ss.inputBlock}>
          <Text style={[type_.labelSm, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Account Type</Text>
          <View style={ss.segmentRow}>
            {(['SAVINGS', 'CURRENT'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  ss.segment,
                  { borderColor: colors.border, backgroundColor: colors.white },
                  accountType === t && { borderColor: colors.brand, backgroundColor: colors.surface },
                ]}
                onPress={() => setAccountType(t)}
                accessibilityRole="button"
                accessibilityLabel={t}
              >
                <Text
                  style={[
                    type_.label,
                    { color: accountType === t ? colors.brand : colors.textMeta },
                  ]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Input
          label="Opening Balance (₦) — optional"
          value={balance}
          onChangeText={setBalance}
          placeholder="0.00"
          keyboardType="decimal-pad"
          accessibilityLabel="Opening balance"
        />

        <Button
          variant="green"
          onPress={handleSubmit}
          disabled={addMutation.isPending}
          loading={addMutation.isPending}
          accessibilityLabel="Add account"
        >
          Add Account
        </Button>
      </View>
    </BottomSheet>
  );
}

// ─── Update Balance Sheet ─────────────────────────────────────────────────────

interface UpdateBalanceSheetProps {
  account: BankAccount | null;
  onClose: () => void;
}

function UpdateBalanceSheet({ account, onClose }: UpdateBalanceSheetProps) {
  const colors = useTheme();
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

  return (
    <BottomSheet visible={!!account} onClose={handleClose} title="Update Balance">
      <View style={ss.sheetBody}>
        {account && (
          <Text style={[type_.bodyReg, { color: colors.textMeta, marginBottom: spacing.lg }]}>
            {account.institution} · {account.alias ?? account.account_name}
            {'  '}
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
              Current: {formatNaira(account.balance)}
            </Text>
          </Text>
        )}
        <Input
          label="New Balance (₦) *"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          autoFocus
          accessibilityLabel="New balance"
        />
        <Input
          label="Note — optional"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Monthly reconciliation"
          accessibilityLabel="Balance note"
        />
        <Button
          variant="green"
          onPress={handleSubmit}
          disabled={updateMutation.isPending}
          loading={updateMutation.isPending}
          accessibilityLabel="Save balance"
        >
          Save Balance
        </Button>
      </View>
    </BottomSheet>
  );
}

// ─── Rename Sheet ─────────────────────────────────────────────────────────────

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

  return (
    <BottomSheet visible={!!account} onClose={handleClose} title="Rename Account">
      <View style={ss.sheetBody}>
        <Input
          label="Nickname *"
          value={alias}
          onChangeText={setAlias}
          placeholder="e.g. My Salary Account"
          autoFocus
          accessibilityLabel="Account nickname"
        />
        <Button
          variant="green"
          onPress={handleSubmit}
          disabled={renameMutation.isPending}
          loading={renameMutation.isPending}
          accessibilityLabel="Save name"
        >
          Save
        </Button>
      </View>
    </BottomSheet>
  );
}

// ─── More Actions Sheet ───────────────────────────────────────────────────────

interface MoreActionsSheetProps {
  account: BankAccount | null;
  onClose: () => void;
  onRename: () => void;
  onUpdateBalance: () => void;
  onUnlink: () => void;
  onDelete: () => void;
}

function MoreActionsSheet({
  account,
  onClose,
  onRename,
  onUpdateBalance,
  onUnlink,
  onDelete,
}: MoreActionsSheetProps) {
  const colors = useTheme();
  if (!account) return null;
  const isLinked = account.is_mono_linked;

  function action(fn: () => void) {
    onClose();
    // brief delay so sheet closes before any confirm modal opens
    setTimeout(fn, 220);
  }

  return (
    <BottomSheet visible={!!account} onClose={onClose} title={account.alias ?? account.account_name}>
      <View style={ss.ashList}>
        {/* Rename */}
        <TouchableOpacity
          style={ss.ashRow}
          onPress={() => action(onRename)}
          accessibilityRole="button"
          accessibilityLabel="Rename account"
        >
          <View style={[ss.ashIc, { backgroundColor: colors.surface }]}>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View style={ss.ashText}>
            <Text style={[type_.body, { color: colors.textPrimary }]}>Rename</Text>
            <Text style={[type_.caption, { color: colors.textMeta }]}>Change the display name</Text>
          </View>
        </TouchableOpacity>

        {/* Update Balance (manual only) */}
        {!isLinked && (
          <TouchableOpacity
            style={ss.ashRow}
            onPress={() => action(onUpdateBalance)}
            accessibilityRole="button"
            accessibilityLabel="Update balance"
          >
            <View style={[ss.ashIc, { backgroundColor: colors.warningSubtle }]}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke={colors.warning} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={ss.ashText}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>Update Balance</Text>
              <Text style={[type_.caption, { color: colors.textMeta }]}>Manually set the current balance</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Link to Mono (manual only) */}
        {!isLinked && (
          <TouchableOpacity
            style={ss.ashRow}
            onPress={() => {
              onClose();
              router.push({ pathname: '/(auth)/link-bank', params: { accountId: account.id } });
            }}
            accessibilityRole="button"
            accessibilityLabel="Link to Mono"
          >
            <View style={[ss.ashIc, { backgroundColor: colors.infoSubtle }]}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={ss.ashText}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>Link to Mono</Text>
              <Text style={[type_.caption, { color: colors.textMeta }]}>Enable automatic sync</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Disconnect Mono (linked only) */}
        {isLinked && (
          <TouchableOpacity
            style={ss.ashRow}
            onPress={() => action(onUnlink)}
            accessibilityRole="button"
            accessibilityLabel="Disconnect Mono"
          >
            <View style={[ss.ashIc, { backgroundColor: colors.warningSubtle }]}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path d="M18.84 12.25l1.72-1.71a4.91 4.91 0 00-6.94-6.94l-1.72 1.71M5.17 8l-2.14 2.14a4.91 4.91 0 006.94 6.94l2.14-2.13M2 2l20 20" stroke={colors.warning} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={ss.ashText}>
              <Text style={[type_.body, { color: colors.textPrimary }]}>Disconnect Mono</Text>
              <Text style={[type_.caption, { color: colors.textMeta }]}>Stop automatic sync</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={[ss.ashDivider, { backgroundColor: colors.border }]} />

        {/* Delete */}
        <TouchableOpacity
          style={ss.ashRow}
          onPress={() => action(onDelete)}
          accessibilityRole="button"
          accessibilityLabel="Remove account"
        >
          <View style={[ss.ashIc, { backgroundColor: colors.errorSubtle }]}>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke={colors.error} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View style={ss.ashText}>
            <Text style={[type_.body, { color: colors.error }]}>Remove Account</Text>
            <Text style={[type_.caption, { color: colors.textMeta }]}>Transaction history is preserved</Text>
          </View>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────

interface AccountCardProps {
  account: BankAccount;
  isSyncing: boolean;
  onSync: () => void;
  onMoreActions: () => void;
}

function AccountCard({ account, isSyncing, onSync, onMoreActions }: AccountCardProps) {
  const colors = useTheme();
  const isLinked = account.is_mono_linked;
  const needsReauth = isLinked && account.requires_reauth;

  // Sync status
  type SyncState = 'ok' | 'warn' | 'manual';
  const syncState: SyncState = !isLinked ? 'manual' : needsReauth ? 'warn' : 'ok';
  const syncDotColor =
    syncState === 'ok' ? colors.brandBright :
      syncState === 'warn' ? colors.warning :
        'transparent';

  const syncStatusText =
    syncState === 'manual' ? 'Manual account' :
      syncState === 'warn' ? 'Sync paused · Re-auth needed' :
        `Synced · ${formatLastSynced(account.last_synced_at)}`;

  return (
    <View
      style={[
        ss.card,
        { backgroundColor: colors.white, borderColor: needsReauth ? colors.warning : colors.border },
        shadow.sm,
      ]}
    >
      {/* Card top section */}
      <View style={[ss.cardTop, { borderBottomColor: colors.border }]}>
        {/* Bank info row */}
        <View style={ss.cardRow}>
          <View style={ss.bankInfo}>
            <View style={[ss.bankIc, { backgroundColor: colors.surface }]}>
              <Ionicons
                name={isLinked ? 'business' : 'wallet-outline'}
                size={20}
                color={isLinked ? colors.brand : colors.textMeta}
              />
            </View>
            <View>
              <Text style={[type_.label, { color: colors.textPrimary }]}>{account.institution}</Text>
              <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                {account.account_type}
              </Text>
            </View>
          </View>
          <View
            style={[
              ss.badge,
              isLinked
                ? { backgroundColor: colors.surface, borderColor: colors.borderBrand }
                : { backgroundColor: colors.purpleSubtle, borderColor: colors.purpleBorder },
            ]}
          >
            <Text
              style={[
                ss.badgeText,
                { color: isLinked ? colors.brand : colors.purple },
              ]}
            >
              {isLinked ? 'Mono' : 'Manual'}
            </Text>
          </View>
        </View>

        {/* Balance */}
        <Text style={[ss.balanceAmt, { color: colors.textPrimary }]}>
          {formatNaira(account.balance)}
        </Text>
        {!isLinked && account.balance_as_of && (
          <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2, marginBottom: spacing.sm }]}>
            {formatBalanceDate(account.balance_as_of)}
          </Text>
        )}

        {/* Sync status */}
        <View style={ss.syncStatusRow}>
          {syncState !== 'manual' && (
            <View style={[ss.syncDot, { backgroundColor: syncDotColor }]} />
          )}
          <Text
            style={[
              type_.caption,
              {
                color: syncState === 'warn' ? colors.warning : colors.textMeta,
                fontWeight: syncState === 'warn' ? '600' : '400',
              },
            ]}
          >
            {syncStatusText}
          </Text>
        </View>
      </View>

      {/* Card footer */}
      <View
        style={[
          ss.cardFooter,
          {
            backgroundColor: needsReauth ? colors.warningSubtle : colors.surface,
            borderTopColor: needsReauth ? colors.warningBorder : colors.border,
          },
        ]}
      >
        {needsReauth ? (
          <>
            <Text style={[type_.caption, { color: colors.warningText, flex: 1 }]}>
              Session expired — needs reconnection
            </Text>
            <TouchableOpacity
              style={[ss.footerBtn, { backgroundColor: colors.warning, borderColor: colors.warning }]}
              onPress={() => router.push({ pathname: '/(auth)/link-bank', params: { accountId: account.id } })}
              accessibilityRole="button"
              accessibilityLabel="Reconnect Mono"
            >
              <Text style={[ss.footerBtnTxt, { color: colors.white }]}>Reconnect</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Last sync info */}
            <View style={ss.footerSyncInfo}>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Path d="M23 4v6h-6M1 20v-6h6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={[type_.caption, { color: colors.textMeta }]}>
                {isLinked ? `Last sync: ${formatLastSynced(account.last_synced_at)}` : 'Manual account'}
              </Text>
            </View>

            <View style={ss.footerBtns}>
              {isLinked && (
                <TouchableOpacity
                  style={[ss.footerBtn, { backgroundColor: colors.white, borderColor: colors.border }, isSyncing && ss.footerBtnDisabled]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSync(); }}
                  disabled={isSyncing}
                  accessibilityRole="button"
                  accessibilityLabel="Sync account"
                >
                  {isSyncing ? (
                    <ActivityIndicator size={12} color={colors.brand} />
                  ) : (
                    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                      <Path d="M23 4v6h-6" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M3.51 9a9 9 0 0114.85-3.36L23 10" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  )}
                  <Text style={[ss.footerBtnTxt, { color: colors.textSecondary }]}>
                    {isSyncing ? 'Syncing…' : 'Sync'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[ss.footerBtnMore, { backgroundColor: colors.white, borderColor: colors.border }]}
                onPress={onMoreActions}
                accessibilityRole="button"
                accessibilityLabel="More options"
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Circle cx={12} cy={5} r={1.5} fill={colors.textMeta} />
                  <Circle cx={12} cy={12} r={1.5} fill={colors.textMeta} />
                  <Circle cx={12} cy={19} r={1.5} fill={colors.textMeta} />
                </Svg>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

function AccountsContent() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { confirm } = useToast();
  const { data: accounts = [], isLoading, error, refetch } = useAccounts();
  const syncMutation = useTriggerSync();
  const unlinkMutation = useUnlinkMono();
  const deleteMutation = useDeleteAccount();

  const [refreshing, setRefreshing] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [balanceAccount, setBalanceAccount] = useState<BankAccount | null>(null);
  const [renameAccount, setRenameAccount] = useState<BankAccount | null>(null);
  const [moreAccount, setMoreAccount] = useState<BankAccount | null>(null);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const hasReauthAccount = accounts.some((a) => a.is_mono_linked && a.requires_reauth);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  function handleSync(account: BankAccount) {
    setSyncingId(account.id);
    syncMutation.mutate(account.id, { onSettled: () => setSyncingId(null) });
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
      <View style={[ss.safe, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ flex: 1, marginTop: insets.top + 40 }} color={colors.brand} />
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
          <Text style={[ss.errorText, { color: colors.textSecondary }]}>Could not load accounts.</Text>
          <Text style={[ss.errorSub, { color: colors.textMeta }]}>Pull down to retry.</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[ss.safe, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      {/* ── Header ── */}
      <View
        style={[
          ss.header,
          {
            backgroundColor: colors.white,
            borderBottomColor: colors.border,
            paddingTop: insets.top + spacing.smd,
          },
        ]}
      >
        <Text style={[ss.headerTitle, { color: colors.textPrimary }]}>Accounts</Text>
        <View style={ss.headerActions}>
          <TouchableOpacity
            style={[ss.headerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddSheet(true); }}
            accessibilityRole="button"
            accessibilityLabel="Add manual account"
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5v14M5 12h14" stroke={colors.brand} strokeWidth={2.5} strokeLinecap="round" />
            </Svg>
            <Text style={[ss.headerBtnTxt, { color: colors.brand }]}>Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ss.headerBtn, { backgroundColor: colors.brand, borderColor: colors.brand }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(auth)/link-bank'); }}
            accessibilityRole="button"
            accessibilityLabel="Link bank via Mono"
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[ss.headerBtnTxt, { color: colors.white }]}>Link Bank</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[ss.scroll, accounts.length === 0 && { flex: 1 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
        showsVerticalScrollIndicator={false}
      >
        {accounts.length === 0 ? (
          /* ── Empty state ── */
          <View style={ss.emptyWrap}>
            <View style={[ss.emptyIconWrap, { backgroundColor: colors.surface }]}>
              <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
                <Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke={colors.brand} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M9 22V12h6v10" stroke={colors.brand} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text style={[ss.emptyTitle, { color: colors.textPrimary }]}>No accounts yet</Text>
            <Text style={[type_.body, { color: colors.textMeta, textAlign: 'center', marginBottom: spacing.xxl }]}>
              Add a bank account manually, or link one via Mono to sync transactions automatically.
            </Text>
            <Button variant="green" onPress={() => setShowAddSheet(true)} accessibilityLabel="Add  account manually">
              Add Manually
            </Button>
            <TouchableOpacity
              style={[ss.emptyGhostBtn, { borderColor: colors.border }]}
              onPress={() => router.push('/(auth)/link-bank')}
              accessibilityRole="button"
              accessibilityLabel="Link via Mono"
            >
              <Text style={[type_.label, { color: colors.brand }]}>Link via Mono</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Total Balance Card ── */}
            <View style={[ss.totalCard, { backgroundColor: colors.darkGreen }]}>
              <Text style={[ss.totalLbl, { color: colors.textInverseFaint }]}>Total Balance</Text>
              <Text style={[ss.totalAmt, { color: colors.textInverse }]}>{formatNaira(totalBalance)}</Text>
              <View style={ss.syncNote}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                  <Path d="M23 4v6h-6M1 20v-6h6" stroke={colors.textInverseFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke={colors.textInverseFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={[ss.syncNoteTxt, { color: colors.textInverseFaint }]}>
                  Syncs every 12 AM
                </Text>
              </View>
            </View>

            {/* ── Global re-auth warning banner ── */}
            {hasReauthAccount && (
              <TouchableOpacity
                style={[ss.globalReauthBanner, { backgroundColor: colors.warningSubtle, borderColor: colors.warningBorder }]}
                onPress={() => router.push('/(auth)/link-bank')}
                accessibilityRole="button"
                accessibilityLabel="Fix Mono reconnection"
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={colors.warning} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M12 9v4M12 17h.01" stroke={colors.warning} strokeWidth={2} strokeLinecap="round" />
                </Svg>
                <View style={{ flex: 1 }}>
                  <Text style={[type_.label, { color: colors.warningText }]}>
                    Sync paused on one or more accounts
                  </Text>
                  <Text style={[type_.caption, { color: colors.warningText, marginTop: 2 }]}>
                    Reconnect to resume automatic sync
                  </Text>
                </View>
                <Text style={[type_.label, { color: colors.warning }]}>Fix →</Text>
              </TouchableOpacity>
            )}

            {/* ── Account cards ── */}
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isSyncing={syncingId === account.id}
                onSync={() => handleSync(account)}
                onMoreActions={() => setMoreAccount(account)}
              />
            ))}

            {/* ── Link more prompt card ── */}
            <View style={[ss.linkMoreCard, { backgroundColor: colors.darkGreen }]}>
              {/* Radial glow overlay */}
              <View style={[ss.linkMoreGlow, { backgroundColor: colors.limeGlow }]} />
              <Text style={[ss.linkMoreTitle, { color: colors.textInverse }]}>Got another account?</Text>
              <Text style={[ss.linkMoreSub, { color: colors.textInverseSecondary }]}>
                Link your OPay, Zenith, or Access account for a complete picture of your money.
              </Text>
              <TouchableOpacity
                style={[ss.linkMoreBtn, { backgroundColor: colors.lime }]}
                onPress={() => router.push('/(auth)/link-bank')}
                accessibilityRole="button"
                accessibilityLabel="Link another bank"
              >
                <Text style={[ss.linkMoreBtnTxt, { color: colors.darkGreen }]}>Link Another Bank</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: spacing.xxl + 60 }} />
          </>
        )}
      </ScrollView>

      {/* ── Sheets ── */}
      <AddManualSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />
      <UpdateBalanceSheet
        account={balanceAccount}
        onClose={() => setBalanceAccount(null)}
      />
      <RenameSheet
        account={renameAccount}
        onClose={() => setRenameAccount(null)}
      />
      <MoreActionsSheet
        account={moreAccount}
        onClose={() => setMoreAccount(null)}
        onRename={() => { setMoreAccount(null); setRenameAccount(moreAccount); }}
        onUpdateBalance={() => { setMoreAccount(null); setBalanceAccount(moreAccount); }}
        onUnlink={() => moreAccount && handleUnlink(moreAccount)}
        onDelete={() => moreAccount && handleDelete(moreAccount)}
      />
    </View>
  );
}

export default function AccountsScreen() {
  return (
    <ErrorBoundary>
      <AccountsContent />
    </ErrorBoundary>
  );
}

// ─── Static styles ────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.mdn,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    letterSpacing: -0.3,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  headerBtnTxt: { fontSize: 13, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },

  // Scroll
  scroll: { paddingTop: spacing.smd },

  // Total Balance Card  — matches .tbb-card in HTML
  totalCard: {
    borderRadius: radius.md,
    padding: spacing.mdn,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  totalLbl: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    marginBottom: spacing.xs,
  },
  totalAmt: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    letterSpacing: -1,
  },
  syncNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  syncNoteTxt: { fontSize: 11 },

  // Global re-auth banner  — matches .reauth-banner
  globalReauthBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.smd,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.mdn,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.smd,
  },

  // Account card  — matches .acct-card
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
    marginTop: spacing.smd,
  },
  cardTop: {
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  bankInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.smd },
  bankIc: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badge: {
    borderRadius: radius.xs,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },

  balanceAmt: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    letterSpacing: -1,
    marginBottom: spacing.sm,
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  syncDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },

  // Card footer  — matches .acct-footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.smd,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerSyncInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  footerBtns: { flexDirection: 'row', gap: spacing.xs },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.smd,
    paddingVertical: 5,
  },
  footerBtnDisabled: { opacity: 0.6 },
  footerBtnTxt: { fontSize: 11, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  footerBtnMore: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.xs,
  },

  // Link more card  — matches .link-more-card
  linkMoreCard: {
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.smd,
    padding: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  linkMoreGlow: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  linkMoreTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
    marginBottom: spacing.xs,
  },
  linkMoreSub: {
    fontSize: 12,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  linkMoreBtn: {
    alignSelf: 'flex-start',
    borderRadius: spacing.smd,
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
  },
  linkMoreBtnTxt: { fontSize: 13, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl + spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyGhostBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.full,
    borderWidth: 1,
  },

  // Sheet body
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  inputBlock: {},
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingVertical: spacing.smd,
    alignItems: 'center',
  },

  // More actions sheet  — ash-list pattern
  ashList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  ashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  ashIc: {
    width: 36,
    height: 36,
    borderRadius: spacing.smd,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ashText: { flex: 1 },
  ashDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },

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
