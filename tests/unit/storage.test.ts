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

describe('category buckets', () => {
  const now = Date.now();

  it('cleans up what it loads: normalises names, drops bad entries and old resets, omits an empty field', async () => {
    seed(
      app([
        makeBudget({
          categoryBuckets: {
            'eating  out': { bucket: 'savings', updatedAt: now },
            Pets: { bucket: 'sideways', updatedAt: now },
            Gifts: 'needs',
            Old: { bucket: null, updatedAt: 1 },
            Fresh: { bucket: null, updatedAt: now },
            '  ': { bucket: 'needs', updatedAt: now },
          } as any,
        }),
        makeBudget({ categoryBuckets: { Old: { bucket: null, updatedAt: 1 } } }),
      ])
    );
    const [a, b] = (await storage.loadAppData()).budgets;
    expect(a.categoryBuckets).toEqual({
      'Eating Out': { bucket: 'savings', updatedAt: now },
      Fresh: { bucket: null, updatedAt: now },
    });
    expect('categoryBuckets' in b).toBe(false);
  });

  it('keeps the latest of two entries that normalise to one name', () => {
    expect(
      storage.sanitizeCategoryBuckets({ pets: { bucket: 'needs', updatedAt: 1 }, PETS: { bucket: 'wants', updatedAt: 2 } })
    ).toEqual({ Pets: { bucket: 'wants', updatedAt: 2 } });
  });

  it('records a choice on the active budget only, bumping its modified time', async () => {
    const active = makeBudget({ modifiedAt: 1 });
    const other = makeBudget({ modifiedAt: 1 });
    seed(app([active, other], active.id));
    expect((await storage.setCategoryBucket('childcare', 'needs')).success).toBe(true);
    const [a, o] = (await storage.loadAppData()).budgets;
    expect(a.categoryBuckets?.Childcare?.bucket).toBe('needs');
    expect(a.modifiedAt).toBeGreaterThan(1);
    expect(o.categoryBuckets).toBeUndefined();
    expect(o.modifiedAt).toBe(1);
  });

  it('writes nothing when the choice would change nothing', async () => {
    const active = makeBudget({ modifiedAt: 1, categoryBuckets: { Loan: { bucket: 'savings', updatedAt: 1 } } });
    seed(app([active]));
    await storage.setCategoryBucket('Loan', 'savings'); // already so
    await storage.setCategoryBucket('Rent', null); // never changed
    const [a] = (await storage.loadAppData()).budgets;
    expect(a.modifiedAt).toBe(1);
    expect(a.categoryBuckets).toEqual({ Loan: { bucket: 'savings', updatedAt: 1 } });
  });

  it('remembers a reset, so an older choice elsewhere cannot bring it back', async () => {
    seed(app([makeBudget({ categoryBuckets: { Loan: { bucket: 'savings', updatedAt: 1 } } })]));
    await storage.setCategoryBucket('Loan', null);
    const [a] = (await storage.loadAppData()).budgets;
    expect(a.categoryBuckets?.Loan?.bucket).toBeNull();
    expect(a.categoryBuckets?.Loan?.updatedAt).toBeGreaterThan(1);
  });

  it('follows a renamed category and resets the old name', async () => {
    const active = makeBudget({
      customCategories: [{ name: 'Pets', updatedAt: 1 }],
      categoryBuckets: { Pets: { bucket: 'needs', updatedAt: 1 } },
      expenses: [makeExpense({ id: 'e1', categoryTag: 'Pets', updatedAt: 1 })],
    });
    seed(app([active]));
    expect((await storage.renameCustomExpenseCategory('Pets', 'Animals')).success).toBe(true);
    const [a] = (await storage.loadAppData()).budgets;
    expect(a.categoryBuckets?.Animals?.bucket).toBe('needs');
    expect(a.categoryBuckets?.Pets?.bucket).toBeNull();
  });

  it('renaming a category with no choice adds none', async () => {
    seed(app([makeBudget({ customCategories: [{ name: 'Pets', updatedAt: 1 }] })]));
    await storage.renameCustomExpenseCategory('Pets', 'Animals');
    const [a] = (await storage.loadAppData()).budgets;
    expect(a.categoryBuckets).toBeUndefined();
  });

  it('forgets the choice of a deleted custom category', async () => {
    const active = makeBudget({
      customCategories: [{ name: 'Pets', updatedAt: 1 }],
      categoryBuckets: { Pets: { bucket: 'needs', updatedAt: 1 }, Loan: { bucket: 'savings', updatedAt: 1 } },
    });
    seed(app([active]));
    await storage.saveCustomExpenseCategories([]);
    const [a] = (await storage.loadAppData()).budgets;
    expect(a.categoryBuckets?.Pets?.bucket).toBeNull();
    expect(a.categoryBuckets?.Loan?.bucket).toBe('savings');
  });

  it('gives a new budget the current budget’s choices', async () => {
    seed(app([makeBudget({ categoryBuckets: { Loan: { bucket: 'savings', updatedAt: 1 } } })]));
    const { budget } = await storage.addBudget('Holiday');
    expect(budget?.categoryBuckets).toEqual({ Loan: { bucket: 'savings', updatedAt: 1 } });
  });

  it('carries the choices into a duplicate', async () => {
    const original = makeBudget({ categoryBuckets: { Loan: { bucket: 'savings', updatedAt: 1 } } });
    seed(app([original]));
    const { budget } = await storage.duplicateBudget(original.id);
    expect(budget?.categoryBuckets).toEqual({ Loan: { bucket: 'savings', updatedAt: 1 } });
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

describe('which account owns the device’s data', () => {
  it('wipes another account’s data when a different account signs in', async () => {
    seed(app([makeBudget()]), { device_owner_v1: 'alice', synced_budget_ids_v1: '["x"]' });
    await storage.claimDeviceData('bob');
    expect((await storage.loadAppData()).budgets).toEqual([]);
    expect(await storage.loadSyncedBudgetIds()).toEqual([]);
    expect(await storage.getDeviceOwner()).toBe('bob');
  });

  it('keeps the data when the same account signs back in', async () => {
    seed(app([makeBudget()]), { device_owner_v1: 'alice' });
    await storage.claimDeviceData('alice');
    expect((await storage.loadAppData()).budgets).toHaveLength(1);
  });

  it('when signed out, clears data with no recorded owner and keeps owned data', async () => {
    seed(app([makeBudget()]));
    await storage.clearUnownedDeviceData();
    expect((await storage.loadAppData()).budgets).toEqual([]);

    seed(app([makeBudget()]), { device_owner_v1: 'alice' });
    await storage.clearUnownedDeviceData();
    expect((await storage.loadAppData()).budgets).toHaveLength(1);
  });

  it('signing out forgets the owner along with the data', async () => {
    seed(app([makeBudget()]), { device_owner_v1: 'alice' });
    await storage.clearLocalAppData();
    expect(await storage.getDeviceOwner()).toBeNull();
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

describe('expenses sort preference', () => {
  beforeEach(() => device.store.clear());

  it('defaults to newest first', async () => {
    expect(await storage.getExpensesSort()).toEqual({ by: 'date', order: 'desc' });
  });

  it('round-trips a saved sort and ignores junk', async () => {
    await storage.saveExpensesSort({ by: 'cost', order: 'desc' });
    expect(await storage.getExpensesSort()).toEqual({ by: 'cost', order: 'desc' });
    device.store.set('expenses_sort_v1', JSON.stringify({ by: 'nope', order: 'asc' }));
    expect(await storage.getExpensesSort()).toEqual({ by: 'date', order: 'desc' });
  });

  it("does not carry over to the next account on the device", async () => {
    await storage.claimDeviceData('user-a');
    await storage.saveExpensesSort({ by: 'cost', order: 'desc' });
    await storage.claimDeviceData('user-b');
    expect(await storage.getExpensesSort()).toEqual({ by: 'date', order: 'desc' });
  });
});

describe('importing a budget', () => {
  const draft = () => ({
    name: 'Imported',
    householdSettings: { distributionMethod: 'income-based' as const },
    people: [{ id: 'p1', name: 'Paul', income: [], updatedAt: 5 }],
    expenses: [makeExpense({ id: 'e1', categoryTag: 'Pets', description: 'Dog food' })],
    customCategories: ['Pets', 'Groceries', 'pets'],
  });

  it('adds it as a new budget, makes it active, and leaves the others alone', async () => {
    const existing = makeBudget({ name: 'Family', expenses: [makeExpense({ id: 'keep' })] });
    seed(app([existing]));

    const result = await storage.importBudget(draft());
    expect(result.success).toBe(true);

    const data = await storage.loadAppData();
    expect(data.budgets.map((b) => b.name)).toEqual(['Family', 'Imported']);
    expect(data.activeBudgetId).toBe(result.budget!.id);
    expect(data.budgets[0].expenses.map((e) => e.id)).toEqual(['keep']);

    const imported = data.budgets[1];
    expect(imported.id).not.toBe(existing.id);
    expect(imported.householdSettings.distributionMethod).toBe('income-based');
    expect(imported.people.map((p) => p.name)).toEqual(['Paul']);
    expect(imported.expenses.map((e) => e.description)).toEqual(['Dog food']);
    // Built-in names and repeats are dropped from the budget's own category list.
    expect(imported.customCategories?.map((c) => c.name)).toEqual(['Pets']);
    expect(imported.lock?.locked).toBe(false);
  });

  it('works on a device with no budgets yet', async () => {
    seed(app([]));
    const result = await storage.importBudget(draft());
    expect(result.success).toBe(true);
    const data = await storage.loadAppData();
    expect(data.budgets).toHaveLength(1);
    expect(data.activeBudgetId).toBe(data.budgets[0].id);
  });
});
