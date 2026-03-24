/**
 * @jest-environment node
 */
/**
 * Tests for store/budgetSlice.ts
 *
 * Run: npm test -- --testPathPattern=budgetSlice
 */

import budgetReducer, {
  nextMonth,
  prevMonth,
  setSelectedMonth,
  syncToCurrentMonth,
} from '../../store/budgetSlice';

describe('budgetSlice', () => {
  const monthOf = (y: number, m: number) =>
    `${y}-${String(m).padStart(2, '0')}`;

  // ── Initial state ─────────────────────────────────────────────────────────

  it('initialises selectedMonth to the current calendar month', () => {
    const state = budgetReducer(undefined, { type: '@@INIT' });
    const now = new Date();
    const expected = monthOf(now.getFullYear(), now.getMonth() + 1);
    expect(state.selectedMonth).toBe(expected);
  });

  // ── setSelectedMonth ───────────────────────────────────────────────────────

  it('sets an arbitrary month', () => {
    const state = budgetReducer({ selectedMonth: '2026-01' }, setSelectedMonth('2025-06'));
    expect(state.selectedMonth).toBe('2025-06');
  });

  // ── prevMonth ─────────────────────────────────────────────────────────────

  it('goes back one month within a year', () => {
    const s = budgetReducer({ selectedMonth: '2026-03' }, prevMonth());
    expect(s.selectedMonth).toBe('2026-02');
  });

  it('wraps from January back to December of the previous year', () => {
    const s = budgetReducer({ selectedMonth: '2026-01' }, prevMonth());
    expect(s.selectedMonth).toBe('2025-12');
  });

  it('goes back multiple times correctly', () => {
    let s = { selectedMonth: '2026-03' };
    s = budgetReducer(s, prevMonth());
    s = budgetReducer(s, prevMonth());
    s = budgetReducer(s, prevMonth());
    expect(s.selectedMonth).toBe('2025-12');
  });

  // ── nextMonth ─────────────────────────────────────────────────────────────

  it('advances one month within a year', () => {
    const s = budgetReducer({ selectedMonth: '2026-03' }, nextMonth());
    expect(s.selectedMonth).toBe('2026-04');
  });

  it('wraps from December to January of the next year', () => {
    const s = budgetReducer({ selectedMonth: '2025-12' }, nextMonth());
    expect(s.selectedMonth).toBe('2026-01');
  });

  it('prevMonth and nextMonth are inverses', () => {
    const initial = '2026-06';
    let s = { selectedMonth: initial };
    s = budgetReducer(s, nextMonth());
    s = budgetReducer(s, prevMonth());
    expect(s.selectedMonth).toBe(initial);
  });

  // ── syncToCurrentMonth ────────────────────────────────────────────────────

  it('advances a stale past month to the current month', () => {
    const now = new Date();
    const current = monthOf(now.getFullYear(), now.getMonth() + 1);
    // Start on a month in the past
    const s = budgetReducer({ selectedMonth: '2024-01' }, syncToCurrentMonth());
    expect(s.selectedMonth).toBe(current);
  });

  it('does NOT advance a future month (user browsing ahead)', () => {
    const future = '2099-12';
    const s = budgetReducer({ selectedMonth: future }, syncToCurrentMonth());
    expect(s.selectedMonth).toBe(future);
  });

  it('is a no-op when already on the current month', () => {
    const now = new Date();
    const current = monthOf(now.getFullYear(), now.getMonth() + 1);
    const s = budgetReducer({ selectedMonth: current }, syncToCurrentMonth());
    expect(s.selectedMonth).toBe(current);
  });
});
