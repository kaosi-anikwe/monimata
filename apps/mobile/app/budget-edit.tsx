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
 */
import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatNaira } from '@/utils/money';
import { useToast } from '@/components/Toast';
import { useAppSelector } from '@/store/hooks';
import type { BudgetCategory, BudgetGroup } from '@/types/budget';
import {
  useBudget,
  useCreateGroup,
  useCreateCategory,
  useRenameCategory,
  useHideCategory,
  useDeleteCategory,
  useRenameGroup,
  useDeleteGroup,
  useHideGroup,
  useDeleteTarget,
} from '@/hooks/useBudget';

// ─── Target summary label ─────────────────────────────────────────────────────

function targetLabel(cat: BudgetCategory): string {
  if (!cat.target_amount || !cat.target_frequency) return '';
  const amount = formatNaira(cat.target_amount);
  switch (cat.target_frequency) {
    case 'weekly': return `${amount}/wk`;
    case 'monthly': return `${amount}/mo`;
    case 'yearly': return `${amount}/yr`;
    case 'custom': return `${amount} goal`;
    default: return amount;
  }
}

// ─── Category options modal ────────────────────────────────────────────────────

interface CatOptionsProps {
  category: BudgetCategory | null;
  month: string;
  onClose: () => void;
  onNavigateTarget: (categoryId: string) => void;
}

