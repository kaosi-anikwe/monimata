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
import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { useAccounts } from '@/hooks/useAccounts';
import { useCategoryGroups } from '@/hooks/useCategories';
import {
  useTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  type ManualTransactionBody,
} from '@/hooks/useTransactions';
import type { BankAccount } from '@/types/account';
import type { CategoryItem } from '@/types/category';
import type { Transaction } from '@/types/transaction';
import { RECURRENCE_OPTIONS } from '@/types/recurring';
import { nairaStringToKobo, computeNextDue } from '@/utils/money';
import { useCreateRecurringRule, useDeactivateRecurringRule } from '@/hooks/useRecurring';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(kobo: number): string {
  return (Math.abs(kobo) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}


function koboToNaira(kobo: number): string {
  return (Math.abs(kobo) / 100).toFixed(0);
}

/** Format an ISO datetime string for display (e.g. "10 Mar 2025, 02:30 PM") */
function formatTxDatetime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', '
    + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ─── Picker modal (shared) ────────────────────────────────────────────────────

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
            <TouchableOpacity
              style={s.pickerRow}
              onPress={() => { onSelect(item); onClose(); }}
            >
              <Text style={s.pickerRowText}>{item.label}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F3F4F6' }} />}
        />
      </View>
    </Modal>
  );
}

// ─── Read-only detail row ────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Editable form row ────────────────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.formRow}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowContent}>{children}</View>
    </View>
  );
}

// ─── Manual edit form ─────────────────────────────────────────────────────────

