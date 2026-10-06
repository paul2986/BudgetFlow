import { describe, expect, it } from 'vitest';
import { admin, createInvite, createUser, members, serverBudget, TestUser } from '../helpers/localSupabase';
import { createDevice, Device } from '../helpers/device';
import { descriptions, makeBudget, makeExpense } from '../helpers/fixtures';
import type { Budget } from '../../types/budget';

// Budgets syncing between devices and people (utils/budgetSync.ts), against a
// local Supabase. Each test sets up its own users and budgets.

const find = (data: { budgets: Budget[] }, id: string) => data.budgets.find((b) => b.id === id);

const addExpense = (device: Device, budgetId: string, description: string) =>
  device.edit(budgetId, (b) => {
    b.expenses.push(makeExpense({ description, updatedAt: Date.now() }));
  });

// Alice with a budget on her phone, synced.
const aliceWithBudget = async (overrides: Partial<Budget> = {}) => {
  const alice = await createUser('alice');
  const phone = await createDevice(alice);
  const budget = makeBudget(overrides);
  await phone.storage.saveAppData({ version: 2, budgets: [budget], activeBudgetId: budget.id });
  await phone.sync();
  return { alice, phone, budget };
};

const joinWithDevice = async (owner: TestUser, budgetId: string, label = 'bob') => {
  const user = await createUser(label);
  const { error } = await user.client.rpc('accept_budget_invite', { p_token: await createInvite(owner, budgetId) });
  if (error) throw error;
  const device = await createDevice(user);
  await device.sync();
  return { user, device };
};

describe('one person', () => {
  it('uploads a new budget, owned by them, without its lock (the account’s lock is kept apart)', async () => {
    const { phone, budget } = await aliceWithBudget({ lock: { locked: true, autoLockMinutes: 5, pinVerifier: 'v1$1$ab$cd' } });
    const row = await serverBudget(budget.id);
    expect(row?.data.name).toBe('Family');
    expect(row?.data).not.toHaveProperty('lock');
    expect(phone.sharing[budget.id]).toEqual({ role: 'owner', memberCount: 1 });
  });

  it('leaves the device copy alone when a pass finds nothing new', async () => {
    const { phone, budget } = await aliceWithBudget();
    const writes: string[] = [];
    const setItem = phone.disk.setItem;
    phone.disk.setItem = async (key: string, value: string) => {
      writes.push(key);
      return setItem(key, value);
    };
    // Every screen change used to rewrite every budget, validated twice and read back.
    await phone.sync();
    await phone.sync();
    expect(writes).toEqual([]);
    expect(find(await phone.load(), budget.id)?.name).toBe('Family');
  });

  it('gets everything on a new device', async () => {
    const { alice, budget } = await aliceWithBudget();
    const laptop = await createDevice(alice);
    const data = await laptop.sync();
    expect(find(data, budget.id)?.name).toBe('Family');
    expect(find(data, budget.id)?.lock?.locked).toBe(false);
  });

  it('a stale device cannot bring back a deleted budget', async () => {
    const { alice, phone, budget } = await aliceWithBudget();
    const laptop = await createDevice(alice);
    await laptop.sync();
    const keep = makeBudget({ name: 'Keep' });
    await phone.storage.saveAppData({ ...(await phone.load()), budgets: [...(await phone.load()).budgets, keep], activeBudgetId: keep.id });
    await phone.sync();
    await phone.storage.deleteBudget(budget.id);
    await phone.sync();
    expect(await serverBudget(budget.id)).toBeNull();
    expect(find(await laptop.sync(), budget.id)).toBeUndefined();
    expect(find(await phone.sync(), budget.id)).toBeUndefined();
  });

  it('keeps a save made while a sync is in flight', async () => {
    const { phone, budget } = await aliceWithBudget();
    const syncing = phone.sync();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await addExpense(phone, budget.id, 'Saved mid-sync');
    await syncing;
    expect(descriptions(find(await phone.load(), budget.id))).toEqual(['Saved mid-sync']);
    await phone.sync();
    expect(descriptions((await serverBudget(budget.id))?.data)).toEqual(['Saved mid-sync']);
  });

  it('erase all deletes unshared budgets and leaves shared ones with the others', async () => {
    const { alice, phone, budget: shared } = await aliceWithBudget({ name: 'Shared' });
    const solo = makeBudget({ name: 'Solo' });
    const data = await phone.load();
    await phone.storage.saveAppData({ ...data, budgets: [...data.budgets, solo] });
    await phone.sync();
    const { user: bob } = await joinWithDevice(alice, shared.id);

    await phone.storage.clearAllAppData();
    expect((await phone.sync()).budgets).toEqual([]);
    expect(await serverBudget(solo.id)).toBeNull();
    expect(await members(shared.id)).toEqual([{ user_id: bob.id, role: 'owner' }]);
  });
});

