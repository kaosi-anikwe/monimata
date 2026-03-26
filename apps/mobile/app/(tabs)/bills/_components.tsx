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
 * Shared components, helpers, and StyleSheet for the bills flow.
 * This file is NOT a route (underscore prefix tells Expo Router to ignore it).
 */

import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';
import { type_ } from '@/lib/typography';
import { formatNaira } from '@/utils/money';
import { useBillHistory } from '@/hooks/useBills';
import type { BankAccount } from '@/types/account';
import type { BillHistoryItem } from '@/types/bills';
import type { CategoryItem } from '@/types/category';
import { radius, shadow, spacing } from '@/lib/tokens';

// ── Step type (stepper display only) ─────────────────────────────────────────

export type BillStep =
  | 'categories'
  | 'billers'
  | 'payment_items'
  | 'customer_form'
  | 'confirm'
  | 'webview'
  | 'processing'
  | 'receipt';

// ── Category icon + background helpers ───────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  airtime: 'phone-portrait-outline',
  data: 'wifi-outline',
  electricity: 'flash-outline',
  water: 'water-outline',
  cable: 'tv-outline',
  insurance: 'shield-checkmark-outline',
  toll: 'car-outline',
  transport: 'car-outline',
  school: 'school-outline',
  education: 'school-outline',
  travel: 'airplane-outline',
};

export function categoryIcon(name: string): React.ComponentProps<typeof Ionicons>['name'] {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return 'receipt-outline';
}

type TokenKey =
  | 'warningSubtle'
  | 'infoSubtle'
  | 'tealSubtle'
  | 'errorSubtle'
  | 'purpleSubtle'
  | 'successSubtle'
  | 'surface';

export function categoryBgToken(name: string): TokenKey {
  const lower = name.toLowerCase();
  if (lower.includes('electric') || lower.includes('toll') || lower.includes('transport')) return 'warningSubtle';
  if (lower.includes('airtime') || lower.includes('data') || lower.includes('water')) return 'infoSubtle';
  if (lower.includes('cable') || lower.includes('tv')) return 'tealSubtle';
  if (lower.includes('travel') || lower.includes('air')) return 'errorSubtle';
  if (lower.includes('edu') || lower.includes('school')) return 'purpleSubtle';
  if (lower.includes('insur')) return 'successSubtle';
  return 'surface';
}

// ── Progress stepper ──────────────────────────────────────────────────────────

const STEPPER_STEPS: { label: string; steps: BillStep[] }[] = [
  { label: 'Biller', steps: ['billers', 'payment_items'] },
  { label: 'Details', steps: ['customer_form'] },
  { label: 'Confirm', steps: ['confirm', 'webview', 'processing', 'receipt'] },
];

export function stepIndexOf(step: BillStep): number {
  for (let i = 0; i < STEPPER_STEPS.length; i++) {
    if ((STEPPER_STEPS[i].steps as BillStep[]).includes(step)) return i;
  }
  return 0;
}

