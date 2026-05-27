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
 * Transaction Details screen.
 *
 * Email-parsed/bank transactions: read-only except category + memo.
 * Manual transactions: fully editable (type, amount, narration, date, account, category, memo).
 * Manual transactions only: Delete button.
 *
 * Route: /transaction/[id]
 */
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Modal,
  Platform,
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
import { CategoryPickerSheet } from '@/components/CategoryPickerSheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useCreateRecurringRule, useDeactivateRecurringRule } from '@/hooks/useRecurring';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import {
  useDeleteTransaction,
  useRemoveSplit,
  useTransaction,
  useTransactionSplits,
  useUpdateTransaction,
  type ManualTransactionBody,
} from '@/hooks/useTransactions';
import { GRADIENTS, useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import type { CategoryItem } from '@/types/category';
import { RECURRENCE_OPTIONS } from '@/types/recurring';
import { computeNextDue, formatNaira } from '@/utils/money';
import type { BankAccount, Transaction, TransactionSplit } from '@monimata/shared-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function koboToNairaStr(kobo: number): string {
  return Math.abs(kobo).toString();
}

function formatAmountDisplay(s: string): string {
  const kobo = parseInt(s || '0', 10);
  return new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kobo / 100);
}

function formatTxDatetime(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  );
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useTheme();
  const keyStyle = [ss.numKey, { backgroundColor: colors.cardBg }];
  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const K = (v: string) => (
    <TouchableOpacity key={v} style={keyStyle} onPress={() => {
      tap();
      onChange(value + v);
    }} activeOpacity={0.5} accessibilityRole="button" accessibilityLabel={v}>
      <Text style={[ss.numKeyText, { color: colors.textPrimary }]}>{v}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[ss.numpad, { backgroundColor: colors.border }]}>
      {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row) => (
        <View key={row[0]} style={ss.numRow}>
          {row.map((k) => K(k))}
        </View>
      ))}
      <View style={ss.numRow}>
        <TouchableOpacity style={[keyStyle, { flex: 2 }]} onPress={() => {
          tap();
          onChange(value + '0');
        }} activeOpacity={0.5} accessibilityRole="button" accessibilityLabel="0">
          <Text style={[ss.numKeyText, { color: colors.textPrimary }]}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={keyStyle} onPress={() => { tap(); onChange(value.slice(0, -1)); }}
          activeOpacity={0.5} accessibilityRole="button" accessibilityLabel="Backspace">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2zM18 9l-6 6M12 9l6 6"
              stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Frow ─────────────────────────────────────────────────────────────────────