describe('switching accounts on a device', () => {
  it('another account signing in never uploads the previous account’s budgets', async () => {
    const { phone, budget } = await aliceWithBudget();
    // Alice's session ends elsewhere (signing out ends every device's session),
    // leaving her budgets on this phone; then Bob signs in on it. Drop the
    // synced-ids list too, as on a device last used with the pre-sharing app.
    phone.disk.store.delete('synced_budget_ids_v1');
    const bob = await createUser('bob');
    const bobOnAlicesPhone = await createDevice(bob, phone.disk);
    expect((await bobOnAlicesPhone.sync()).budgets).toEqual([]);
    const { data: owned } = await admin.from('budget_members').select('budget_id').eq('user_id', bob.id);
    expect(owned).toEqual([]);
    expect(await members(budget.id)).toHaveLength(1);
  });

  it('a sync for an account the device data doesn’t belong to refuses to run', async () => {
    const { phone } = await aliceWithBudget();
    const bob = await createUser('bob');
    const result = await phone.syncAs(bob.id);
    expect(result.ok).toBe(false);
    const { data: owned } = await admin.from('budget_members').select('budget_id').eq('user_id', bob.id);
    expect(owned).toEqual([]);
  });
});

describe('signing out and back in', () => {
  // What useBudgetData does while a budget is open, and what signing out does to the device.
  const openBudget = async (device: Device, budgetId: string) => {
    const data = await device.load();
    await device.storage.saveAppData({ ...data, activeBudgetId: budgetId });
    await device.storage.rememberActiveBudget(device.user.id, budgetId);
  };
  const signOutAndBackIn = async (device: Device) => {
    await device.storage.clearLocalAppData();
    return createDevice(device.user, device.disk);
  };

  const aliceWithThree = async () => {
    const alice = await createUser('alice');
    const phone = await createDevice(alice);
    // Created in a different order from their dates, so the order is the dates' doing.
    const newest = makeBudget({ name: 'Newest', createdAt: 3000 });
    const oldest = makeBudget({ name: 'Oldest', createdAt: 1000 });
    const middle = makeBudget({ name: 'Middle', createdAt: 2000 });
    await phone.storage.saveAppData({ version: 2, budgets: [newest, oldest, middle], activeBudgetId: newest.id });
    await phone.sync();
    return { alice, phone, newest, oldest, middle };
  };

  it('returns to the budget that was open', async () => {
    const { phone, middle } = await aliceWithThree();
    await openBudget(phone, middle.id);
    const again = await signOutAndBackIn(phone);
    expect((await again.load()).budgets).toEqual([]);
    expect((await again.sync()).activeBudgetId).toBe(middle.id);
  });

  it('lists budgets oldest first, however they came back from the server', async () => {
    const { phone } = await aliceWithThree();
    const again = await signOutAndBackIn(phone);
    expect((await again.sync()).budgets.map((b) => b.name)).toEqual(['Oldest', 'Middle', 'Newest']);
  });

  it('opens the oldest when the account has never had one open here', async () => {
    const { alice, oldest } = await aliceWithThree();
    const newDevice = await createDevice(alice);
    expect((await newDevice.sync()).activeBudgetId).toBe(oldest.id);
  });

  it('opens the oldest when the remembered budget is gone', async () => {
    const { alice, phone, newest, oldest } = await aliceWithThree();
    await openBudget(phone, newest.id);
    const again = await signOutAndBackIn(phone);
    await alice.client.from('budgets').delete().eq('id', newest.id);
    expect((await again.sync()).activeBudgetId).toBe(oldest.id);
  });

  it('does not hand one account’s open budget to another on the same device', async () => {
    const { alice, phone, middle } = await aliceWithThree();
    await openBudget(phone, middle.id);
    // Bob is a member of the budget Alice had open, and has an older one of his own.
    const { device: bobPhone } = await joinWithDevice(alice, middle.id);
    const bobsOwn = makeBudget({ name: 'Bobs', createdAt: 500 });
    const bobData = await bobPhone.load();
    await bobPhone.storage.saveAppData({ ...bobData, budgets: [...bobData.budgets, bobsOwn] });
    await bobPhone.sync();

    await phone.storage.clearLocalAppData();
    const bobHere = await createDevice(bobPhone.user, phone.disk);
    const data = await bobHere.sync();
    expect(data.budgets.map((b) => b.name)).toEqual(['Bobs', 'Middle']);
    expect(data.activeBudgetId).toBe(bobsOwn.id);
    expect(await bobHere.storage.loadRememberedBudget(bobPhone.user.id)).toBeNull();
    expect(await bobHere.storage.loadRememberedBudget(alice.id)).toBe(middle.id);
  });

  it('keeps the budget chosen on a device that stayed signed in', async () => {
    const { phone, newest, oldest } = await aliceWithThree();
    await openBudget(phone, newest.id);
    await phone.sync();
    expect((await phone.load()).activeBudgetId).toBe(newest.id);
    await openBudget(phone, oldest.id);
    expect((await phone.sync()).activeBudgetId).toBe(oldest.id);
  });
});

