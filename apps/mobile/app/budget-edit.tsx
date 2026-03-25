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
 * Budget Edit screen — manage budget structure: groups, categories, targets.
 *
 * - "Cost to be me": sum of all target_amount values across categories with targets.
 * - Group header: group name + [+ add category] + [⋯ group options] buttons.
 * - Category row: name + target summary + [⋯ category options] button.
 * - Changes (rename, hide, delete, add) sync immediately via API mutations.
 * - Drag-to-reorder: long-press the ≡ handle on a group or category row to
 *   drag it to a new position. Groups collapse while a group is being dragged.
 */
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { ProgressBar } from '@/components/ui';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  useBudget,
  useCreateCategory,
  useCreateGroup,
  useDeleteCategory,
  useDeleteGroup,
  useDeleteTarget,
  useHideCategory,
  useHideGroup,
  useRenameCategory,
  useRenameGroup,
  useReorderCategories,
  useReorderGroups,
} from '@/hooks/useBudget';
import { useTheme } from '@/lib/theme';
import { glass, radius, shadow, spacing } from '@/lib/tokens';
import { ff, formatMoney } from '@/lib/typography';
import { useAppSelector } from '@/store/hooks';
import type { BudgetCategory, BudgetGroup } from '@/types/budget';


// ─── Target summary label ─────────────────────────────────────────────────────

function targetLabel(cat: BudgetCategory): string {
  if (!cat.target_amount || !cat.target_frequency) return '';
  const amount = formatMoney(cat.target_amount);
  switch (cat.target_frequency) {
    case 'weekly': return `${amount}/wk`;
    case 'monthly': return `${amount}/mo`;
    case 'yearly': return `${amount}/yr`;
    case 'custom': return `${amount} goal`;
    default: return amount;
  }
}

// ─── Category options sheet ───────────────────────────────────────────────────

interface CatOptionsProps {
  category: BudgetCategory | null;
  month: string;
  onClose: () => void;
  onNavigateTarget: (categoryId: string) => void;
}

