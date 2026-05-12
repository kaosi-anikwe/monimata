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
 * Accounts tab — manage bank accounts (manual entry).
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
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

import { useToast } from '@/components/Toast';
import { useTour, type TourStep } from '@/components/tour';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { Input } from '@/components/ui/Input';
import { ListRow } from '@/components/ui/ListRow';
import {
  useAccounts,
  useAddManualAccount,
  useDeleteAccount,
  useUpdateAlias,
  useUpdateBalance,
  type AddManualAccountPayload,
} from '@/hooks/useAccounts';
import { useTheme } from '@/lib/theme';
import { radius, shadow, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import type { BankAccount } from '@/types/account';
import { formatNaira } from '@/utils/money';

// ── Tour definition ─────────────────────────────────────────────────────

const ACCOUNTS_TOUR: TourStep[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
                  { borderColor: colors.border, backgroundColor: colors.cardBg },
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
  onDelete: () => void;
}

function MoreActionsSheet({
  account,
  onClose,
  onRename,
  onUpdateBalance,
  onDelete,
}: MoreActionsSheetProps) {
  const colors = useTheme();
  if (!account) return null;

  function action(fn: () => void) {
    onClose();
    // brief delay so sheet closes before any confirm modal opens
    setTimeout(fn, 220);
  }

  return (
    <BottomSheet visible={!!account} onClose={onClose} title={account.alias ?? account.account_name}>
      <View style={ss.ashList}>
        {/* Rename */}
        <ListRow
          leftIcon={
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          }
          iconBg={colors.surface}
          title="Rename"
          subtitle="Change the display name"
          onPress={() => action(onRename)}
          showChevron
        />

        {/* Update Balance */}
        <ListRow
          leftIcon={
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke={colors.warning} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          }
          iconBg={colors.warningSubtle}
          title="Update Balance"
          subtitle="Manually set the current balance"
          onPress={() => action(onUpdateBalance)}
          showChevron
        />

        <Divider verticalMargin={spacing.xs} />

        {/* Delete */}
        <ListRow
          leftIcon={
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke={colors.error} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          }
          iconBg={colors.errorSubtle}
          title="Remove Account"
          titleStyle={{ color: colors.error }}
          subtitle="Transaction history is preserved"
          onPress={() => action(onDelete)}
          showChevron
        />
      </View>
    </BottomSheet>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────

interface AccountCardProps {
  account: BankAccount;
  onMoreActions: () => void;
}

function AccountCard({ account, onMoreActions }: AccountCardProps) {
  const colors = useTheme();

  return (
    <View
      style={[
        ss.card,
        { backgroundColor: colors.cardBg, borderColor: colors.border },
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
                name="wallet-outline"
                size={20}
                color={colors.textMeta}
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
              { backgroundColor: colors.purpleSubtle, borderColor: colors.purpleBorder },
            ]}
          >
            <Text style={[ss.badgeText, { color: colors.purple }]}>Manual</Text>
          </View>
        </View>

        {/* Balance */}
        <Text style={[ss.balanceAmt, { color: colors.textPrimary }]}>
          {formatNaira(account.balance)}
        </Text>
        {account.balance_as_of && (
          <Text style={[type_.caption, { color: colors.textMeta, marginTop: 2, marginBottom: spacing.sm }]}>
            {formatBalanceDate(account.balance_as_of)}
          </Text>
        )}

        {/* Status */}
        <View style={ss.syncStatusRow}>
          <Text style={[type_.caption, { color: colors.textMeta }]}>Manual account</Text>
        </View>
      </View>

      {/* Card footer */}
      <View
        style={[
          ss.cardFooter,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={ss.footerSyncInfo}>
          <Text style={[type_.caption, { color: colors.textMeta }]}>
            {account.balance_as_of
              ? `Updated: ${formatBalanceDate(account.balance_as_of)}`
              : 'Add transactions manually or via email alerts'}
          </Text>
        </View>
        <View style={ss.footerBtns}>
          <TouchableOpacity
            style={[ss.footerBtnMore, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
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
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AccountsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { confirm } = useToast();
  const { data: accounts = [], isLoading, error, refetch } = useAccounts();
  const deleteMutation = useDeleteAccount();

  const [refreshing, setRefreshing] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [balanceAccount, setBalanceAccount] = useState<BankAccount | null>(null);
  const [renameAccount, setRenameAccount] = useState<BankAccount | null>(null);
  const [moreAccount, setMoreAccount] = useState<BankAccount | null>(null);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  const startTourIfUnseen = useTour();
  useFocusEffect(
    useCallback(() => { startTourIfUnseen('accounts', ACCOUNTS_TOUR); }, [startTourIfUnseen]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
            backgroundColor: colors.cardBg,
            borderBottomColor: colors.border,
            paddingTop: insets.top + spacing.smd,
          },
        ]}
      >
        <Text style={[ss.headerTitle, { color: colors.textPrimary }]}>Accounts</Text>
        <View style={ss.headerActions}>
          <TouchableOpacity
            style={[ss.headerBtn, { backgroundColor: colors.brand, borderColor: colors.brand }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddSheet(true); }}
            accessibilityRole="button"
            accessibilityLabel="Add manual account"
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5v14M5 12h14" stroke={colors.white} strokeWidth={2.5} strokeLinecap="round" />
            </Svg>
            <Text style={[ss.headerBtnTxt, { color: colors.white }]}>Add Account</Text>
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
              Add your first bank account to start tracking your money.
            </Text>
            <Button variant="green" onPress={() => setShowAddSheet(true)} accessibilityLabel="Add account manually">
              Add Account
            </Button>
          </View>
        ) : (
          <>
            {/* ── Total Balance Card ── */}
            <View style={[ss.totalCard, { backgroundColor: colors.darkGreen }]}>
              <Text style={[ss.totalLbl, { color: colors.textInverseFaint }]}>Total Balance</Text>
              <Text style={[ss.totalAmt, { color: colors.white }]}>{formatNaira(totalBalance)}</Text>
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

            {/* ── Account cards ── */}
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onMoreActions={() => setMoreAccount(account)}
              />
            ))}

            {/* ── Add more prompt card ── */}
            <View style={[ss.linkMoreCard, { backgroundColor: colors.darkGreen }]}>
              {/* Radial glow overlay */}
              <View style={[ss.linkMoreGlow, { backgroundColor: colors.limeGlow }]} />
              <Text style={[ss.linkMoreTitle, { color: colors.textInverse }]}>Got another account?</Text>
              <Text style={[ss.linkMoreSub, { color: colors.textInverseSecondary }]}>
                Add your OPay, Zenith, or Access account for a complete picture of your money.
              </Text>
              <TouchableOpacity
                style={[ss.linkMoreBtn, { backgroundColor: colors.lime }]}
                onPress={() => setShowAddSheet(true)}
                accessibilityRole="button"
                accessibilityLabel="Add another account"
              >
                <Text style={[ss.linkMoreBtnTxt, { color: colors.darkGreen }]}>Add Another Account</Text>
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
        onDelete={() => moreAccount && handleDelete(moreAccount)}
      />
    </View>
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
  ashList: { paddingBottom: spacing.xxxl },

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
