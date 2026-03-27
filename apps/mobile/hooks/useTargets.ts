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

import { Q } from '@nozbe/watermelondb';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDatabase } from '@/database';
import { queryKeys } from '@/lib/queryKeys';
import { useToast } from '@/components/Toast';
import { syncDatabase } from '@/database/sync';
import CategoryTargetModel from '@/database/models/CategoryTarget';
import type { CategoryTarget, CategoryTargetUpsert } from '@/types/target';

function targetModelToDto(m: CategoryTargetModel): CategoryTarget {
  return {
    id: m.id,
    category_id: m.categoryId,
    frequency: m.frequency as CategoryTarget['frequency'],
    behavior: m.behavior as CategoryTarget['behavior'],
    target_amount: m.targetAmount,
    day_of_week: m.dayOfWeek,
    day_of_month: m.dayOfMonth,
    target_date: m.targetDate,
    repeats: m.repeats,
    updated_at: m.updatedAt.toISOString(),
  };
}

/** Fetch the current target for a category (null if none). */
export function useTarget(categoryId: string) {
  return useQuery({
    queryKey: queryKeys.target(categoryId),
    queryFn: async () => {
      const db = getDatabase();
      const targets = await db
        .get<CategoryTargetModel>('category_targets')
        .query(Q.where('category_id', categoryId))
        .fetch();
      return targets.length > 0 ? targetModelToDto(targets[0]) : null;
    },
  });
}

export function useUpsertTarget(month: string) {
  const { error } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, body }: { categoryId: string; body: CategoryTargetUpsert }) => {
      const db = getDatabase();
      await db.write(async () => {
        const existing = await db.get<CategoryTargetModel>('category_targets')
          .query(Q.where('category_id', categoryId))
          .fetch();
        if (existing.length > 0) {
          await existing[0].update(t => {
            t.frequency = body.frequency;
            t.behavior = body.behavior;
            t.targetAmount = body.target_amount;
            t.dayOfWeek = body.day_of_week ?? null;
            t.dayOfMonth = body.day_of_month ?? null;
            t.targetDate = body.target_date ?? null;
            t.repeats = body.repeats ?? false;
            t.updatedAt = new Date();
          });
        } else {
          await db.get<CategoryTargetModel>('category_targets').create(t => {
            t.categoryId = categoryId;
            t.frequency = body.frequency;
            t.behavior = body.behavior;
            t.targetAmount = body.target_amount;
            t.dayOfWeek = body.day_of_week ?? null;
            t.dayOfMonth = body.day_of_month ?? null;
            t.targetDate = body.target_date ?? null;
            t.repeats = body.repeats ?? false;
          });
        }
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: (_data, variables) => {
      // Invalidate both the target cache (so the edit screen re-reads fresh
      // data on the next open) and the budget cache (required_this_month etc).
      qc.invalidateQueries({ queryKey: queryKeys.target(variables.categoryId) });
      qc.invalidateQueries({ queryKey: ['budget'] });
    },
    onError: () => error('Error', 'Could not save target.'),
  });
}
