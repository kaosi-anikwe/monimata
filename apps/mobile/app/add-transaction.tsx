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
 * Add Transaction screen — create a manual transaction.
 *
 * Route: /add-transaction
 */
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from "expo-haptics";
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';

import { Button, ScreenHeader } from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useCreateRecurringRule } from '@/hooks/useRecurring';
import { useCreateTransaction } from '@/hooks/useTransactions';
import { useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';
import type { CategoryGroup, CategoryItem } from '@/types/category';
import { RECURRENCE_OPTIONS } from '@/types/recurring';
import { computeNextDue, nairaStringToKobo } from '@/utils/money';
import type { BankAccount } from '@monimata/shared-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(d: Date): string {
  return (
    d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  );
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
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange('debit') }}
        accessibilityRole="radio"
        accessibilityState={{ checked: isDebit }}
        accessibilityLabel="Debit"
      >
        <Animated.Text style={[ss.typeBtnText, { color: debitColor }]}>Debit (−)</Animated.Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={ss.typeBtn}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange('credit') }}
        accessibilityRole="radio"
        accessibilityState={{ checked: !isDebit }}
        accessibilityLabel="Credit"
      >
        <Animated.Text style={[ss.typeBtnText, { color: creditColor }]}>Credit (+)</Animated.Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Numpad ───────────────────────────────────────────────────────────────────

function Numpad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useTheme();
  const keyStyle = [ss.numKey, { backgroundColor: colors.cardBg }];
  const K = (v: string) => (
    <TouchableOpacity key={v} style={keyStyle} onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (value === '0') return;
          onChange(value + '0');
        }} activeOpacity={0.5} accessibilityRole="button" accessibilityLabel="0">
          <Text style={[ss.numKeyText, { color: colors.textPrimary }]}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={keyStyle} onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChange(value.slice(0, -1) || '0')
        }}
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

// ─── Frow (form row inside card) ─────────────────────────────────────────────