describe('copies of budgets the user can’t open', () => {
  it('are dropped, never uploaded under a new id', async () => {
    // A budget that exists on the server but isn't this user's: its id is taken.
    const bob = await createUser('bob');
    const theirs = makeBudget({ name: 'Theirs' });
    await bob.client.rpc('create_budget', { p_id: theirs.id, p_data: theirs });

    const alice = await createUser('alice');
    const phone = await createDevice(alice);
    await phone.storage.saveAppData({ version: 2, budgets: [{ ...theirs, name: 'Copy' }], activeBudgetId: theirs.id });
    const [first, second] = await Promise.all([phone.syncNow(), phone.syncNow()]);
    expect(first.ok && second.ok).toBe(true);

    const { data: owned } = await admin.from('budget_members').select('budget_id').eq('user_id', alice.id);
    expect(owned).toEqual([]);
    expect((await phone.load()).budgets).toEqual([]);
    expect((await serverBudget(theirs.id))?.data.name).toBe('Theirs');
  });

  it('a new budget synced from two passes at once is created once', async () => {
    const alice = await createUser('alice');
    const phone = await createDevice(alice);
    const mine = makeBudget({ name: 'Mine' });
    await phone.storage.saveAppData({ version: 2, budgets: [mine], activeBudgetId: mine.id });
    await Promise.all([phone.syncNow(), phone.syncNow()]);
    const { data: owned } = await admin.from('budget_members').select('budget_id').eq('user_id', alice.id);
    expect(owned).toEqual([{ budget_id: mine.id }]);
    expect((await phone.load()).budgets.map((b) => b.name)).toEqual(['Mine']);
  });
});

describe('two tabs on one device', () => {
  it('a tab still holding another account’s budgets in memory doesn’t upload them', async () => {
    // As on the iPhone: tab B has the owner's budgets loaded. In tab A the
    // owner signs out and the other account signs in, clearing storage and
    // claiming it; tab B's memory still has the owner's budgets. Then the
    // other account's session starts in tab B too.
    const { alice, budget } = await aliceWithBudget();
    const bob = await createUser('bob');
    const tabB = await createDevice(bob, undefined, { claim: false });
    const aliceData = { version: 2 as const, budgets: [find(await (await createDevice(alice)).sync(), budget.id)!], activeBudgetId: budget.id };
    await tabB.storage.saveAppData(aliceData);
    tabB.disk.store.clear();
    tabB.disk.store.set('device_owner_v1', bob.id);

    await tabB.storage.claimDeviceData(bob.id);
    expect((await tabB.sync()).budgets).toEqual([]);
    const { data: owned } = await admin.from('budget_members').select('budget_id').eq('user_id', bob.id);
    expect(owned).toEqual([]);
    expect(await members(budget.id)).toEqual([{ user_id: alice.id, role: 'owner' }]);
  });
});

