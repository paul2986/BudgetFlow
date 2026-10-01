import { describe, expect, it, vi } from 'vitest';
import { makeBudget, makeExpense, descriptions } from '../helpers/fixtures';

// The real client needs env vars; merging never touches it.
vi.mock('../../utils/supabase', () => ({ supabase: {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const { mergeBudget, stableStringify, toServerBudget } = await import('../../utils/budgetSync');

describe('mergeBudget', () => {
  it('keeps additions made on both sides', () => {
    const base = makeBudget();
    const local = { ...base, expenses: [makeExpense({ id: 'a', description: 'Rent' })] };
    const remote = { ...base, expenses: [makeExpense({ id: 'b', description: 'Gas' })] };
    expect(descriptions(mergeBudget(local, remote))).toEqual(['Gas', 'Rent']);
    expect(descriptions(mergeBudget(remote, local))).toEqual(['Gas', 'Rent']);
  });

  it('keeps the most recent edit of the same expense', () => {
    const base = makeBudget();
    const local = { ...base, expenses: [makeExpense({ id: 'a', description: 'Old', updatedAt: 100 })] };
    const remote = { ...base, expenses: [makeExpense({ id: 'a', description: 'New', updatedAt: 200 })] };
    expect(descriptions(mergeBudget(local, remote))).toEqual(['New']);
    expect(descriptions(mergeBudget(remote, local))).toEqual(['New']);
  });

  it('lets a deletion remove an older copy, but an edit after the deletion wins', () => {
    const now = Date.now();
    const base = makeBudget();
    const deleted = { ...base, expenses: [], deletions: { a: now - 1000 } };
    const stale = { ...base, expenses: [makeExpense({ id: 'a', updatedAt: now - 5000 })] };
    expect(mergeBudget(stale, deleted).expenses).toEqual([]);

    const editedLater = { ...base, expenses: [makeExpense({ id: 'a', updatedAt: now })] };
    expect(mergeBudget(editedLater, deleted).expenses.map((e) => e.id)).toEqual(['a']);
  });

  it('ignores deletion records older than 90 days', () => {
    const now = Date.now();
    const base = makeBudget();
    const ancient = now - 91 * 24 * 60 * 60 * 1000;
    const merged = mergeBudget(
      { ...base, expenses: [makeExpense({ id: 'a', updatedAt: ancient - 1 })] },
      { ...base, deletions: { a: ancient } }
    );
    expect(merged.deletions).toEqual({});
    expect(merged.expenses).toHaveLength(1);
  });

  it('takes name and settings from the more recently edited copy', () => {
    const base = makeBudget();
    const local = { ...base, name: 'Ours', modifiedAt: 100 };
    const remote = { ...base, name: 'Theirs', modifiedAt: 200, householdSettings: { distributionMethod: 'income-based' as const } };
    const merged = mergeBudget(local, remote);
    expect(merged.name).toBe('Theirs');
    expect(merged.householdSettings.distributionMethod).toBe('income-based');
    expect(merged.modifiedAt).toBe(200);
  });

  it('unions custom categories and honours category deletions', () => {
    const now = Date.now();
    const base = makeBudget();
    const local = { ...base, customCategories: [{ name: 'Pets', updatedAt: now - 5000 }] };
    const remote = {
      ...base,
      customCategories: [{ name: 'Gifts', updatedAt: now }],
      deletedCategories: { Pets: now - 1000 },
    };
    const merged = mergeBudget(local, remote);
    expect(merged.customCategories?.map((c) => c.name)).toEqual(['Gifts']);
    expect(merged.deletedCategories?.Pets).toBe(now - 1000);

    // Re-added after the deletion: it comes back.
    const readded = { ...base, customCategories: [{ name: 'Pets', updatedAt: now }] };
    expect(mergeBudget(readded, remote).customCategories?.map((c) => c.name)).toEqual(['Gifts', 'Pets']);
  });

  it('always keeps this device’s lock', () => {
    const base = makeBudget();
    const local = { ...base, lock: { locked: true, autoLockMinutes: 5 }, modifiedAt: 1 };
    const remote = { ...base, lock: { locked: false, autoLockMinutes: 0 }, modifiedAt: 999 };
    expect(mergeBudget(local, remote).lock).toEqual({ locked: true, autoLockMinutes: 5 });
  });

  it('is idempotent', () => {
    const now = Date.now();
    const a = makeBudget({
      expenses: [makeExpense({ id: 'x', updatedAt: now })],
      customCategories: [{ name: 'Pets', updatedAt: now }],
      deletions: { gone: now },
    });
    const once = mergeBudget(a, a);
    expect(stableStringify(mergeBudget(once, a))).toBe(stableStringify(once));
  });
});

describe('server copy', () => {
  it('leaves the device lock out', () => {
    const budget = makeBudget({ lock: { locked: true, autoLockMinutes: 1 } });
    expect('lock' in toServerBudget(budget)).toBe(false);
  });

  it('compares content regardless of key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
