import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../helpers/memoryStorage';
import { makeBudget, makeExpense } from '../helpers/fixtures';
import type { AppDataV2 } from '../../types/budget';

const device = createMemoryStorage();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: device }));

const storage = await import('../../utils/storage');

// Start each test from what's on "disk", not the module's in-memory cache.
const seed = (data: unknown, extra: Record<string, string> = {}) => {
  device.store.clear();
  device.store.set('app_data_v2', JSON.stringify(data));
  for (const [k, v] of Object.entries(extra)) device.store.set(k, v);
  storage.resetAppDataCache();
};

const app = (budgets: AppDataV2['budgets'], activeBudgetId = budgets[0]?.id || ''): AppDataV2 => ({
  version: 2,
  budgets,
  activeBudgetId,
});

beforeEach(() => {
  device.store.clear();
  storage.resetAppDataCache();
});

describe('custom categories', () => {
  it('folds the old device-only list into every budget and drops the old key', async () => {
    const a = makeBudget({ name: 'A' });
    const b = makeBudget({ name: 'B' });
    seed(app([a, b]), { custom_expense_categories_v1: JSON.stringify(['pets', 'Gifts', 'Groceries']) });

    const data = await storage.loadAppData();
    expect(data.budgets.map((x) => x.customCategories?.map((c) => c.name))).toEqual([
      ['Gifts', 'Pets'],
      ['Gifts', 'Pets'],
    ]);
    expect(device.store.has('custom_expense_categories_v1')).toBe(false);
  });

  it('hands an account-wide list (the #33 format) to every budget', async () => {
    const now = Date.now();
    seed({ ...app([makeBudget(), makeBudget()]), customCategories: [{ name: 'Pets', updatedAt: now }] });
    const data = await storage.loadAppData();
    expect(data.budgets.every((x) => x.customCategories?.[0]?.name === 'Pets')).toBe(true);
    expect('customCategories' in data).toBe(false);
  });

  it('changes only the active budget and records removals', async () => {
    const active = makeBudget({ customCategories: [{ name: 'Pets', updatedAt: 1 }] });
    const other = makeBudget({ customCategories: [{ name: 'Pets', updatedAt: 1 }] });
    seed(app([active, other], active.id));

    await storage.saveCustomExpenseCategories(['Gifts']);
    const data = await storage.loadAppData();
    const [a, o] = data.budgets;
    expect(a.customCategories?.map((c) => c.name)).toEqual(['Gifts']);
    expect(typeof a.deletedCategories?.Pets).toBe('number');
    expect(o.customCategories?.map((c) => c.name)).toEqual(['Pets']);
    expect(await storage.getCustomExpenseCategories()).toEqual(['Gifts']);
  });

  it('renames, retagging the active budget’s expenses with a fresh timestamp', async () => {
    const active = makeBudget({
      customCategories: [{ name: 'Pets', updatedAt: 1 }],
      expenses: [makeExpense({ id: 'e1', categoryTag: 'Pets', updatedAt: 1 }), makeExpense({ id: 'e2', categoryTag: 'Rent', updatedAt: 1 })],
    });
    const other = makeBudget({ expenses: [makeExpense({ id: 'e3', categoryTag: 'Pets', updatedAt: 1 })] });
    seed(app([active, other], active.id));

    const result = await storage.renameCustomExpenseCategory('Pets', 'Animals');
    expect(result.success).toBe(true);
    const [a, o] = (await storage.loadAppData()).budgets;
    const e1 = a.expenses.find((e) => e.id === 'e1')!;
    expect(e1.categoryTag).toBe('Animals');
    expect(e1.updatedAt).toBeGreaterThan(1);
    expect(a.expenses.find((e) => e.id === 'e2')!.updatedAt).toBe(1);
    expect(a.customCategories?.map((c) => c.name)).toEqual(['Animals']);
    expect(typeof a.deletedCategories?.Pets).toBe('number');
    expect(o.expenses[0].categoryTag).toBe('Pets');
  });

  it('gives a new budget the current budget’s categories', async () => {
    seed(app([makeBudget({ customCategories: [{ name: 'Pets', updatedAt: 1 }] })]));
    const { budget } = await storage.addBudget('Holiday');
    expect(budget?.customCategories?.map((c) => c.name)).toEqual(['Pets']);
  });
});

describe('removing budgets', () => {
  it('queues a deleted budget for removal on the server', async () => {
    const a = makeBudget();
    const b = makeBudget();
    seed(app([a, b], b.id));
    await storage.deleteBudget(a.id);
    const data = await storage.loadAppData();
    expect(data.budgets.map((x) => x.id)).toEqual([b.id]);
    expect(typeof data.deletedBudgets?.[a.id]).toBe('number');
  });

  it('refuses to delete the last budget, except when leaving a shared one', async () => {
    const only = makeBudget();
    seed(app([only]));
    expect((await storage.deleteBudget(only.id)).success).toBe(false);
    expect((await storage.deleteBudget(only.id, true)).success).toBe(true);
    expect((await storage.loadAppData()).budgets).toEqual([]);
  });

  it('erase all queues every budget for removal', async () => {
    const a = makeBudget();
    const b = makeBudget();
    seed(app([a, b]));
    await storage.clearAllAppData();
    const data = await storage.loadAppData();
    expect(data.budgets).toEqual([]);
    expect(Object.keys(data.deletedBudgets || {}).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('budget lock', () => {
  it('stays on the device without counting as an edit to the budget', async () => {
    const budget = makeBudget({ modifiedAt: 123 });
    seed(app([budget]));
    await storage.setBudgetLock(budget.id, { locked: true, autoLockMinutes: 5 });
    const [saved] = (await storage.loadAppData()).budgets;
    expect(saved.lock?.locked).toBe(true);
    expect(saved.modifiedAt).toBe(123);
  });
});