describe('two people', () => {
  it('an invited editor gets the budget and both see each other’s edits', async () => {
    const { alice, phone, budget } = await aliceWithBudget();
    await addExpense(phone, budget.id, 'Rent');
    await phone.sync();
    const { device: bob } = await joinWithDevice(alice, budget.id);
    expect(bob.sharing[budget.id]).toEqual({ role: 'editor', memberCount: 2 });
    expect(descriptions(find(await bob.load(), budget.id))).toEqual(['Rent']);

    await addExpense(bob, budget.id, 'Gas');
    await bob.sync();
    expect(descriptions(find(await phone.sync(), budget.id))).toEqual(['Gas', 'Rent']);
  });

  it('simultaneous edits both survive, even when the writes race', async () => {
    const { alice, phone, budget } = await aliceWithBudget();
    const { device: bob } = await joinWithDevice(alice, budget.id);
    await addExpense(phone, budget.id, 'Groceries');
    await addExpense(bob, budget.id, 'Gas');
    await Promise.all([phone.sync(), bob.sync()]);
    await Promise.all([phone.sync(), bob.sync()]);
    expect(descriptions(find(await phone.load(), budget.id))).toEqual(['Gas', 'Groceries']);
    expect(descriptions(find(await bob.load(), budget.id))).toEqual(['Gas', 'Groceries']);
    expect(descriptions((await serverBudget(budget.id))?.data)).toEqual(['Gas', 'Groceries']);
  });

  it('deleting an expense removes it for the other person', async () => {
    const { alice, phone, budget } = await aliceWithBudget({ expenses: [makeExpense({ id: 'gas', description: 'Gas' })] });
    const { device: bob } = await joinWithDevice(alice, budget.id);
    await bob.edit(budget.id, (b) => {
      b.expenses = b.expenses.filter((e) => e.id !== 'gas');
      b.deletions = { ...b.deletions, gas: Date.now() };
    });
    await bob.sync();
    expect(find(await phone.sync(), budget.id)?.expenses).toEqual([]);
  });

  it('custom categories travel with the budget', async () => {
    const { alice, phone, budget } = await aliceWithBudget();
    const { device: bob } = await joinWithDevice(alice, budget.id);
    await bob.storage.setActiveBudget(budget.id);
    await bob.storage.saveCustomExpenseCategories(['Pets']);
    await bob.sync();
    await phone.sync();
    await phone.storage.setActiveBudget(budget.id);
    expect(await phone.storage.getCustomExpenseCategories()).toEqual(['Pets']);
  });

  it('where categories count in the review travels with the budget; later choices win and resets stick', async () => {
    const { alice, phone, budget } = await aliceWithBudget();
    const { device: bob } = await joinWithDevice(alice, budget.id);
    await phone.storage.setActiveBudget(budget.id);
    await bob.storage.setActiveBudget(budget.id);
    const choices = async (device: Device) => (find(await device.load(), budget.id)?.categoryBuckets ?? {}) as Record<string, { bucket: string | null }>;

    // Different categories on each device, both kept.
    await phone.storage.setCategoryBucket('Childcare', 'needs');
    await bob.storage.setCategoryBucket('Loan', 'savings');
    await phone.sync();
    await bob.sync();
    await phone.sync();
    for (const device of [phone, bob]) {
      const seen = await choices(device);
      expect(seen.Childcare?.bucket).toBe('needs');
      expect(seen.Loan?.bucket).toBe('savings');
    }

    // The same category: the later choice wins on both.
    await bob.storage.setCategoryBucket('Childcare', 'wants');
    await bob.sync();
    await phone.sync();
    expect((await choices(phone)).Childcare?.bucket).toBe('wants');

    // A reset on one device reaches the other.
    await phone.storage.setCategoryBucket('Loan', null);
    await phone.sync();
    await bob.sync();
    expect((await choices(bob)).Loan?.bucket).toBeNull();
  });

  it('an outsider’s sync sees nothing', async () => {
    await aliceWithBudget();
    const eve = await createDevice(await createUser('eve'));
    expect((await eve.sync()).budgets).toEqual([]);
  });
});

