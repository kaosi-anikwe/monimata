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
 * useReportAccountFilter
 *
 * Returns the comma-separated account_ids string for report API calls,
 * computed from the user's exclusion list in Redux.
 *
 * - If no accounts are excluded → returns undefined (no filter).
 * - Otherwise → returns included account IDs joined by commas.
 */

import { useMemo } from 'react';

import { useAccounts } from '@/hooks/useAccounts';
import { useAppSelector } from '@/store/hooks';

export function useReportAccountFilter(): string | undefined {
    const { data: accounts } = useAccounts();
    const excluded = useAppSelector((st) => st.preferences.reportExcludedAccountIds);

    return useMemo(() => {
        if (!excluded.length) return undefined;
        const all = accounts ?? [];
        const included = all
            .filter((a) => !excluded.includes(a.id))
            .map((a) => a.id);
        // If everything is excluded, pass undefined to avoid empty-result API calls
        if (!included.length) return undefined;
        return included.join(',');
    }, [accounts, excluded]);
}
