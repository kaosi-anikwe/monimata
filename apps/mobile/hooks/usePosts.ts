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

import { $api } from '@/services/api';

/**
 * Fetch the paginated list of mobile-visible Knowledge Hub posts.
 * Results are cached for 5 minutes.
 */
export function usePosts(params?: { page?: number; limit?: number }) {
  return $api.useQuery(
    'get',
    '/content/posts',
    {
      params: {
        query: {
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
        },
      },
    },
    { staleTime: 5 * 60_000 },
  );
}

/**
 * Fetch a single post by its slug.
 * Results are cached for 5 minutes.
 */
export function usePost(slug: string) {
  return $api.useQuery(
    'get',
    '/content/posts/{slug}',
    { params: { path: { slug } } },
    { staleTime: 5 * 60_000, enabled: !!slug },
  );
}
