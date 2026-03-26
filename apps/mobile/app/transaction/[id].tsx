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
 * Mono/bank transactions: read-only except category + memo.
 * Manual transactions: fully editable (type, amount, narration, date, account, category, memo).
 * Manual transactions only: Delete button.
 *
 * Route: /transaction/[id]
 */
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { type_ } from '@/lib/typography';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/Button';
import { GRADIENTS, useTheme } from '@/lib/theme';
import { useAccounts } from '@/hooks/useAccounts';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCategoryGroups } from '@/hooks/useCategories';
import type { CategoryGroup, CategoryItem } from '@/types/category';
import {
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
  type ManualTransactionBody,
} from '@/hooks/useTransactions';
import { radius, spacing } from '@/lib/tokens';
import type { BankAccount } from '@/types/account';
import { RECURRENCE_OPTIONS } from '@/types/recurring';
import type { Transaction } from '@/types/transaction';
import { computeNextDue, nairaStringToKobo } from '@/utils/money';
import { useCreateRecurringRule, useDeactivateRecurringRule } from '@/hooks/useRecurring';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function koboToNairaStr(kobo: number): string {
  return (Math.abs(kobo) / 100).toFixed(0);
}

function formatAmountDisplay(s: string): string {
  if (!s) return '0';
  if (s.includes('.')) {
    const [intPart, decPart] = s.split('.');
    const int = parseInt(intPart || '0', 10);
    return `${new Intl.NumberFormat('en-NG').format(int)}.${decPart}`;
  }
  const int = parseInt(s, 10);
  return isNaN(int) ? '0' : new Intl.NumberFormat('en-NG').format(int);
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
  const K = (v: string) => (
    <TouchableOpacity key={v} style={keyStyle} onPress={() => {
      if (value === '0') { onChange(v); return; }
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
          if (value === '0') return;
          onChange(value + '0');
        }} activeOpacity={0.5} accessibilityRole="button" accessibilityLabel="0">
          <Text style={[ss.numKeyText, { color: colors.textPrimary }]}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={keyStyle} onPress={() => onChange(value.slice(0, -1) || '0')}
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
      <Text style={[type_.small, { color: colors.textMeta, fontWeight: '500', width: 90 }]}>{label}</Text>
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
      <Text style={[type_.small, { color: colors.textMeta, fontWeight: '500' }]}>{label}</Text>
      <Text style={[type_.small, { color: colors.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

// ─── Category picker sheet ────────────────────────────────────────────────────

function CategoryPickerSheet({
  visible, groups, selected, onSelect, onClose,
}: {
  visible: boolean;
  groups: CategoryGroup[];
  selected: CategoryItem | null;
  onSelect: (item: CategoryItem | null) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Category" scrollable={false}>
      <ScrollView style={{ maxHeight: 420 }}>
        <TouchableOpacity
          style={[ss.pickRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}
          onPress={() => { onSelect(null); onClose(); }}
          accessibilityRole="button" accessibilityLabel="No category"
        >
          <Text style={[type_.body, { color: colors.textMeta, fontStyle: 'italic' }]}>No category</Text>
          {!selected && (
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Polyline points="20 6 9 17 4 12" stroke={colors.brand} strokeWidth={2.5} strokeLinecap="round" />
            </Svg>
          )}
        </TouchableOpacity>
        {groups.map((g) => (
          <View key={g.name}>
            <View style={[ss.pickGroupHdr, { backgroundColor: colors.surface }]}>
              <Text style={[type_.labelSm, { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 1.2 }]}>{g.name}</Text>
            </View>
            {g.categories.map((cat, i) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  ss.pickRow,
                  i < g.categories.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
                ]}
                onPress={() => { onSelect(cat); onClose(); }}
                accessibilityRole="button" accessibilityLabel={cat.name}
              >
                <Text style={[type_.body, { color: colors.textPrimary, flex: 1 }]}>{cat.name}</Text>
                {selected?.id === cat.id && (
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Polyline points="20 6 9 17 4 12" stroke={colors.brand} strokeWidth={2.5} strokeLinecap="round" />
                  </Svg>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
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
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
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
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
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
      </View>
    </LinearGradient>
  );
}

// ─── Bank view form (read-only + editable category/memo) ─────────────────────

function BankViewForm({
  tx,
  categoryOptions,
  categoryMap,
  onSave,
  isSaving,
}: {
  tx: Transaction;
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

  useEffect(() => {
    setSelectedCategory(tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null);
  }, [tx.category_id, categoryMap]);

  return (
    <>
      {/* Fixed details card */}
      <View style={[ss.detailCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <DetailRow label="Narration" value={tx.narration} />
        <DetailRow label="Date" value={formatTxDatetime(tx.date)} />
        <DetailRow label="Source" value={tx.source} isLast={!tx.recurrence_id} />
        {tx.recurrence_id && <DetailRow label="Recurring" value="Yes" isLast />}
      </View>

      {/* Editable section: category + memo */}
      <View style={[ss.formCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
        <Frow label="Category">
          <TouchableOpacity
            style={ss.frowTouchable}
            onPress={() => setShowCategoryPicker(true)}
            accessibilityRole="button" accessibilityLabel="Select category"
          >
            <Text style={[type_.small, {
              color: selectedCategory ? colors.brand : colors.textTertiary,
              fontWeight: selectedCategory ? '600' : '400',
              flex: 1,
            }]}>
              {selectedCategory ? selectedCategory.name : 'Uncategorised'}
            </Text>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke={selectedCategory ? colors.brand : colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
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
}: {
  tx: Transaction;
  accounts: BankAccount[];
  categoryMap: Map<string, CategoryItem>;
  accountOptions: { value: BankAccount; label: string }[];
  onSave: (patch: Partial<ManualTransactionBody> & { memo?: string | null }) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const colors = useTheme();
  const { data: groups = [] } = useCategoryGroups();
  const { confirm } = useToast();
  const createRecurring = useCreateRecurringRule();
  const deactivateRecurring = useDeactivateRecurringRule();

  const [txType, setTxType] = useState<'debit' | 'credit'>(tx.type);
  const [amountStr, setAmountStr] = useState(koboToNairaStr(tx.amount));
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
  const amountColor = isDebit ? colors.error : colors.success;
  const amountBg = isDebit ? colors.errorSubtle : colors.successSubtle;

  function handleSave() {
    const koboAmount = nairaStringToKobo(amountStr);
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
    confirm({
      title: 'Delete Transaction',
      message: 'This will permanently remove this transaction and its budget impact.',
      confirmText: 'Delete',
      confirmStyle: 'destructive',
      onConfirm: onDelete,
    });
  }

  return (
    <>
      {/* Type toggle */}
      <TypeToggle value={txType} onChange={setTxType} />

      {/* Amount display */}
      <View style={[ss.amtCard, { backgroundColor: amountBg, borderColor: colors.border }]}>
        <View style={ss.amtRow}>
          <Text style={[ss.amtSym, { color: amountColor }]}>₦</Text>
          <Text style={[ss.amtNum, { color: amountColor }]}>{formatAmountDisplay(amountStr)}</Text>
        </View>
      </View>

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
            <Text style={[type_.small, { color: colors.textPrimary, fontWeight: '600', flex: 1 }]}>
              {formatTxDatetime(txDatetime.toISOString())}
            </Text>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
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
              style={[type_.small, {
                color: selectedAccount ? colors.textPrimary : colors.textTertiary,
                fontWeight: selectedAccount ? '600' : '400',
                flex: 1,
              }]}
              numberOfLines={1}
            >
              {selectedAccount
                ? (selectedAccount.alias ?? `${selectedAccount.institution} — ${selectedAccount.account_name}`)
                : 'Select account'}
            </Text>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </Frow>
        <Frow label="Category">
          <TouchableOpacity
            style={ss.frowTouchable}
            onPress={() => setShowCategoryPicker(true)}
            accessibilityRole="button" accessibilityLabel="Select category"
          >
            <Text style={[type_.small, {
              color: selectedCategory ? colors.brand : colors.textTertiary,
              fontWeight: selectedCategory ? '600' : '400',
              flex: 1,
            }]}>
              {selectedCategory ? selectedCategory.name : 'Optional'}
            </Text>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M9 18l6-6-6-6" stroke={selectedCategory ? colors.brand : colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
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
            <View style={[ss.recurBadge, { backgroundColor: colors.surface }]}>
              <Text style={[type_.small, { color: colors.brand }]}>↻ Recurring</Text>
            </View>
            <TouchableOpacity
              style={[ss.stopBtn, { borderColor: colors.error }]}
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
              <Text style={[type_.caption, { color: colors.error, fontWeight: '700' }]}>Stop</Text>
            </TouchableOpacity>
          </Frow>
        ) : (
          <Frow label="Repeats" isLast>
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => setShowRecurrencePicker(true)}
              accessibilityRole="button" accessibilityLabel="Select recurrence"
            >
              <Text style={[type_.small, {
                color: recurrence ? colors.textPrimary : colors.textTertiary,
                fontWeight: recurrence ? '600' : '400',
                flex: 1,
              }]}>
                {recurrence ? recurrence.label : 'Never'}
              </Text>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </Frow>
        )}
      </View>

      {/* Numpad */}
      <Numpad value={amountStr} onChange={setAmountStr} />

      {/* Save + Delete buttons */}
      <Button
        variant="green"
        onPress={handleSave}
        disabled={nairaStringToKobo(amountStr) <= 0 || isSaving}
        loading={isSaving}
        accessibilityLabel="Save changes"
      >
        Save Changes
      </Button>

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
  const [showActions, setShowActions] = useState(false);

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
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
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

  return (
    <View style={[ss.safe, { backgroundColor: colors.background }]}>
      <StatusBar style={tx.is_manual ? 'dark' : 'light'} />
      {/* ── Header: white for manual, dark gradient hero for bank ── */}
      {tx.is_manual ? (
        <View style={[ss.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={[ss.backBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.back()}
            accessibilityRole="button" accessibilityLabel="Go back"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M19 12H5M12 5l-7 7 7 7" stroke={colors.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[type_.h3, { color: colors.textPrimary }]}>Manual Transaction</Text>
          <TouchableOpacity
            style={[ss.backBtn, { backgroundColor: colors.surface }]}
            onPress={() => setShowActions(true)}
            accessibilityRole="button"
            accessibilityLabel="More options"
            hitSlop={12}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
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

      {/* ── Content ── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {tx.is_manual ? (
          <ManualEditForm
            tx={tx}
            accounts={accounts}
            categoryMap={categoryMap}
            accountOptions={accountOptions}
            onSave={handleSave}
            onDelete={handleDelete}
            isSaving={update.isPending}
            isDeleting={deleteTx.isPending}
          />
        ) : (
          <BankViewForm
            tx={tx}
            categoryOptions={categoryOptions}
            categoryMap={categoryMap}
            onSave={handleSave}
            isSaving={update.isPending}
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
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M16 3h5v5" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M8 3H3v5" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M21 3l-7 7-4-4-7 7" stroke={colors.info} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View style={ss.ashText}>
            <Text style={[ss.ashName, { color: colors.textPrimary }]}>Split Transaction</Text>
            <Text style={[ss.ashDesc, { color: colors.textMeta }]}>Divide across multiple categories</Text>
          </View>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </BottomSheet>
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
  backBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  // Action sheet rows
  ashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ashIc: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ashText: { flex: 1 },
  ashName: { fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans-SemiBold' },
  ashDesc: { fontSize: 12, marginTop: 1 },
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
  heroNavTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.3,
  },
  frostBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAmtLg: {
    fontSize: 38,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    letterSpacing: -1.5,
    marginBottom: spacing.sm,
  },
  heroNarr: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'PlusJakartaSans_500Medium',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: spacing.md,
  },
  heroChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  heroChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  heroChipTxt: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroChipGlass: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroChipGlassTxt: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: 'rgba(255,255,255,0.75)',
  },
  // kept for typeBadge usage in any remaining manual form badges
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  typeBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
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
    minHeight: 48,
  },
  frowTouchable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  frowInput: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: 'PlusJakartaSans-SemiBold', padding: 0 },
  frowValue: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  // Type toggle
  typeToggle: { flexDirection: 'row', borderRadius: radius.sm + 1, padding: 3, overflow: 'hidden' },
  typePill: { position: 'absolute', top: 3, bottom: 3, borderRadius: spacing.smd },
  typeBtn: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  typeBtnText: { fontSize: 14, fontWeight: '700', fontFamily: 'PlusJakartaSans-Bold' },
  // Amount display (manual edit)
  amtCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  amtRow: { flexDirection: 'row', alignItems: 'flex-start' },
  amtSym: { fontSize: 20, fontWeight: '800', fontFamily: 'PlusJakartaSans-ExtraBold', lineHeight: 52, marginRight: 2 },
  amtNum: { fontSize: 48, fontWeight: '800', fontFamily: 'PlusJakartaSans-ExtraBold', letterSpacing: -2 },
  // Recurring badge
  recurBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.xs, flex: 1 },
  stopBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.xs, borderWidth: 1.5 },
  // Delete button
  deleteBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // Numpad
  numpad: { borderRadius: radius.md, overflow: 'hidden', gap: 1 },
  numRow: { flexDirection: 'row', gap: 1 },
  numKey: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  numKeyText: { fontSize: 19, fontWeight: '600', fontFamily: 'PlusJakartaSans-SemiBold' },
  // Pickers
  pickGroupHdr: { paddingHorizontal: spacing.lg, paddingVertical: 7 },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.mdn },
  // DatePicker
  dtBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  dtSheet: { paddingBottom: 24, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  dtDoneBtn: { margin: spacing.lg, paddingVertical: 14, borderRadius: radius.sm, alignItems: 'center' },
});