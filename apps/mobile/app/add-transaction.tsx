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
import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  StyleSheet,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { useAccounts } from '@/hooks/useAccounts';
import type { BankAccount } from '@/types/account';
import type { CategoryItem } from '@/types/category';
import { RECURRENCE_OPTIONS } from '@/types/recurring';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useCreateRecurringRule } from '@/hooks/useRecurring';
import { useCreateTransaction } from '@/hooks/useTransactions';
import { nairaStringToKobo, computeNextDue } from '@/utils/money';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date for display in the date/time picker row. */
function formatDateTime(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', '
    + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}


// ─── Picker modal ─────────────────────────────────────────────────────────────

interface PickerOption { id: string; label: string }

function PickerModal({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  onSelect: (opt: PickerOption) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.pickerBackdrop} onPress={onClose} activeOpacity={1} />
      <View style={s.pickerSheet}>
        <View style={s.pickerHeader}>
          <Text style={s.pickerTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={options}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.pickerRow} onPress={() => { onSelect(item); onClose(); }}>
              <Text style={s.pickerRowText}>{item.label}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F3F4F6' }} />}
        />
      </View>
    </Modal>
  );
}

// ─── Row components ───────────────────────────────────────────────────────────

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.formRow}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowContent}>{children}</View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AddTransactionScreen() {
  const router = useRouter();

  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useCategoryGroups();
  const createTx = useCreateTransaction();

  // Form state
  const [txType, setTxType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [txDatetime, setTxDatetime] = useState(() => new Date());
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [memo, setMemo] = useState('');

  // Picker visibility
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Android needs separate date then time steps
  const [dtPickerMode, setDtPickerMode] = useState<'date' | 'time'>('date');

  // Recurrence
  const [recurrence, setRecurrence] = useState<typeof RECURRENCE_OPTIONS[number] | null>(null);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const createRecurring = useCreateRecurringRule();

  // Derived picker options
  const accountOptions = useMemo<PickerOption[]>(
    () => accounts.map((a) => ({ id: a.id, label: `${a.institution} — ${a.alias ?? a.account_name}` })),
    [accounts],
  );

  const categoryOptions = useMemo<PickerOption[]>(
    () =>
      groups.flatMap((g) =>
        g.categories.map((c) => ({ id: c.id, label: `${g.name} › ${c.name}` })),
      ),
    [groups],
  );

  const categoryMap = useMemo(() => {
    const m = new Map<string, CategoryItem>();
    groups.forEach((g) => g.categories.forEach((c) => m.set(c.id, c)));
    return m;
  }, [groups]);

  function handleSave() {
    const koboAmount = nairaStringToKobo(amount);
    if (koboAmount <= 0) return;
    if (!selectedAccount) return;
    if (!narration.trim()) return;

    const signedAmount = txType === 'debit' ? -koboAmount : koboAmount;

    createTx.mutate(
      {
        account_id: selectedAccount.id,
        date: txDatetime.toISOString(),
        amount: koboAmount,
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

  const canSave = nairaStringToKobo(amount) > 0 && narration.trim().length > 0 && selectedAccount !== null;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Transaction</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {/* Type toggle */}
          <View style={s.typeToggle}>
            <TouchableOpacity
              style={[s.typeBtn, txType === 'debit' && s.typeBtnDebit]}
              onPress={() => setTxType('debit')}
            >
              <Ionicons
                name="arrow-up"
                size={16}
                color={txType === 'debit' ? '#fff' : '#EF4444'}
              />
              <Text style={[s.typeBtnText, txType === 'debit' && { color: '#fff' }]}>Debit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, txType === 'credit' && s.typeBtnCredit]}
              onPress={() => setTxType('credit')}
            >
              <Ionicons
                name="arrow-down"
                size={16}
                color={txType === 'credit' ? '#fff' : '#10B981'}
              />
              <Text style={[s.typeBtnText, txType === 'credit' && { color: '#fff' }]}>Credit</Text>
            </TouchableOpacity>
          </View>

          {/* Amount */}
          <View style={[s.amountCard, txType === 'debit' ? s.amountCardDebit : s.amountCardCredit]}>
            <Text style={[s.amountCurrency, txType === 'debit' ? { color: '#EF4444' } : { color: '#10B981' }]}>₦</Text>
            <TextInput
              style={[s.amountInput, txType === 'debit' ? { color: '#EF4444' } : { color: '#10B981' }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#D1D5DB"
            />
          </View>

          {/* Narration */}
          <FormRow label="Narration">
            <TextInput
              style={s.textField}
              value={narration}
              onChangeText={setNarration}
              placeholder="What was this for?"
              placeholderTextColor="#9CA3AF"
              returnKeyType="done"
            />
          </FormRow>

          {/* Date & Time */}
          <FormRow label="Date & Time">
            <TouchableOpacity
              style={s.pickerField}
              onPress={() => {
                setDtPickerMode('date');
                setShowDatePicker(true);
              }}
            >
              <Text style={s.pickerSelected}>{formatDateTime(txDatetime)}</Text>
              <Ionicons name="calendar-outline" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </FormRow>

          {/* DateTimePicker — Android uses date then time, iOS uses inline datetime */}
          {showDatePicker && (
            Platform.OS === 'ios' ? (
              <Modal visible transparent animationType="fade">
                <TouchableOpacity
                  style={s.dtBackdrop}
                  activeOpacity={1}
                  onPress={() => setShowDatePicker(false)}
                />
                <View style={s.dtSheet}>
                  <DateTimePicker
                    value={txDatetime}
                    mode="datetime"
                    display="spinner"
                    onChange={(_e: DateTimePickerEvent, d?: Date) => d && setTxDatetime(d)}
                    style={{ alignSelf: 'stretch' }}
                  />
                  <TouchableOpacity style={s.dtDoneBtn} onPress={() => setShowDatePicker(false)}>
                    <Text style={s.dtDoneText}>Done</Text>
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
                    setShowDatePicker(true); // chain to time picker
                  } else {
                    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                    setTxDatetime(next);
                  }
                }}
              />
            )
          )}

          {/* Account */}
          <FormRow label="Account">
            <TouchableOpacity
              style={s.pickerField}
              onPress={() => setShowAccountPicker(true)}
            >
              <Text style={selectedAccount ? s.pickerSelected : s.pickerPlaceholder}>
                {selectedAccount
                  ? selectedAccount.alias ? selectedAccount.alias : `${selectedAccount.institution} — ${selectedAccount.account_name}`
                  : 'Select account'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </FormRow>

          {/* Category (optional) */}
          <FormRow label="Category">
            <TouchableOpacity
              style={s.pickerField}
              onPress={() => setShowCategoryPicker(true)}
            >
              <Text style={selectedCategory ? s.pickerSelected : s.pickerPlaceholder}>
                {selectedCategory ? selectedCategory.name : 'Optional'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
            {selectedCategory && (
              <TouchableOpacity
                style={s.clearBtn}
                onPress={() => setSelectedCategory(null)}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </FormRow>

          {/* Memo */}
          <FormRow label="Memo">
            <TextInput
              style={s.textField}
              value={memo}
              onChangeText={setMemo}
              placeholder="Optional note"
              placeholderTextColor="#9CA3AF"
              returnKeyType="done"
            />
          </FormRow>

          {/* Repeats */}
          <FormRow label="Repeats">
            <TouchableOpacity style={s.pickerField} onPress={() => setShowRecurrencePicker(true)}>
              <Text style={recurrence ? s.pickerSelected : s.pickerPlaceholder}>
                {recurrence ? recurrence.label : 'Never'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
            {recurrence && (
              <TouchableOpacity style={s.clearBtn} onPress={() => setRecurrence(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </FormRow>
        </ScrollView>

        {/* Save button */}
        <View style={s.saveBar}>
          <TouchableOpacity
            style={[s.saveBtn, (!canSave || createTx.isPending) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || createTx.isPending}
          >
            {createTx.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>Add transaction</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <PickerModal
        visible={showAccountPicker}
        title="Select Account"
        options={accountOptions}
        onSelect={(opt) => setSelectedAccount(accounts.find((a) => a.id === opt.id) ?? null)}
        onClose={() => setShowAccountPicker(false)}
      />
      <PickerModal
        visible={showCategoryPicker}
        title="Select Category"
        options={categoryOptions}
        onSelect={(opt) => setSelectedCategory(categoryMap.get(opt.id) ?? null)}
        onClose={() => setShowCategoryPicker(false)}
      />
      <PickerModal
        visible={showRecurrencePicker}
        title="Repeats"
        options={RECURRENCE_OPTIONS.map((o, i) => ({ id: String(i), label: o.label }))}
        onSelect={(opt) => setRecurrence(RECURRENCE_OPTIONS[parseInt(opt.id)] ?? null)}
        onClose={() => setShowRecurrencePicker(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  body: { padding: 16, paddingBottom: 40, gap: 12 },

  typeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    padding: 4,
    gap: 4,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  typeBtnDebit: { backgroundColor: '#EF4444' },
  typeBtnCredit: { backgroundColor: '#10B981' },
  typeBtnText: { fontSize: 15, fontWeight: '700', color: '#374151' },

  amountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 16,
    marginVertical: 4,
  },
  amountCardDebit: { backgroundColor: '#FEF2F2' },
  amountCardCredit: { backgroundColor: '#F0FDF4' },
  amountCurrency: { fontSize: 28, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '800', padding: 0 },

  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  rowLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', width: 72 },
  rowContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },

  textField: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },

  pickerField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerSelected: { fontSize: 15, color: '#111827', flex: 1 },
  pickerPlaceholder: { fontSize: 15, color: '#9CA3AF', flex: 1 },
  clearBtn: { marginLeft: 8 },

  saveBar: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveBtn: {
    backgroundColor: '#0F7B3F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  pickerRow: { paddingHorizontal: 18, paddingVertical: 14 },
  pickerRowText: { fontSize: 15, color: '#374151' },

  // DateTimePicker (iOS modal)
  dtBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  dtSheet: {
    backgroundColor: '#fff',
    paddingBottom: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dtDoneBtn: {
    marginTop: 4,
    marginHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#111827',
    borderRadius: 10,
    alignItems: 'center',
  },
  dtDoneText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