describe('leaving and rejoining', () => {
  it('leaving removes it from all the leaver’s devices and keeps it for the owner', async () => {
    const { alice, phone, budget } = await aliceWithBudget();
    const { user: bob, device: bobPhone } = await joinWithDevice(alice, budget.id);
    const bobLaptop = await createDevice(bob);
    await bobLaptop.sync();

    await bobPhone.storage.deleteBudget(budget.id, true);
    await bobPhone.sync();
    expect(await members(budget.id)).toEqual([{ user_id: alice.id, role: 'owner' }]);
    expect(find(await bobPhone.sync(), budget.id)).toBeUndefined();
    expect(find(await bobLaptop.sync(), budget.id)).toBeUndefined();
    expect(find(await phone.sync(), budget.id)).toBeDefined();
    expect(phone.sharing[budget.id].memberCount).toBe(1);
  });

  it('rejoining after leaving sticks on every device', async () => {
    const { alice, budget } = await aliceWithBudget();
    const { user: bob, device: bobPhone } = await joinWithDevice(alice, budget.id);
    const bobLaptop = await createDevice(bob);
    await bobLaptop.sync();
    await bobPhone.storage.deleteBudget(budget.id, true);
    await bobPhone.sync();
    await bobLaptop.sync();

    const { error } = await bob.client.rpc('accept_budget_invite', { p_token: await createInvite(alice, budget.id) });
    expect(error).toBeNull();
    for (let i = 0; i < 2; i++) {
      expect(find(await bobPhone.sync(), budget.id)).toBeDefined();
      expect(find(await bobLaptop.sync(), budget.id)).toBeDefined();
    }
    expect(await members(budget.id)).toHaveLength(2);
  });

  it('a leave queued on an offline device doesn’t undo a later rejoin from another device', async () => {
    const { alice, budget } = await aliceWithBudget();
    const { user: bob, device: bobPhone } = await joinWithDevice(alice, budget.id);
    const bobLaptop = await createDevice(bob);
    await bobLaptop.sync();

    // Phone left a minute ago while offline: queued, not yet sent. (A real gap,
    // not milliseconds: device and server clocks can differ by that much.)
    await bobPhone.storage.deleteBudget(budget.id, true);
    const queued = await bobPhone.load();
    await bobPhone.storage.saveAppData({ ...queued, deletedBudgets: { [budget.id]: Date.now() - 60_000 } });
    // Meanwhile the laptop leaves, then rejoins with a new invite.
    await bobLaptop.storage.deleteBudget(budget.id, true);
    await bobLaptop.sync();
    const { error } = await bob.client.rpc('accept_budget_invite', { p_token: await createInvite(alice, budget.id) });
    expect(error).toBeNull();

    // Phone comes back online: its stale leave is dropped and the budget returns.
    expect(find(await bobPhone.sync(), budget.id)).toBeDefined();
    expect(await members(budget.id)).toHaveLength(2);
    expect((await bobPhone.load()).deletedBudgets?.[budget.id]).toBeUndefined();
  });

  it('being removed by the owner drops it from the editor’s devices', async () => {
    const { alice, budget } = await aliceWithBudget();
    const { user: bob, device: bobPhone } = await joinWithDevice(alice, budget.id);
    await alice.client.from('budget_members').delete().eq('budget_id', budget.id).eq('user_id', bob.id);
    expect(find(await bobPhone.sync(), budget.id)).toBeUndefined();
  });

  it('an owner deleting a shared budget removes it for everyone', async () => {
    const { alice, phone, budget } = await aliceWithBudget();
    const keep = makeBudget({ name: 'Keep' });
    const data = await phone.load();
    await phone.storage.saveAppData({ ...data, budgets: [...data.budgets, keep], activeBudgetId: keep.id });
    await phone.sync();
    const { device: bob } = await joinWithDevice(alice, budget.id);

    // What useBudgetData.deleteBudget does for a shared budget the user owns.
    await alice.client.from('budgets').delete().eq('id', budget.id);
    await phone.storage.deleteBudget(budget.id);
    await phone.sync();
    expect(await serverBudget(budget.id)).toBeNull();
    expect(find(await bob.sync(), budget.id)).toBeUndefined();
  });
});
