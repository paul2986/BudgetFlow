import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../helpers/memoryStorage';
import { makeBudget, makeExpense } from '../helpers/fixtures';
import type { AppDataV2 } from '../../types/budget';

const device = createMemoryStorage();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: device }));

const storage = await import('../../utils/storage');
const { NO_FILTERS } = await import('../../utils/expenseFilters');

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

describe('an expense’s own bucket', () => {
  it('survives a load, and a value that isn’t a bucket is dropped', async () => {
    seed(
      app([
        makeBudget({
          expenses: [
            makeExpense({ id: 'a', categoryTag: 'Loan', bucket: 'wants' }),
            makeExpense({ id: 'b', categoryTag: 'Loan', bucket: 'sideways' as any }),
            makeExpense({ id: 'c', categoryTag: 'Loan', bucket: 3 as any }),
            makeExpense({ id: 'd', categoryTag: 'Loan' }),
          ],
        }),
      ])
    );
    const [budget] = (await storage.loadAppData()).budgets;
    const byId = Object.fromEntries(budget.expenses.map((e) => [e.id, e]));
    expect(byId.a.bucket).toBe('wants');
    for (const id of ['b', 'c', 'd']) expect('bucket' in byId[id]).toBe(false);
  });

  it('is copied into a duplicate of the budget', async () => {
    const source = makeBudget({ expenses: [makeExpense({ id: 'a', categoryTag: 'Loan', bucket: 'wants' })] });
    seed(app([source]));
    const res = await storage.duplicateBudget(source.id, 'Copy');
    expect(res.budget?.expenses[0].bucket).toBe('wants');
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

  it('keeps the code’s hash, the time and Face ID across a reload, and drops anything else', async () => {
    const budget = makeBudget({ lock: { locked: true, autoLockMinutes: -1, pinVerifier: 'v1$5000$aa$bb', biometrics: true, lastUnlockAt: '2026-10-06T09:00:00Z' } });
    seed(app([{ ...budget, lock: { ...budget.lock!, pin: '1234' } as any }]));
    const [loaded] = (await storage.loadAppData()).budgets;
    expect(loaded.lock).toEqual({
      locked: true,
      autoLockMinutes: -1,
      pinVerifier: 'v1$5000$aa$bb',
      biometrics: true,
      lastUnlockAt: '2026-10-06T09:00:00Z',
    });
    expect(JSON.stringify(loaded)).not.toContain('1234');
  });

  it('does not take Face ID or a code from junk', async () => {
    seed(app([makeBudget({ lock: { locked: true, autoLockMinutes: 5, pinVerifier: 42 as any, biometrics: 'yes' as any } })]));
    const [loaded] = (await storage.loadAppData()).budgets;
    expect(loaded.lock?.pinVerifier).toBeUndefined();
    expect(loaded.lock?.biometrics).toBeUndefined();
  });

  it('does not copy a lock into a duplicate or an import', async () => {
    const budget = makeBudget({ lock: { locked: true, autoLockMinutes: 5, pinVerifier: 'v1$5000$aa$bb', biometrics: true } });
    seed(app([budget]));
    const copy = await storage.duplicateBudget(budget.id, 'Copy');
    expect(copy.success).toBe(true);
    const copies = (await storage.loadAppData()).budgets.filter((b) => b.id !== budget.id);
    expect(copies).toHaveLength(1);
    expect(copies[0].lock).toEqual({ locked: false, autoLockMinutes: 0 });
  });

  it('remembers wrong codes per budget, so quitting the app does not clear the wait', async () => {
    expect(await storage.getLockAttempts('a')).toEqual({ failures: 0, blockedUntil: 0 });
    await storage.saveLockAttempts('a', { failures: 5, blockedUntil: 99 });
    await storage.saveLockAttempts('b', { failures: 1, blockedUntil: 0 });
    expect(await storage.getLockAttempts('a')).toEqual({ failures: 5, blockedUntil: 99 });
    await storage.saveLockAttempts('a', { failures: 0, blockedUntil: 0 });
    expect(await storage.getLockAttempts('a')).toEqual({ failures: 0, blockedUntil: 0 });
    expect(await storage.getLockAttempts('b')).toEqual({ failures: 1, blockedUntil: 0 });
  });

  it('reads damaged attempt counts as none', async () => {
    device.store.set('lock_attempts_v1', '{"a":{"failures":"lots"}}');
    expect(await storage.getLockAttempts('a')).toEqual({ failures: 0, blockedUntil: 0 });
    device.store.set('lock_attempts_v1', 'not json');
    expect(await storage.getLockAttempts('a')).toEqual({ failures: 0, blockedUntil: 0 });
  });

  it('is left behind on sign-out: wrong codes forgotten, nothing stays unlocked', async () => {
    const { unlockSession } = await import('../../utils/budgetLock');
    seed(app([makeBudget({ id: 'b1' })]));
    await storage.saveLockAttempts('b1', { failures: 5, blockedUntil: 99 });
    unlockSession.unlock('b1', 'p');
    await storage.clearLocalAppData();
    expect(await storage.getLockAttempts('b1')).toEqual({ failures: 0, blockedUntil: 0 });
    expect(unlockSession.isUnlocked('b1', 5, 'p')).toBe(false);
  });
});

describe('budget order', () => {
  it('sorts oldest first, and equal dates keep the order they arrived in', () => {
    const [a, b, c, d] = [
      makeBudget({ name: 'a', createdAt: 300 }),
      makeBudget({ name: 'b', createdAt: 100 }),
      makeBudget({ name: 'c', createdAt: 200 }),
      makeBudget({ name: 'd', createdAt: 200 }),
    ];
    expect(storage.sortBudgetsByCreated([a, b, c, d]).map((x) => x.name)).toEqual(['b', 'c', 'd', 'a']);
    expect(storage.sortBudgetsByCreated([d, c]).map((x) => x.name)).toEqual(['d', 'c']);
  });

  it('puts a device copy in created order when it loads, and falls back to the oldest', async () => {
    const newest = makeBudget({ name: 'Newest', createdAt: 300 });
    const oldest = makeBudget({ name: 'Oldest', createdAt: 100 });
    const middle = makeBudget({ name: 'Middle', createdAt: 200 });
    seed({ version: 2, budgets: [newest, oldest, middle], activeBudgetId: 'gone' });
    const data = await storage.loadAppData();
    expect(data.budgets.map((x) => x.name)).toEqual(['Oldest', 'Middle', 'Newest']);
    expect(data.activeBudgetId).toBe(oldest.id);
  });

  it('keeps the chosen budget when it is not the oldest', async () => {
    const oldest = makeBudget({ createdAt: 100 });
    const newest = makeBudget({ createdAt: 300 });
    seed(app([newest, oldest], newest.id));
    expect((await storage.loadAppData()).activeBudgetId).toBe(newest.id);
  });

  it('files a new budget after the existing ones', async () => {
    const old = makeBudget({ createdAt: 100 });
    seed(app([old]));
    const res = await storage.addBudget('Newer');
    const data = await storage.loadAppData();
    expect(data.budgets.map((x) => x.id)).toEqual([old.id, res.budget!.id]);
  });
});

describe('the budget last open', () => {
  beforeEach(() => device.store.clear());

  it('is kept per account', async () => {
    await storage.rememberActiveBudget('alice', 'b1');
    await storage.rememberActiveBudget('bob', 'b2');
    expect(await storage.loadRememberedBudget('alice')).toBe('b1');
    expect(await storage.loadRememberedBudget('bob')).toBe('b2');
    expect(await storage.loadRememberedBudget('carol')).toBeNull();
  });

  it('survives signing out, which clears the budgets themselves', async () => {
    seed(app([makeBudget({ id: 'b1' })]), { device_owner_v1: 'alice' });
    await storage.rememberActiveBudget('alice', 'b1');
    await storage.clearLocalAppData();
    expect(await storage.loadRememberedBudget('alice')).toBe('b1');
    expect((await storage.loadAppData()).budgets).toEqual([]);
  });

  it('is not rewritten when it has not changed', async () => {
    await storage.rememberActiveBudget('alice', 'b1');
    const writes: string[] = [];
    const setItem = device.setItem;
    device.setItem = async (key: string, value: string) => {
      writes.push(key);
      return setItem(key, value);
    };
    await storage.rememberActiveBudget('alice', 'b1');
    device.setItem = setItem;
    expect(writes).toEqual([]);
  });

  it('is dropped with a deleted account, leaving others alone', async () => {
    await storage.rememberActiveBudget('alice', 'b1');
    await storage.rememberActiveBudget('bob', 'b2');
    await storage.forgetRememberedBudget('alice');
    expect(await storage.loadRememberedBudget('alice')).toBeNull();
    expect(await storage.loadRememberedBudget('bob')).toBe('b2');
  });

  it('reads damaged data as nothing remembered', async () => {
    device.store.set('last_active_budgets_v1', '{not json');
    expect(await storage.loadRememberedBudget('alice')).toBeNull();
    device.store.set('last_active_budgets_v1', JSON.stringify(['b1']));
    expect(await storage.loadRememberedBudget('alice')).toBeNull();
    device.store.set('last_active_budgets_v1', JSON.stringify({ alice: 7, bob: 'b2' }));
    expect(await storage.loadRememberedBudget('alice')).toBeNull();
    expect(await storage.loadRememberedBudget('bob')).toBe('b2');
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

describe('expenses filters', () => {
  beforeEach(() => device.store.clear());

  it('starts with nothing filtered', async () => {
    expect(await storage.getExpensesFilters('b1')).toEqual(NO_FILTERS);
  });

  it('remembers a bucket filter, and ignores junk', async () => {
    await storage.saveExpensesFilters('b1', { ...NO_FILTERS, bucket: 'wants' });
    expect((await storage.getExpensesFilters('b1')).bucket).toBe('wants');

    await storage.saveExpensesFilters('b1', { ...NO_FILTERS, bucket: 'sideways' as any });
    expect((await storage.getExpensesFilters('b1')).bucket).toBe('all');

    device.store.set('expenses_filters_v2', JSON.stringify({ b1: { bucketFilter: 7 } }));
    expect((await storage.getExpensesFilters('b1')).bucket).toBe('all');
  });

  it('remembers every selected category, not just the first', async () => {
    await storage.saveExpensesFilters('b1', { ...NO_FILTERS, categories: ['Loan', 'groceries'], personId: 'p1', type: 'personal' });
    expect(await storage.getExpensesFilters('b1')).toEqual({ ...NO_FILTERS, categories: ['Loan', 'Groceries'], personId: 'p1', type: 'personal' });
  });

  it('keeps each budget\'s filters to itself', async () => {
    await storage.saveExpensesFilters('b1', { ...NO_FILTERS, categories: ['Loan'], personId: 'p1' });
    await storage.saveExpensesFilters('b2', { ...NO_FILTERS, type: 'household' });

    expect(await storage.getExpensesFilters('b1')).toEqual({ ...NO_FILTERS, categories: ['Loan'], personId: 'p1' });
    expect(await storage.getExpensesFilters('b2')).toEqual({ ...NO_FILTERS, type: 'household' });
    expect(await storage.getExpensesFilters('b3')).toEqual(NO_FILTERS);

    // Clearing one budget's filters leaves the other's.
    await storage.saveExpensesFilters('b1', NO_FILTERS);
    expect(await storage.getExpensesFilters('b1')).toEqual(NO_FILTERS);
    expect(await storage.getExpensesFilters('b2')).toEqual({ ...NO_FILTERS, type: 'household' });
  });

  it('drops the retired device-wide filters instead of applying them to every budget', async () => {
    device.store.set('expenses_filters_v1', JSON.stringify({ category: 'Loan', debtFilter: 'any' }));
    expect(await storage.getExpensesFilters('b1')).toEqual(NO_FILTERS);

    await storage.saveExpensesFilters('b1', { ...NO_FILTERS, type: 'personal' });
    expect(device.store.has('expenses_filters_v1')).toBe(false);
  });

  it('reads damaged filters as none', async () => {
    device.store.set('expenses_filters_v2', 'not json');
    expect(await storage.getExpensesFilters('b1')).toEqual(NO_FILTERS);
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
