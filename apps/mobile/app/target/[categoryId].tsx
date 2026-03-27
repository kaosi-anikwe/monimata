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
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ff } from '@/lib/typography';
import { useTheme } from '@/lib/theme';
import { useBudget } from '@/hooks/useBudget';
import { radius, spacing } from '@/lib/tokens';
import { useAppSelector } from '@/store/hooks';
import { nairaStringToKobo } from '@/utils/money';
import { useTarget, useUpsertTarget } from '@/hooks/useTargets';
import type { TargetBehavior, TargetFrequency } from '@/types/target';
import DateTimePicker from '@react-native-community/datetimepicker';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function koboToNaira(kobo: number): string {
  return (kobo / 100).toFixed(0);
}

// ─── Amount input ─────────────────────────────────────────────────────────────

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useTheme();
  // Display formatted with commas; store raw digits only
  const formatted = value ? Number(value).toLocaleString('en-NG') : '';

  function handleChange(text: string) {
    // Strip all non-digit characters before storing
    const raw = text.replace(/[^0-9]/g, '');
    onChange(raw);
  }

  return (
    <View style={[ts.amountRow, {
      backgroundColor: colors.surface,
      borderColor: colors.brand,
    }]}>
      <Text style={[ts.currencySymbol, { color: colors.brand }]}>₦</Text>
      <TextInput
        style={[ts.amountInput, { color: colors.brand }]}
        value={formatted}
        onChangeText={handleChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.textTertiary}
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
  const colors = useTheme();

  const heading = {
    weekly: 'Next week I want to',
    monthly: 'Next month I want to',
    yearly: 'Next year I want to',
    custom: 'I want to',
  }[frequency];

  const freqSuffix = { weekly: '/week', monthly: '/month', yearly: '/year', custom: '' }[frequency];
  const amtLabel = amount ? `₦${Number(amount).toLocaleString('en-NG')}${freqSuffix}` : 'the target amount';

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
    <View style={ts.section}>
      <Text style={[ts.sectionLabel, { color: colors.textMeta }]}>{heading}</Text>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          style={[ts.behaviorRow, {
            backgroundColor: value === opt.key ? colors.surface : colors.background,
            borderWidth: 1.5,
            borderColor: value === opt.key ? colors.brand : colors.border,
          }]}
          onPress={() => onChange(opt.key)}
          activeOpacity={0.7}
        >
          <View style={[ts.radioOuter, {
            borderColor: value === opt.key ? colors.brand : colors.borderStrong,
          }]}>
            {value === opt.key ? (
              <View style={[ts.radioInner, { backgroundColor: colors.brand }]} />
            ) : null}
          </View>
          <View style={ts.behaviorText}>
            <Text style={[ts.behaviorLabel, { color: value === opt.key ? colors.brand : colors.textPrimary }]}>
              {opt.label}
            </Text>
            <Text style={[ts.behaviorDesc, { color: colors.textMeta }]}>{opt.desc}</Text>
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
  const colors = useTheme();
  return (
    <ScrollView contentContainerStyle={ts.tabContent}>
      <Text style={[ts.sentence, { color: colors.textSecondary }]}>I need</Text>
      <AmountInput value={amount} onChange={setAmount} />
      <Text style={[ts.sentence, { color: colors.textSecondary }]}>every week</Text>

      <View style={ts.section}>
        <Text style={[ts.sectionLabel, { color: colors.textMeta }]}>Due by</Text>
        <View style={ts.weekdayRow}>
          {WEEKDAYS.map((d, i) => (
            <TouchableOpacity
              key={d}
              style={[ts.weekdayBtn, {
                backgroundColor: dayOfWeek === i ? colors.brand : colors.surface,
              }]}
              onPress={() => setDayOfWeek(i)}
            >
              <Text style={[ts.weekdayText, { color: dayOfWeek === i ? colors.white : colors.textMeta }]}>
                {d}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="weekly" amount={amount} />

      <Text style={[ts.hint, { color: colors.textMeta }]}>
        MoniMata will remind you to assign ₦{Number(amount || '0').toLocaleString('en-NG')} by each {WEEKDAYS[dayOfWeek]}.
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
  const colors = useTheme();
  return (
    <ScrollView contentContainerStyle={ts.tabContent}>
      <Text style={[ts.sentence, { color: colors.textSecondary }]}>I need</Text>
      <AmountInput value={amount} onChange={setAmount} />
      <Text style={[ts.sentence, { color: colors.textSecondary }]}>every month</Text>

      <View style={ts.section}>
        <Text style={[ts.sectionLabel, { color: colors.textMeta }]}>Due by day of month</Text>
        <View style={ts.dayInputRow}>
          <TouchableOpacity
            style={[ts.dayStepBtn, { backgroundColor: colors.surface }]}
            onPress={() => setDayOfMonth(Math.max(1, dayOfMonth - 1))}
          >
            <Ionicons name="remove" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[ts.dayValue, { color: colors.textPrimary }]}>
            {dayOfMonth === 0 ? 'Last' : dayOfMonth}
          </Text>
          <TouchableOpacity
            style={[ts.dayStepBtn, { backgroundColor: colors.surface }]}
            onPress={() => setDayOfMonth(dayOfMonth >= 28 ? 0 : dayOfMonth + 1)}
          >
            <Ionicons name="add" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={[ts.hint, { color: colors.textMeta }]}>
          Use &apos;Last&apos; for the last day of the month.
        </Text>
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="monthly" amount={amount} />
    </ScrollView>
  );
}

// ─── Date picker field ───────────────────────────────────────────────────────

/**
 * Tappable date button that opens an inline spinner (iOS) or native dialog
 * (Android).  Passes the selected date back as a "YYYY-MM-DD" string.
 */
function DatePickerField({
  value,
  onChange,
  showYear = true,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Set to false on Yearly tab where the year is implicit. */
  showYear?: boolean;
}) {
  const colors = useTheme();
  const [open, setOpen] = useState(false);

  const parts = value.split('-');
  const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function handleChange(_: unknown, selected?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (!selected) return;
    const y = selected.getFullYear();
    const m = String(selected.getMonth() + 1).padStart(2, '0');
    const d = String(selected.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
  }

  const displayDate = dateObj.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    ...(showYear ? { year: 'numeric' } : {}),
  });

  return (
    <View>
      <TouchableOpacity
        style={[ts.dateBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Select date"
      >
        <Ionicons name="calendar-outline" size={16} color={colors.brand} />
        <Text style={[ts.dateBtnTxt, { color: colors.textPrimary }]}>{displayDate}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMeta} />
      </TouchableOpacity>

      {open && (
        Platform.OS === 'android' ? (
          // On Android the picker is a native modal dialog — no wrapper needed.
          <DateTimePicker
            value={dateObj}
            mode="date"
            display="default"
            onChange={handleChange}
            minimumDate={today}
          />
        ) : (
          // On iOS, render an inline spinner with our color scheme + a Done button.
          <View style={[ts.datePickerWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <DateTimePicker
              value={dateObj}
              mode="date"
              display="spinner"
              onChange={handleChange}
              minimumDate={today}
              accentColor={colors.brand}
              textColor={colors.textPrimary}
              style={{ alignSelf: 'stretch' }}
            />
            <TouchableOpacity
              style={[ts.datePickerDone, { backgroundColor: colors.brand }]}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Confirm date"
            >
              <Text style={[ts.datePickerDoneTxt, { color: colors.white }]}>Done</Text>
            </TouchableOpacity>
          </View>
        )
      )}
    </View>
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
  const colors = useTheme();
  return (
    <ScrollView contentContainerStyle={ts.tabContent}>
      <Text style={[ts.sentence, { color: colors.textSecondary }]}>I need to save</Text>
      <AmountInput value={amount} onChange={setAmount} />
      <Text style={[ts.sentence, { color: colors.textSecondary }]}>by</Text>

      <View style={ts.section}>
        <Text style={[ts.sectionLabel, { color: colors.textMeta }]}>Due on</Text>
        <DatePickerField value={targetDate} onChange={setTargetDate} showYear={false} />
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="yearly" amount={amount} />

      <Text style={[ts.hint, { color: colors.textMeta }]}>
        MoniMata will spread the saving goal evenly over the months until the target date.
      </Text>
    </ScrollView>
  );
}

// ─── Custom tab ───────────────────────────────────────────────────────────────

function CustomTab({
  amount, setAmount, targetDate, setTargetDate, behavior, setBehavior,
}: {
  amount: string; setAmount: (v: string) => void;
  targetDate: string; setTargetDate: (v: string) => void;
  behavior: TargetBehavior; setBehavior: (v: TargetBehavior) => void;
}) {
  const colors = useTheme();
  return (
    <ScrollView contentContainerStyle={ts.tabContent}>
      <Text style={[ts.sentence, { color: colors.textSecondary }]}>Amount</Text>
      <AmountInput value={amount} onChange={setAmount} />

      <View style={ts.section}>
        <Text style={[ts.sectionLabel, { color: colors.textMeta }]}>Due on</Text>
        <DatePickerField value={targetDate} onChange={setTargetDate} />
      </View>

      <BehaviorPicker value={behavior} onChange={setBehavior} frequency="custom" amount={amount} />
    </ScrollView>
  );
}

// ─── Tab constants ────────────────────────────────────────────────────────────

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
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { selectedMonth } = useAppSelector((s) => s.budget);

  const upsert = useUpsertTarget(selectedMonth);
  const { data: budget } = useBudget(selectedMonth);
  const { data: existingTarget, isLoading } = useTarget(categoryId);

  const category = budget?.groups.flatMap(g => g.categories).find(c => c.id === categoryId);

  // Form state
  const [tab, setTab] = useState<TargetFrequency>('monthly');
  const [slideDir, setSlideDir] = useState<'forward' | 'back'>('forward');
  const [pillBarWidth, setPillBarWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));
  const [amount, setAmount] = useState('');

  function handleTabPress(newTab: TargetFrequency) {
    const idx = TABS.indexOf(newTab);
    setSlideDir(idx >= TABS.indexOf(tab) ? 'forward' : 'back');
    setTab(newTab);
    // indicatorX is kept in sync by the tab/pillBarWidth useEffect below.
  }
  const [dayOfWeek, setDayOfWeek] = useState(5); // Saturday
  const [dayOfMonth, setDayOfMonth] = useState(0); // Last day of month
  const [targetDate, setTargetDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [behavior, setBehavior] = useState<TargetBehavior>('set_aside');

  // Pre-populate from existing target
  useEffect(() => {
    if (!existingTarget) return;
    setTab(existingTarget.frequency);
    setAmount(koboToNaira(existingTarget.target_amount));
    if (existingTarget.day_of_week != null) setDayOfWeek(existingTarget.day_of_week);
    if (existingTarget.day_of_month != null) setDayOfMonth(existingTarget.day_of_month);
    if (existingTarget.target_date) setTargetDate(existingTarget.target_date);
    setBehavior(existingTarget.behavior);
  }, [existingTarget]);

  // Keep the pill indicator in sync with the active tab.
  // This must be a separate effect (not inline in onLayout or handleTabPress only)
  // because the pre-population useEffect above calls setTab() directly, bypassing
  // handleTabPress, so indicatorX would otherwise stay on the default 'monthly'
  // position when editing an existing target.
  useEffect(() => {
    if (pillBarWidth === 0) return;
    const idx = TABS.indexOf(tab);
    indicatorX.value = withTiming(idx * ((pillBarWidth - 6) / TABS.length), { duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pillBarWidth]);

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
          repeats: false,
        },
      },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <View style={[ts.flex, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      {/* ── Dark green header ── */}
      <View
        style={[ts.hdr, {
          paddingTop: insets.top + 10,
          borderBottomLeftRadius: radius.xl,
          borderBottomRightRadius: radius.xl,
        }]}
      >
        <LinearGradient
          colors={[colors.darkGreen, colors.darkGreenMid]}
          style={StyleSheet.absoluteFill}
        />
        {/* Back row */}
        <View style={ts.hdrTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={[ts.backBtn, { backgroundColor: colors.overlayGhost }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <Text style={[ts.hdrTitle, { color: colors.white }]} numberOfLines={1}>
            {category ? `Set Target — ${category.name}` : 'Set Target'}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Pill tab bar (.hub-tabs style) */}
        <View
          style={[ts.pillBar, { backgroundColor: colors.overlayGhost }]}
          onLayout={(e) => setPillBarWidth(e.nativeEvent.layout.width)}
        >
          {/* Sliding selected pill */}
          {pillBarWidth > 0 && (
            <Animated.View
              style={[
                ts.pillIndicator,
                { width: (pillBarWidth - 6) / TABS.length, backgroundColor: colors.lime },
                indicatorStyle,
              ]}
            />
          )}
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              style={ts.pillTab}
              onPress={() => handleTabPress(t)}
              activeOpacity={0.8}
            >
              <Text style={[ts.pillTabText, { color: tab === t ? colors.darkGreen : colors.textInverseSecondary }]}>
                {TAB_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Tab content ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={ts.flex}
      >
        <View style={[ts.flex, { overflow: 'hidden' }]}>
          <Animated.View
            key={tab}
            style={StyleSheet.absoluteFill}
            entering={slideDir === 'forward' ? SlideInRight.duration(260) : SlideInLeft.duration(260)}
            exiting={slideDir === 'forward' ? SlideOutLeft.duration(260) : SlideOutRight.duration(260)}
          >
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
                behavior={behavior} setBehavior={setBehavior}
              />
            )}
          </Animated.View>
        </View>

        {/* ── Save bar ── */}
        <View style={[ts.saveBar, {
          backgroundColor: colors.cardBg,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + spacing.mdn,
        }]}>
          <TouchableOpacity
            style={[ts.saveBtn, { backgroundColor: colors.brand }, (upsert.isPending || isLoading) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={upsert.isPending || isLoading}
            activeOpacity={0.85}
          >
            {(upsert.isPending || isLoading) ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={[ts.saveBtnText, { color: colors.white }]}>Save target</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const ts = StyleSheet.create({
  flex: { flex: 1 },

  // ── Header ───────────────────────────────────────────────────────────────
  hdr: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    flexShrink: 0,
    overflow: 'hidden',
  },
  hdrTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  hdrTitle: { ...ff(700), fontSize: 17, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // overridden inline with colors.overlayGhost
  },

  // ── Pill tab bar (.hub-tabs) ──────────────────────────────────────────────
  pillBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 0,
  },
  pillIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 9,
  },
  pillTab: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTabText: { ...ff(600), fontSize: 13 },

  // ── Tab content ───────────────────────────────────────────────────────────
  tabContent: {
    padding: spacing.xl,
    paddingBottom: 40,
  },

  sentence: { ...ff(600), fontSize: 20, marginBottom: 4, marginTop: 12 },

  // ── Amount input ─────────────────────────────────────────────────────────
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.smd,
    marginVertical: spacing.sm,
  },
  currencySymbol: { ...ff(700), fontSize: 24, marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 32,
    ...ff(800),
    padding: 0,
  },

  // ── Section ───────────────────────────────────────────────────────────────
  section: { marginTop: 20 },
  sectionLabel: {
    ...ff(700),
    fontSize: 11,
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Weekday row ───────────────────────────────────────────────────────────
  weekdayRow: { flexDirection: 'row', gap: 6 },
  weekdayBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  weekdayText: { ...ff(600), fontSize: 12 },

  // ── Day stepper ───────────────────────────────────────────────────────────
  dayInputRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  dayStepBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayValue: { ...ff(800), fontSize: 24, minWidth: 44, textAlign: 'center' },

  // ── Date picker ───────────────────────────────────────────────────────────
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateBtnTxt: { ...ff(600), fontSize: 15, flex: 1 },
  datePickerWrap: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
  },
  datePickerDone: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  datePickerDoneTxt: { ...ff(600), fontSize: 14 },

  // ── Repeats toggle ────────────────────────────────────────────────────────
  repeatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  hint: { ...ff(400), fontSize: 13, marginTop: 10, lineHeight: 18 },

  // ── Behavior picker ───────────────────────────────────────────────────────
  behaviorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  behaviorText: { flex: 1 },
  behaviorLabel: { ...ff(600), fontSize: 15 },
  behaviorDesc: { ...ff(400), fontSize: 12, marginTop: 2 },

  // ── Save bar ──────────────────────────────────────────────────────────────
  saveBar: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  saveBtn: {
    borderRadius: radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { ...ff(700), fontSize: 16 },
});