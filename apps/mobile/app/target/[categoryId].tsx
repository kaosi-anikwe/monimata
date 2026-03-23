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
 * Target Edit screen — set or edit a spending target for a category.
 *
 * Four tabs: Weekly | Monthly | Yearly | Custom
 * Each tab shows a "sentence" UI: "I need ₦____ every [week/month/year]"
 * plus a Behavior picker and optional date/repeat fields.
 *
 * Route: /target/[categoryId]
 */
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAppSelector } from '@/store/hooks';
import { nairaStringToKobo } from '@/utils/money';
import { useTarget, useUpsertTarget } from '@/hooks/useTargets';
import type { TargetFrequency, TargetBehavior } from '@/types/target';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function koboToNaira(kobo: number): string {
  return (kobo / 100).toFixed(0);
}



// ─── Amount input ─────────────────────────────────────────────────────────────

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.amountRow}>
      <Text style={s.currencySymbol}>₦</Text>
      <TextInput
        style={s.amountInput}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor="#D1D5DB"
      />
    </View>
  );
}

// ─── Behavior picker ─────────────────────────────────────────────────────────

function BehaviorPicker({
  value,
  onChange,
  frequency,
  amount,
}: {
  value: TargetBehavior;
  onChange: (v: TargetBehavior) => void;
  frequency: TargetFrequency;
  amount: string;
}) {
  const heading = {
    weekly: 'Next week I want to',
    monthly: 'Next month I want to',
    yearly: 'Next year I want to',
    custom: 'I want to',
  }[frequency];

  const freqSuffix = { weekly: '/week', monthly: '/month', yearly: '/year', custom: '' }[frequency];
  const amtLabel = amount ? `₦${amount}${freqSuffix}` : 'the target amount';

  const options: { key: TargetBehavior; label: string; desc: string }[] = [
    {
      key: 'set_aside',
      label: `Assign another ${amtLabel}`,
      desc: 'For bills and subscriptions that repeat each period.',
    },
    {
      key: 'refill',
      label: `Refill up to ${amtLabel}`,
      desc: 'Tops up to the target — great for groceries, fun money, dining out.',
    },
    ...(frequency === 'yearly' || frequency === 'custom'
      ? [{
        key: 'balance' as TargetBehavior,
        label: `Maintain a balance of ${amtLabel}`,
        desc: 'Keep your available amount above the target — great for emergency funds.',
      }]
      : []),
  ];

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{heading}</Text>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          style={[s.behaviorRow, value === opt.key && s.behaviorRowActive]}
          onPress={() => onChange(opt.key)}
          activeOpacity={0.7}
        >
          <View style={[s.radioOuter, value === opt.key && s.radioOuterActive]}>
            {value === opt.key ? <View style={s.radioInner} /> : null}
          </View>
          <View style={s.behaviorText}>
            <Text style={[s.behaviorLabel, value === opt.key && { color: '#0F7B3F' }]}>{opt.label}</Text>
            <Text style={s.behaviorDesc}>{opt.desc}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Weekly tab ───────────────────────────────────────────────────────────────

function WeeklyTab({
  amount, setAmount, dayOfWeek, setDayOfWeek, behavior, setBehavior,
}: {
  amount: string; setAmount: (v: string) => void;
  dayOfWeek: number; setDayOfWeek: (v: number) => void;
  behavior: TargetBehavior; setBehavior: (v: TargetBehavior) => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <Text style={s.sentence}>I need</Text>
      <AmountInput value={amount} onChange={setAmount} />
      <Text style={s.sentence}>every week</Text>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Due by</Text>
        <View style={s.weekdayRow}>
          {WEEKDAYS.map((d, i) => (
            <TouchableOpacity
              key={d}
              style={[s.weekdayBtn, dayOfWeek === i && s.weekdayBtnActive]}
              onPress={() => setDayOfWeek(i)}
            >
              <Text style={[s.weekdayText, dayOfWeek === i && s.weekdayTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="weekly" amount={amount} />

      <Text style={s.hint}>
        MoniMata will remind you to assign ₦{amount || '0'} by each {WEEKDAYS[dayOfWeek]}.
      </Text>
    </ScrollView>
  );
}

// ─── Monthly tab ──────────────────────────────────────────────────────────────

function MonthlyTab({
  amount, setAmount, dayOfMonth, setDayOfMonth, behavior, setBehavior,
}: {
  amount: string; setAmount: (v: string) => void;
  dayOfMonth: number; setDayOfMonth: (v: number) => void;
  behavior: TargetBehavior; setBehavior: (v: TargetBehavior) => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <Text style={s.sentence}>I need</Text>
      <AmountInput value={amount} onChange={setAmount} />
      <Text style={s.sentence}>every month</Text>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Due by day of month</Text>
        <View style={s.dayInputRow}>
          <TouchableOpacity
            style={s.dayStepBtn}
            onPress={() => setDayOfMonth(Math.max(1, dayOfMonth - 1))}
          >
            <Ionicons name="remove" size={20} color="#374151" />
          </TouchableOpacity>
          <Text style={s.dayValue}>{dayOfMonth === 0 ? 'Last' : dayOfMonth}</Text>
          <TouchableOpacity
            style={s.dayStepBtn}
            onPress={() => setDayOfMonth(dayOfMonth >= 28 ? 0 : dayOfMonth + 1)}
          >
            <Ionicons name="add" size={20} color="#374151" />
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>Use &apos;Last&apos; for the last day of the month.</Text>
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="monthly" amount={amount} />
    </ScrollView>
  );
}

// ─── Yearly tab ───────────────────────────────────────────────────────────────

function YearlyTab({
  amount, setAmount, targetDate, setTargetDate, behavior, setBehavior,
}: {
  amount: string; setAmount: (v: string) => void;
  targetDate: string; setTargetDate: (v: string) => void;
  behavior: TargetBehavior; setBehavior: (v: TargetBehavior) => void;
}) {
  // Split into MM and DD for simple pickers
  const parts = targetDate ? targetDate.split('-') : ['', '12', '31'];
  const mm = parts[1] ?? '12';
  const dd = parts[2] ?? '31';

  function updateDate(newMm: string, newDd: string) {
    const year = new Date().getFullYear();
    setTargetDate(`${year}-${newMm.padStart(2, '0')}-${newDd.padStart(2, '0')}`);
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <Text style={s.sentence}>I need to save</Text>
      <AmountInput value={amount} onChange={setAmount} />
      <Text style={s.sentence}>by</Text>

      <View style={s.section}>
        <Text style={s.sectionLabel}>Due on</Text>
        <View style={s.dateRow}>
          <TextInput
            style={s.dateInput}
            value={mm}
            onChangeText={(v) => updateDate(v, dd)}
            keyboardType="numeric"
            maxLength={2}
            placeholder="MM"
          />
          <Text style={s.dateSep}>/</Text>
          <TextInput
            style={s.dateInput}
            value={dd}
            onChangeText={(v) => updateDate(mm, v)}
            keyboardType="numeric"
            maxLength={2}
            placeholder="DD"
          />
        </View>
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="yearly" amount={amount} />

      <Text style={s.hint}>
        MoniMata will spread the saving goal evenly over the months until the target date.
      </Text>
    </ScrollView>
  );
}

// ─── Custom tab ───────────────────────────────────────────────────────────────

function CustomTab({
  amount, setAmount, targetDate, setTargetDate, repeats, setRepeats, behavior, setBehavior,
}: {
  amount: string; setAmount: (v: string) => void;
  targetDate: string; setTargetDate: (v: string) => void;
  repeats: boolean; setRepeats: (v: boolean) => void;
  behavior: TargetBehavior; setBehavior: (v: TargetBehavior) => void;
}) {
  const parts = targetDate ? targetDate.split('-') : [String(new Date().getFullYear()), '12', '31'];
  const yyyy = parts[0] ?? String(new Date().getFullYear());
  const mm = parts[1] ?? '12';
  const dd = parts[2] ?? '31';

  function updateDate(newYyyy: string, newMm: string, newDd: string) {
    setTargetDate(`${newYyyy}-${newMm.padStart(2, '0')}-${newDd.padStart(2, '0')}`);
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <Text style={s.sentence}>Amount</Text>
      <AmountInput value={amount} onChange={setAmount} />

      <View style={s.section}>
        <Text style={s.sectionLabel}>Due on</Text>
        <View style={s.dateRow}>
          <TextInput
            style={[s.dateInput, { minWidth: 60 }]}
            value={yyyy}
            onChangeText={(v) => updateDate(v, mm, dd)}
            keyboardType="numeric"
            maxLength={4}
            placeholder="YYYY"
          />
          <Text style={s.dateSep}>/</Text>
          <TextInput
            style={s.dateInput}
            value={mm}
            onChangeText={(v) => updateDate(yyyy, v, dd)}
            keyboardType="numeric"
            maxLength={2}
            placeholder="MM"
          />
          <Text style={s.dateSep}>/</Text>
          <TextInput
            style={s.dateInput}
            value={dd}
            onChangeText={(v) => updateDate(yyyy, mm, v)}
            keyboardType="numeric"
            maxLength={2}
            placeholder="DD"
          />
        </View>
      </View>

      <View style={s.section}>
        <View style={s.repeatRow}>
          <View>
            <Text style={s.sectionLabel}>Repeasts after target date</Text>
            <Text style={s.hint}>Create a new target after completion.</Text>
          </View>
          <Switch
            value={repeats}
            onValueChange={setRepeats}
            trackColor={{ true: '#10B981', false: '#D1D5DB' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="custom" amount={amount} />
    </ScrollView>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

const TABS: TargetFrequency[] = ['weekly', 'monthly', 'yearly', 'custom'];
const TAB_LABELS: Record<TargetFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom',
};

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TargetEditScreen() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { selectedMonth } = useAppSelector((s) => s.budget);

  const { data: existingTarget, isLoading } = useTarget(categoryId);
  const upsert = useUpsertTarget(selectedMonth);

  // Form state
  const [tab, setTab] = useState<TargetFrequency>('monthly');
  const [amount, setAmount] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(5); // Saturday
  const [dayOfMonth, setDayOfMonth] = useState(0); // Last day of month
  const [targetDate, setTargetDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [repeats, setRepeats] = useState(false);
  const [behavior, setBehavior] = useState<TargetBehavior>('set_aside');

  // Pre-populate from existing target
  useEffect(() => {
    if (!existingTarget) return;
    setTab(existingTarget.frequency);
    setAmount(koboToNaira(existingTarget.target_amount));
    if (existingTarget.day_of_week != null) setDayOfWeek(existingTarget.day_of_week);
    if (existingTarget.day_of_month != null) setDayOfMonth(existingTarget.day_of_month);
    if (existingTarget.target_date) setTargetDate(existingTarget.target_date);
    setRepeats(existingTarget.repeats ?? false);
    setBehavior(existingTarget.behavior);
  }, [existingTarget]);

  function handleSave() {
    const koboAmount = nairaStringToKobo(amount);
    if (koboAmount <= 0) return;

    upsert.mutate(
      {
        categoryId,
        body: {
          frequency: tab,
          behavior,
          target_amount: koboAmount,
          day_of_week: tab === 'weekly' ? dayOfWeek : null,
          day_of_month: tab === 'monthly' ? dayOfMonth : null,
          target_date: (tab === 'yearly' || tab === 'custom') ? targetDate : null,
          repeats: tab === 'custom' ? repeats : false,
        },
      },
      { onSuccess: () => router.back() },
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
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Set Target</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
              {TAB_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Tab content */}
        <View style={{ flex: 1 }}>
          {tab === 'weekly' && (
            <WeeklyTab
              amount={amount} setAmount={setAmount}
              dayOfWeek={dayOfWeek} setDayOfWeek={setDayOfWeek}
              behavior={behavior} setBehavior={setBehavior}
            />
          )}
          {tab === 'monthly' && (
            <MonthlyTab
              amount={amount} setAmount={setAmount}
              dayOfMonth={dayOfMonth} setDayOfMonth={setDayOfMonth}
              behavior={behavior} setBehavior={setBehavior}
            />
          )}
          {tab === 'yearly' && (
            <YearlyTab
              amount={amount} setAmount={setAmount}
              targetDate={targetDate} setTargetDate={setTargetDate}
              behavior={behavior} setBehavior={setBehavior}
            />
          )}
          {tab === 'custom' && (
            <CustomTab
              amount={amount} setAmount={setAmount}
              targetDate={targetDate} setTargetDate={setTargetDate}
              repeats={repeats} setRepeats={setRepeats}
              behavior={behavior} setBehavior={setBehavior}
            />
          )}
        </View>

        {/* Save button */}
        <View style={s.saveBar}>
          <TouchableOpacity
            style={[s.saveBtn, upsert.isPending && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={upsert.isPending}
          >
            {upsert.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>Save target</Text>
            )}
          </TouchableOpacity>
        </View>
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

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#0F7B3F' },
  tabLabel: { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  tabLabelActive: { color: '#0F7B3F' },

  tabContent: {
    padding: 20,
    paddingBottom: 40,
  },

  sentence: { fontSize: 20, fontWeight: '600', color: '#374151', marginBottom: 4, marginTop: 12 },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginVertical: 8,
    backgroundColor: '#F0FDF4',
  },
  currencySymbol: { fontSize: 24, fontWeight: '700', color: '#0F7B3F', marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '800',
    color: '#0F7B3F',
    padding: 0,
  },

  section: { marginTop: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginBottom: 10, letterSpacing: 0.5 },

  weekdayRow: { flexDirection: 'row', gap: 6 },
  weekdayBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  weekdayBtnActive: { backgroundColor: '#0F7B3F' },
  weekdayText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  weekdayTextActive: { color: '#fff' },

  dayInputRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  dayStepBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayValue: { fontSize: 24, fontWeight: '800', color: '#111827', minWidth: 44, textAlign: 'center' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: {
    minWidth: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  dateSep: { fontSize: 20, fontWeight: '600', color: '#9CA3AF' },

  repeatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  hint: { fontSize: 13, color: '#6B7280', marginTop: 10, lineHeight: 18 },

  behaviorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#F9FAFB',
  },
  behaviorRowActive: { backgroundColor: '#F0FDF4' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioOuterActive: { borderColor: '#0F7B3F' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0F7B3F' },
  behaviorText: { flex: 1 },
  behaviorLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  behaviorDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

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
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
