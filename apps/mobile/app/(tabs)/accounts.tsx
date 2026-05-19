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
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useToast } from '@/components/Toast';
import { TourTarget, useTour, type TourStep } from '@/components/tour';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ListRow } from '@/components/ui/ListRow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  useAccounts,
  useAddManualAccount,
  useDeleteAccount,
  useReconcile,
  useSupportedBanks,
  useUpdateAlias,
  useUpdateBalance,
  type AddManualAccountPayload,
} from '@/hooks/useAccounts';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { useTheme } from '@/lib/theme';
import { layout, radius, shadow, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import { StatementAccountNotFoundError, uploadStatement } from '@/services/api';
import { formatNaira } from '@/utils/money';
import type { BankAccount, SupportedBank } from '@monimata/shared-types';

// ─── Bank Picker Sheet ───────────────────────────────────────────────────────

interface BankPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (bank: SupportedBank) => void;
}

function BankPickerSheet({ visible, onClose, onSelect }: BankPickerSheetProps) {
  const colors = useTheme();
  const [search, setSearch] = useState('');
  const { data: banks = [], isLoading } = useSupportedBanks();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...banks].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter((b) => b.name.toLowerCase().includes(q));
  }, [banks, search]);

  function handleClose() {
    setSearch('');
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Select Bank" scrollable={false}>
      {/* Search input */}
      <View style={[bps.searchWrap, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={8} stroke={colors.textTertiary} strokeWidth={2} />
          <Path d="M21 21l-4.35-4.35" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round" />
        </Svg>
        <TextInput
          style={[bps.searchInput, { color: colors.textPrimary }]}
          placeholder="Search banks…"
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoFocus={false}
          accessibilityLabel="Search banks"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M18 6L6 18M6 6l12 12" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ margin: spacing.xl }} color={colors.brand} />
      ) : (
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={[type_.bodyReg, { color: colors.textMeta, textAlign: 'center', padding: spacing.xl }]}>
              No banks match &ldquo;{search}&rdquo;
            </Text>
          ) : (
            filtered.map((bank, i) => (
              <TouchableOpacity
                key={bank.slug}
                style={[
                  bps.row,
                  { borderBottomColor: colors.separator },
                  i < filtered.length - 1 && bps.rowBorder,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSearch('');
                  onSelect(bank);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={bank.name}
              >
                <View style={ss.bankInfo}>
                  <View style={[ss.bankIc, { backgroundColor: colors.surface }]}>
                    <Ionicons name="business-outline" size={type_.bodyXl.fontSize} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type_.body, { color: colors.textPrimary }]}>{bank.name}</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xxs - 1, flexWrap: 'wrap' }}>
                      {bank.channels.map((ch) => (
                        <View key={ch} style={[bps.chip, { backgroundColor: colors.surface }]}>
                          <Text style={[bps.chipTxt, { color: colors.brand }]}>{ch}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                  <Path d="M9 18l6-6-6-6" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const bps = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: layout.avatarMd,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...type_.body,
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.smd,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  chip: {
    paddingHorizontal: spacing.xxs,
    paddingVertical: 1,
    borderRadius: radius.xxs,
  },
  chipTxt: {
    ...type_.labelSm,
    textTransform: 'none',
    letterSpacing: 0,
  },
});

// ── Tour definition ─────────────────────────────────────────────────────

/** Knowledge Hub article that walks users through email-forwarding setup. */
const HUB_EMAIL_SETUP_URL = 'https://moni-mata.ng/hub/email-setup';

const ACCOUNTS_TOUR: TourStep[] = [
  {
    targetId: 'accounts-add-btn',
    title: 'Add an account',
    body: 'Tap here to manually add a bank account and start tracking your balances and transactions.',
    tooltipSide: 'below',
  },
  {
    targetId: 'accounts-total-card',
    title: 'Total balance',
    body: 'Your combined balance across all linked accounts — your full financial picture at a glance.',
    tooltipSide: 'below',
    fallbackFullscreen: true,
  },
  {
    targetId: 'accounts-card-more',
    title: 'Account actions',
    body: 'Tap here to rename, update the balance, upload a bank statement, or remove the account.',
    tooltipSide: 'above',
    fallbackFullscreen: true,
  },
];


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
  const [selectedBank, setSelectedBank] = useState<SupportedBank | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<'SAVINGS' | 'CURRENT'>('SAVINGS');
  const [balance, setBalance] = useState('');

  function reset() {
    setAlias('');
    setSelectedBank(null);
    setAccountNumber('');
    setAccountType('SAVINGS');
    setBalance('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!alias.trim() || !selectedBank || accountNumber.length !== 10) {
      error('Missing details', !selectedBank ? 'Please select a bank.' : 'Please fill in all required fields. Account number must be 10 digits.');
      return;
    }
    const payload: AddManualAccountPayload = {
      alias: alias.trim(),
      institution: selectedBank.name,
      bank_slug: selectedBank.slug,
      account_number: accountNumber.trim(),
      account_type: accountType,
      balance: balance ? Math.round(parseFloat(balance) * 100) : 0,
    };
    addMutation.mutate({ body: payload as never }, { onSuccess: handleClose });
  }

  return (
    <>
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

          {/* Bank selector */}
          <View style={ss.inputBlock}>
            <Text style={[type_.labelSm, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Bank *</Text>
            <TouchableOpacity
              style={[
                ss.bankSelectBtn,
                {
                  borderColor: selectedBank ? colors.brand : colors.border,
                  backgroundColor: colors.cardBg,
                },
              ]}
              onPress={() => setShowBankPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Select bank"
            >
              {selectedBank ? (
                <View style={[ss.bankInfo, { flex: 1 }]}>
                  <View style={[ss.bankIc, { backgroundColor: colors.surface }]}>
                    <Ionicons name="business-outline" size={type_.bodyXl.fontSize} color={colors.brand} />
                  </View>
                  <Text style={[type_.body, { color: colors.textPrimary, flex: 1 }]}>{selectedBank.name}</Text>
                </View>
              ) : (
                <Text style={[type_.body, { color: colors.textTertiary, flex: 1 }]}>Select a bank…</Text>
              )}
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M6 9l6 6 6-6" stroke={selectedBank ? colors.brand : colors.textTertiary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </View>
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

      <BankPickerSheet
        visible={showBankPicker}
        onClose={() => setShowBankPicker(false)}
        onSelect={(bank) => setSelectedBank(bank)}
      />
    </>
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
      {
        params: { path: { account_id: account.id } },
        body: { balance: Math.round(parsed * 100), note: note.trim() || undefined },
      },
      { onSuccess: handleClose },
    );
  }

  return (
    <BottomSheet visible={!!account} onClose={handleClose} title="Update Balance">
      <View style={ss.sheetBody}>
        {account && (
          <Text style={[type_.bodyReg, { color: colors.textMeta, marginBottom: spacing.smd }]}>
            {account.institution} · {account.alias ?? account.account_name}
            {'  '}
            <Text style={[{ color: colors.textPrimary }, ff(700)]}>
              Current: {formatNaira(account.balance)}
            </Text>
          </Text>
        )}
        <AmountInput
          label="New Balance *"
          value={amount}
          onChange={setAmount}
          allowDecimals
          autoFocus
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
      { params: { path: { account_id: account.id } }, body: { alias: alias.trim() } },
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

// ─── Reconcile Sheet ────────────────────────────────────────────────────────

interface ReconcileSheetProps {
  account: BankAccount | null;
  onClose: () => void;
}

function ReconcileSheet({ account, onClose }: ReconcileSheetProps) {
  const colors = useTheme();
  const reconcileMutation = useReconcile();
  const { error } = useToast();
  const [amount, setAmount] = useState('');

  function handleClose() {
    setAmount('');
    onClose();
  }

  function handleSubmit() {
    if (!account) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      error('Invalid amount', 'Please enter a valid balance.');
      return;
    }
    reconcileMutation.mutate(
      {
        params: { path: { account_id: account.id } },
        body: { true_actual_balance: Math.round(parsed * 100) },
      },
      { onSuccess: handleClose },
    );
  }

  return (
    <BottomSheet visible={!!account} onClose={handleClose} title="Reconcile Account">
      <View style={ss.sheetBody}>
        {account && (
          <Text style={[type_.bodyReg, { color: colors.textMeta, marginBottom: spacing.smd }]}>
            {account.institution} · {account.alias ?? account.account_name}
            {'  '}
            <Text style={[{ color: colors.textPrimary }, ff(700)]}>
              Recorded: {formatNaira(account.balance)}
            </Text>
          </Text>
        )}
        <AmountInput
          label="Actual Balance *"
          value={amount}
          onChange={setAmount}
          allowDecimals
          autoFocus
        />
        <View style={[ss.stmtTip, { backgroundColor: colors.infoSubtle ?? colors.surface, borderColor: colors.infoBorder ?? colors.border }]}>
          <Text style={[type_.caption, { color: colors.textMeta, lineHeight: 20 }]}>
            If the actual balance differs from the recorded balance, a reconciliation adjustment transaction will be created automatically.
          </Text>
        </View>
        <Button
          variant="green"
          onPress={handleSubmit}
          disabled={reconcileMutation.isPending}
          loading={reconcileMutation.isPending}
          accessibilityLabel="Reconcile account"
        >
          Reconcile
        </Button>
      </View>
    </BottomSheet>
  );
}

// ─── Upload Statement Sheet ──────────────────────────────────────────────────

type StatementUploadState = 'idle' | 'uploading' | 'done' | 'error';

interface UploadStatementSheetProps {
  account: BankAccount | null;
  onClose: () => void;
}

function UploadStatementSheet({ account, onClose }: UploadStatementSheetProps) {
  const colors = useTheme();
  const { success, error } = useToast();
  const [file, setFile] = useState<{ uri: string; name: string; size?: number } | null>(null);
  const [uploadState, setUploadState] = useState<StatementUploadState>('idle');
  const [progress, setProgress] = useState(0);

  function resetState() {
    setFile(null);
    setUploadState('idle');
    setProgress(0);
  }

  function handleClose() {
    if (uploadState === 'uploading') return;
    resetState();
    onClose();
  }

  async function pickPDF() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size !== undefined && asset.size > 5 * 1024 * 1024) {
      error('File too large', 'Please select a PDF under 5 MB.');
      return;
    }
    setFile({ uri: asset.uri, name: asset.name, size: asset.size ?? undefined });
    setUploadState('idle');
    setProgress(0);
  }

  async function handleUpload() {
    if (!file) return;
    setUploadState('uploading');
    setProgress(0);
    try {
      await uploadStatement(
        { uri: file.uri, mimeType: 'application/pdf', name: file.name },
        (fraction) => { setProgress(Math.min(fraction * 0.9, 0.9)); },
      );
      setProgress(1);
      setUploadState('done');
      success('Statement uploaded!', 'Transactions will appear shortly.');
      setTimeout(() => { resetState(); onClose(); }, 1200);
    } catch (err) {
      setProgress(0);
      setUploadState('error');
      if (err instanceof StatementAccountNotFoundError) {
        error('Account not found', (err as Error).message);
      } else {
        error('Upload failed', (err as Error).message);
      }
    }
  }

  const isUploading = uploadState === 'uploading';
  const isDone = uploadState === 'done';

  return (
    <BottomSheet visible={!!account} onClose={handleClose} title="Upload Statement">
      <View style={ss.sheetBody}>
        {/* Context note */}
        {account && (
          <View style={[ss.stmtNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" stroke={colors.brand} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M13 2v7h7" stroke={colors.brand} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[type_.small, { color: colors.textMeta, flex: 1, lineHeight: 20 }]}>
              The PDF will be matched to your{' '}
              <Text style={[{ color: colors.textPrimary }, ff(600)]}>{account.institution}</Text>{' '}
              account automatically.
            </Text>
          </View>
        )}

        {/* PDF picker button */}
        <TouchableOpacity
          style={[
            ss.stmtPickBtn,
            { borderColor: file ? colors.brand : colors.border, backgroundColor: colors.cardBg },
          ]}
          onPress={pickPDF}
          disabled={isUploading || isDone}
          accessibilityRole="button"
          accessibilityLabel="Select PDF statement"
        >
          <View style={[ss.stmtPickIc, { backgroundColor: file ? colors.surface : colors.surface }]}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={file ? colors.brand : colors.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" stroke={file ? colors.brand : colors.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            {file ? (
              <>
                <Text style={[type_.body, { color: colors.textPrimary }]} numberOfLines={1}>
                  {file.name}
                </Text>
                {file.size !== undefined && (
                  <Text style={[type_.caption, { color: colors.textMeta, marginTop: 1 }]}>
                    {(file.size / 1024).toFixed(1)} KB · PDF
                  </Text>
                )}
              </>
            ) : (
              <Text style={[type_.body, { color: colors.textTertiary }]}>Tap to select a PDF…</Text>
            )}
          </View>
          {file && !isUploading && !isDone && (
            <TouchableOpacity
              onPress={() => { setFile(null); setUploadState('idle'); setProgress(0); }}
              hitSlop={8}
              accessibilityLabel="Remove selected file"
            >
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M18 6L6 18M6 6l12 12" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round" />
              </Svg>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* Progress bar */}
        {(isUploading || isDone) && (
          <ProgressBar progress={progress} state={isDone ? 'ok' : 'brand'} size="sm" animate />
        )}

        <Button
          variant="green"
          onPress={handleUpload}
          disabled={!file || isUploading || isDone}
          loading={isUploading}
          accessibilityLabel="Upload statement"
        >
          {isDone ? 'Uploaded!' : 'Upload Statement'}
        </Button>

        {/* Tip */}
        <View style={[ss.stmtTip, { backgroundColor: colors.infoSubtle ?? colors.surface, borderColor: colors.infoBorder ?? colors.border }]}>
          <Text style={[type_.caption, { color: colors.textMeta, lineHeight: 20 }]}>
            PDF only · max 5 MB. Parsed in the background — transactions appear within a few minutes.
          </Text>
        </View>
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
  onReconcile: () => void;
  onUploadStatement: () => void;
  onDelete: () => void;
}

function MoreActionsSheet({
  account,
  onClose,
  onRename,
  onUpdateBalance,
  onReconcile,
  onUploadStatement,
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
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
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
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke={colors.warning} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          }
          iconBg={colors.warningSubtle}
          title="Update Balance"
          subtitle="Manually set the current balance"
          onPress={() => action(onUpdateBalance)}
          showChevron
        />

        {/* Reconcile */}
        <ListRow
          leftIcon={
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M22 4L12 14.01l-3-3" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          }
          iconBg={colors.surface}
          title="Reconcile"
          subtitle="Confirm actual balance and log adjustment"
          onPress={() => action(onReconcile)}
          showChevron
        />

        {/* Upload Statement */}
        <ListRow
          leftIcon={
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" stroke={colors.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          }
          iconBg={colors.surface}
          title="Upload Statement"
          subtitle="Import all transactions from a PDF"
          onPress={() => action(onUploadStatement)}
          showChevron
        />

        {/* Delete */}
        <ListRow
          leftIcon={
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
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
  showTourTarget?: boolean;
}

function AccountCard({ account, onMoreActions, showTourTarget }: AccountCardProps) {
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
        <View style={ss.footerBtns}>
          <TourTarget id={showTourTarget ? 'accounts-card-more' : `card-more-${account.id}`}>
            <TouchableOpacity
              style={[ss.footerBtnMore, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={onMoreActions}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={5} r={1.5} fill={colors.textMeta} />
                <Circle cx={12} cy={12} r={1.5} fill={colors.textMeta} />
                <Circle cx={12} cy={19} r={1.5} fill={colors.textMeta} />
              </Svg>
            </TouchableOpacity>
          </TourTarget>
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
  const [statementAccount, setStatementAccount] = useState<BankAccount | null>(null);
  const [reconcileAccount, setReconcileAccount] = useState<BankAccount | null>(null);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  const startTourIfUnseen = useTour();
  useFocusEffect(
    useCallback(() => { startTourIfUnseen('accounts', ACCOUNTS_TOUR); }, [startTourIfUnseen]),
  );
  useStatusBarStyle('dark');

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
      onConfirm: () => deleteMutation.mutate({ params: { path: { account_id: account.id } } }),
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
          <TourTarget id="accounts-add-btn">
            <TouchableOpacity
              style={[ss.headerBtn, { backgroundColor: colors.brand, borderColor: colors.brand }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddSheet(true); }}
              accessibilityRole="button"
              accessibilityLabel="Add manual account"
            >
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M12 5v14M5 12h14" stroke={colors.white} strokeWidth={2.5} strokeLinecap="round" />
              </Svg>
              <Text style={[ss.headerBtnTxt, { color: colors.white }]}>Add Account</Text>
            </TouchableOpacity>
          </TourTarget>
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
            <TouchableOpacity
              style={ss.emailFwdBtn}
              onPress={() => Linking.openURL(HUB_EMAIL_SETUP_URL)}
              accessibilityRole="link"
              accessibilityLabel="Set up email forwarding on our website"
            >
              <Ionicons name="mail-outline" size={type_.bodyXl.fontSize} color={colors.brand} />
              <Text style={[ss.emailFwdBtnTxt, { color: colors.brand }]}>Set up email forwarding →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Total Balance Card ── */}
            <TourTarget id="accounts-total-card">
              <View style={[ss.totalCard, { backgroundColor: colors.darkGreen }]}>
                <Text style={[ss.totalLbl, { color: colors.textInverseFaint }]}>Total Balance</Text>
                <Text style={[ss.totalAmt, { color: colors.white }]}>{formatNaira(totalBalance)}</Text>
              </View>
            </TourTarget>

            {/* ── Account cards ── */}
            {accounts.map((account, i) => (
              <AccountCard
                key={account.id}
                account={account}
                onMoreActions={() => setMoreAccount(account)}
                showTourTarget={i === 0}
              />
            ))}

            {/* ── Email forwarding promo ── */}
            <TouchableOpacity
              style={[ss.emailFwdCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
              onPress={() => Linking.openURL(HUB_EMAIL_SETUP_URL)}
              accessibilityRole="link"
              accessibilityLabel="Set up email forwarding to auto-import transactions"
            >
              <View style={[ss.emailFwdIc, { backgroundColor: colors.surface }]}>
                <Ionicons name="mail-outline" size={type_.bodyXl.fontSize} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.emailFwdTitle, { color: colors.textPrimary }]}>Import via email alerts</Text>
                <Text style={[ss.emailFwdSub, { color: colors.textMeta }]}>
                  Forward bank alerts to auto-import transactions. Setup guide on our website.
                </Text>
              </View>
              <Ionicons name="open-outline" size={type_.bodyXl.fontSize} color={colors.textTertiary} />
            </TouchableOpacity>

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
      <UploadStatementSheet
        account={statementAccount}
        onClose={() => setStatementAccount(null)}
      />
      <ReconcileSheet
        account={reconcileAccount}
        onClose={() => setReconcileAccount(null)}
      />
      <MoreActionsSheet
        account={moreAccount}
        onClose={() => setMoreAccount(null)}
        onRename={() => { setMoreAccount(null); setRenameAccount(moreAccount); }}
        onUpdateBalance={() => { setMoreAccount(null); setBalanceAccount(moreAccount); }}
        onReconcile={() => setReconcileAccount(moreAccount)}
        onUploadStatement={() => { setMoreAccount(null); setTimeout(() => setStatementAccount(moreAccount), 220); }}
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
    ...type_.h1,
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
  headerBtnTxt: { ...type_.body },

  // Scroll
  scroll: { paddingTop: spacing.smd },

  // Total Balance Card  — matches .tbb-card in HTML
  totalCard: {
    borderRadius: radius.md,
    padding: spacing.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  totalLbl: {
    ...type_.label,
    letterSpacing: 1.3,
    marginBottom: spacing.md,
  },
  totalAmt: {
    ...type_.display,
    marginBottom: spacing.sm,
  },

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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
    width: layout.avatarMd,
    height: layout.avatarMd,
    borderRadius: radius.smd,
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
  badgeText: { ...type_.labelSm },

  balanceAmt: {
    ...type_.displayMd,
    marginBottom: spacing.sm,
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  syncDot: { width: spacing.xxs, height: spacing.xxs, borderRadius: spacing.xs, flexShrink: 0 },

  // Card footer  — matches .acct-footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.smd,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtns: { flexDirection: 'row', gap: spacing.xs },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xxs,
  },
  footerBtnDisabled: { opacity: 0.6 },
  footerBtnTxt: { ...type_.caption },
  footerBtnMore: {
    width: layout.avatarSm,
    height: layout.avatarSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.xs,
  },

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
    ...type_.h2,
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
  bankSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
  },
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

  // Upload statement sheet
  stmtNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.smd,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd,
  },
  stmtPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    borderStyle: 'dashed',
    padding: spacing.md,
    minHeight: 64,
  },
  stmtPickIc: {
    width: layout.avatarMd,
    height: layout.avatarMd,
    borderRadius: radius.smd,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stmtTip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd,
  },

  // Error state
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorText: { ...type_.h3, textAlign: 'center' },
  errorSub: { ...type_.bodyReg, textAlign: 'center' },

  // Email forwarding entry points
  emailFwdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  emailFwdBtnTxt: { ...type_.body },
  emailFwdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.smd,
  },
  emailFwdIc: {
    width: layout.avatarMd,
    height: layout.avatarMd,
    borderRadius: radius.smd,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emailFwdTitle: { ...type_.body },
  emailFwdSub: { ...type_.caption, lineHeight: 19, marginTop: 2 },
});
