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

import type { Category } from '@monimata/shared-types';

/** Lightweight pick — only id + name are needed by pickers and dropdowns. */
export type CategoryItem = Pick<Category, 'id' | 'name'>;

/**
 * CategoryGroup with lightweight CategoryItem children.
 * The mobile app builds these from WatermelonDB models — only id + name are
 * projected from the local DB. For full API responses use CategoryGroupWithCategories.
 */
export interface CategoryGroup {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
  categories: CategoryItem[];
}
