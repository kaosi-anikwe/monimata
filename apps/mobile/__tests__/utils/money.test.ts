/**
 * @jest-environment node
 */
/**
 * Tests for utils/money.ts
 *
 * Run: npm test -- --testPathPattern=money
 *
 * These utilities are critical for financial correctness.
 * A regression in kobo/Naira conversion would display wrong amounts to all users.
 */

import {
  computeNextDue,
  formatNaira,
  formatNairaCompact,
  koboToNaira,
  nairaStringToKobo,
  nairaToKobo,
  spentPercent,
} from '../../utils/money';

// ─── koboToNaira ──────────────────────────────────────────────────────────────

describe('koboToNaira', () => {
  it('converts integer kobo to naira float', () => {
    expect(koboToNaira(15000)).toBe(150.0);
    expect(koboToNaira(100)).toBe(1.0);
    expect(koboToNaira(1)).toBe(0.01);
  });

  it('handles zero', () => {
    expect(koboToNaira(0)).toBe(0);
  });

  it('handles negative (debit) amounts', () => {
    expect(koboToNaira(-5000)).toBe(-50.0);
  });

  it('handles large amounts (millions)', () => {
    expect(koboToNaira(100_000_000)).toBe(1_000_000); // ₦1,000,000
  });
});

// ─── nairaToKobo ─────────────────────────────────────────────────────────────

describe('nairaToKobo', () => {
  it('converts naira float to integer kobo', () => {
    expect(nairaToKobo(150)).toBe(15000);
    expect(nairaToKobo(1.5)).toBe(150);
    expect(nairaToKobo(0.01)).toBe(1);
  });

  it('rounds to nearest kobo to avoid floating point drift', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
  });

  it('handles zero', () => {
    expect(nairaToKobo(0)).toBe(0);
  });

  it('is the inverse of koboToNaira for round amounts', () => {
    const originalKobo = 12345;
    expect(nairaToKobo(koboToNaira(originalKobo))).toBe(originalKobo);
  });
});

// ─── nairaStringToKobo ───────────────────────────────────────────────────────

describe('nairaStringToKobo', () => {
  it('parses a plain number string', () => {
    expect(nairaStringToKobo('150')).toBe(15000);
  });

  it('strips commas (Nigerian formatting)', () => {
    expect(nairaStringToKobo('1,250,000')).toBe(125_000_000);
  });

  it('handles decimal input', () => {
    expect(nairaStringToKobo('150.50')).toBe(15050);
  });

  it('returns 0 for empty or non-numeric strings', () => {
    expect(nairaStringToKobo('')).toBe(0);
    expect(nairaStringToKobo('abc')).toBe(0);
    expect(nairaStringToKobo('N/A')).toBe(0);
  });
});

// ─── formatNaira ─────────────────────────────────────────────────────────────

describe('formatNaira', () => {
  it('formats with ₦ symbol and 2 decimal places', () => {
    expect(formatNaira(15000)).toBe('₦150.00');
    expect(formatNaira(100)).toBe('₦1.00');
  });

  it('uses comma-separated thousands', () => {
    expect(formatNaira(100_000_000)).toBe('₦1,000,000.00');
    expect(formatNaira(1_250_000)).toBe('₦12,500.00');
  });

  it('handles negative amounts (overspent)', () => {
    expect(formatNaira(-5000)).toBe('-₦50.00');
  });

  it('handles zero', () => {
    expect(formatNaira(0)).toBe('₦0.00');
  });

  it('shows explicit sign when showSign option is true', () => {
    expect(formatNaira(-5000, { showSign: true })).toBe('-₦50.00');
    expect(formatNaira(5000, { showSign: true })).toBe('₦50.00'); // positive has no extra sign
  });
});

// ─── formatNairaCompact ───────────────────────────────────────────────────────

describe('formatNairaCompact', () => {
  it('formats thousands with k suffix', () => {
    expect(formatNairaCompact(500_000)).toBe('₦5k');
    expect(formatNairaCompact(100_000)).toBe('₦1k');
  });

  it('formats millions with M suffix', () => {
    expect(formatNairaCompact(150_000_000)).toBe('₦1.5M');
    expect(formatNairaCompact(1_000_000_000)).toBe('₦10.0M');
  });

  it('formats small amounts without suffix', () => {
    expect(formatNairaCompact(5000)).toBe('₦50');
  });

  it('handles negative amounts', () => {
    // abs() is applied — compact format doesn't show sign
    expect(formatNairaCompact(-500_000)).toBe('₦5k');
  });
});

// ─── spentPercent ─────────────────────────────────────────────────────────────

describe('spentPercent', () => {
  it('returns 0 when nothing is assigned', () => {
    expect(spentPercent(-5000, 0)).toBe(0);
  });

  it('returns 50% when half is spent', () => {
    // activity is negative (debit); assigned is positive
    expect(spentPercent(-5000, 10000)).toBe(50);
  });

  it('returns 100% when fully spent', () => {
    expect(spentPercent(-10000, 10000)).toBe(100);
  });

  it('can exceed 100% when overspent', () => {
    expect(spentPercent(-15000, 10000)).toBe(150);
  });
});

// ─── computeNextDue ──────────────────────────────────────────────────────────

describe('computeNextDue', () => {
  const base = '2026-01-15';

  it('advances daily by interval', () => {
    expect(computeNextDue(base, 'daily', 1)).toBe('2026-01-16');
    expect(computeNextDue(base, 'daily', 7)).toBe('2026-01-22');
  });

  it('advances weekly by interval', () => {
    expect(computeNextDue(base, 'weekly', 1)).toBe('2026-01-22');
    expect(computeNextDue(base, 'weekly', 2)).toBe('2026-01-29');
  });

  it('advances monthly by interval', () => {
    expect(computeNextDue(base, 'monthly', 1)).toBe('2026-02-15');
    expect(computeNextDue(base, 'monthly', 3)).toBe('2026-04-15');
  });

  it('advances yearly', () => {
    expect(computeNextDue(base, 'yearly', 1)).toBe('2027-01-15');
  });

  it('handles month-end rollover gracefully', () => {
    // Jan 31 + 1 month = Feb 28 (not Feb 31)
    const result = computeNextDue('2026-01-31', 'monthly', 1);
    expect(result).toBe('2026-02-28');
  });

  it('accepts a Date object as input', () => {
    const d = new Date(2026, 0, 15); // Jan 15 2026 local time
    expect(computeNextDue(d, 'monthly', 1)).toBe('2026-02-15');
  });
});
