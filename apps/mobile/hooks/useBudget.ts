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

import { useToast } from '@/components/Toast';
import { getDatabase } from '@/database';
import BudgetMonthModel from '@/database/models/BudgetMonth';
import CategoryModel from '@/database/models/Category';
import CategoryGroupModel from '@/database/models/CategoryGroup';
import CategoryTargetModel from '@/database/models/CategoryTarget';
import TransactionModel from '@/database/models/Transaction';
import { syncDatabase } from '@/database/sync';
import { queryKeys } from '@/lib/queryKeys';
import { useAppSelector } from '@/store/hooks';
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
      ]);

      const bmCurrentMap = new Map(bmCurrent.map((b) => [b.categoryId, b]));
      const bmPrevMap = new Map(bmPrev.map((b) => [b.categoryId, b]));
      const targetMap = new Map(targets.map((t) => [t.categoryId, t]));

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
          const activity = bm?.activity ?? 0;
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

      return { month, tbb, groups: groupRows };
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
