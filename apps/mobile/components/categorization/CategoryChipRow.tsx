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
 * CategoryChipRow
 *
 * Horizontally scrollable row of quick-assign category chips for a cluster
 * card (spec §7.2). Shows up to MAX_CHIPS categories from the user's
 * category list, then a "More…" chip that opens the full search sheet.
 *
 * Categories are shown in the order supplied (caller is responsible for
 * pre-sorting by relevance). The existing `Chip` UI component is used so
 * tap animation and colour logic stay consistent with the rest of the app.
 */

import * as Haptics from 'expo-haptics';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useToast } from '@/components/Toast';
import { Chip } from '@/components/ui';
import { spacing } from '@/lib/tokens';
import type { CategoryGroup } from '@/types/category';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum category chips shown before the "More…" fallback. */
const MAX_CHIPS = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryChipRowProps {
  /** Full category tree from WatermelonDB via useCategoryGroups(). */
  groups: CategoryGroup[];
  /** Called with the selected category id and display name.
   *  categoryId is null when the user selects TBB. */
  onSelect: (categoryId: string | null, categoryName: string) => void;
  /** Opens the full CategorySearchSheet. */
  onMorePress: () => void;
  /**
   * Id of the category whose mutation is currently in-flight.
   * The matching chip renders in the `selected` (filled) state and all
   * chips are disabled while the mutation is pending.
   */
  pendingCategoryId?: string;
  /** When true the TBB chip is shown disabled with a warning on tap. */
  disableTBB?: boolean;
}

// ─── CategoryChipRow ─────────────────────────────────────────────────────────

export function CategoryChipRow({
  groups,
  onSelect,
  onMorePress,
  pendingCategoryId,
  disableTBB = false,
}: CategoryChipRowProps) {
  const { info: showInfo } = useToast();
  // Flatten all non-hidden categories and cap at MAX_CHIPS.
  const flatCategories = groups
    .filter((g) => !g.is_hidden)
    .flatMap((g) => g.categories)
    .slice(0, MAX_CHIPS);

  const isPending = !!pendingCategoryId;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={ss.row}
      keyboardShouldPersistTaps="handled"
    >
      {/* TBB chip — always first */}
      <Chip
        label="TBB"
        selected={false}
        onPress={() => {
          if (disableTBB) {
            showInfo('Not allowed', 'Expenses cannot be assigned to To Be Budgeted.');
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(null, 'To Be Budgeted');
          }
        }}
        disabled={isPending}
        style={[ss.chip, disableTBB ? { opacity: 0.4 } : undefined]}
        accessibilityLabel={disableTBB ? 'TBB — not available for expenses' : 'Assign to TBB'}
      />

      {flatCategories.map((cat) => (
        <Chip
          key={cat.id}
          label={cat.name}
          selected={cat.id === pendingCategoryId}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(cat.id, cat.name);
          }}
          disabled={isPending}
          style={ss.chip}
          accessibilityLabel={`Assign to ${cat.name}`}
        />
      ))}

      <Chip
        label="More…"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onMorePress();
        }}
        disabled={isPending}
        style={ss.chip}
        accessibilityLabel="Browse all categories"
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    // Chips are sized by content — no fixed width enforced here.
  },
});
