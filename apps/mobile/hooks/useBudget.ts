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
import { useAppSelector } from '@/store/hooks';
import CategoryModel from '@/database/models/Category';
import BudgetMonthModel from '@/database/models/BudgetMonth';
import TransactionModel from '@/database/models/Transaction';
import CategoryGroupModel from '@/database/models/CategoryGroup';
import CategoryTargetModel from '@/database/models/CategoryTarget';
import type { BudgetCategory, BudgetGroup, BudgetResponse } from '@/types/budget';

// ── Budget logic (mirrors apps/api/app/services/budget_logic.py) ─────────────

/** "YYYY-MM" → "YYYY-MM" for the previous calendar month */
function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** "YYYY-MM" → UTC epoch-ms bounds [start, end) */
function monthBounds(month: string): { start: number; end: number } {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = m === 12 ? Date.UTC(y + 1, 0, 1) : Date.UTC(y, m, 1);
  return { start, end };
}

/** epoch-ms (UTC) → "YYYY-MM" */
function epochToYearMonth(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * required_this_month — exact port of budget_logic.py::required_this_month().
 * Returns kobo needed this month to meet the target, or null if unknown.
 */
function requiredThisMonth(
  target: CategoryTargetModel,
  available: number,
  today: Date,
): number | null {
  const { frequency, behavior, targetAmount, targetDate } = target;

  if (frequency === 'monthly') {
    return Math.max(0, targetAmount - available);
  }

  if (frequency === 'weekly') {
    if (behavior === 'refill') return Math.max(0, targetAmount - available);
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const remainingDays = daysInMonth - today.getDate() + 1;
    const remainingWeeks = Math.ceil(remainingDays / 7);
    return Math.max(0, targetAmount * remainingWeeks - available);
  }

  if (frequency === 'yearly' || frequency === 'custom') {
    if (behavior === 'balance') return Math.max(0, targetAmount - available);
    let tDate: Date;
    if (targetDate) {
      tDate = new Date(targetDate);
    } else if (frequency === 'yearly') {
      tDate = new Date(today.getFullYear(), 11, 31);
    } else {
      return null; // custom with no target_date
    }
    if (tDate <= today) return Math.max(0, targetAmount - available);
    const monthsLeft =
      (tDate.getFullYear() - today.getFullYear()) * 12 +
      (tDate.getMonth() - today.getMonth()) +
      1;
    const totalNeeded = targetAmount - available;
    if (totalNeeded <= 0) return 0;
    return Math.ceil(totalNeeded / Math.max(1, monthsLeft));
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useBudget(month: string) {
  return useQuery({
    queryKey: queryKeys.budget(month),
    queryFn: async (): Promise<BudgetResponse> => {
      const db = getDatabase();
      const prev = prevMonth(month);

      // Build up to 12 months of history for TBB carry-forward
      const tbbMonths: string[] = [month];
      let m = month;
      for (let i = 1; i < 12; i++) {
        m = prevMonth(m);
        tbbMonths.push(m);
      }
      const oldestBounds = monthBounds(tbbMonths[tbbMonths.length - 1]);
      const currentBounds = monthBounds(month);

      const [
        groups,
        categories,
        bmCurrent,
        bmPrev,
        targets,
        creditTxns,
        bmHistorical,
        allMonthTxns,
      ] = await Promise.all([
        db.get<CategoryGroupModel>('category_groups')
          .query(Q.sortBy('sort_order', Q.asc))
          .fetch(),
        db.get<CategoryModel>('categories')
          .query(Q.sortBy('sort_order', Q.asc))
          .fetch(),
        db.get<BudgetMonthModel>('budget_months')
          .query(Q.where('month', month))
          .fetch(),
        db.get<BudgetMonthModel>('budget_months')
          .query(Q.where('month', prev))
          .fetch(),
        db.get<CategoryTargetModel>('category_targets').query().fetch(),
        db.get<TransactionModel>('transactions').query(
          Q.where('type', 'credit'),
          Q.where('date', Q.gte(oldestBounds.start)),
          Q.where('date', Q.lt(currentBounds.end)),
        ).fetch(),
        db.get<BudgetMonthModel>('budget_months')
          .query(Q.where('month', Q.oneOf(tbbMonths)))
          .fetch(),
        // All transactions this month — used for live per-category activity AND
        // total_debit (all debits, categorised or not), so this mirrors the way
        // creditTxns includes all credits regardless of category.
        db.get<TransactionModel>('transactions').query(
          Q.where('date', Q.gte(currentBounds.start)),
          Q.where('date', Q.lt(currentBounds.end)),
        ).fetch(),
      ]);

      const bmCurrentMap = new Map(bmCurrent.map((b) => [b.categoryId, b]));
      const bmPrevMap = new Map(bmPrev.map((b) => [b.categoryId, b]));
      const targetMap = new Map(targets.map((t) => [t.categoryId, t]));

      // Compute live activity from transactions — normalised by type so this works
      // regardless of whether amounts are signed (new manual txns) or unsigned
      // (server-synced txns stored with the old positive-only convention).
      const activityByCategory = new Map<string, number>();
      let totalDebit = 0;
      allMonthTxns.forEach((tx) => {
        if (tx.type === 'debit') totalDebit += Math.abs(tx.amount);
        if (!tx.categoryId) return;
        const contribution = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
        activityByCategory.set(tx.categoryId, (activityByCategory.get(tx.categoryId) ?? 0) + contribution);
      });

      // Income per month (credit transactions) for TBB
      const incomeByMonth = new Map<string, number>();
      creditTxns.forEach((tx) => {
        const txMonth = epochToYearMonth(tx.date.getTime());
        incomeByMonth.set(txMonth, (incomeByMonth.get(txMonth) ?? 0) + tx.amount);
      });

      // Total assigned per month for TBB
      const assignedByMonth = new Map<string, number>();
      bmHistorical.forEach((bm) => {
        assignedByMonth.set(bm.month, (assignedByMonth.get(bm.month) ?? 0) + bm.assigned);
      });

      // TBB: iterate oldest → newest, short-circuit on empty historical months
      let tbb = 0;
      for (let i = tbbMonths.length - 1; i >= 0; i--) {
        const mm = tbbMonths[i];
        const income = incomeByMonth.get(mm) ?? 0;
        const assigned = assignedByMonth.get(mm) ?? 0;
        if (i < tbbMonths.length - 1 && income === 0 && assigned === 0) {
          tbb = 0; // no data in this historical month — reset carry
          continue;
        }
        tbb = income - assigned + Math.max(0, tbb);
      }

      const today = new Date();
      const groupRows: BudgetGroup[] = groups.map((g) => {
        const cats = categories.filter((c) => c.groupId === g.id);
        const catRows: BudgetCategory[] = cats.map((cat) => {
          const bm = bmCurrentMap.get(cat.id);
          const pb = bmPrevMap.get(cat.id);
          const assigned = bm?.assigned ?? 0;
          // Use live transaction-derived activity (always up to date pre-sync)
          const activity = activityByCategory.get(cat.id) ?? 0;
          // One level of carry-forward (matches Python's compute_available)
          const prevAvailable = pb ? pb.assigned + pb.activity : 0;
          const carry = Math.max(0, prevAvailable);
          const available = assigned + carry + activity;
          const target = targetMap.get(cat.id);
          return {
            id: cat.id,
            name: cat.name,
            sort_order: cat.sortOrder,
            is_hidden: cat.isHidden,
            assigned,
            activity,
            available,
            required_this_month: target ? requiredThisMonth(target, available, today) : null,
            target_amount: target?.targetAmount ?? null,
            target_frequency: (target?.frequency ?? null) as string | null,
          };
        });
        return {
          id: g.id,
          name: g.name,
          sort_order: g.sortOrder,
          is_hidden: g.isHidden,
          categories: catRows,
        };
      });

      return { month, tbb, groups: groupRows, total_debit: totalDebit };
    },
  });
}

export function useAssignCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  const userId = useAppSelector(state => state.auth.user?.id ?? '');
  return useMutation({
    mutationFn: async ({ categoryId, assigned }: { categoryId: string; assigned: number }) => {
      const db = getDatabase();
      await db.write(async () => {
        const existing = await db.get<BudgetMonthModel>('budget_months')
          .query(Q.where('category_id', categoryId), Q.where('month', month))
          .fetch();
        if (existing.length > 0) {
          await existing[0].update(bm => {
            bm.assigned = assigned;
            bm.updatedAt = new Date();
          });
        } else {
          await db.get<BudgetMonthModel>('budget_months').create(bm => {
            bm.userId = userId;
            bm.categoryId = categoryId;
            bm.month = month;
            bm.assigned = assigned;
            bm.activity = 0;
          });
        }
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not save assignment.'),
  });
}

export function useCreateGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  const userId = useAppSelector(state => state.auth.user?.id ?? '');
  return useMutation({
    mutationFn: async (name: string) => {
      const db = getDatabase();
      await db.write(async () => {
        await db.get<CategoryGroupModel>('category_groups').create(g => {
          g.userId = userId;
          g.name = name;
          g.sortOrder = 0;
          g.isHidden = false;
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not create group.'),
  });
}

export function useCreateCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  const userId = useAppSelector(state => state.auth.user?.id ?? '');
  return useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      const db = getDatabase();
      await db.write(async () => {
        await db.get<CategoryModel>('categories').create(c => {
          c.userId = userId;
          c.groupId = groupId;
          c.name = name;
          c.sortOrder = 0;
          c.isHidden = false;
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not create category.'),
  });
}

export function useRenameCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async ({ categoryId, name }: { categoryId: string; name: string }) => {
      const db = getDatabase();
      await db.write(async () => {
        const cat = await db.get<CategoryModel>('categories').find(categoryId);
        await cat.update(c => {
          c.name = name;
          c.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not rename category.'),
  });
}

export function useHideCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const cat = await db.get<CategoryModel>('categories').find(categoryId);
        await cat.update(c => {
          c.isHidden = true;
          c.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not hide category.'),
  });
}

export function useUnhideCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const cat = await db.get<CategoryModel>('categories').find(categoryId);
        await cat.update(c => {
          c.isHidden = false;
          c.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not unhide category.'),
  });
}

export function useDeleteCategory(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const cat = await db.get<CategoryModel>('categories').find(categoryId);
        await cat.markAsDeleted();
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Cannot Delete', 'Could not delete category.'),
  });
}

export function useRenameGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      const db = getDatabase();
      await db.write(async () => {
        const grp = await db.get<CategoryGroupModel>('category_groups').find(groupId);
        await grp.update(g => {
          g.name = name;
          g.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not rename group.'),
  });
}

export function useDeleteGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const grp = await db.get<CategoryGroupModel>('category_groups').find(groupId);
        await grp.markAsDeleted();
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Cannot Delete', 'Could not delete group.'),
  });
}

export function useDeleteTarget(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const targets = await db.get<CategoryTargetModel>('category_targets')
          .query(Q.where('category_id', categoryId))
          .fetch();
        for (const t of targets) {
          await t.markAsDeleted();
        }
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not remove target.'),
  });
}

export function useHideGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const grp = await db.get<CategoryGroupModel>('category_groups').find(groupId);
        await grp.update(g => {
          g.isHidden = true;
          g.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not hide group.'),
  });
}

export function useUnhideGroup(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const db = getDatabase();
      await db.write(async () => {
        const grp = await db.get<CategoryGroupModel>('category_groups').find(groupId);
        await grp.update(g => {
          g.isHidden = false;
          g.updatedAt = new Date();
        });
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Error', 'Could not unhide group.'),
  });
}

export function useMoveMoney(month: string) {
  const qc = useQueryClient();
  const { error } = useToast();
  const userId = useAppSelector(state => state.auth.user?.id ?? '');
  return useMutation({
    mutationFn: async ({
      fromCategoryId,
      toCategoryId,
      amount,
    }: {
      fromCategoryId: string;
      toCategoryId: string;
      amount: number; // kobo
    }) => {
      const db = getDatabase();
      const [fromRows, toRows] = await Promise.all([
        db.get<BudgetMonthModel>('budget_months')
          .query(Q.where('category_id', fromCategoryId), Q.where('month', month))
          .fetch(),
        db.get<BudgetMonthModel>('budget_months')
          .query(Q.where('category_id', toCategoryId), Q.where('month', month))
          .fetch(),
      ]);
      await db.write(async () => {
        if (fromRows.length > 0) {
          await fromRows[0].update(bm => {
            bm.assigned = bm.assigned - amount;
            bm.updatedAt = new Date();
          });
        }
        if (toRows.length > 0) {
          await toRows[0].update(bm => {
            bm.assigned = bm.assigned + amount;
            bm.updatedAt = new Date();
          });
        } else {
          await db.get<BudgetMonthModel>('budget_months').create(bm => {
            bm.userId = userId;
            bm.categoryId = toCategoryId;
            bm.month = month;
            bm.assigned = amount;
            bm.activity = 0;
          });
        }
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
    onError: () => error('Cannot Move', 'Could not move money.'),
  });
}

/**
 * Persist a new group order. Accepts a list of group IDs in the desired order;
 * each gets sortOrder = its index in the list. Triggers sync after write.
 */
export function useReorderGroups(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const db = getDatabase();
      await db.write(async () => {
        await Promise.all(
          orderedIds.map(async (id, idx) => {
            const grp = await db.get<CategoryGroupModel>('category_groups').find(id);
            await grp.update(g => {
              g.sortOrder = idx;
              g.updatedAt = new Date();
            });
          }),
        );
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
  });
}

/**
 * Persist a new category order within a group. Accepts a list of category IDs
 * in the desired order; each gets sortOrder = its index. Triggers sync.
 */
export function useReorderCategories(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const db = getDatabase();
      await db.write(async () => {
        await Promise.all(
          orderedIds.map(async (id, idx) => {
            const cat = await db.get<CategoryModel>('categories').find(id);
            await cat.update(c => {
              c.sortOrder = idx;
              c.updatedAt = new Date();
            });
          }),
        );
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.budget(month) }),
  });
}

// ── Auto-Assign ───────────────────────────────────────────────────────────────

export type AutoAssignStrategy =
  | 'underfunded'
  | 'assigned_last_month'
  | 'spent_last_month'
  | 'avg_assigned'
  | 'avg_spent';

export interface AutoAssignItem {
  categoryId: string;
  categoryName: string;
  currentAssigned: number; // kobo
  proposedAssigned: number; // kobo
}

export interface AutoAssignPreview {
  strategy: AutoAssignStrategy;
  /** Only categories where proposed !== current */
  items: AutoAssignItem[];
  /** Sum of all (proposed - current) deltas; kobo */
  totalDelta: number;
  /** Projected TBB after applying this strategy; kobo */
  newTbb: number;
}

export type AutoAssignAllPreviews = Record<AutoAssignStrategy, AutoAssignPreview>;

/**
 * Computes auto-assign strategy previews from WatermelonDB.
 * Uses the already-computed BudgetResponse (current month + live activity)
 * and looks up last 3 months of historical budget_months rows.
 *
 * Mode is derived from TBB:
 *   TBB > 0 → "assign" mode: each strategy only keeps items where
 *             proposedAssigned > currentAssigned (we are filling, not reducing).
 *   TBB < 0 → "fix" mode: underfunded strategy is excluded entirely;
 *             each strategy only keeps items where proposedAssigned < currentAssigned
 *             (we are reducing over-assignment to bring TBB back to 0).
 *
 * Enabled only when budgetData is present and tbb !== 0.
 */
export function useAutoAssignPreviews(
  month: string,
  budgetData: BudgetResponse | undefined,
) {
  return useQuery({
    queryKey: ['auto-assign-previews', month] as const,
    queryFn: async (): Promise<AutoAssignAllPreviews> => {
      const db = getDatabase();

      const allCats = (budgetData?.groups ?? [])
        .filter((g) => !g.is_hidden)
        .flatMap((g) => g.categories.filter((c) => !c.is_hidden));

      const prev1 = prevMonth(month);
      const prev2 = prevMonth(prev1);
      const prev3 = prevMonth(prev2);
      const histMonths = [prev1, prev2, prev3];
      const catIds = allCats.map((c) => c.id);

      const [historicalBMs, allTargets] = await Promise.all([
        catIds.length > 0
          ? db
              .get<BudgetMonthModel>('budget_months')
              .query(
                Q.where('category_id', Q.oneOf(catIds)),
                Q.where('month', Q.oneOf(histMonths)),
              )
              .fetch()
          : Promise.resolve([]),
        db.get<CategoryTargetModel>('category_targets').query().fetch(),
      ]);

      // Index: categoryId → month → record
      const bmIndex = new Map<string, Map<string, BudgetMonthModel>>();
      for (const bm of historicalBMs) {
        if (!bmIndex.has(bm.categoryId)) bmIndex.set(bm.categoryId, new Map());
        bmIndex.get(bm.categoryId)!.set(bm.month, bm);
      }

      // Index: categoryId → target (needed for underfunded priority sort)
      const targetMap = new Map(allTargets.map((t) => [t.categoryId, t]));

      const strategies: AutoAssignStrategy[] = [
        'underfunded',
        'assigned_last_month',
        'spent_last_month',
        'avg_assigned',
        'avg_spent',
      ];

      const result = {} as AutoAssignAllPreviews;
      const today = new Date();
      const tbb = budgetData?.tbb ?? 0;
      // assign mode (tbb > 0): only keep items that increase assignments (we're filling).
      // fix mode    (tbb < 0): only keep items that decrease assignments (we're reducing).
      const mode: 'assign' | 'fix' = tbb >= 0 ? 'assign' : 'fix';

      for (const strategy of strategies) {
        // Underfunded is about topping categories up — no place in fix mode.
        if (strategy === 'underfunded' && mode === 'fix') {
          result[strategy] = { strategy, items: [], totalDelta: 0, newTbb: tbb };
          continue;
        }

        const items: AutoAssignItem[] = [];

        if (strategy === 'underfunded') {
          // Build priority-sorted candidates and simulate TBB-cap: min(shortfall, remaining).
          type Candidate = { cat: BudgetCategory; shortfall: number };
          const candidates: Candidate[] = allCats
            .filter((cat) => cat.required_this_month !== null && cat.required_this_month > 0)
            .map((cat) => ({ cat, shortfall: cat.required_this_month! }));

          // Priority rank matches the backend sort:
          //   [0, daysAway] → by_date targets (closest deadline first)
          //   [1, 0]        → monthly set_aside
          //   [2, 0]        → monthly refill / balance
          //   [3, 0]        → weekly
          //   [4, 0]        → other / no target
          const rank = (cat: BudgetCategory): [number, number] => {
            const target = targetMap.get(cat.id);
            if (!target) return [4, 0];
            if (
              (target.frequency === 'yearly' || target.frequency === 'custom') &&
              target.targetDate
            ) {
              const daysAway = Math.floor(
                (new Date(target.targetDate).getTime() - today.getTime()) / 86_400_000,
              );
              return [0, daysAway];
            }
            if (target.frequency === 'monthly' && target.behavior === 'set_aside') return [1, 0];
            if (target.frequency === 'monthly') return [2, 0];
            if (target.frequency === 'weekly') return [3, 0];
            return [4, 0];
          };

          candidates.sort((a, b) => {
            const [pa, da] = rank(a.cat);
            const [pb, db_] = rank(b.cat);
            return pa !== pb ? pa - pb : da - db_;
          });

          let remainingTbb = tbb;
          for (const { cat, shortfall } of candidates) {
            if (remainingTbb <= 0) break;
            const toAssign = Math.min(shortfall, remainingTbb);
            items.push({
              categoryId: cat.id,
              categoryName: cat.name,
              currentAssigned: cat.assigned,
              proposedAssigned: cat.assigned + toAssign,
            });
            remainingTbb -= toAssign;
          }
        } else {
          // Historical strategies — iterate all visible categories
          for (const cat of allCats) {
            const catBMs = bmIndex.get(cat.id);
            let proposed: number;

            switch (strategy) {
              case 'assigned_last_month': {
                proposed = catBMs?.get(prev1)?.assigned ?? 0;
                break;
              }
              case 'spent_last_month': {
                // activity is stored negative for debits; abs gives the spend amount
                proposed = Math.abs(catBMs?.get(prev1)?.activity ?? 0);
                break;
              }
              case 'avg_assigned': {
                const vals = histMonths
                  .map((m) => catBMs?.get(m)?.assigned ?? 0)
                  .filter((v) => v > 0);
                proposed =
                  vals.length > 0
                    ? Math.ceil(vals.reduce((a, b) => a + b, 0) / vals.length)
                    : 0;
                break;
              }
              case 'avg_spent': {
                const vals = histMonths
                  .map((m) => Math.abs(catBMs?.get(m)?.activity ?? 0))
                  .filter((v) => v > 0);
                proposed =
                  vals.length > 0
                    ? Math.ceil(vals.reduce((a, b) => a + b, 0) / vals.length)
                    : 0;
                break;
              }
              default:
                proposed = cat.assigned;
            }

            if (proposed !== cat.assigned) {
              items.push({
                categoryId: cat.id,
                categoryName: cat.name,
                currentAssigned: cat.assigned,
                proposedAssigned: proposed,
              });
            }
          }
        }

        // Mode filter applied after computing all candidates:
        //   assign mode → only increases (we are distributing unassigned money)
        //   fix mode    → only decreases (we are pulling money back to TBB)
        const filteredItems =
          mode === 'assign'
            ? items.filter((it) => it.proposedAssigned > it.currentAssigned)
            : items.filter((it) => it.proposedAssigned < it.currentAssigned);

        const totalDelta = filteredItems.reduce(
          (s, it) => s + (it.proposedAssigned - it.currentAssigned),
          0,
        );

        result[strategy] = {
          strategy,
          items: filteredItems,
          totalDelta,
          newTbb: tbb - totalDelta,
        };
      }

      return result;
    },
    enabled: !!budgetData && (budgetData?.tbb ?? 0) !== 0,
    staleTime: 15_000, // previews stay fresh for 15 s
  });
}

/**
 * Applies an auto-assign preview: writes proposed assigned amounts to
 * WatermelonDB for all affected categories, then triggers a background sync.
 */
export function useApplyAutoAssign(month: string) {
  const qc = useQueryClient();
  const { error: showError, success } = useToast();
  const userId = useAppSelector((state) => state.auth.user?.id ?? '');

  return useMutation({
    mutationFn: async (items: AutoAssignItem[]) => {
      const db = getDatabase();
      await db.write(async () => {
        for (const item of items) {
          const existing = await db
            .get<BudgetMonthModel>('budget_months')
            .query(Q.where('category_id', item.categoryId), Q.where('month', month))
            .fetch();
          if (existing.length > 0) {
            await existing[0].update((bm) => {
              bm.assigned = item.proposedAssigned;
              bm.updatedAt = new Date();
            });
          } else {
            await db.get<BudgetMonthModel>('budget_months').create((bm) => {
              bm.userId = userId;
              bm.categoryId = item.categoryId;
              bm.month = month;
              bm.assigned = item.proposedAssigned;
              bm.activity = 0;
            });
          }
        }
      });
      syncDatabase().catch(console.warn);
    },
    onSuccess: (_, items) => {
      qc.invalidateQueries({ queryKey: queryKeys.budget(month) });
      qc.invalidateQueries({ queryKey: ['auto-assign-previews', month] });
      const n = items.length;
      success(
        'Assignments applied',
        `${n} categor${n === 1 ? 'y' : 'ies'} updated.`,
      );
    },
    onError: () => showError('Error', 'Could not apply auto-assign.'),
  });
}
