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
 * components/CategoryPickerSheet.tsx
 *
 * Shared bottom-sheet category picker with inline "add category" support.
 * Replaces 4 duplicate inline implementations across transaction screens.
 *
 * Variants controlled via props:
 *  - `disableTBB`    — lock the TBB row for expenses
 *  - `showTBB`       — hide the TBB row entirely (e.g. for splits)
 *  - `onSelectId`    — alternative callback that receives just the id string
 *                       (used by the filter picker on the transactions tab)
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useToast } from '@/components/Toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCreateCategoryInline } from '@/hooks/useCreateCategoryInline';
import { useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { ff, type_ } from '@/lib/typography';
import type { CategoryGroup, CategoryItem } from '@/types/category';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CategoryPickerSheetProps {
  visible: boolean;
  groups: CategoryGroup[];
  onClose: () => void;

  /** Called with the selected CategoryItem, or `null` for TBB / "No category". */
  onSelect?: (item: CategoryItem | null) => void;
  /** Alternative: called with just the category id string (for filter pickers). */
  onSelectId?: (id: string) => void;

  /** Currently selected category (shows checkmark). */
  selected?: CategoryItem | null;

  /** Show the "To Be Budgeted" row. Default true. */
  showTBB?: boolean;
  /** When true the TBB option is disabled with a lock icon. */
  disableTBB?: boolean;
  /** When true a search bar is shown above the category list. */
  searchable?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoryPickerSheet({
  visible,
  groups,
  onClose,
  onSelect,
  onSelectId,
  selected,
  showTBB = true,
  disableTBB = false,
  searchable = false,
}: CategoryPickerSheetProps) {
  const colors = useTheme();
  const { info: showInfo } = useToast();

  // Search state
  const [query, setQuery] = useState('');

  // Inline "add category" state — tracks which group is being added to
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const inputRef = useRef<TextInput>(null);
  const createMutation = useCreateCategoryInline();

  // Filtered groups based on search query
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        categories: g.categories.filter((c) => c.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.categories.length > 0);
  }, [groups, query]);

  function handleSelect(item: CategoryItem | null) {
    if (onSelect) onSelect(item);
    if (onSelectId && item) onSelectId(item.id);
    setQuery('');
    onClose();
  }

  function handleStartAdd(groupId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddingGroupId(groupId);
    setNewCatName('');
    // Focus after render
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleCancelAdd() {
    setAddingGroupId(null);
    setNewCatName('');
  }

  function handleConfirmAdd() {
    const trimmed = newCatName.trim();
    if (!trimmed || !addingGroupId) return;
    createMutation.mutate(
      { groupId: addingGroupId, name: trimmed },
      {
        onSuccess: (created) => {
          setAddingGroupId(null);
          setNewCatName('');
          // Auto-select the newly created category
          handleSelect(created);
        },
      },
    );
  }

  return (
    <BottomSheet visible={visible} onClose={() => { setQuery(''); onClose(); }} title="Category" scrollable={false}>
      {/* Search bar */}
      {searchable && (
        <View
          style={[
            ss.searchWrap,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <Ionicons name="search" size={layout.iconMd} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories…"
            placeholderTextColor={colors.textTertiary}
            style={[ss.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search categories"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={layout.iconMd} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView style={{ maxHeight: searchable ? 380 : 420 }} keyboardShouldPersistTaps="handled">
        {/* TBB row */}
        {showTBB && (
          <TouchableOpacity
            style={[
              ss.pickRow,
              {
                backgroundColor: disableTBB ? colors.surface : colors.successSubtle,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.separator,
                gap: spacing.sm,
              },
            ]}
            onPress={() => {
              if (disableTBB) {
                showInfo('Not allowed', 'Expenses cannot be assigned to To Be Budgeted.');
              } else {
                handleSelect(null);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={
              disableTBB
                ? 'To Be Budgeted — not available for expenses'
                : 'Assign to To Be Budgeted'
            }
          >
            <View
              style={[
                ss.tbbBadge,
                { backgroundColor: disableTBB ? colors.textTertiary : colors.brand },
              ]}
            >
              <Text style={[type_.labelSm, { color: colors.white }]}>TBB</Text>
            </View>
            <Text
              style={[
                type_.body,
                { color: disableTBB ? colors.textTertiary : colors.brand, flex: 1 },
              ]}
            >
              To Be Budgeted
            </Text>
            {!selected && !disableTBB && (
              <Svg
                width={type_.body.fontSize}
                height={type_.body.fontSize}
                viewBox="0 0 24 24"
                fill="none"
              >
                <Polyline
                  points="20 6 9 17 4 12"
                  stroke={colors.brand}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              </Svg>
            )}
            {disableTBB && (
              <Ionicons
                name="lock-closed-outline"
                size={layout.iconSm}
                color={colors.textTertiary}
              />
            )}
          </TouchableOpacity>
        )}

        {/* Groups + categories */}
        {filteredGroups.map((g) => (
          <View key={g.id}>
            {/* Group header with + button */}
            <View style={[ss.pickGroupHdr, { backgroundColor: colors.surface }]}>
              <Text
                style={[
                  type_.labelSm,
                  { color: colors.textMeta, textTransform: 'uppercase', letterSpacing: 1.2, flex: 1 },
                ]}
              >
                {g.name}
              </Text>
              <TouchableOpacity
                onPress={() => handleStartAdd(g.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Add category to ${g.name}`}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
              </TouchableOpacity>
            </View>

            {/* Category rows */}
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
                onPress={() => handleSelect(cat)}
                accessibilityRole="button"
                accessibilityLabel={cat.name}
              >
                <Text style={[type_.body, { color: colors.textPrimary, flex: 1 }]}>
                  {cat.name}
                </Text>
                {selected?.id === cat.id && (
                  <Svg
                    width={type_.body.fontSize}
                    height={type_.body.fontSize}
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <Polyline
                      points="20 6 9 17 4 12"
                      stroke={colors.brand}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </Svg>
                )}
              </TouchableOpacity>
            ))}

            {/* Inline add-category input */}
            {addingGroupId === g.id && (
              <View style={[ss.addRow, { borderBottomColor: colors.separator }]}>
                <TextInput
                  ref={inputRef}
                  style={[ss.addInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardBg }]}
                  value={newCatName}
                  onChangeText={setNewCatName}
                  placeholder="New category name"
                  placeholderTextColor={colors.textTertiary}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleConfirmAdd}
                  editable={!createMutation.isPending}
                  accessibilityLabel="New category name"
                />
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <>
                    <TouchableOpacity
                      onPress={handleConfirmAdd}
                      disabled={!newCatName.trim()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Create category"
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={26}
                        color={newCatName.trim() ? colors.brand : colors.textTertiary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCancelAdd}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Ionicons name="close-circle" size={26} color={colors.textMeta} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    height: layout.rowMinHeight,
  },
  searchInput: {
    flex: 1,
    ...type_.body,
    padding: 0,
  },
  pickGroupHdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxs,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.mdn,
  },
  tbbBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addInput: {
    flex: 1,
    ...type_.body,
    ...ff(400),
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
