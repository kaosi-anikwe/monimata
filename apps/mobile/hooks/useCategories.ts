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
import { useQuery } from '@tanstack/react-query';

import { getDatabase } from '@/database';
import { queryKeys } from '@/lib/queryKeys';
import type { CategoryGroup } from '@/types/category';
import CategoryModel from '@/database/models/Category';
import CategoryGroupModel from '@/database/models/CategoryGroup';

export function useCategoryGroups() {
  return useQuery({
    queryKey: queryKeys.categoryGroups(),
    queryFn: async () => {
      const db = getDatabase();
      const [groups, categories] = await Promise.all([
        db.get<CategoryGroupModel>('category_groups')
          .query(Q.sortBy('sort_order', Q.asc))
          .fetch(),
        db.get<CategoryModel>('categories')
          .query(Q.sortBy('sort_order', Q.asc))
          .fetch(),
      ]);
      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        categories: categories
          .filter((c) => c.groupId === g.id)
          .map((c) => ({ id: c.id, name: c.name })),
      })) as CategoryGroup[];
    },
  });
}
