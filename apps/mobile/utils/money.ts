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
 * Money utilities — kobo ↔ Naira conversions and formatting.
 * All amounts in the system are stored/transmitted as kobo (integer).
 * Only format to Naira at the display layer.
 */

/** Convert kobo to Naira (float) */
export function koboToNaira(kobo: number): number {
    return kobo / 100;
}

/** Convert Naira to kobo (integer, rounds to nearest kobo) */
export function nairaToKobo(naira: number): number {
    return Math.round(naira * 100);
}

/** Convert Naira string to kobo */
export function nairaStringToKobo(naira: string): number {
    const n = parseFloat(naira.replace(/,/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100);
}

/** Format kobo as a Naira string — e.g. 15000 → "₦150.00" */
export function formatNaira(kobo: number, options?: { showSign?: boolean }): string {
    const naira = koboToNaira(kobo);
    const abs = Math.abs(naira);
    const formatted = new Intl.NumberFormat('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(abs);

    const sign = options?.showSign && kobo < 0 ? '-' : kobo < 0 ? '-' : '';
    return `${sign}₦${formatted}`;
}

/** Format kobo as a compact Naira string — e.g. 1500000 → "₦15k" */
export function formatNairaCompact(kobo: number): string {
    const naira = Math.abs(koboToNaira(kobo));
    if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}M`;
    if (naira >= 1_000) return `₦${(naira / 1_000).toFixed(0)}k`;
    return `₦${naira.toFixed(0)}`;
}

/** Returns the percentage spent relative to assigned. Clamps to 0–100+. */
export function spentPercent(activity: number, assigned: number): number {
    if (assigned === 0) return 0;
    // activity is negative; we want magnitude of spending / assigned
    return Math.round((Math.abs(activity) / assigned) * 100);
}

export function computeNextDue(fromDate: Date | string, frequency: string, interval: number): string {
    let d: Date;
    if (fromDate instanceof Date) {
        // Use the calendar date in local time, discarding the time component
        d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    } else {
        // Append T00:00:00 (no Z) so Date parses in local time, not UTC.
        d = new Date(fromDate + 'T00:00:00');
    }
    switch (frequency) {
        case 'daily': d.setDate(d.getDate() + interval); break;
        case 'weekly': d.setDate(d.getDate() + 7 * interval); break;
        case 'biweekly': d.setDate(d.getDate() + 14); break;
        case 'monthly': {
            // Temporarily move to the 1st so setMonth never overflows.
            // Then clamp the original day to the days available in the target month.
            const origDay = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() + interval);
            const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(origDay, daysInMonth));
            break;
        }
        case 'yearly': d.setFullYear(d.getFullYear() + interval); break;
        default: d.setDate(d.getDate() + 7); break;
    }
    // Format using local date parts to avoid UTC-conversion off-by-one errors
    // that toISOString() causes for timezones ahead of UTC (e.g. Africa/Lagos UTC+1).
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