function Frow({ label, isLast = false, children }: { label: string; isLast?: boolean; children: React.ReactNode }) {
  const colors = useTheme();
  return (
    <View style={[ss.frow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <Text style={[type_.small, { color: colors.textMeta, width: 90 }]}>{label}</Text>
      <View style={ss.frowValue}>{children}</View>
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
          style={[ss.pickRow, { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
          onPress={() => { onSelect(null); onClose(); }}
          accessibilityRole="button" accessibilityLabel="No category"
        >
          <Text style={[type_.body, { color: colors.textMeta, fontStyle: 'italic' }]}>No category</Text>
          {!selected && (
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
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
                  <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
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

// ─── Account picker sheet ─────────────────────────────────────────────────────

function AccountPickerSheet({
  visible, accounts, onSelect, onClose,
}: {
  visible: boolean;
  accounts: BankAccount[];
  onSelect: (a: BankAccount) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const router = useRouter();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Account" scrollable={false}>
      {accounts.length === 0 ? (
        <View style={ss.pickerEmpty}>
          <Text style={[type_.bodyReg, { color: colors.textMeta, textAlign: 'center' }]}>
            You don&apos;t have any accounts yet.
          </Text>
          <TouchableOpacity
            onPress={() => { onClose(); router.push('/(tabs)/accounts'); }}
            accessibilityRole="link"
            accessibilityLabel="Go to Accounts to add one"
          >
            <Text style={[type_.body, { color: colors.brand, textAlign: 'center', marginTop: spacing.sm }]}>
              Add an account →
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 360 }}>
          {accounts.map((a, i) => (
            <TouchableOpacity
              key={a.id}
              style={[
                ss.pickRow,
                i < accounts.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
              ]}
              onPress={() => { onSelect(a); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel={a.alias ?? `${a.institution} — ${a.account_name}`}
            >
              <Text style={[type_.body, { color: colors.textPrimary }]}>
                {a.alias ?? `${a.institution} — ${a.account_name}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AddTransactionScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Refs kept but not used for focus management with numpad (no keyboard needed for amount)
  const _narrationRef = useRef<TextInput>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useCategoryGroups();
  const createTx = useCreateTransaction();
  const createRecurring = useCreateRecurringRule();

  const [txType, setTxType] = useState<'debit' | 'credit'>('debit');
  const [amountStr, setAmountStr] = useState('');
  const [narration, setNarration] = useState('');
  const [txDatetime, setTxDatetime] = useState(() => new Date());
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [memo, setMemo] = useState('');
  const [recurrence, setRecurrence] = useState<typeof RECURRENCE_OPTIONS[number] | null>(null);

  const [numpadVisible, setNumpadVisible] = useState(false);
  const [numpadHeight, setNumpadHeight] = useState(300);
  const numpadAnim = useRef(new Animated.Value(0)).current;

  function showNumpad() {
    setNumpadVisible(true);
    Animated.spring(numpadAnim, { toValue: 1, useNativeDriver: true, tension: 220, friction: 26 }).start();
  }
  function dismissNumpad() {
    setNumpadVisible(false);
    Animated.spring(numpadAnim, { toValue: 0, useNativeDriver: true, tension: 220, friction: 26 }).start();
  }

  const caretOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!numpadVisible) {
      caretOpacity.setValue(1);
      return;
    }
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(caretOpacity, { toValue: 0, duration: 530, useNativeDriver: true }),
        Animated.timing(caretOpacity, { toValue: 1, duration: 530, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [numpadVisible, caretOpacity]);

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dtPickerMode, setDtPickerMode] = useState<'date' | 'time'>('date');

  const recurrenceOptions = useMemo(
    () => RECURRENCE_OPTIONS.map((o) => ({ value: o, label: o.label })),
    [],
  );

  const koboAmount = nairaStringToKobo(amountStr);
  const canSave = koboAmount > 0 && narration.trim().length > 0 && selectedAccount !== null;

  function handleSave() {
    if (!canSave || !selectedAccount) return;
    const signedAmount = txType === 'debit' ? -koboAmount : koboAmount;
    createTx.mutate(
      {
        account_id: selectedAccount.id,
        date: txDatetime.toISOString(),
        amount: signedAmount,
        narration: narration.trim(),
        type: txType,
        category_id: selectedCategory?.id ?? null,
        memo: memo.trim() || null,
      },
      {
        onSuccess: () => {
          if (recurrence) {
            createRecurring.mutate({
              frequency: recurrence.value,
              interval: recurrence.interval,
              next_due: computeNextDue(txDatetime, recurrence.value, recurrence.interval),
              template: {
                account_id: selectedAccount!.id,
                amount: signedAmount,
                narration: narration.trim(),
                type: txType,
                category_id: selectedCategory?.id ?? null,
                memo: memo.trim() || null,
              },
            });
          }
          router.back();
        },
      },
    );
  }

  const isDebit = txType === 'debit';
  const amountColor = isDebit ? colors.error : colors.success;

  const fabRestBottom = insets.bottom + spacing.md;
  const numpadTranslateY = numpadAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [numpadHeight, 0],
  });
  const fabTranslateY = numpadAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(numpadHeight + spacing.sm - fabRestBottom)],
  });

  useStatusBarStyle('light');

  return (
    <View style={[ss.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Add Transaction"
        onBack={() => router.back()}
        paddingTop={insets.top + 10}
        rightSlot={
          <Button
            variant="icon"
            iconTheme="dark"
            onPress={() => router.push('/upload-receipt' as never)}
            accessibilityLabel="Upload receipt"
          >
            <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
              <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={colors.white} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M14 2v6h6" stroke={colors.white} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M12 12v6M9 15l3-3 3 3" stroke={colors.white} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Button>
        }
      />

      {/* ── Type toggle ── */}
      <View style={[ss.typeToggleWrap, { backgroundColor: colors.cardBg, borderBottomColor: colors.border }]}>
        <TypeToggle value={txType} onChange={setTxType} />
      </View>

      {/* ── Sticky amount display ── */}
      <TouchableOpacity
        style={[ss.amtCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
        onPress={showNumpad}
        activeOpacity={0.85}
      >
        <View style={ss.amtRow}>
          <Text style={[ss.amtSym, { color: amountColor }]}>₦</Text>
          <Text style={[ss.amtNum, { color: amountColor }]}>{formatAmountDisplay(amountStr)}</Text>
          {numpadVisible && (
            <Animated.View style={[ss.caret, { backgroundColor: amountColor, opacity: caretOpacity }]} />
          )}
        </View>
        <Text style={[type_.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
          {numpadVisible ? 'Tap elsewhere to dismiss' : 'Tap to enter amount'}
        </Text>
      </TouchableOpacity>

      {/* ── Scrollable form ── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={[ss.scrollContent, { paddingBottom: numpadHeight + insets.bottom + layout.btnHeight + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={dismissNumpad}
      >
        {/* ── Form card ── */}
        <View style={[ss.formCard, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
          <Frow label="What for?">
            <TextInput
              ref={_narrationRef}
              style={[ss.frowInput, { color: colors.textPrimary }]}
              value={narration}
              onChangeText={setNarration}
              placeholder="Enter description"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
              accessibilityLabel="Transaction description"
            />
          </Frow>
          <Frow label="Date & Time">
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => { dismissNumpad(); setDtPickerMode('date'); setShowDatePicker(true); }}
              accessibilityRole="button" accessibilityLabel="Select date and time"
            >
              <Text style={[{ ...type_.small, lineHeight: 16 }, { color: colors.textPrimary, flex: 1 }]}>
                {formatDateTime(txDatetime)}
              </Text>
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </Frow>
          <Frow label="Account">
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => { dismissNumpad(); setShowAccountPicker(true); }}
              accessibilityRole="button" accessibilityLabel="Select account"
            >
              <Text
                style={[
                  { ...type_.small, lineHeight: 16 },
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
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => { dismissNumpad(); setShowCategoryPicker(true); }}
              accessibilityRole="button" accessibilityLabel="Select category"
            >
              <Text style={[
                { ...type_.small, lineHeight: 16 },
                { color: selectedCategory ? colors.brand : colors.textTertiary, flex: 1 },
              ]}>
                {selectedCategory ? selectedCategory.name : 'Optional'}
              </Text>
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
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
          <Frow label="Repeats" isLast>
            <TouchableOpacity
              style={ss.frowTouchable}
              onPress={() => { dismissNumpad(); setShowRecurrencePicker(true); }}
              accessibilityRole="button" accessibilityLabel="Select recurrence"
            >
              <Text style={[
                { ...type_.small, lineHeight: 16 },
                { color: recurrence ? colors.textPrimary : colors.textTertiary, flex: 1 },
              ]}>
                {recurrence ? recurrence.label : 'Never'}
              </Text>
              <Svg width={type_.body.fontSize} height={type_.body.fontSize} viewBox="0 0 24 24" fill="none">
                <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </TouchableOpacity>
          </Frow>
        </View>
      </ScrollView>

      {/* ── FAB Save button ── */}
      <Animated.View
        style={[ss.fabWrap, { bottom: fabRestBottom }, { transform: [{ translateY: fabTranslateY }] }]}
      >
        <Button
          variant="green"
          onPress={handleSave}
          disabled={!canSave || createTx.isPending}
          loading={createTx.isPending}
          fullWidth={false}
          style={{ opacity: 1, paddingHorizontal: spacing.xxl }}
          accessibilityLabel="Save transaction"
        >
          Save
        </Button>
      </Animated.View>

      {/* ── Numpad slide-up panel ── */}
      <Animated.View
        style={[ss.numpadPanel, { backgroundColor: colors.cardBg, borderTopColor: colors.border, paddingBottom: insets.bottom }, { transform: [{ translateY: numpadTranslateY }] }]}
        onLayout={(e) => setNumpadHeight(e.nativeEvent.layout.height)}
      >
        <Numpad value={amountStr} onChange={setAmountStr} />
      </Animated.View>

      {/* ── DateTimePicker ── */}
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

      {/* ── Pickers ── */}
      <AccountPickerSheet
        visible={showAccountPicker}
        accounts={accounts}
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
      <OptionPickerSheet
        visible={showRecurrencePicker}
        title="Repeats"
        options={recurrenceOptions}
        onSelect={(o) => setRecurrence(o)}
        onClose={() => setShowRecurrencePicker(false)}
      />
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
  closeBtn: { width: layout.iconBtnSize, height: layout.iconBtnSize, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  typeToggleWrap: { paddingHorizontal: spacing.xl, paddingVertical: spacing.mdn, borderBottomWidth: StyleSheet.hairlineWidth },
  typeToggle: { flexDirection: 'row', borderRadius: radius.sm + 1, padding: spacing.xxs, overflow: 'hidden' },
  typePill: { position: 'absolute', top: spacing.xxs, bottom: spacing.xxs, borderRadius: spacing.smd },
  typeBtn: { flex: 1, height: layout.avatarSm + spacing.xxs, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  typeBtnText: { ...type_.btnSm },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
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
  amtRow: { flexDirection: 'row', alignItems: 'center' },
  caret: { width: 2, height: layout.btnHeight, borderRadius: 1, marginLeft: 2 },
  amtSym: { ...type_.h1, lineHeight: layout.btnHeight, marginRight: 2 },
  amtNum: { ...type_.displayXl },
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
  numpad: { marginHorizontal: 0, borderRadius: radius.md, overflow: 'hidden', gap: 1 },
  numRow: { flexDirection: 'row', gap: 1 },
  numKey: { flex: 1, height: layout.btnHeightSm, alignItems: 'center', justifyContent: 'center' },
  numKeyText: { ...type_.numpad },
  saveBar: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  pickGroupHdr: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xxs },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.mdn },
  pickerEmpty: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, alignItems: 'center' },
  dtBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  dtSheet: { paddingBottom: spacing.xxl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  dtDoneBtn: { margin: spacing.lg, paddingVertical: spacing.mdn, borderRadius: radius.sm, alignItems: 'center' },
  fabWrap: {
    position: 'absolute',
    right: spacing.xl,
    zIndex: 20,
  },
  numpadPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
});
