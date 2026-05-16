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
 * CategorySearchSheet
 *
 * Full-category fuzzy search inside a bottom sheet (spec §7.3).
 * Shared between the Cluster Blitz (Mode A) and the Review Queue (Mode B).
 *
 * Layout:
 *   BottomSheet (scrollable=false)
 *   ├── Search TextInput (sticky at top)
 *   └── SectionList  ← sections filtered by query, grouped by category group
 *
 * Mirrors the CategoryPickerSheet pattern in transactions.tsx but adds a
 * live-filtered search bar above the list.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BottomSheet } from '@/components/ui';
import { useCategoryGroups } from '@/hooks/useCategories';
import { useTheme } from '@/lib/theme';
import { layout, radius, spacing } from '@/lib/tokens';
import { type_ } from '@/lib/typography';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;
// Reserve space for sheet handle + title + search bar above the list.
const LIST_MAX_HEIGHT = SCREEN_H * 0.52;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategorySearchSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the selected categoryId and display name. Sheet auto-closes. */
  onSelect: (categoryId: string, categoryName: string) => void;
}

// ─── CategorySearchSheet ──────────────────────────────────────────────────────

export function CategorySearchSheet({
  visible,
  onClose,
  onSelect,
}: CategorySearchSheetProps) {
  const colors = useTheme();
  const [query, setQuery] = useState('');
  const { data: groups = [] } = useCategoryGroups();

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => !g.is_hidden)
      .map((g) => ({
        title: g.name,
        data: q
          ? g.categories.filter((c) => c.name.toLowerCase().includes(q))
          : g.categories,
      }))
      .filter((s) => s.data.length > 0);
  }, [groups, query]);

  function handleClose() {
    setQuery('');
    onClose();
  }

  function handleSelect(categoryId: string, categoryName: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(categoryId, categoryName);
    setQuery('');
    onClose();
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Choose Category"
      scrollable={false}
    >
      {/* ── Search bar ── */}
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

      {/* ── Category list ── */}
      <SectionList
        sections={filteredSections}
        keyExtractor={(item) => item.id}
        style={[ss.list, { maxHeight: LIST_MAX_HEIGHT }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => (
          <View style={[ss.sectionHeader, { backgroundColor: colors.surface }]}>
            <Text style={[type_.labelSm, { color: colors.textMeta }]}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[ss.catRow, { borderBottomColor: colors.separator }]}
            onPress={() => handleSelect(item.id, item.name)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
          >
            <Text style={[type_.body, { color: colors.textPrimary, flex: 1 }]}>
              {item.name}
            </Text>
            <Ionicons name="chevron-forward" size={layout.iconSm} color={colors.textMeta} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={ss.emptyRow}>
            <Text style={[type_.small, { color: colors.textTertiary }]}>
              No categories match &ldquo;{query}&rdquo;
            </Text>
          </View>
        }
      />
    </BottomSheet>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
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
  list: {
    flexGrow: 0,
  },
  sectionHeader: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyRow: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
});
