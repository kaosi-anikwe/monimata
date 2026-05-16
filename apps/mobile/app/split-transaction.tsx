/**
 * Split Transaction screen.
 *
 * Allows a user to split a single transaction across multiple budget categories.
 * Navigated to from the Transaction Detail screen via an action on a manual transaction.
 *
 * Route: /split-transaction?id=<txId>
*/
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';

import { useToast } from '@/components/Toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { useSplitTransaction, useTransaction } from '@/hooks/useTransactions';
import { useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import type { CategoryGroup, CategoryItem } from '@/types/category';
import { formatNaira } from '@/utils/money';

// ─── Constants ───────────────────────────────────────────────────────────────

const SEG_COLORS = ['#4F6EF7', '#F77F4F', '#4FD1A7', '#F7C84F', '#A44FF7', '#F74F6E', '#4FB8F7', '#7CF74F'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface SplitLine {
  id: string;
  category: CategoryItem | null;
  /** Amount in kobo */
  amount: number;
  memo: string;
}

// ─── Category picker sheet ────────────────────────────────────────────────────

function CategoryPickerSheet({
  visible,
  groups,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  groups: CategoryGroup[];
  selected: CategoryItem | null;
  onSelect: (item: CategoryItem | null) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Category" scrollable>
      <TouchableOpacity
        style={[ss.pickRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}
        onPress={() => { onSelect(null); onClose(); }}
        accessibilityRole="button"
        accessibilityLabel="No category"
      >
        <Text style={[type_.body, { color: colors.textMeta, fontStyle: 'italic', flex: 1 }]}>
          No category
        </Text>
        {!selected && (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Polyline points="20 6 9 17 4 12" stroke={colors.brand} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
        )}
      </TouchableOpacity>
      {groups.map((g) => (
        <View key={g.name}>
          <View style={[ss.pickGroupHdr, { backgroundColor: colors.surface }]}>
            <Text style={[type_.labelSm, { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 1.2 }]}>
              {g.name}
            </Text>
          </View>
          {g.categories.map((cat, i) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                ss.pickRow,
                i < g.categories.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.separator,
                },
              ]}
              onPress={() => { onSelect(cat); onClose(); }}
              accessibilityRole="button"
              accessibilityLabel={cat.name}
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
    </BottomSheet>
  );
}

// ─── Split line row ───────────────────────────────────────────────────────────

function SplitLineRow({
  line,
  index,
  totalKobo,
  remainingKobo,
  onChange,
  onRemove,
  canRemove,
  onPickCategory,
}: {
  line: SplitLine;
  index: number;
  totalKobo: number;
  remainingKobo: number;
  onChange: (patch: Partial<SplitLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onPickCategory: () => void;
}) {
  const colors = useTheme();
  const pct = totalKobo > 0 ? Math.round((line.amount / totalKobo) * 100) : 0;
  const accentColor = SEG_COLORS[index % SEG_COLORS.length];

  function handleFill() {
    if (remainingKobo > 0) onChange({ amount: line.amount + remainingKobo });
  }

  return (
    <View style={[ss.splitRow, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
      {/* Row header: badge + category pill + delete */}
      <View style={ss.splitRowTop}>
        <View style={[ss.splitNumBadge, { backgroundColor: accentColor }]}>
          <Text style={[ss.splitNumTxt, { color: colors.white }]}>{index + 1}</Text>
        </View>

        <TouchableOpacity
          style={[ss.splitCatPill, { backgroundColor: colors.surface }]}
          onPress={onPickCategory}
          accessibilityRole="button"
          accessibilityLabel="Select category"
        >
          <Text
            style={[ss.splitCatTxt, { color: line.category ? colors.textPrimary : colors.textTertiary }]}
            numberOfLines={1}
          >
            {line.category?.name ?? 'Tap to choose…'}
          </Text>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M9 18l6-6-6-6" stroke={colors.textMeta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>

        {canRemove && (
          <TouchableOpacity
            style={[ss.splitDel, { backgroundColor: colors.surface }]}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel="Remove split"
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M18 6L6 18M6 6l12 12" stroke={colors.error} strokeWidth={2.2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        )}
      </View>

      {/* Amount row */}
      <View style={ss.splitAmtRow}>
        <View style={[ss.splitAmtWrap, { borderColor: accentColor, backgroundColor: colors.surface }]}>
          <Text style={[ss.splitAmtSymbol, { color: colors.textMeta }]}>₦</Text>
          <TextInput
            style={[ss.splitAmtInp, { color: colors.textPrimary }]}
            value={line.amount > 0 ? String(line.amount / 100) : ''}
            onChangeText={(v) => {
              const kobo = Math.round((parseFloat(v) || 0) * 100);
              onChange({ amount: kobo });
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            accessibilityLabel="Split amount"
          />
          {pct > 0 && <Text style={[ss.splitPct, { color: colors.textMeta }]}>{pct}%</Text>}
        </View>

        {remainingKobo > 0 && (
          <TouchableOpacity
            style={[ss.splitFillBtn, { borderColor: accentColor, backgroundColor: colors.surface }]}
            onPress={handleFill}
            accessibilityRole="button"
            accessibilityLabel="Fill remaining"
          >
            <Text style={[ss.splitFillTxt, { color: accentColor }]}>Fill</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Memo */}
      <View style={[ss.splitMemoRow, { borderTopColor: colors.separator }]}>
        <TextInput
          style={[ss.splitMemoInput, { color: colors.textPrimary }]}
          value={line.memo}
          onChangeText={(v) => onChange({ memo: v })}
          placeholder="Note (optional)"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          accessibilityLabel="Split note"
        />
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function SplitTransactionScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { success: showSuccess, error: showError } = useToast();
  useStatusBarStyle('light')

  const { data: tx } = useTransaction(id);
  const { data: groups = [] } = useCategoryGroups();
  const splitMutation = useSplitTransaction();

  const totalKobo = tx ? Math.abs(tx.amount) : 0;

  const [lines, setLines] = useState<SplitLine[]>([
    { id: '1', category: null, amount: totalKobo, memo: '' },
    { id: '2', category: null, amount: 0, memo: '' },
  ]);
  const [pickerForLine, setPickerForLine] = useState<string | null>(null);

  const allocatedKobo = useMemo(
    () => lines.reduce((sum, l) => sum + l.amount, 0),
    [lines],
  );
  const remainingKobo = totalKobo - allocatedKobo;
  const isBalanced = remainingKobo === 0;

  function updateLine(id: string, patch: Partial<SplitLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const newId = String(Date.now());
    setLines((prev) => [...prev, { id: newId, category: null, amount: 0, memo: '' }]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function handleSave() {
    if (!isBalanced) {
      showError('Amounts must add up to the total transaction amount.');
      return;
    }
    const uncategorised = lines.find((l) => !l.category);
    if (uncategorised) {
      showError('Every split line must have a category.');
      return;
    }
    splitMutation.mutate(
      {
        txId: id,
        splits: lines.map((l) => ({
          category_id: l.category!.id,
          amount: l.amount,
          memo: l.memo || null,
        })),
      },
      {
        onSuccess: () => {
          showSuccess('Transaction split saved.');
          router.back();
        },
        onError: () => showError('Failed to save split.'),
      },
    );
  }

  // Category picker state
  const activePickerLine = lines.find((l) => l.id === pickerForLine) ?? null;

  return (
    <View style={[ss.safe, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Split Transaction"
        onBack={() => router.back()}
        paddingTop={insets.top + 10}
      />

      <ScrollView
        style={ss.scroll}
        contentContainerStyle={[ss.scrollContent, { paddingBottom: spacing.xxxl + 60 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card: visual bar + total */}
        <View style={[ss.heroCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={ss.heroTopRow}>
            <View>
              <Text style={[ss.heroLbl, { color: colors.textMeta }]}>Total</Text>
              <Text style={[ss.heroAmt, { color: colors.textPrimary }]}>{formatNaira(totalKobo)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[ss.heroLbl, { color: colors.textMeta }]}>Allocated</Text>
              <Text style={[ss.heroAmt, { color: colors.brand }]}>{formatNaira(allocatedKobo)}</Text>
            </View>
          </View>

          {/* Segmented visual bar */}
          <View style={[ss.visualBar, { backgroundColor: colors.surface }]}>
            {lines.map((l, i) => {
              const w = totalKobo > 0 ? (l.amount / totalKobo) * 100 : 0;
              return w > 0 ? (
                <View
                  key={l.id}
                  style={{ width: `${w}%`, height: '100%', backgroundColor: SEG_COLORS[i % SEG_COLORS.length] }}
                />
              ) : null;
            })}
          </View>
          <Text style={[ss.heroHint, { color: isBalanced ? colors.success : colors.textMeta }]}>
            {isBalanced ? '✓ Perfectly balanced' : `${formatNaira(Math.abs(remainingKobo))} ${remainingKobo > 0 ? 'still to allocate' : 'over-allocated'}`}
          </Text>
        </View>

        {/* Equal-split quick chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.eqChips}>
          {[2, 3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              style={[ss.eqChip, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
              onPress={() => {
                const base = Math.floor(totalKobo / n);
                const rem = totalKobo - base * n;
                const next = Array.from({ length: n }, (_, i) => ({
                  id: String(Date.now() + i),
                  category: null,
                  amount: i === 0 ? base + rem : base,
                  memo: '',
                }));
                setLines(next);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Split equally ${n} ways`}
            >
              <Text style={[ss.eqChipTxt, { color: colors.textSecondary }]}>Equal ×{n}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Split lines */}
        {lines.map((line, i) => (
          <SplitLineRow
            key={line.id}
            line={line}
            index={i}
            totalKobo={totalKobo}
            remainingKobo={remainingKobo}
            onChange={(patch) => updateLine(line.id, patch)}
            onRemove={() => removeLine(line.id)}
            canRemove={lines.length > 2}
            onPickCategory={() => setPickerForLine(line.id)}
          />
        ))}

        {/* Add split */}
        <TouchableOpacity
          style={[ss.addBtn, { borderColor: colors.brand }]}
          onPress={addLine}
          accessibilityRole="button"
          accessibilityLabel="Add split"
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M12 5v14M5 12h14" stroke={colors.brand} strokeWidth={2.5} strokeLinecap="round" />
          </Svg>
          <Text style={[type_.label, { color: colors.brand, marginLeft: 6 }]}>Add split</Text>
        </TouchableOpacity>

        <Button
          variant="green"
          onPress={handleSave}
          disabled={!isBalanced || splitMutation.isPending}
          loading={splitMutation.isPending}
          accessibilityLabel="Save split"
        >
          Save Split
        </Button>
      </ScrollView>

      {/* Sticky remaining pill */}
      {!isBalanced && (
        <View style={[ss.remPill, { backgroundColor: colors.darkGreen }]}>
          <Text style={[ss.remLbl, { color: colors.textInverseSecondary }]}>Remaining</Text>
          <Text style={[ss.remVal, { color: remainingKobo > 0 ? colors.warning : colors.error }]}>
            {remainingKobo > 0 ? '' : '−'}{formatNaira(Math.abs(remainingKobo))}
          </Text>
        </View>
      )}

      {/* Category picker */}
      <CategoryPickerSheet
        visible={pickerForLine !== null}
        groups={groups}
        selected={activePickerLine?.category ?? null}
        onSelect={(cat) => {
          if (pickerForLine) updateLine(pickerForLine, { category: cat });
        }}
        onClose={() => setPickerForLine(null)}
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
  backBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },

  // Hero card
  heroCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  heroLbl: { ...type_.caption, ...ff(600), textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xxs },
  heroAmt: { ...type_.displaySm },
  visualBar: { height: spacing.smd, borderRadius: spacing.xxs, overflow: 'hidden', flexDirection: 'row', marginVertical: spacing.sm },
  heroHint: { ...type_.small, ...ff(600) },

  // Equal-split chips
  eqChips: { paddingVertical: spacing.smd, gap: spacing.sm },
  eqChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xxs + spacing.xxs, borderRadius: radius.full, borderWidth: 1.5 },
  eqChipTxt: { ...type_.small, ...ff(700) },

  // Split row
  splitRow: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', padding: spacing.mdn },
  splitRowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  splitNumBadge: { width: 24, height: 24, borderRadius: radius.xxs, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  splitNumTxt: { ...type_.caption, ...ff(700) },
  splitCatPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + spacing.xxs,
    gap: spacing.xs,
  },
  splitCatTxt: { ...type_.bodyReg, ...ff(600), flex: 1 },
  splitDel: { width: layout.iconBtnSize, height: layout.iconBtnSize, borderRadius: radius.smd, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  splitAmtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  splitAmtWrap: {
    flex: 1,
    height: 38,
    borderRadius: radius.smd,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  splitAmtSymbol: { ...type_.mono },
  splitAmtInp: { flex: 1, ...type_.mono, padding: 0 },
  splitPct: { ...type_.small, ...ff(600) },
  splitFillBtn: {
    height: 38,
    borderRadius: radius.smd,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  splitFillTxt: { ...type_.small, ...ff(700) },
  splitMemoRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  splitMemoInput: { ...type_.bodyReg, padding: 0 },

  // Add button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: spacing.mdn,
  },

  // Sticky remaining pill
  remPill: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.smd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  remLbl: { ...type_.small, ...ff(600) },
  remVal: { ...type_.displayXs },

  // Category picker
  pickGroupHdr: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xxs + spacing.xs },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdn,
  },
});