function Frow({ label, isLast = false, children }: { label: string; isLast?: boolean; children: React.ReactNode }) {
  const colors = useTheme();
  return (
    <View style={[ss.frow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <Text style={[type_.small, { color: colors.textMeta, width: 90 }]}>{label}</Text>
      <View style={ss.frowValue}>{children}</View>
    </View>
  );
}

// ─── DetailRow (read-only) ────────────────────────────────────────────────────

function DetailRow({ label, value, isLast = false }: { label: string; value: string; isLast?: boolean }) {
  const colors = useTheme();
  return (
    <View style={[
      ss.detailRow,
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
    ]}>
      <Text style={[type_.small, { color: colors.textMeta }]}>{label}</Text>
      <Text style={[{ ...type_.small, lineHeight: 19 }, { color: colors.textPrimary, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ─── Generic option picker sheet ─────────────────────────────────────────────

function OptionPickerSheet<T>({
  visible, title, options, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} scrollable={false}>
      <ScrollView style={{ maxHeight: 360 }}>
        {options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={[
              ss.pickRow,
              i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
            ]}
            onPress={() => { onSelect(opt.value); onClose(); }}
            accessibilityRole="button" accessibilityLabel={opt.label}
          >
            <Text style={[type_.body, { color: colors.textPrimary }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Split breakdown card ──────────────────────────────────────────────────

const SPLIT_COLORS = ['#4F6EF7', '#F77F4F', '#4FD1A7', '#F7C84F', '#A44FF7', '#F74F6E', '#4FB8F7', '#7CF74F'];

function SplitBreakdownCard({
  splits,
  categoryMap,
  onRemove,
  isRemoving,
}: {
  splits: TransactionSplit[];
  categoryMap: Map<string, CategoryItem>;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={[ss.splitCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
      {/* Header */}
      <View style={[ss.splitCardHdr, { borderBottomColor: colors.separator }]}>
        <View style={[ss.splitCardHdrLeft]}>
          <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
            <Path d="M16 3h5v5" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M8 3H3v5" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M21 3l-7 7-4-4-7 7" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={[type_.label, { color: colors.textPrimary }]}>Split Breakdown</Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          disabled={isRemoving}
          accessibilityRole="button"
          accessibilityLabel="Remove split"
          hitSlop={8}
        >
          {isRemoving ? (
            <ActivityIndicator color={colors.error} size="small" />
          ) : (
            <Text style={[type_.small, { color: colors.error }]}>Remove</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Split lines */}
      {splits.map((s, i) => {
        const cat = s.category_id ? categoryMap.get(s.category_id) : null;
        const isLast = i === splits.length - 1;
        return (
          <View
            key={s.id}
            style={[
              ss.splitLineRow,
              !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
            ]}
          >
            <View style={[ss.splitDot, { backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length] }]} />
            <View style={{ flex: 1 }}>
              <View style={ss.splitLineMain}>
                <Text style={[type_.body, { color: colors.textPrimary, flex: 1 }]}>
                  {cat ? cat.name : 'Uncategorised'}
                </Text>
                <Text style={[type_.bodyReg, { color: colors.textPrimary }]}>
                  {formatNaira(s.amount)}
                </Text>
              </View>
              {s.memo ? (
                <Text style={[type_.small, { color: colors.textMeta, marginTop: 2 }]}>
                  {s.memo}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Bank transaction hero header ────────────────────────────────────────────
function BankHeroHeader({
  tx,
  onBack,
  onMore,
  insets,
}: {
  tx: Transaction;
  onBack: () => void;
  onMore: () => void;
  insets: { top: number };
}) {
  const colors = useTheme();
  const isDebit = tx.type === 'debit';
  const amountColor = isDebit ? colors.error : colors.success;
  const sign = isDebit ? '−' : '+';
  const gradColors = isDebit
    ? GRADIENTS.expenseHdr
    : GRADIENTS.darkCard;

  return (
    <LinearGradient
      colors={gradColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[ss.heroHdr, { paddingTop: insets.top + 10 }]}
    >
      {/* Nav row */}
      <View style={ss.heroNav}>
        <TouchableOpacity
          style={[ss.frostBtn, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
        >
          <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M12 5l-7 7 7 7" stroke={colors.textInverseHigh} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={[ss.heroNavTitle, { color: colors.textInverseHigh }]}>Transaction Details</Text>
        <TouchableOpacity
          style={[ss.frostBtn, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}
          onPress={onMore}
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={12}
        >
          <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
            <Circle cx={5} cy={12} r={1.2} fill={colors.textInverseHigh} />
            <Circle cx={12} cy={12} r={1.2} fill={colors.textInverseHigh} />
            <Circle cx={19} cy={12} r={1.2} fill={colors.textInverseHigh} />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Amount */}
      <Text style={[ss.heroAmtLg, { color: amountColor }]}>
        {sign}₦{(Math.abs(tx.amount) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
      </Text>

      {/* Narration */}
      <Text style={[ss.heroNarr, { color: colors.textInverseSub }]} numberOfLines={2}>{tx.narration}</Text>

      {/* Chips row */}
      <View style={ss.heroChips}>
        <View style={[ss.heroChip, { backgroundColor: amountColor + '33' }]}>
          <Text style={[ss.heroChipTxt, { color: amountColor }]}>{tx.type.toUpperCase()}</Text>
        </View>
        {tx.source ? (
          <View style={[ss.heroChipGlass, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder }]}>
            <Text style={[ss.heroChipGlassTxt, { color: colors.textInverseMid }]}>{tx.source}</Text>
          </View>
        ) : null}
        {tx.categorization_source === 'llm' ? (
          <View style={[ss.heroChipGlass, { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Ionicons name="sparkles" size={11} color={colors.textInverseMid} />
            <Text style={[ss.heroChipGlassTxt, { color: colors.textInverseMid }]}>AI</Text>
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

// ─── Bank view form (read-only + editable category/memo) ─────────────────────

function BankViewForm({
  tx,
  accounts,
  categoryOptions,
  categoryMap,
  onSave,
  isSaving,
}: {
  tx: Transaction;
  accounts: BankAccount[];
  categoryOptions: { id: string; label: string }[];
  categoryMap: Map<string, CategoryItem>;
  onSave: (patch: { category_id: string | null; memo: string | null }) => void;
  isSaving: boolean;
}) {
  const colors = useTheme();
  const { data: groups = [] } = useCategoryGroups();
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(
    tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
  );
  const [memo, setMemo] = useState(tx.memo ?? '');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const account = accounts.find((a) => a.id === tx.account_id);
  const accountLabel = account
    ? (account.alias ?? `${account.institution} — ${account.account_name}`)
    : undefined;

  useEffect(() => {
    setSelectedCategory(tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null);
  }, [tx.category_id, categoryMap]);

  return (
    <>
      {/* Fixed details card */}
      <View style={[ss.detailCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <DetailRow label="Narration" value={tx.narration} />
        <DetailRow label="Date" value={formatTxDatetime(tx.date)} />
        {accountLabel && <DetailRow label="Account" value={accountLabel} />}
        <DetailRow label="Source" value={tx.source} isLast={!tx.recurrence_id} />
        {tx.recurrence_id && <DetailRow label="Recurring" value="Yes" isLast />}
      </View>

      {/* Editable section: category + memo */}
      <View style={[ss.formCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <Frow label="Category">
          {tx.is_split ? (
            <View style={ss.frowTouchable}>
              <Text style={[{ ...type_.small, lineHeight: 19 }, { color: colors.info, flex: 1 }]}>
                Split
              </Text>
              <Text style={[type_.caption, { color: colors.textMeta }]}>
                Remove split to change
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => setShowCategoryPicker(true)}
              accessibilityRole="button" accessibilityLabel="Select category"
            >
              <Text style={[
                { ...ff(selectedCategory ? 600 : 400), ...type_.small, lineHeight: 19 },
                { color: selectedCategory ? colors.brand : colors.textTertiary, flex: 1 },
              ]}>
                {selectedCategory ? selectedCategory.name : 'Uncategorised'}
              </Text>
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke={selectedCategory ? colors.brand : colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          )}
        </Frow>
        <Frow label="Memo" isLast>
          <TextInput
            style={[ss.frowInput, { color: colors.textPrimary }]}
            value={memo}
            onChangeText={setMemo}
            placeholder="Add a note"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            accessibilityLabel="Transaction memo"
          />
        </Frow>
      </View>

      <Button
        variant="green"
        onPress={() => onSave({ category_id: selectedCategory?.id ?? null, memo: memo.trim() || null })}
        disabled={isSaving}
        loading={isSaving}
        accessibilityLabel="Save changes"
      >
        Save
      </Button>

      <CategoryPickerSheet
        visible={showCategoryPicker}
        groups={groups}
        selected={selectedCategory}
        onSelect={(c) => setSelectedCategory(c)}
        onClose={() => setShowCategoryPicker(false)}
        disableTBB={tx.amount < 0}
      />
    </>
  );
}

// ─── TypeToggle (animated debit/credit pill) ───────────────────────────────

function TypeToggle({
  value,
  onChange,
}: {
  value: 'debit' | 'credit';
  onChange: (v: 'debit' | 'credit') => void;
}) {
  const colors = useTheme();
  const isDebit = value === 'debit';
  const anim = useRef(new Animated.Value(isDebit ? 0 : 1)).current;
  const [pillW, setPillW] = useState(0);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isDebit ? 0 : 1,
      useNativeDriver: false,
      tension: 180,
      friction: 18,
    }).start();
  }, [isDebit, anim]);

  const pillBg = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.error, colors.brand] });
  const debitColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.white, colors.textMeta] });
  const creditColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.textMeta, colors.white] });
  const pillX = anim.interpolate({ inputRange: [0, 1], outputRange: [3, pillW + 3] });

  return (
    <View
      style={[ss.typeToggle, { backgroundColor: colors.surface }]}
      onLayout={(e) => setPillW(e.nativeEvent.layout.width / 2 - 3)}
    >
      {pillW > 0 && (
        <Animated.View
          style={[ss.typePill, { width: pillW, backgroundColor: pillBg, transform: [{ translateX: pillX }] }]}
        />
      )}
      <TouchableOpacity
        style={ss.typeBtn}
        onPress={() => onChange('debit')}
        accessibilityRole="radio"
        accessibilityState={{ checked: isDebit }}
        accessibilityLabel="Debit"
      >
        <Animated.Text style={[ss.typeBtnText, { color: debitColor }]}>Debit (−)</Animated.Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={ss.typeBtn}
        onPress={() => onChange('credit')}
        accessibilityRole="radio"
        accessibilityState={{ checked: !isDebit }}
        accessibilityLabel="Credit"
      >
        <Animated.Text style={[ss.typeBtnText, { color: creditColor }]}>Credit (+)</Animated.Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Manual edit form ─────────────────────────────────────────────────────────

function ManualEditForm({
  tx,
  accounts,
  categoryMap,
  accountOptions,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  amountStr,
  txType,
  onAmountChange: _onAmountChange,
  onTypeChange: _onTypeChange,
  saveRef,
}: {
  tx: Transaction;
  accounts: BankAccount[];
  categoryMap: Map<string, CategoryItem>;
  accountOptions: { value: BankAccount; label: string }[];
  onSave: (patch: Partial<ManualTransactionBody> & { memo?: string | null }) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
  amountStr: string;
  txType: 'debit' | 'credit';
  onAmountChange: (s: string) => void;
  onTypeChange: (t: 'debit' | 'credit') => void;
  saveRef: { current: () => void };
}) {
  const colors = useTheme();
  const { data: groups = [] } = useCategoryGroups();
  const { confirm, actionSheet } = useToast();
  const createRecurring = useCreateRecurringRule();
  const deactivateRecurring = useDeactivateRecurringRule();

  const [narration, setNarration] = useState(tx.narration);
  const [txDatetime, setTxDatetime] = useState(() => new Date(tx.date));
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(
    accounts.find((a) => a.id === tx.account_id) ?? null,
  );
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(
    tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
  );
  const [memo, setMemo] = useState(tx.memo ?? '');
  const [recurrence, setRecurrence] = useState<typeof RECURRENCE_OPTIONS[number] | null>(null);

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dtPickerMode, setDtPickerMode] = useState<'date' | 'time'>('date');

  const recurrenceOptions = useMemo(
    () => RECURRENCE_OPTIONS.map((o) => ({ value: o, label: o.label })),
    [],
  );

  const isDebit = txType === 'debit';

  function handleSave() {
    const koboAmount = parseInt(amountStr || '0', 10);
    if (koboAmount <= 0) return;
    const signedAmount = isDebit ? -koboAmount : koboAmount;
    onSave({
      type: txType,
      amount: signedAmount,
      narration: narration.trim(),
      date: txDatetime.toISOString(),
      account_id: selectedAccount?.id ?? tx.account_id,
      category_id: selectedCategory?.id ?? null,
      memo: memo.trim() || null,
    });
    if (recurrence && !tx.recurrence_id) {
      createRecurring.mutate({
        frequency: recurrence.value,
        interval: recurrence.interval,
        next_due: computeNextDue(txDatetime, recurrence.value, recurrence.interval),
        parent_transaction_id: tx.id,
        template: {
          account_id: selectedAccount?.id ?? tx.account_id,
          amount: signedAmount,
          narration: narration.trim(),
          type: txType,
          category_id: selectedCategory?.id ?? null,
          memo: memo.trim() || null,
        },
      });
    }
  }

  function handleDelete() {
    if (tx.recurrence_id) {
      actionSheet({
        title: 'Delete this transaction?',
        options: [
          {
            label: 'Delete transaction only',
            style: 'destructive',
            onPress: onDelete,
          },
          {
            label: 'Delete and stop recurring',
            style: 'destructive',
            onPress: () => {
              // Deactivate the rule first (local write + queued sync),
              // then delete the transaction (local write + queued sync).
              // The sync queue coalesces both into one push pass.
              deactivateRecurring.mutate(tx.recurrence_id!);
              onDelete();
            },
          },
        ],
      });
    } else {
      confirm({
        title: 'Delete Transaction',
        message: 'This will permanently remove this transaction and its budget impact.',
        confirmText: 'Delete',
        confirmStyle: 'destructive',
        onConfirm: onDelete,
      });
    }
  }

  saveRef.current = handleSave;

  return (
    <>
      {/* Form card */}
      <View style={[ss.formCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <Frow label="What for?">
          <TextInput
            style={[ss.frowInput, { color: colors.textPrimary }]}
            value={narration}
            onChangeText={setNarration}
            placeholder="What was this for?"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            accessibilityLabel="Transaction description"
          />
        </Frow>
        <Frow label="Date & Time">
          <TouchableOpacity
            style={ss.frowTouchable}
            onPress={() => { setDtPickerMode('date'); setShowDatePicker(true); }}
            accessibilityRole="button" accessibilityLabel="Select date and time"
          >
            <Text style={[{ ...type_.small, lineHeight: 19 }, { color: colors.textPrimary, flex: 1 }]}>
              {formatTxDatetime(txDatetime.toISOString())}
            </Text>
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </Frow>
        <Frow label="Account">
          <TouchableOpacity
            style={ss.frowTouchable}
            onPress={() => setShowAccountPicker(true)}
            accessibilityRole="button" accessibilityLabel="Select account"
          >
            <Text
              style={[
                { ...ff(selectedAccount ? 600 : 400), ...type_.small, lineHeight: 19 },
                { color: selectedAccount ? colors.textPrimary : colors.textTertiary, flex: 1 },
              ]}
              numberOfLines={1}
            >
              {selectedAccount
                ? (selectedAccount.alias ?? `${selectedAccount.institution} — ${selectedAccount.account_name}`)
                : 'Select account'}
            </Text>
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </Frow>
        <Frow label="Category">
          {tx.is_split ? (
            <View style={ss.frowTouchable}>
              <Text style={[{ ...type_.small, lineHeight: 19 }, { color: colors.info, flex: 1 }]}>
                Split
              </Text>
              <Text style={[type_.caption, { color: colors.textMeta }]}>
                Remove split to change
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => setShowCategoryPicker(true)}
              accessibilityRole="button" accessibilityLabel="Select category"
            >
              <Text style={[
                { ...ff(selectedCategory ? 600 : 400), ...type_.small, lineHeight: 19 },
                { color: selectedCategory ? colors.brand : colors.textTertiary, flex: 1 },
              ]}>
                {selectedCategory ? selectedCategory.name : 'Optional'}
              </Text>
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke={selectedCategory ? colors.brand : colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          )}
        </Frow>
        <Frow label="Memo">
          <TextInput
            style={[ss.frowInput, { color: colors.textPrimary }]}
            value={memo}
            onChangeText={setMemo}
            placeholder="Optional note"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            accessibilityLabel="Optional memo"
          />
        </Frow>

        {/* Recurring section */}
        {tx.recurrence_id ? (
          <Frow label="Repeats" isLast>
            <View style={[ss.recurBadge, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={[type_.small, { color: colors.brand }]}>↻ Recurring</Text>
            </View>
            <TouchableOpacity
              style={[ss.stopBtn, { borderColor: colors.error, marginLeft: spacing.sm }]}
              onPress={() => {
                confirm({
                  title: 'Stop repeating?',
                  message: 'Future transactions in this series will no longer be created.',
                  confirmText: 'Stop',
                  confirmStyle: 'destructive',
                  onConfirm: () => deactivateRecurring.mutate(tx.recurrence_id!),
                });
              }}
              accessibilityRole="button" accessibilityLabel="Stop recurring"
            >
              <Text style={[type_.caption, { color: colors.error }]}>Stop</Text>
            </TouchableOpacity>
          </Frow>
        ) : (
          <Frow label="Repeats" isLast>
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => setShowRecurrencePicker(true)}
              accessibilityRole="button" accessibilityLabel="Select recurrence"
            >
              <Text style={[
                { ...ff(recurrence ? 600 : 400), ...type_.small, lineHeight: 19 },
                { color: recurrence ? colors.textPrimary : colors.textTertiary, flex: 1 },
              ]}>
                {recurrence ? recurrence.label : 'Never'}
              </Text>
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </Frow>
        )}
      </View>

      <TouchableOpacity
        style={[ss.deleteBtn, { borderColor: colors.error }, isDeleting && { opacity: 0.6 }]}
        onPress={handleDelete}
        disabled={isDeleting}
        accessibilityRole="button"
        accessibilityLabel="Delete transaction"
      >
        {isDeleting ? (
          <ActivityIndicator color={colors.error} />
        ) : (
          <Text style={[type_.label, { color: colors.error }]}>Delete transaction</Text>
        )}
      </TouchableOpacity>

      {/* DateTimePicker */}
      {showDatePicker && (
        Platform.OS === 'ios' ? (
          <Modal visible transparent animationType="fade">
            <TouchableOpacity style={[ss.dtBackdrop, { backgroundColor: colors.overlayNeutral }]} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
            <View style={[ss.dtSheet, { backgroundColor: colors.cardBg }]}>
              <DateTimePicker
                value={txDatetime}
                mode="datetime"
                display="spinner"
                onChange={(_e: DateTimePickerEvent, d?: Date) => d && setTxDatetime(d)}
                style={{ alignSelf: 'stretch' }}
              />
              <TouchableOpacity
                style={[ss.dtDoneBtn, { backgroundColor: colors.brand }]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={[type_.label, { color: colors.white }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={txDatetime}
            mode={dtPickerMode}
            display="default"
            onChange={(e: DateTimePickerEvent, selected?: Date) => {
              setShowDatePicker(false);
              if (e.type !== 'set' || !selected) return;
              const next = new Date(txDatetime);
              if (dtPickerMode === 'date') {
                next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                setTxDatetime(next);
                setDtPickerMode('time');
                setShowDatePicker(true);
              } else {
                next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                setTxDatetime(next);
              }
            }}
          />
        )
      )}

      {/* Pickers */}
      <OptionPickerSheet
        visible={showAccountPicker}
        title="Select Account"
        options={accountOptions}
        onSelect={(a) => setSelectedAccount(a)}
        onClose={() => setShowAccountPicker(false)}
      />
      <CategoryPickerSheet
        visible={showCategoryPicker}
        groups={groups}
        selected={selectedCategory}
        onSelect={(c) => setSelectedCategory(c)}
        onClose={() => setShowCategoryPicker(false)}
        disableTBB={txType === 'debit'}
      />
      {!tx.recurrence_id && (
        <OptionPickerSheet
          visible={showRecurrencePicker}
          title="Repeats"
          options={recurrenceOptions}
          onSelect={(o) => setRecurrence(o)}
          onClose={() => setShowRecurrencePicker(false)}
        />
      )}
    </>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TransactionDetailsScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: tx, isLoading } = useTransaction(id);
  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useCategoryGroups();
  const update = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const splits = useTransactionSplits(id, tx?.is_split ?? false);
  const removeSplit = useRemoveSplit();
  const [showActions, setShowActions] = useState(false);

  useStatusBarStyle("dark")

  const categoryMap = useMemo(() => {
    const m = new Map<string, CategoryItem>();
    groups.forEach((g) => g.categories.forEach((c) => m.set(c.id, c)));
    return m;
  }, [groups]);

  const categoryOptions = useMemo(
    () => groups.flatMap((g) => g.categories.map((c) => ({ id: c.id, label: `${g.name} › ${c.name}` }))),
    [groups],
  );

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a, label: a.alias ?? `${a.institution} — ${a.account_name}` })),
    [accounts],
  );

  // ── Manual edit overlay state ──
  const [manualAmountStr, setManualAmountStr] = useState('0');
  const [manualTxType, setManualTxType] = useState<'debit' | 'credit'>('debit');
  const saveRef = useRef<() => void>(() => { });
  const [numpadVisible, setNumpadVisible] = useState(false);
  const [numpadHeight, setNumpadHeight] = useState(300);
  const numpadAnim = useRef(new Animated.Value(0)).current;
  const caretOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (tx && tx.source !== 'statement') {
      setManualTxType(tx.type as 'debit' | 'credit');
      setManualAmountStr(koboToNairaStr(tx.amount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx?.id]);

  useEffect(() => {
    if (!numpadVisible) { caretOpacity.setValue(1); return; }
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(caretOpacity, { toValue: 0, duration: 530, useNativeDriver: true }),
        Animated.timing(caretOpacity, { toValue: 1, duration: 530, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [numpadVisible, caretOpacity]);

  useEffect(() => {
    if (!numpadVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissNumpad();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numpadVisible]);

  function showNumpad() {
    setNumpadVisible(true);
    Animated.spring(numpadAnim, { toValue: 1, useNativeDriver: true, tension: 220, friction: 26 }).start();
  }
  function dismissNumpad() {
    setNumpadVisible(false);
    Animated.spring(numpadAnim, { toValue: 0, useNativeDriver: true, tension: 220, friction: 26 }).start();
  }

  function handleSave(patch: Parameters<typeof update.mutate>[0]['body']) {
    update.mutate({ txId: id, body: patch }, { onSuccess: () => router.back() });
  }
  function handleDelete() {
    deleteTx.mutate(id, { onSuccess: () => router.back() });
  }

  if (isLoading) {
    return (
      <View style={[ss.safe, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.brand} />
      </View>
    );
  }

  if (!tx) {
    return (
      <View style={[ss.safe, { backgroundColor: colors.background }]}>
        <View style={[ss.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={[ss.backBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.back()}
            accessibilityRole="button" accessibilityLabel="Go back"
          >
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke={colors.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[type_.h3, { color: colors.textPrimary }]}>Transaction</Text>
          <View style={ss.backBtn} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[type_.small, { color: colors.textTertiary }]}>Transaction not found.</Text>
        </View>
      </View>
    );
  }

  const isManual = tx.source !== 'statement';
  const manualAmountColor = manualTxType === 'debit' ? colors.error : colors.success;
  const fabRestBottom = insets.bottom + spacing.md;
  const numpadTranslateY = numpadAnim.interpolate({ inputRange: [0, 1], outputRange: [numpadHeight, 0] });
  const fabTranslateY = numpadAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -(numpadHeight + spacing.sm - fabRestBottom)] });

  return (
    <View style={[ss.safe, { backgroundColor: colors.background }]}>
      <StatusBar style={tx.source !== 'statement' ? 'dark' : 'light'} />
      {/* ── Header: white for manual, dark gradient hero for bank ── */}
      {tx.source !== 'statement' ? (
        <View style={[ss.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={[ss.backBtn, { backgroundColor: colors.surface }]}
            onPress={() => { if (numpadVisible) { dismissNumpad(); return; } router.back(); }}
            accessibilityRole="button" accessibilityLabel="Go back"
          >
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke={colors.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[type_.h1, { color: colors.textPrimary }]}>Manual Transaction</Text>
          <TouchableOpacity
            style={[ss.backBtn, { backgroundColor: colors.surface }]}
            onPress={() => setShowActions(true)}
            accessibilityRole="button"
            accessibilityLabel="More options"
            hitSlop={12}
          >
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Circle cx={5} cy={12} r={1.2} fill={colors.textSecondary} />
              <Circle cx={12} cy={12} r={1.2} fill={colors.textSecondary} />
              <Circle cx={19} cy={12} r={1.2} fill={colors.textSecondary} />
            </Svg>
          </TouchableOpacity>
        </View>
      ) : (
        <BankHeroHeader
          tx={tx}
          onBack={() => router.back()}
          onMore={() => setShowActions(true)}
          insets={insets}
        />
      )}

      {/* ── Manual: sticky type toggle + amount ── */}
      {isManual && (
        <>
          <View style={[ss.typeToggleWrap, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
            <TypeToggle value={manualTxType} onChange={setManualTxType} />
          </View>
          <TouchableOpacity
            style={[ss.amtCard, { backgroundColor: manualTxType === 'debit' ? colors.errorSubtle : colors.successSubtle, borderColor: colors.border }]}
            onPress={showNumpad}
            activeOpacity={0.85}
          >
            <View style={ss.amtRow}>
              <Text style={[ss.amtSym, { color: manualAmountColor }]}>₦</Text>
              <Text style={[ss.amtNum, { color: manualAmountColor }]}>{formatAmountDisplay(manualAmountStr)}</Text>
              {numpadVisible && (
                <Animated.View style={[ss.caret, { backgroundColor: manualAmountColor, opacity: caretOpacity }]} />
              )}
            </View>
            <Text style={[type_.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
              {numpadVisible ? 'Tap elsewhere to dismiss' : 'Tap to edit amount'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Content ── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={[
          ss.scrollContent,
          isManual ? { paddingBottom: numpadHeight + insets.bottom + layout.btnHeight + spacing.xl } : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={isManual ? dismissNumpad : undefined}
      >
        {tx.source !== 'statement' ? (
          <ManualEditForm
            tx={tx}
            accounts={accounts}
            categoryMap={categoryMap}
            accountOptions={accountOptions}
            onSave={handleSave}
            onDelete={handleDelete}
            isSaving={update.isPending}
            isDeleting={deleteTx.isPending}
            amountStr={manualAmountStr}
            txType={manualTxType}
            onAmountChange={setManualAmountStr}
            onTypeChange={setManualTxType}
            saveRef={saveRef}
          />
        ) : (
          <BankViewForm
            tx={tx}
            accounts={accounts}
            categoryOptions={categoryOptions}
            categoryMap={categoryMap}
            onSave={handleSave}
            isSaving={update.isPending}
          />
        )}
        {tx.is_split && splits.data && splits.data.length > 0 && (
          <SplitBreakdownCard
            splits={splits.data}
            categoryMap={categoryMap}
            onRemove={() => removeSplit.mutate(id, { onSuccess: () => router.back() })}
            isRemoving={removeSplit.isPending}
          />
        )}
      </ScrollView>

      {/* ── Actions sheet ── */}
      <BottomSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        title="Transaction Actions"
        scrollable={false}
      >
        {/* Split */}
        <TouchableOpacity
          style={[ss.ashRow, { borderBottomColor: colors.separator }]}
          onPress={() => {
            setShowActions(false);
            router.push(`/split-transaction?id=${id}` as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Split transaction"
        >
          <View style={[ss.ashIc, { backgroundColor: colors.infoSubtle }]}>
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M16 3h5v5" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M8 3H3v5" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M21 3l-7 7-4-4-7 7" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View style={ss.ashText}>
            <Text style={[ss.ashName, { color: colors.textPrimary }]}>Split Transaction</Text>
            <Text style={[ss.ashDesc, { color: colors.textMeta }]}>Divide across multiple categories</Text>
          </View>
          <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
            <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </BottomSheet>

      {/* ── Manual: FAB Save + Numpad panel ── */}
      {isManual && (
        <>
          <Animated.View
            style={[ss.fabWrap, { bottom: fabRestBottom }, { transform: [{ translateY: fabTranslateY }] }]}
          >
            <Button
              variant="green"
              onPress={() => saveRef.current()}
              disabled={parseInt(manualAmountStr || '0', 10) <= 0 || update.isPending}
              loading={update.isPending}
              fullWidth={false}
              style={{ opacity: 1, paddingHorizontal: spacing.xxl }}
              accessibilityLabel="Save changes"
            >
              Save
            </Button>
          </Animated.View>
          <Animated.View
            style={[ss.numpadPanel, { backgroundColor: colors.cardBg, borderTopColor: colors.border, paddingBottom: insets.bottom }, { transform: [{ translateY: numpadTranslateY }] }]}
            onLayout={(e) => setNumpadHeight(e.nativeEvent.layout.height)}
          >
            <Numpad value={manualAmountStr} onChange={setManualAmountStr} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── Static styles ────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.mdn,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: layout.iconBtnSize, height: layout.iconBtnSize, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  // Action sheet rows
  ashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdn,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ashIc: { width: layout.iconBtnSize, height: layout.iconBtnSize, borderRadius: radius.smd, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ashText: { flex: 1 },
  ashName: { ...type_.body },
  ashDesc: { ...type_.small, marginTop: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  // Hero card (bank view) — now replaced by BankHeroHeader gradient
  heroHdr: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  heroNavTitle: { ...type_.h1 },
  frostBtn: {
    width: layout.iconBtnSize,
    height: layout.iconBtnSize,
    borderRadius: radius.smd,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmtLg: { ...type_.displayHero, marginBottom: spacing.sm },
  heroNarr: { ...type_.mono, marginBottom: spacing.md },
  heroChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  heroChip: {
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  heroChipTxt: { ...type_.label },
  heroChipGlass: {
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroChipGlassTxt: { ...type_.caption },
  // kept for typeBadge usage in any remaining manual form badges
  typeBadge: { paddingHorizontal: spacing.smd, paddingVertical: spacing.xs, borderRadius: radius.full },
  typeBadgeText: { ...type_.label },
  // Detail card (bank view)
  detailCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  // Form card
  formCard: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  frow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    minHeight: layout.rowMinHeight + spacing.xs,
  },
  frowTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  frowInput: { flex: 1, ...type_.bodyReg, padding: 0 },
  frowValue: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  // Type toggle
  typeToggle: { flexDirection: 'row', borderRadius: radius.sm + 1, padding: spacing.xxs, overflow: 'hidden' },
  typePill: { position: 'absolute', top: spacing.xxs, bottom: spacing.xxs, borderRadius: spacing.smd },
  typeBtn: { flex: 1, height: layout.avatarSm + spacing.xxs, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  typeBtnText: { ...type_.btnSm },
  // Amount display (manual edit)
  amtCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  amtRow: { flexDirection: 'row', alignItems: 'flex-start' },
  amtSym: { ...type_.displaySm, lineHeight: layout.btnHeight, marginRight: 2 },
  amtNum: { ...type_.displayXl },
  // Recurring badge
  recurBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.xs, flex: 1 },
  stopBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.xs, borderWidth: 1.5 },
  // Delete button
  deleteBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.mdn,
    alignItems: 'center',
  },
  caret: { width: 2, height: layout.btnHeight, borderRadius: 1, marginLeft: 2 },
  typeToggleWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.mdn, borderBottomWidth: StyleSheet.hairlineWidth },
  fabWrap: { position: 'absolute', right: spacing.xl, zIndex: 20 },
  numpadPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  // Numpad
  numpad: { borderRadius: radius.md, overflow: 'hidden', gap: 1 },
  numRow: { flexDirection: 'row', gap: 1 },
  numKey: { flex: 1, height: layout.btnHeightSm, alignItems: 'center', justifyContent: 'center' },
  numKeyText: { ...type_.numpad },
  // Pickers
  pickGroupHdr: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xxs },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.mdn },
  tbbBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  // DatePicker
  dtBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  dtSheet: { paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  dtDoneBtn: { margin: spacing.lg, paddingVertical: spacing.mdn, borderRadius: radius.sm, alignItems: 'center' },
  // Split breakdown card
  splitCard: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  splitCardHdr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdn,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splitCardHdrLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdn,
  },
  splitDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  splitLineMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});