function CategoryOptionsSheet({ category, month, onClose, onNavigateTarget }: CatOptionsProps) {
  const colors = useTheme();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const rename = useRenameCategory(month);
  const hide = useHideCategory(month);
  const del = useDeleteCategory(month);
  const delTarget = useDeleteTarget(month);
  const { confirm } = useToast();

  // Must be after all hooks — React Compiler evaluates handler bodies eagerly.
  if (!category) return null;

  function startRename() {
    setNewName(category!.name);
    setRenaming(true);
  }

  function commitRename() {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== category!.name) {
      rename.mutate({ categoryId: category!.id, name: trimmed });
    }
    setRenaming(false);
    onClose();
  }

  function doHide() {
    confirm({
      title: 'Hide category?',
      message: `"${category!.name}" will be hidden and won't appear in your budget.`,
      confirmText: 'Hide',
      confirmStyle: 'destructive',
      onConfirm: () => { hide.mutate(category!.id); onClose(); },
    });
  }

  function doDelete() {
    confirm({
      title: 'Delete category?',
      message: `This will permanently delete "${category!.name}".`,
      confirmText: 'Delete',
      confirmStyle: 'destructive',
      onConfirm: () => { del.mutate(category!.id); onClose(); },
    });
  }

  function doRemoveTarget() {
    confirm({
      title: 'Remove target?',
      message: `Remove the spending target for "${category!.name}"?`,
      confirmText: 'Remove',
      confirmStyle: 'destructive',
      onConfirm: () => { delTarget.mutate(category!.id); onClose(); },
    });
  }

  return (
    <BottomSheet
      visible={!!category}
      onClose={onClose}
      title={category?.name ?? ''}
      scrollable={false}
    >
      {renaming ? (
        <View style={[ss.renameRow, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[ss.renameInput, {
              backgroundColor: colors.surface,
              borderColor: colors.brand,
              color: colors.textPrimary,
            }]}
            value={newName}
            onChangeText={setNewName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={commitRename}
            placeholder="Category name"
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity
            style={[ss.renameConfirm, { backgroundColor: colors.brand }]}
            onPress={commitRename}
          >
            <Ionicons name="checkmark" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Rename */}
          <TouchableOpacity
            style={[ss.ashRow, { borderBottomColor: colors.separator }]}
            onPress={startRename}
            activeOpacity={0.7}
          >
            <View style={[ss.ashIc, { backgroundColor: colors.surface }]}>
              <Feather name="edit-2" size={17} color={colors.brand} />
            </View>
            <View style={ss.ashText}>
              <Text style={[ss.ashNm, { color: colors.textPrimary }]}>Rename</Text>
            </View>
          </TouchableOpacity>

          {/* Add / Edit target */}
          <TouchableOpacity
            style={[ss.ashRow, { borderBottomColor: colors.separator }]}
            onPress={() => { onNavigateTarget(category!.id); onClose(); }}
            activeOpacity={0.7}
          >
            <View style={[ss.ashIc, { backgroundColor: colors.surface }]}>
              <Feather name="target" size={17} color={colors.brand} />
            </View>
            <View style={ss.ashText}>
              <Text style={[ss.ashNm, { color: colors.textPrimary }]}>
                {category?.target_amount ? 'Edit target' : 'Add target'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Remove target */}
          {category?.target_amount ? (
            <TouchableOpacity
              style={[ss.ashRow, { borderBottomColor: colors.separator }]}
              onPress={doRemoveTarget}
              activeOpacity={0.7}
            >
              <View style={[ss.ashIc, { backgroundColor: colors.errorSubtle }]}>
                <Feather name="x-circle" size={17} color={colors.error} />
              </View>
              <View style={ss.ashText}>
                <Text style={[ss.ashNm, { color: colors.error }]}>Remove target</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* Hide */}
          <TouchableOpacity
            style={[ss.ashRow, { borderBottomColor: colors.separator }]}
            onPress={doHide}
            activeOpacity={0.7}
          >
            <View style={[ss.ashIc, { backgroundColor: colors.surface }]}>
              <Feather name="eye-off" size={17} color={colors.textMeta} />
            </View>
            <View style={ss.ashText}>
              <Text style={[ss.ashNm, { color: colors.textSecondary }]}>Hide</Text>
            </View>
          </TouchableOpacity>

          {/* Delete */}
          <TouchableOpacity
            style={[ss.ashRow]}
            onPress={doDelete}
            activeOpacity={0.7}
          >
            <View style={[ss.ashIc, { backgroundColor: colors.errorSubtle }]}>
              <Feather name="trash-2" size={17} color={colors.error} />
            </View>
            <View style={ss.ashText}>
              <Text style={[ss.ashNm, { color: colors.error }]}>Delete</Text>
            </View>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

// ─── Group options sheet ──────────────────────────────────────────────────────

interface GroupOptionsProps {
  group: BudgetGroup | null;
  month: string;
  onClose: () => void;
}

function GroupOptionsSheet({ group, month, onClose }: GroupOptionsProps) {
  const colors = useTheme();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const rename = useRenameGroup(month);
  const del = useDeleteGroup(month);
  const hide = useHideGroup(month);
  const { confirm } = useToast();

  // Must be after all hooks — React Compiler evaluates handler bodies eagerly.
  if (!group) return null;

  function startRename() {
    setNewName(group!.name);
    setRenaming(true);
  }

  function commitRename() {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== group!.name) {
      rename.mutate({ groupId: group!.id, name: trimmed });
    }
    setRenaming(false);
    onClose();
  }

  function doHide() {
    confirm({
      title: 'Hide group?',
      message: `"${group!.name}" will be hidden from your budget view.`,
      confirmText: 'Hide',
      confirmStyle: 'destructive',
      onConfirm: () => { hide.mutate(group!.id); onClose(); },
    });
  }

  function doDelete() {
    confirm({
      title: 'Delete group?',
      message: `This will permanently delete "${group!.name}" and all its categories.`,
      confirmText: 'Delete',
      confirmStyle: 'destructive',
      onConfirm: () => { del.mutate(group!.id); onClose(); },
    });
  }

  return (
    <BottomSheet
      visible={!!group}
      onClose={onClose}
      title={group?.name ?? ''}
      scrollable={false}
    >
      {renaming ? (
        <View style={[ss.renameRow, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[ss.renameInput, {
              backgroundColor: colors.surface,
              borderColor: colors.brand,
              color: colors.textPrimary,
            }]}
            value={newName}
            onChangeText={setNewName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={commitRename}
            placeholder="Group name"
            placeholderTextColor={colors.textTertiary}
          />
          <TouchableOpacity
            style={[ss.renameConfirm, { backgroundColor: colors.brand }]}
            onPress={commitRename}
          >
            <Ionicons name="checkmark" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[ss.ashRow, { borderBottomColor: colors.separator }]}
            onPress={startRename}
            activeOpacity={0.7}
          >
            <View style={[ss.ashIc, { backgroundColor: colors.surface }]}>
              <Feather name="edit-2" size={17} color={colors.brand} />
            </View>
            <View style={ss.ashText}>
              <Text style={[ss.ashNm, { color: colors.textPrimary }]}>Rename group</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ss.ashRow, { borderBottomColor: colors.separator }]}
            onPress={doHide}
            activeOpacity={0.7}
          >
            <View style={[ss.ashIc, { backgroundColor: colors.surface }]}>
              <Feather name="eye-off" size={17} color={colors.textMeta} />
            </View>
            <View style={ss.ashText}>
              <Text style={[ss.ashNm, { color: colors.textSecondary }]}>Hide group</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ss.ashRow]}
            onPress={doDelete}
            activeOpacity={0.7}
          >
            <View style={[ss.ashIc, { backgroundColor: colors.errorSubtle }]}>
              <Feather name="trash-2" size={17} color={colors.error} />
            </View>
            <View style={ss.ashText}>
              <Text style={[ss.ashNm, { color: colors.error }]}>Delete group</Text>
            </View>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

// ─── Add category modal ───────────────────────────────────────────────────────

interface AddCatProps {
  groupId: string | null;
  month: string;
  onClose: () => void;
}

function AddCategoryModal({ groupId, month, onClose }: AddCatProps) {
  const colors = useTheme();
  const [name, setName] = useState('');
  const create = useCreateCategory(month);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !groupId) return;
    create.mutate({ groupId, name: trimmed });
    setName('');
    onClose();
  }

  return (
    <Modal visible={!!groupId} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[ss.modalBackdrop, { backgroundColor: colors.overlayNeutral }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[ss.modalCard, { backgroundColor: colors.white }]}>
          <Text style={[ss.modalTitle, { color: colors.textPrimary }]}>New Category</Text>
          <TextInput
            style={[ss.modalInput, {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              color: colors.textPrimary,
            }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rent"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={ss.modalRow}>
            <TouchableOpacity
              style={[ss.modalCancel, { backgroundColor: colors.surface }]}
              onPress={onClose}
            >
              <Text style={[ss.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ss.modalSave, { backgroundColor: colors.brand }]}
              onPress={handleSave}
            >
              <Text style={[ss.modalSaveText, { color: colors.white }]}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Category row (.edit-cat-row) ─────────────────────────────────────────────

function CategoryEditRow({
  category,
  onOptions,
  onNavigateTarget,
  drag,
}: {
  category: BudgetCategory;
  onOptions: () => void;
  onNavigateTarget: (categoryId: string) => void;
  drag: () => void;
}) {
  const colors = useTheme();
  const label = targetLabel(category);
  return (
    <View style={[ss.catRow, { borderBottomColor: colors.separator }]}>
      {/* Drag handle — long-press to start drag */}
      <TouchableOpacity onLongPress={drag} hitSlop={10} style={ss.dragHandleHit} activeOpacity={0.6}>
        <Ionicons name="reorder-three-outline" size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      <TouchableOpacity style={ss.catNameBtn} onPress={onOptions} activeOpacity={0.6}>
        <Text style={[ss.catName, { color: colors.textPrimary }]} numberOfLines={1}>
          {category.name}
        </Text>
      </TouchableOpacity>

      {label ? (
        <TouchableOpacity
          onPress={() => onNavigateTarget(category.id)}
          hitSlop={10}
          style={[ss.catTargetChip, { backgroundColor: colors.surface }]}
          activeOpacity={0.7}
        >
          <Text style={[ss.catTargetText, { color: colors.brand }]}>{label}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => onNavigateTarget(category.id)}
          hitSlop={10}
          style={ss.catAddTargetBtn}
          activeOpacity={0.7}
        >
          <Text style={[ss.catAddTargetText, { color: colors.brand }]}>+ Add target</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Group header (.edit-grp-h) ───────────────────────────────────────────────

function GroupEditHeader({
  group,
  onAddCategory,
  onOptions,
  drag,
}: {
  group: BudgetGroup;
  onAddCategory: () => void;
  onOptions: () => void;
  drag: () => void;
}) {
  const colors = useTheme();
  return (
    <View style={[ss.groupHdr, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {/* Drag handle — long-press to start group drag */}
      <TouchableOpacity onLongPress={drag} hitSlop={10} style={ss.dragHandleHit} activeOpacity={0.6}>
        <Ionicons name="reorder-three-outline" size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      <Text style={[ss.groupName, { color: colors.textSecondary }]} numberOfLines={1}>
        {group.name.toUpperCase()}
      </Text>

      {/* Add category button */}
      <TouchableOpacity
        style={[ss.groupAddBtn, { backgroundColor: colors.surface }]}
        onPress={onAddCategory}
        hitSlop={10}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={12} color={colors.brand} />
        <Text style={[ss.groupAddText, { color: colors.brand }]}>Add</Text>
      </TouchableOpacity>

      {/* Group more button */}
      <TouchableOpacity
        style={[ss.groupMoreBtn, { backgroundColor: colors.surface }]}
        onPress={onOptions}
        hitSlop={10}
        activeOpacity={0.7}
      >
        <Ionicons name="ellipsis-horizontal" size={14} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function BudgetEditScreen() {
  const router = useRouter();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { selectedMonth } = useAppSelector((s) => s.budget);
  const [addCatGroupId, setAddCatGroupId] = useState<string | null>(null);
  const [catOptions, setCatOptions] = useState<BudgetCategory | null>(null);
  const [groupOptions, setGroupOptions] = useState<BudgetGroup | null>(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupDragging, setGroupDragging] = useState(false);

  const reorderGroups = useReorderGroups(selectedMonth);
  const reorderCategories = useReorderCategories(selectedMonth);

  const { data, isLoading, error } = useBudget(selectedMonth);
  const createGroup = useCreateGroup(selectedMonth);

  const groups = data?.groups ?? [];

  // "Cost to be me" = sum of all target amounts
  const costToBeMe = useMemo(() => {
    if (!data) return 0;
    return data.groups.flatMap((g) => g.categories).reduce((sum, c) => sum + (c.target_amount ?? 0), 0);
  }, [data]);

  const assignedTotal = useMemo(() => {
    if (!data) return 0;
    return data.groups.flatMap((g) => g.categories).reduce((sum, c) => sum + c.assigned, 0);
  }, [data]);

  const progress = costToBeMe > 0 ? Math.min(assignedTotal / costToBeMe, 1) : 0;

  if (isLoading && !data) {
    return (
      <View style={[ss.flex, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={ss.flex} color={colors.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[ss.flex, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={ss.errorContainer}
        >
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textTertiary} />
          <Text style={[ss.errorText, { color: colors.textSecondary }]}>Could not load budget.</Text>
          <Text style={[ss.errorSub, { color: colors.textMeta }]}>Pull down to retry.</Text>
        </ScrollView>
      </View>
    );
  }

  // renderItem for the inner category NestableDraggableFlatList
  function renderCategoryItem(
    { item: cat, drag: catDrag, isActive: catIsActive, getIndex }: RenderItemParams<BudgetCategory>,
    groupCatCount: number,
  ) {
    const idx = getIndex() ?? 0;
    const isLast = idx === groupCatCount - 1;
    return (
      <ScaleDecorator activeScale={1.03}>
        <View
          style={[
            ss.grpBodyItem,
            {
              backgroundColor: catIsActive ? colors.surface : colors.white,
              borderColor: colors.border,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderBottomWidth: isLast ? 1 : 0,
              borderBottomLeftRadius: isLast ? radius.md : 0,
              borderBottomRightRadius: isLast ? radius.md : 0,
            },
          ]}
        >
          <CategoryEditRow
            category={cat}
            onOptions={() => setCatOptions(cat)}
            onNavigateTarget={(catId) => router.push(`/target/${catId}`)}
            drag={catDrag}
          />
        </View>
      </ScaleDecorator>
    );
  }

  return (
    <View style={[ss.flex, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      {/* ── Dark green header (.edit-hdr) ── */}
      <View
        style={[ss.hdr, { paddingTop: insets.top + 10, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl }]}
      >
        <LinearGradient
          colors={[colors.darkGreen, colors.darkGreenMid]}
          style={StyleSheet.absoluteFill}
        />
        {/* Header top row */}
        <View style={ss.hdrTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={[ss.backBtn]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <Text style={[ss.hdrTitle, { color: colors.white }]}>Edit Budget</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* CTBM card (.ctbm-card) */}
        <View style={[ss.ctbmCard, { backgroundColor: glass.card, borderColor: glass.borderLime }]}>
          <Text style={[ss.ctbmLabel, { color: glass.labelDim }]}>COST TO BE ME</Text>
          <Text style={[ss.ctbmVal, { color: colors.white }]}>
            {formatMoney(costToBeMe)}<Text style={[ss.ctbmSuffix, { color: glass.textDim }]}>/mo</Text>
          </Text>
          <Text style={[ss.ctbmSub, { color: glass.textFaint }]}>
            {formatMoney(assignedTotal)} assigned of {formatMoney(costToBeMe)}
          </Text>
          {/* Progress bar */}
          <ProgressBar
            animate
            progress={progress}
            state="brand"
            gradient
            size="md"
            trackStyle={{ marginTop: spacing.smd, backgroundColor: glass.borderWhiteStrong }}
          />
        </View>
      </View>

      {/* ── Groups + Categories ── */}
      <NestableScrollContainer
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <NestableDraggableFlatList<BudgetGroup>
          data={groups}
          keyExtractor={(g) => g.id}
          onDragBegin={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setGroupDragging(true);
          }}
          onDragEnd={({ data: newGroups }) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setGroupDragging(false);
            reorderGroups.mutate(newGroups.map((g) => g.id));
          }}
          renderItem={({ item: group, drag, isActive }: RenderItemParams<BudgetGroup>) => (
            <ScaleDecorator activeScale={1.02}>
              <View style={ss.grpWrapper}>
                {/* Group header card */}
                <View
                  style={[
                    ss.grpCard,
                    {
                      backgroundColor: colors.white,
                      borderColor: isActive ? colors.brand : colors.border,
                      ...shadow.sm,
                    },
                    (group.categories.length === 0) && {
                      borderBottomLeftRadius: radius.md,
                      borderBottomRightRadius: radius.md,
                    },
                  ]}
                >
                  <GroupEditHeader
                    group={group}
                    onAddCategory={() => setAddCatGroupId(group.id)}
                    onOptions={() => setGroupOptions(group)}
                    drag={drag}
                  />
                </View>

                {/* Category rows — keep mounted during group drag so heights stay stable */}
                <View pointerEvents={groupDragging ? 'none' : 'auto'}>
                  <NestableDraggableFlatList<BudgetCategory>
                    data={group.categories}
                    keyExtractor={(c) => c.id}
                    onDragBegin={() =>
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                    }
                    onDragEnd={({ data: newCats }) =>
                      reorderCategories.mutate(newCats.map((c) => c.id))
                    }
                    renderItem={(params) =>
                      renderCategoryItem(params, group.categories.length)
                    }
                  />
                </View>
              </View>
            </ScaleDecorator>
          )}
        />

        {/* Add Group button */}
        <TouchableOpacity
          style={[
            ss.addGroupBtn,
            {
              borderColor: colors.borderStrong,
              backgroundColor: colors.white,
            },
          ]}
          onPress={() => setAddGroupOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={16} color={colors.brand} />
          <Text style={[ss.addGroupText, { color: colors.brand }]}>Add Group</Text>
        </TouchableOpacity>
      </NestableScrollContainer>

      {/* Add group mini-modal */}
      <Modal
        visible={addGroupOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddGroupOpen(false)}
      >
        <KeyboardAvoidingView
          style={[ss.modalBackdrop, { backgroundColor: colors.overlayNeutral }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[ss.modalCard, { backgroundColor: colors.white }]}>
            <Text style={[ss.modalTitle, { color: colors.textPrimary }]}>New Group</Text>
            <TextInput
              style={[ss.modalInput, {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.textPrimary,
              }]}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="e.g. Housing"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                const trimmed = newGroupName.trim();
                if (trimmed) createGroup.mutate(trimmed);
                setNewGroupName('');
                setAddGroupOpen(false);
              }}
            />
            <View style={ss.modalRow}>
              <TouchableOpacity
                style={[ss.modalCancel, { backgroundColor: colors.surface }]}
                onPress={() => { setNewGroupName(''); setAddGroupOpen(false); }}
              >
                <Text style={[ss.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ss.modalSave, { backgroundColor: colors.brand }]}
                onPress={() => {
                  const trimmed = newGroupName.trim();
                  if (trimmed) createGroup.mutate(trimmed);
                  setNewGroupName('');
                  setAddGroupOpen(false);
                }}
              >
                <Text style={[ss.modalSaveText, { color: colors.white }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AddCategoryModal
        groupId={addCatGroupId}
        month={selectedMonth}
        onClose={() => setAddCatGroupId(null)}
      />

      <CategoryOptionsSheet
        category={catOptions}
        month={selectedMonth}
        onClose={() => setCatOptions(null)}
        onNavigateTarget={(catId) => router.push(`/target/${catId}` as never)}
      />

      <GroupOptionsSheet
        group={groupOptions}
        month={selectedMonth}
        onClose={() => setGroupOptions(null)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  flex: { flex: 1 },

  // ── Header (.edit-hdr) ───────────────────────────────────────────────────
  hdr: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    flexShrink: 0, overflow: 'hidden',
  },
  hdrTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  hdrTitle: { ...ff(700), fontSize: 17, letterSpacing: -0.3 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.strong,
  },

  // ── CTBM card (.ctbm-card) ───────────────────────────────────────────────
  ctbmCard: {
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
  },
  ctbmLabel: {
    ...ff(700),
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  ctbmVal: { ...ff(800), fontSize: 22, letterSpacing: -0.5 },
  ctbmSuffix: { ...ff(500), fontSize: 14, letterSpacing: 0 },
  ctbmSub: { ...ff(400), fontSize: 12, marginTop: spacing.xs },

  // ── Group card wrapper (.edit-grp) ───────────────────────────────────────
  grpWrapper: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.smd,
  },
  grpCard: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // ── Category list + drag overlay ─────────────────────────────────────────
  catListContainer: { position: 'relative' },
  grpBodyItem: {
    overflow: 'hidden',
  },

  // ── Group header (.edit-grp-h) ───────────────────────────────────────────
  groupHdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.mdn,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  groupName: {
    ...ff(700),
    fontSize: 11,
    letterSpacing: 1.5,
    flex: 1,
  },
  groupAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
  },
  groupAddText: { ...ff(600), fontSize: 12 },
  groupMoreBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Category row (.edit-cat-row) ─────────────────────────────────────────
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.mdn,
    paddingVertical: 12,
    gap: spacing.smd,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dragHandleHit: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandle: { marginRight: 2 },
  dragFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: 1.5,
    borderRadius: radius.md,
    ...shadow.md,
  },
  catNameBtn: { flex: 1 },
  catName: { ...ff(600), fontSize: 14 },
  catTargetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 7,
  },
  catTargetText: { ...ff(600), fontSize: 12 },
  catAddTargetBtn: { paddingHorizontal: 2 },
  catAddTargetText: { ...ff(600), fontSize: 12 },

  // ── Add Group button (.add-grp-btn) ──────────────────────────────────────
  addGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingVertical: spacing.mdn,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addGroupText: { ...ff(600), fontSize: 14 },

  // ── Action sheet rows (.ash-row) ─────────────────────────────────────────
  ashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.mdn,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ashIc: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ashText: { flex: 1 },
  ashNm: { ...ff(600), fontSize: 14 },

  // ── Rename inline ────────────────────────────────────────────────────────
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.smd,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.smd,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  renameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    ...ff(600),
  },
  renameConfirm: {
    width: 36,
    height: 36,
    borderRadius: radius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Modal (add cat / add group) ──────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '85%',
    borderRadius: radius.lg,
    padding: spacing.xxl,
  },
  modalTitle: { ...ff(700), fontSize: 18, marginBottom: spacing.lg },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
    ...ff(500),
    marginBottom: 20,
  },
  modalRow: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, ...ff(600) },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  modalSaveText: { fontSize: 15, ...ff(600) },

  // ── Error state ──────────────────────────────────────────────────────────
  errorContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 6 },
  errorText: { fontSize: 16, ...ff(600), textAlign: 'center' },
  errorSub: { fontSize: 13, textAlign: 'center' },
});