function ManualEditForm({
  tx,
  accounts,
  categoryOptions,
  categoryMap,
  accountOptions,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  tx: Transaction;
  accounts: BankAccount[];
  categoryOptions: PickerOption[];
  categoryMap: Map<string, CategoryItem>;
  accountOptions: PickerOption[];
  onSave: (patch: Partial<ManualTransactionBody> & { memo?: string | null }) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [txType, setTxType] = useState<'debit' | 'credit'>(tx.type);
  const [amount, setAmount] = useState(koboToNaira(tx.amount));
  const [narration, setNarration] = useState(tx.narration);
  const [txDatetime, setTxDatetime] = useState(() => new Date(tx.date));
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(
    accounts.find((a) => a.id === tx.account_id) ?? null,
  );
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(
    tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
  );
  const [memo, setMemo] = useState(tx.memo ?? '');

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dtPickerMode, setDtPickerMode] = useState<'date' | 'time'>('date');

  // Recurrence
  const [recurrence, setRecurrence] = useState<typeof RECURRENCE_OPTIONS[number] | null>(null);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const createRecurring = useCreateRecurringRule();
  const deactivateRecurring = useDeactivateRecurringRule();

  function handleSave() {
    const koboAmount = nairaStringToKobo(amount);
    if (koboAmount <= 0) return;
    const signedAmount = txType === 'debit' ? -koboAmount : koboAmount;
    onSave({
      type: txType,
      amount: koboAmount,
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
    Alert.alert(
      'Delete Transaction',
      'This will permanently remove this transaction and its budget impact. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    );
  }

  return (
    <>
      {/* Type toggle */}
      <View style={s.typeToggle}>
        <TouchableOpacity
          style={[s.typeBtn, txType === 'debit' && s.typeBtnDebit]}
          onPress={() => setTxType('debit')}
        >
          <Ionicons name="arrow-up" size={16} color={txType === 'debit' ? '#fff' : '#EF4444'} />
          <Text style={[s.typeBtnText, txType === 'debit' && { color: '#fff' }]}>Debit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.typeBtn, txType === 'credit' && s.typeBtnCredit]}
          onPress={() => setTxType('credit')}
        >
          <Ionicons name="arrow-down" size={16} color={txType === 'credit' ? '#fff' : '#10B981'} />
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

      <FormRow label="Narration">
        <TextInput
          style={s.textField}
          value={narration}
          onChangeText={setNarration}
          placeholder="What was this for?"
          placeholderTextColor="#9CA3AF"
        />
      </FormRow>

      <FormRow label="Date & Time">
        <TouchableOpacity
          style={s.pickerField}
          onPress={() => {
            setDtPickerMode('date');
            setShowDatePicker(true);
          }}
        >
          <Text style={s.pickerSelected}>{formatTxDatetime(txDatetime.toISOString())}</Text>
          <Ionicons name="calendar-outline" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </FormRow>

      {/* DateTimePicker */}
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
                setShowDatePicker(true);
              } else {
                next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                setTxDatetime(next);
              }
            }}
          />
        )
      )}

      <FormRow label="Account">
        <TouchableOpacity style={s.pickerField} onPress={() => setShowAccountPicker(true)}>
          <Text style={selectedAccount ? s.pickerSelected : s.pickerPlaceholder} numberOfLines={1}>
            {selectedAccount
              ? `${selectedAccount.institution} — ${selectedAccount.account_name}`
              : 'Select account'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </FormRow>

      <FormRow label="Category">
        <TouchableOpacity style={s.pickerField} onPress={() => setShowCategoryPicker(true)}>
          <Text style={selectedCategory ? s.pickerSelected : s.pickerPlaceholder}>
            {selectedCategory ? selectedCategory.name : 'Optional'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>
        {selectedCategory && (
          <TouchableOpacity style={s.clearBtn} onPress={() => setSelectedCategory(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </FormRow>

      <FormRow label="Memo">
        <TextInput
          style={s.textField}
          value={memo}
          onChangeText={setMemo}
          placeholder="Optional note"
          placeholderTextColor="#9CA3AF"
        />
      </FormRow>

      {/* Repeats */}
      {tx.recurrence_id ? (
        <View style={s.recurringBadge}>
          <Ionicons name="repeat" size={16} color="#0F7B3F" />
          <Text style={s.recurringText}>Recurring transaction</Text>
          <TouchableOpacity
            style={s.stopBtn}
            onPress={() => {
              Alert.alert(
                'Stop repeating?',
                'Future transactions in this series will no longer be created.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Stop',
                    style: 'destructive',
                    onPress: () => deactivateRecurring.mutate(tx.recurrence_id!),
                  },
                ],
              );
            }}
          >
            <Text style={s.stopBtnText}>Stop repeating</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
      )}

      {/* Save */}
      <TouchableOpacity
        style={[s.saveBtn, isSaving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.saveBtnText}>Save changes</Text>
        )}
      </TouchableOpacity>

      {/* Delete */}
      <TouchableOpacity
        style={[s.deleteBtn, isDeleting && { opacity: 0.6 }]}
        onPress={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <ActivityIndicator color="#EF4444" />
        ) : (
          <Text style={s.deleteBtnText}>Delete transaction</Text>
        )}
      </TouchableOpacity>

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
      {!tx.recurrence_id && (
        <PickerModal
          visible={showRecurrencePicker}
          title="Repeats"
          options={RECURRENCE_OPTIONS.map((o, i) => ({ id: String(i), label: o.label }))}
          onSelect={(opt) => setRecurrence(RECURRENCE_OPTIONS[parseInt(opt.id)] ?? null)}
          onClose={() => setShowRecurrencePicker(false)}
        />
      )}
    </>
  );
}

// ─── Bank/Mono view form (read-only with editable category + memo) ────────────