function CategoryOptionsModal({ category, month, onClose, onNavigateTarget }: CatOptionsProps) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const rename = useRenameCategory(month);
  const hide = useHideCategory(month);
  const del = useDeleteCategory(month);
  const delTarget = useDeleteTarget(month);
  const { confirm } = useToast();

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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.sheetContainer}
      >
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{category.name}</Text>

          {renaming ? (
            <View style={s.renameRow}>
              <TextInput
                style={s.renameInput}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitRename}
                placeholder="Category name"
              />
              <TouchableOpacity style={s.renameConfirm} onPress={commitRename}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.sheetRow} onPress={startRename}>
              <Ionicons name="pencil-outline" size={20} color="#374151" />
              <Text style={s.sheetRowText}>Rename</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.sheetRow}
            onPress={() => { onNavigateTarget(category.id); onClose(); }}
          >
            <Ionicons name="flag-outline" size={20} color="#374151" />
            <Text style={s.sheetRowText}>
              {category.target_amount ? 'Edit target' : 'Add target'}
            </Text>
          </TouchableOpacity>

          {category.target_amount ? (
            <TouchableOpacity style={s.sheetRow} onPress={doRemoveTarget}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[s.sheetRowText, { color: '#EF4444' }]}>Remove target</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={s.sheetRow} onPress={doHide}>
            <Ionicons name="eye-off-outline" size={20} color="#6B7280" />
            <Text style={[s.sheetRowText, { color: '#6B7280' }]}>Hide</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sheetRow} onPress={doDelete}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={[s.sheetRowText, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Group options modal ──────────────────────────────────────────────────────

interface GroupOptionsProps {
  group: BudgetGroup | null;
  month: string;
  onClose: () => void;
}

function GroupOptionsModal({ group, month, onClose }: GroupOptionsProps) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const rename = useRenameGroup(month);
  const del = useDeleteGroup(month);
  const hide = useHideGroup(month);
  const { confirm } = useToast();

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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={s.sheetContainer}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{group.name}</Text>

          {renaming ? (
            <View style={s.renameRow}>
              <TextInput
                style={s.renameInput}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={commitRename}
                placeholder="Group name"
              />
              <TouchableOpacity style={s.renameConfirm} onPress={commitRename}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.sheetRow} onPress={startRename}>
              <Ionicons name="pencil-outline" size={20} color="#374151" />
              <Text style={s.sheetRowText}>Rename</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.sheetRow} onPress={doHide}>
            <Ionicons name="eye-off-outline" size={20} color="#6B7280" />
            <Text style={[s.sheetRowText, { color: '#6B7280' }]}>Hide group</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.sheetRow} onPress={doDelete}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={[s.sheetRowText, { color: '#EF4444' }]}>Delete group</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add category modal ───────────────────────────────────────────────────────

interface AddCatProps {
  groupId: string | null;
  month: string;
  onClose: () => void;
}

function AddCategoryModal({ groupId, month, onClose }: AddCatProps) {
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
        style={s.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>New Category</Text>
          <TextInput
            style={s.modalInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rent"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={s.modalRow}>
            <TouchableOpacity style={s.modalCancel} onPress={onClose}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalSave} onPress={handleSave}>
              <Text style={s.modalSaveText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryEditRow({
  category,
  onOptions,
  onNavigateTarget
}: {
  category: BudgetCategory;
  onOptions: () => void;
  onNavigateTarget: (categoryId: string) => void;
}) {
  const label = targetLabel(category);
  return (
    <TouchableOpacity onPress={onOptions} hitSlop={10}>
      <View style={s.catRow}>

        <Text style={s.catName} numberOfLines={1}>
          {category.name}
        </Text>
        {label ? (
          <Text style={s.catTarget}>{label}</Text>
        ) : (
          <TouchableOpacity onPress={() => onNavigateTarget(category.id)} hitSlop={10}>
            <Text style={s.catAddTarget}>+ Add target</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>

  );
}

// ─── Group header ─────────────────────────────────────────────────────────────

function GroupEditHeader({
  group,
  onAddCategory,
  onOptions,
}: {
  group: BudgetGroup;
  onAddCategory: () => void;
  onOptions: () => void;
}) {
  return (
    <View style={s.groupHeader}>
      <Text style={s.groupName}>{group.name}</Text>
      <View style={s.groupActions}>
        <TouchableOpacity onPress={onAddCategory} hitSlop={10}>
          <Ionicons name="add-circle-outline" size={20} color="#0F7B3F" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onOptions} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function BudgetEditScreen() {
  const router = useRouter();
  const { selectedMonth } = useAppSelector((s) => s.budget);
  const [refreshing, setRefreshing] = useState(false);
  const [addCatGroupId, setAddCatGroupId] = useState<string | null>(null);
  const [catOptions, setCatOptions] = useState<BudgetCategory | null>(null);
  const [groupOptions, setGroupOptions] = useState<BudgetGroup | null>(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const { data, isLoading, error, refetch } = useBudget(selectedMonth);
  const createGroup = useCreateGroup(selectedMonth);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch().catch(() => { });
    setRefreshing(false);
  }, [refetch]);

  const sections = useMemo(
    () =>
      (data?.groups ?? []).map((g) => ({
        ...g,
        data: g.categories,
      })),
    [data],
  );

  // "Cost to be me" = sum of all target amounts
  const costToBeMe = useMemo(() => {
    if (!data) return 0;
    return data.groups.flatMap((g) => g.categories).reduce((sum, c) => sum + (c.target_amount ?? 0), 0);
  }, [data]);

  const assignedTotal = useMemo(() => {
    if (!data) return 0;
    return data.groups.flatMap((g) => g.categories).reduce((sum, c) => sum + c.assigned, 0);
  }, [data]);

  if (isLoading && !data) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ flex: 1 }} color="#10B981" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView
          contentContainerStyle={s.errorContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
          }
        >
          <Ionicons name="cloud-offline-outline" size={40} color="#D1D5DB" />
          <Text style={s.errorText}>Could not load budget.</Text>
          <Text style={s.errorSub}>Pull down to retry.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const progress = costToBeMe > 0 ? Math.min(assignedTotal / costToBeMe, 1) : 0;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Budget</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Cost to be me card */}
      <View style={s.costCard}>
        <View style={s.costRow}>
          <Text style={s.costLabel}>Cost to be me</Text>
          <Text style={s.costAmount}>{formatNaira(costToBeMe)}/mo</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={s.progressLabel}>
          {formatNaira(assignedTotal)} assigned of {formatNaira(costToBeMe)}
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <GroupEditHeader
            group={section}
            onAddCategory={() => setAddCatGroupId(section.id)}
            onOptions={() => setGroupOptions(section)}
          />
        )}
        renderItem={({ item }) => (
          <CategoryEditRow
            category={item}
            onOptions={() => setCatOptions(item)}
            onNavigateTarget={(catId) => router.push(`/target/${catId}`)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListFooterComponent={
          <TouchableOpacity style={s.addGroupBtn} onPress={() => setAddGroupOpen(true)}>
            <Ionicons name="add-circle-outline" size={18} color="#0F7B3F" />
            <Text style={s.addGroupText}>Add group</Text>
          </TouchableOpacity>
        }
      />

      {/* Add group mini-modal */}
      <Modal visible={addGroupOpen} transparent animationType="fade" onRequestClose={() => setAddGroupOpen(false)}>
        <KeyboardAvoidingView
          style={s.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>New Group</Text>
            <TextInput
              style={s.modalInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="e.g. Housing"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                const trimmed = newGroupName.trim();
                if (trimmed) createGroup.mutate(trimmed);
                setNewGroupName('');
                setAddGroupOpen(false);
              }}
            />
            <View style={s.modalRow}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setNewGroupName(''); setAddGroupOpen(false); }}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalSave}
                onPress={() => {
                  const trimmed = newGroupName.trim();
                  if (trimmed) createGroup.mutate(trimmed);
                  setNewGroupName('');
                  setAddGroupOpen(false);
                }}
              >
                <Text style={s.modalSaveText}>Create</Text>
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

      <CategoryOptionsModal
        category={catOptions}
        month={selectedMonth}
        onClose={() => setCatOptions(null)}
        onNavigateTarget={(catId) => router.push(`/target/${catId}` as never)}
      />

      <GroupOptionsModal
        group={groupOptions}
        month={selectedMonth}
        onClose={() => setGroupOptions(null)}
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

  costCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  costLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  costAmount: { fontSize: 18, fontWeight: '800', color: '#111827' },
  progressTrack: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: 6, backgroundColor: '#10B981', borderRadius: 3 },
  progressLabel: { fontSize: 12, color: '#6B7280' },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E5E7EB',
  },
  groupName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
  groupActions: { flexDirection: 'row', gap: 14 },

  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  catName: { flex: 1, fontSize: 15, color: '#111827' },
  catTarget: { fontSize: 13, color: '#6B7280', marginRight: 8 },
  catAddTarget: { fontSize: 13, color: '#0F7B3F', marginRight: 8 },
  catOptions: { padding: 4 },

  addGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  addGroupText: { fontSize: 15, color: '#0F7B3F', fontWeight: '600' },

  // Bottom sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheetContainer: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 20, marginBottom: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  sheetRowText: { fontSize: 15, color: '#111827' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 10 },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111827',
  },
  renameConfirm: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0F7B3F',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal (add category, add group)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 20,
  },
  modalRow: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  modalSave: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  errorContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 6 },
  errorText: { fontSize: 16, fontWeight: '600', color: '#374151', textAlign: 'center' },
  errorSub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
});