export function BillStepper({ currentStep }: { currentStep: BillStep }) {
  const colors = useTheme();
  const active = stepIndexOf(currentStep);

  return (
    <View style={ss.stepper}>
      {STEPPER_STEPS.map((s, i) => {
        const isDone = i < active;
        const isActive = i === active;
        const circBg = isDone ? colors.brand : isActive ? colors.lime : colors.surfaceElevated;
        const circTxt = isDone ? colors.white : isActive ? colors.darkGreen : colors.textMeta;
        const lblColor = isDone || isActive ? colors.brand : colors.textMeta;

        return (
          <React.Fragment key={s.label}>
            {i > 0 && (
              <View
                style={[
                  ss.stepLine,
                  { backgroundColor: i <= active ? colors.brand : colors.surfaceElevated },
                ]}
              />
            )}
            <View style={ss.stepCircleWrap}>
              <View style={[ss.stepCircle, { backgroundColor: circBg }]}>
                <Text style={[ss.stepCircleTxt, { color: circTxt }]}>
                  {isDone ? '✓' : String(i + 1)}
                </Text>
              </View>
              <Text style={[ss.stepLbl, { color: lblColor }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Categories dark header ────────────────────────────────────────────────────

export function CategoriesHeader({
  showHistory,
  onToggleHistory,
}: {
  showHistory: boolean;
  onToggleHistory: () => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        ss.darkHeader,
        { paddingTop: insets.top + spacing.lg, backgroundColor: colors.darkGreen },
      ]}
    >
      <View style={ss.darkHeaderRow}>
        <Text style={[ss.darkHeaderTitle, { color: colors.white }]}>Pay Bills</Text>
        <TouchableOpacity
          style={[
            ss.histToggleBtn,
            { backgroundColor: colors.overlayGhost, borderColor: colors.overlayGhostBorder },
          ]}
          onPress={onToggleHistory}
          activeOpacity={0.7}
        >
          <Text style={[ss.histToggleTxt, { color: colors.textInverseMid }]}>
            {showHistory ? 'Categories' : 'History'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[ss.darkHeaderSub, { color: colors.textInverseFaint }]}>
        Quick, secure bill payments via Interswitch
      </Text>
    </View>
  );
}

// ── Detail white header (billers → confirm) ───────────────────────────────────

export function DetailHeader({
  title,
  step,
  onBack,
}: {
  title: string;
  step: BillStep;
  onBack: () => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        ss.detailHeaderWrap,
        { backgroundColor: colors.cardBg, borderBottomColor: colors.border },
      ]}
    >
      <View style={[ss.detailHeaderRow, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={ss.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text
          style={[ss.detailTitle, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={ss.backBtn} />
      </View>
      <BillStepper currentStep={step} />
    </View>
  );
}

// ── 3-column category card ────────────────────────────────────────────────────

export function CategoryCard({
  item,
  onPress,
}: {
  item: { id: string; name: string };
  onPress: () => void;
}) {
  const colors = useTheme();
  const iconBg = colors[categoryBgToken(item.name)];

  return (
    <TouchableOpacity
      style={[ss.categoryCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[ss.categoryIconTile, { backgroundColor: iconBg }]}>
        <Ionicons name={categoryIcon(item.name)} size={22} color={colors.brand} />
      </View>
      <Text style={[ss.categoryName, { color: colors.textPrimary }]} numberOfLines={2}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );
}

// ── List row (billers + payment items) ────────────────────────────────────────

export function BillListRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const colors = useTheme();

  return (
    <TouchableOpacity
      style={[ss.listRow, { backgroundColor: colors.cardBg }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[ss.listRowIcon, { backgroundColor: colors.surfaceElevated }]}>
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <View style={ss.listRowInfo}>
        <Text style={[ss.listRowTitle, { color: colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[ss.listRowSub, { color: colors.textMeta }]}>{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMeta} />
    </TouchableOpacity>
  );
}

// ── Account picker ────────────────────────────────────────────────────────────

export function AccountPicker({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: BankAccount[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const colors = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={ss.accountScroll}
      contentContainerStyle={ss.accountScrollContent}
    >
      {accounts.map((a) => {
        const active = a.id === selectedId;
        return (
          <TouchableOpacity
            key={a.id}
            style={[
              ss.accountChip,
              {
                borderColor: active ? colors.brand : colors.border,
                backgroundColor: active ? colors.surfaceElevated : colors.cardBg,
              },
            ]}
            onPress={() => onSelect(a.id)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                ss.accountChipInst,
                { color: active ? colors.brand : colors.textSecondary },
              ]}
            >
              {a.institution}
            </Text>
            <Text
              style={[
                ss.accountChipBal,
                { color: active ? colors.brand : colors.textMeta },
              ]}
            >
              {formatNaira(a.balance)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Budget category picker ────────────────────────────────────────────────────

export interface CategoryGroup {
  id: string;
  name: string;
  categories: CategoryItem[];
}

export function CategoryPickerField({
  groups,
  selectedId,
  onSelect,
}: {
  groups: CategoryGroup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const colors = useTheme();

  const selectedName = selectedId
    ? groups.flatMap((g) => g.categories).find((c) => c.id === selectedId)?.name
    : null;

  return (
    <View>
      <TouchableOpacity
        style={[
          ss.catPickerTrigger,
          { backgroundColor: colors.cardBg, borderColor: colors.border },
        ]}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.75}
      >
        <Ionicons name="folder-outline" size={16} color={colors.brand} />
        <Text style={[ss.catPickerTriggerText, { color: colors.textSecondary }]}>
          {selectedName ?? 'None — skip budget tracking'}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textMeta}
        />
      </TouchableOpacity>

      {open && (
        <View
          style={[
            ss.catPickerPanel,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* None option */}
          <TouchableOpacity
            style={[
              ss.catChip,
              {
                backgroundColor: !selectedId ? colors.brand : colors.cardBg,
                borderColor: !selectedId ? colors.brand : colors.border,
              },
            ]}
            onPress={() => { onSelect(null); setOpen(false); }}
            activeOpacity={0.75}
          >
            <Text
              style={[
                ss.catChipText,
                { color: !selectedId ? colors.white : colors.textSecondary },
              ]}
            >
              None
            </Text>
          </TouchableOpacity>

          {groups
            .filter((g) => g.categories.length > 0)
            .map((g) => (
              <View key={g.id}>
                <Text style={[ss.catGroupLabel, { color: colors.textMeta }]}>{g.name}</Text>
                <View style={ss.catChipRow}>
                  {g.categories.map((c) => {
                    const active = selectedId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          ss.catChip,
                          {
                            backgroundColor: active ? colors.brand : colors.cardBg,
                            borderColor: active ? colors.brand : colors.border,
                          },
                        ]}
                        onPress={() => { onSelect(c.id); setOpen(false); }}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            ss.catChipText,
                            { color: active ? colors.white : colors.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
        </View>
      )}
    </View>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

export function HistoryRow({ item }: { item: BillHistoryItem }) {
  const colors = useTheme();

  return (
    <View style={[ss.historyRow, { backgroundColor: colors.cardBg }]}>
      <View style={[ss.historyIconTile, { backgroundColor: colors.surface }]}>
        <Ionicons name="receipt-outline" size={18} color={colors.brand} />
      </View>
      <View style={ss.historyLeft}>
        <Text style={[ss.historyNarration, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.narration}
        </Text>
        <Text style={[ss.historyRef, { color: colors.textMeta }]} numberOfLines={1}>
          {item.reference}
        </Text>
        <Text style={[ss.historyDate, { color: colors.textMeta }]}>
          {new Date(item.date).toLocaleDateString('en-NG', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Text>
      </View>
      <Text style={[ss.historyAmount, { color: colors.error }]}>
        -{formatNaira(Math.abs(item.amount))}
      </Text>
    </View>
  );
}

// ── History full-page list ────────────────────────────────────────────────────

export function HistoryView() {
  const { data: history = [], isLoading } = useBillHistory();
  const colors = useTheme();

  if (isLoading) {
    return <ActivityIndicator style={ss.loader} color={colors.brand} />;
  }

  if (history.length === 0) {
    return (
      <View style={ss.emptyContainer}>
        <Ionicons name="receipt-outline" size={52} color={colors.surfaceHigh} />
        <Text style={[ss.emptyTitle, { color: colors.textSecondary }]}>
          No bill payments yet
        </Text>
        <Text style={[ss.emptySub, { color: colors.textMeta }]}>
          Your Interswitch payments will appear here.
        </Text>
      </View>
    );
  }

  return (
    <FlashList
      data={history}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 40 }}
      ItemSeparatorComponent={() => (
        <View style={[ss.separator, { backgroundColor: colors.separator }]} />
      )}
      renderItem={({ item }) => <HistoryRow item={item} />}
    />
  );
}

// ── Summary row ───────────────────────────────────────────────────────────────

export function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  const colors = useTheme();

  return (
    <View style={ss.summaryRow}>
      <Text style={[ss.summaryLabel, { color: colors.textMeta }]}>{label}</Text>
      <Text
        style={[
          ss.summaryValue,
          { color: bold ? colors.brand : colors.textPrimary },
          bold && ss.summaryValueBold,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Static styles ─────────────────────────────────────────────────────────────
// Layout and structural styles only — all colours applied dynamically via useTheme().

export const ss = StyleSheet.create({
  screenFlex: { flex: 1 },
  flex1: { flex: 1 },
  loader: { flex: 1, marginTop: 40 },

  // ── Dark green header (categories step) ────────────────────────────────────
  darkHeader: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    flexShrink: 0,
  },
  darkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  darkHeaderTitle: {
    ...type_.h1,
  },
  darkHeaderSub: {
    ...type_.bodyReg,
  },
  histToggleBtn: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  histToggleTxt: {
    ...type_.btnSm,
  },

  // ── White detail header + stepper (billers to confirm) ─────────────────────
  detailHeaderWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  detailTitle: {
    flex: 1,
    ...type_.h2,
    textAlign: 'center',
    marginHorizontal: spacing.xs,
  },

  // ── Progress stepper ───────────────────────────────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.mdn,
    paddingTop: spacing.sm,
  },
  stepCircleWrap: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleTxt: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  stepLbl: {
    fontSize: 9,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    marginTop: 3,
    textAlign: 'center',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginTop: 12,
    marginHorizontal: spacing.xs,
  },

  // ── Categories grid ────────────────────────────────────────────────────────
  sectionLabelRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.mdn,
    paddingBottom: spacing.xs,
  },
  sectionLabel: { ...type_.label },
  categoryGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.smd,
  },
  categoryCard: {
    width: '30.5%',
    borderRadius: radius.md,
    padding: spacing.mdn,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...shadow.sm,
  },
  categoryIconTile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryName: {
    ...type_.caption,
    textAlign: 'center',
  },

  // ── Recent Payments section ────────────────────────────────────────────────
  recentSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  recentCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginTop: spacing.sm,
    ...shadow.sm,
  },
  viewAllBtn: { paddingTop: spacing.md, alignItems: 'center' },
  viewAllTxt: { ...type_.bodyReg },

  // ── List rows (billers + payment items) ────────────────────────────────────
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: 40,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.mdn,
  },
  listRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  listRowInfo: { flex: 1 },
  listRowTitle: { ...type_.body },
  listRowSub: { ...type_.small, marginTop: 2 },

  // ── History rows ───────────────────────────────────────────────────────────
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  historyIconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  historyLeft: { flex: 1 },
  historyNarration: { ...type_.body },
  historyRef: { ...type_.caption, marginTop: 2 },
  historyDate: { ...type_.small, marginTop: 2 },
  historyAmount: { ...type_.mono },

  // ── Customer form ──────────────────────────────────────────────────────────
  formContent: { padding: spacing.xl, paddingBottom: 48 },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  contextChipText: { ...type_.small },
  fieldLabel: {
    ...type_.small,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    marginBottom: spacing.sm - 2,
    marginTop: spacing.lg,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.mdn,
    paddingVertical: spacing.md,
    ...type_.body,
  },
  fixedAmountBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.mdn,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  fixedAmountLabel: { ...type_.bodyReg },
  fixedAmountValue: { ...type_.mono },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.mdn,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  warningText: { flex: 1, ...type_.bodyReg },

  // ── Budget category picker ─────────────────────────────────────────────────
  catPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.mdn,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  catPickerTriggerText: { flex: 1, ...type_.body },
  catPickerPanel: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  catGroupLabel: {
    ...type_.label,
    marginTop: spacing.smd,
    marginBottom: spacing.sm,
  },
  catChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm - 2 },
  catChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.md,
  },
  catChipText: { ...type_.bodyReg },

  // ── Account picker ─────────────────────────────────────────────────────────
  accountScroll: { marginTop: spacing.xs },
  accountScrollContent: { gap: spacing.smd, paddingRight: spacing.xs },
  accountChip: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.mdn,
    minWidth: 130,
  },
  accountChipInst: {
    ...type_.bodyReg,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  accountChipBal: { ...type_.small, marginTop: 2 },

  // ── Confirm card ───────────────────────────────────────────────────────────
  confirmCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  summaryGroupLabel: {
    ...type_.label,
    marginBottom: spacing.smd,
  },
  confirmDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.smd,
    gap: spacing.md,
  },
  summaryLabel: { ...type_.bodyReg, flex: 1 },
  summaryValue: { ...type_.body, flex: 2, textAlign: 'right' },
  summaryValueBold: { ...type_.mono },

  // ── Security note ──────────────────────────────────────────────────────────
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  securityNoteText: { flex: 1, ...type_.small },

  // ── Buttons ────────────────────────────────────────────────────────────────
  primaryBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.mdn + 1,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { ...type_.btnLg },
  limeBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.mdn + 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  limeBtnText: { ...type_.btnLg },
  disclaimer: {
    marginTop: spacing.mdn,
    ...type_.caption,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Receipt ────────────────────────────────────────────────────────────────
  receiptIconWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    marginBottom: spacing.md,
  },
  receiptCheckCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptStatusLbl: {
    ...type_.label,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  receiptAmount: {
    fontSize: 34,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  receiptNarration: {
    ...type_.bodyReg,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pendingNote: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  pendingNoteTxt: { ...type_.small, textAlign: 'center' },
  receiptCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },

  // ── Processing ─────────────────────────────────────────────────────────────
  processingText: {
    ...type_.body,
    marginTop: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: { ...type_.body, marginTop: spacing.md },
  emptySub: { ...type_.bodyReg, marginTop: spacing.sm, textAlign: 'center' },

  // ── Separator ──────────────────────────────────────────────────────────────
  separator: { height: StyleSheet.hairlineWidth },
});