function BankViewForm({
  tx,
  categoryOptions,
  categoryMap,
  onSave,
  isSaving,
}: {
  tx: Transaction;
  categoryOptions: PickerOption[];
  categoryMap: Map<string, CategoryItem>;
  onSave: (patch: { category_id: string | null; memo: string | null }) => void;
  isSaving: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(
    tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null,
  );
  const [memo, setMemo] = useState(tx.memo ?? '');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Re-sync if tx updates (e.g., after external recategorise)
  useEffect(() => {
    setSelectedCategory(tx.category_id ? (categoryMap.get(tx.category_id) ?? null) : null);
  }, [tx.category_id, categoryMap]);

  const amountColor = tx.type === 'debit' ? '#EF4444' : '#10B981';
  const amountPrefix = tx.type === 'debit' ? '-' : '+';

  return (
    <>
      {/* Amount hero */}
      <View style={[s.heroCard, tx.type === 'debit' ? s.amountCardDebit : s.amountCardCredit]}>
        <Text style={[s.heroAmount, { color: amountColor }]}>
          {amountPrefix}₦{formatAmount(tx.amount)}
        </Text>
        <View style={[s.typeBadge, { backgroundColor: amountColor + '22' }]}>
          <Text style={[s.typeBadgeText, { color: amountColor }]}>
            {tx.type.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Fixed details */}
      <View style={s.detailCard}>
        <DetailRow label="Narration" value={tx.narration} />
        <View style={s.divider} />
        <DetailRow label="Date" value={formatTxDatetime(tx.date)} />
        <View style={s.divider} />
        <DetailRow label="Source" value={tx.source} />
        {tx.recurrence_id && (
          <>
            <View style={s.divider} />
            <DetailRow label="Recurring" value="Yes" />
          </>
        )}
      </View>

      {/* Category (editable) */}
      <FormRow label="Category">
        <TouchableOpacity style={s.pickerField} onPress={() => setShowCategoryPicker(true)}>
          <Text style={selectedCategory ? s.pickerSelected : s.pickerPlaceholder}>
            {selectedCategory ? selectedCategory.name : 'Uncategorised'}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </TouchableOpacity>
        {selectedCategory && (
          <TouchableOpacity style={s.clearBtn} onPress={() => setSelectedCategory(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </FormRow>

      {/* Memo (editable) */}
      <FormRow label="Memo">
        <TextInput
          style={s.textField}
          value={memo}
          onChangeText={setMemo}
          placeholder="Add a note"
          placeholderTextColor="#9CA3AF"
        />
      </FormRow>

      <TouchableOpacity
        style={[s.saveBtn, isSaving && { opacity: 0.6 }]}
        onPress={() => onSave({ category_id: selectedCategory?.id ?? null, memo: memo.trim() || null })}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.saveBtnText}>Save</Text>
        )}
      </TouchableOpacity>

      <PickerModal
        visible={showCategoryPicker}
        title="Select Category"
        options={categoryOptions}
        onSelect={(opt) => setSelectedCategory(categoryMap.get(opt.id) ?? null)}
        onClose={() => setShowCategoryPicker(false)}
      />
    </>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TransactionDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: tx, isLoading } = useTransaction(id);
  const { data: accounts = [] } = useAccounts();
  const { data: groups = [] } = useCategoryGroups();
  const update = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();

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

  const accountOptions = useMemo<PickerOption[]>(
    () => accounts.map((a) => ({ id: a.id, label: `${a.institution} — ${a.account_name}` })),
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
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color="#10B981" />
      </SafeAreaView>
    );
  }

  if (!tx) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Transaction</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#9CA3AF', fontSize: 15 }}>Transaction not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {tx.is_manual ? 'Manual Transaction' : 'Transaction Details'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          {tx.is_manual ? (
            <ManualEditForm
              tx={tx}
              accounts={accounts}
              categoryOptions={categoryOptions}
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
      </KeyboardAvoidingView>
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

  body: { padding: 16, paddingBottom: 48, gap: 12 },

  heroCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  amountCardDebit: { backgroundColor: '#FEF2F2' },
  amountCardCredit: { backgroundColor: '#F0FDF4' },
  heroAmount: { fontSize: 36, fontWeight: '800' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  typeBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  detailValue: { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#F3F4F6' },

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
  },
  amountCurrency: { fontSize: 28, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 36, fontWeight: '800', padding: 0 },

  saveBtn: {
    backgroundColor: '#0F7B3F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  deleteBtn: {
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },

  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  recurringText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0F7B3F' },
  stopBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  stopBtnText: { fontSize: 12, fontWeight: '600', color: '#EF4444' },

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
