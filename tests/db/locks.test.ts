import { beforeAll, describe, expect, it } from 'vitest';
import { admin, anonClient, createInvite, createUser, deleteUser, TestUser } from '../helpers/localSupabase';
import { createDevice, Device } from '../helpers/device';
import { makeBudget } from '../helpers/fixtures';
import type { Budget } from '../../types/budget';

// Budget locks (supabase/migrations/*_budget_locks.sql, utils/budgetLock*.ts): who can
// see and change one, and that a lock set on one device is there on the others.

const find = (data: { budgets: Budget[] }, id: string) => data.budgets.find((b) => b.id === id);

const verifier = 'v1$5000$00112233445566778899aabbccddeeff$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const createBudget = async (owner: TestUser) => {
  const budget = makeBudget();
  const { error } = await owner.client.rpc('create_budget', { p_id: budget.id, p_data: budget });
  if (error) throw error;
  return budget;
};

const join = async (user: TestUser, owner: TestUser, budgetId: string) => {
  const { error } = await user.client.rpc('accept_budget_invite', { p_token: await createInvite(owner, budgetId) });
  if (error) throw error;
};

const lockRows = async (budgetId: string) =>
  (await admin.from('budget_locks').select('user_id, pin_verifier, auto_lock_minutes').eq('budget_id', budgetId)).data || [];

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createUser('alice'), createUser('bob'), createUser('carol')]);
});

describe('who can do what with a lock', () => {
  it('lets a member lock a budget, change its code and take the lock off', async () => {
    const budget = await createBudget(alice);
    const set = await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 5 });
    expect(set.error).toBeNull();
    expect(await lockRows(budget.id)).toEqual([{ user_id: alice.id, pin_verifier: verifier, auto_lock_minutes: 5 }]);

    const changed = verifier.replace('0123', '4567');
    await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: changed, p_auto_lock_minutes: 0 });
    expect(await lockRows(budget.id)).toEqual([{ user_id: alice.id, pin_verifier: changed, auto_lock_minutes: 0 }]);

    const removed = await alice.client.from('budget_locks').delete().eq('budget_id', budget.id).select();
    expect(removed.data).toHaveLength(1);
    expect(await lockRows(budget.id)).toEqual([]);
  });

  it('is the account’s own: sharing a budget shares nothing of it', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);
    await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });

    const seen = await bob.client.from('budget_locks').select('*').eq('budget_id', budget.id);
    expect(seen.data).toEqual([]);

    // Bob's own lock is his alone, and takes nothing from Alice's.
    await bob.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier.replace('0123', '9999'), p_auto_lock_minutes: -1 });
    expect(await lockRows(budget.id)).toHaveLength(2);
    const mine = await alice.client.from('budget_locks').select('user_id, auto_lock_minutes').eq('budget_id', budget.id);
    expect(mine.data).toEqual([{ user_id: alice.id, auto_lock_minutes: 0 }]);

    // Bob removing his doesn't remove Alice's.
    await bob.client.from('budget_locks').delete().eq('budget_id', budget.id);
    expect((await lockRows(budget.id)).map((r) => r.user_id)).toEqual([alice.id]);
  });

  it('cannot be set on a budget the person is not in', async () => {
    const budget = await createBudget(alice);
    const result = await carol.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    expect(result.error).not.toBeNull();
    expect(await lockRows(budget.id)).toEqual([]);
  });

  it('cannot be written to directly, nor have its code changed in place', async () => {
    const budget = await createBudget(alice);
    const insert = await alice.client.from('budget_locks').insert({ user_id: alice.id, budget_id: budget.id, pin_verifier: verifier });
    expect(insert.error).not.toBeNull();

    await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    const swap = await alice.client.from('budget_locks').update({ pin_verifier: 'x'.repeat(30) }).eq('budget_id', budget.id);
    expect(swap.error).not.toBeNull();

    const timing = await alice.client.from('budget_locks').update({ auto_lock_minutes: 15 }).eq('budget_id', budget.id).select('auto_lock_minutes');
    expect(timing.data).toEqual([{ auto_lock_minutes: 15 }]);

    const stolen = await carol.client.from('budget_locks').update({ auto_lock_minutes: -1 }).eq('budget_id', budget.id).select();
    expect(stolen.data).toEqual([]);
    const wiped = await carol.client.from('budget_locks').delete().eq('budget_id', budget.id).select();
    expect(wiped.data).toEqual([]);
    expect(await lockRows(budget.id)).toHaveLength(1);
  });

  it('rejects a time or a code the app would never send', async () => {
    const budget = await createBudget(alice);
    const tooLong = await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 99999 });
    expect(tooLong.error).not.toBeNull();
    const tooShort = await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: '1234', p_auto_lock_minutes: 0 });
    expect(tooShort.error).not.toBeNull();
    expect(await lockRows(budget.id)).toEqual([]);
  });

  it('gives a signed-out visitor nothing', async () => {
    const budget = await createBudget(alice);
    await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    const anon = anonClient();
    const read = await anon.from('budget_locks').select('*');
    expect(read.data ?? []).toEqual([]);
    const write = await anon.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    expect(write.error).not.toBeNull();
  });
});

describe('when the lock goes', () => {
  it('goes with the person who leaves the budget, and is not waiting if they are invited back', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);
    await bob.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });

    const left = await bob.client.from('budget_members').delete().eq('budget_id', budget.id).eq('user_id', bob.id).select();
    expect(left.data).toHaveLength(1);
    expect((await lockRows(budget.id)).map((r) => r.user_id)).toEqual([alice.id]);

    await join(bob, alice, budget.id);
    const back = await bob.client.from('budget_locks').select('*').eq('budget_id', budget.id);
    expect(back.data).toEqual([]);
  });

  it('goes with the account', async () => {
    const dana = await createUser('dana');
    const budget = await createBudget(dana);
    await join(bob, dana, budget.id);
    await dana.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    await bob.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    await deleteUser(dana);
    // Dana's lock is gone with her; Bob, who now owns the budget, keeps his.
    expect((await lockRows(budget.id)).map((r) => r.user_id)).toEqual([bob.id]);
  });

  it('goes with the budget', async () => {
    const budget = await createBudget(alice);
    await alice.client.rpc('set_budget_lock', { p_budget_id: budget.id, p_pin_verifier: verifier, p_auto_lock_minutes: 0 });
    const deleted = await alice.client.from('budgets').delete().eq('id', budget.id).select();
    expect(deleted.data).toHaveLength(1);
    expect(await lockRows(budget.id)).toEqual([]);
  });
});

// A device signed in as `user`, holding `budget` (already on the server).
const deviceWith = async (user: TestUser, budget: Budget): Promise<Device> => {
  const device = await createDevice(user);
  await device.sync();
  expect(find(await device.load(), budget.id)).toBeDefined();
  return device;
};

const aliceOnTwoDevices = async () => {
  const user = await createUser('alice');
  const phone = await createDevice(user);
  const budget = makeBudget();
  await phone.storage.saveAppData({ version: 2, budgets: [budget], activeBudgetId: budget.id });
  await phone.sync();
  const laptop = await deviceWith(user, budget);
  return { user, phone, laptop, budget };
};

describe('a lock on every device', () => {
  it('locks the budget on a device that did not set it, with this device’s own state left alone', async () => {
    const { phone, laptop, budget } = await aliceOnTwoDevices();
    expect((await phone.lockActions.setCode(budget.id, '1234')).success).toBe(true);

    // The phone, where it was set, is open; nothing says the laptop is.
    const onPhone = find(await phone.load(), budget.id)!;
    expect(onPhone.lock?.locked).toBe(true);
    expect(phone.lock.isBudgetLocked(onPhone)).toBe(false);

    const onLaptop = find(await laptop.sync(), budget.id)!;
    expect(onLaptop.lock?.locked).toBe(true);
    expect(onLaptop.lock?.pinVerifier).toBe(onPhone.lock?.pinVerifier);
    expect(laptop.lock.isBudgetLocked(onLaptop)).toBe(true);

    // And the code opens it there.
    expect(await laptop.lockActions.checkCode(budget.id, '1234')).toEqual({ ok: true });
    expect(laptop.lock.isBudgetLocked(find(await laptop.load(), budget.id))).toBe(false);
  });

  it('keeps the code out of the budget itself', async () => {
    const { phone, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    await phone.sync();
    const { data } = await admin.from('budgets').select('data').eq('id', budget.id).single();
    expect(data?.data).not.toHaveProperty('lock');
    expect(JSON.stringify(data?.data)).not.toContain('pinVerifier');
    const [row] = await lockRows(budget.id);
    expect(row.pin_verifier).not.toContain('1234');
    expect(row.pin_verifier.startsWith('v1$')).toBe(true);
  });

  it('takes the lock off the other devices when it is turned off', async () => {
    const { phone, laptop, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    await laptop.sync();
    expect(laptop.lock.isBudgetLocked(find(await laptop.load(), budget.id))).toBe(true);

    expect((await phone.lockActions.removeLock(budget.id)).success).toBe(true);
    const onLaptop = find(await laptop.sync(), budget.id)!;
    expect(onLaptop.lock).toEqual({ locked: false, autoLockMinutes: 0 });
    expect(laptop.lock.isBudgetLocked(onLaptop)).toBe(false);
  });

  it('locks a device again when the code is changed somewhere else', async () => {
    const { phone, laptop, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    await laptop.sync();
    await laptop.lockActions.checkCode(budget.id, '1234');
    expect(laptop.lock.isBudgetLocked(find(await laptop.load(), budget.id))).toBe(false);

    await phone.lockActions.setCode(budget.id, '9876');
    const onLaptop = find(await laptop.sync(), budget.id)!;
    expect(laptop.lock.isBudgetLocked(onLaptop)).toBe(true);
    expect(await laptop.lockActions.checkCode(budget.id, '1234')).toMatchObject({ ok: false });
    expect(await laptop.lockActions.checkCode(budget.id, '9876')).toEqual({ ok: true });
  });

  it('shares the auto-lock time but not Face ID, which is each device’s own', async () => {
    const { phone, laptop, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    await phone.lockActions.setBiometrics(budget.id, true);
    await phone.lockActions.setAutoLock(budget.id, 15);

    const onLaptop = find(await laptop.sync(), budget.id)!;
    expect(onLaptop.lock?.autoLockMinutes).toBe(15);
    expect(onLaptop.lock?.biometrics).toBeUndefined();
    expect(find(await phone.sync(), budget.id)?.lock?.biometrics).toBe(true);
  });

  it('stays open on this device when its auto-lock time is changed, even from “never”', async () => {
    const { phone, laptop, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    await phone.lockActions.setAutoLock(budget.id, -1);
    // Quit and reopened: nothing in memory, but "never" is remembered on the device.
    const reopened = await createDevice(phone.user, phone.disk);
    const before = find(await reopened.load(), budget.id)!;
    expect(reopened.lock.isBudgetLocked(before)).toBe(false);

    await reopened.lockActions.setAutoLock(budget.id, 5);
    expect(reopened.lock.isBudgetLocked(find(await reopened.load(), budget.id))).toBe(false);

    // A device that never opened it still asks, and "never" then holds across a restart there.
    const onLaptop = find(await laptop.sync(), budget.id)!;
    expect(onLaptop.lock?.autoLockMinutes).toBe(5);
    expect(laptop.lock.isBudgetLocked(onLaptop)).toBe(true);
  });

  it('does not lock a partner who shares the budget', async () => {
    const { user, phone, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    const partner = await createUser('bob');
    await join(partner, user, budget.id);
    const partnerPhone = await createDevice(partner);
    const synced = find(await partnerPhone.sync(), budget.id)!;
    expect(synced.lock?.locked).toBe(false);
    expect(partnerPhone.lock.isBudgetLocked(synced)).toBe(false);
  });

  it('keeps a lock set while a sync is in flight', async () => {
    const { phone, budget } = await aliceOnTwoDevices();
    const syncing = phone.sync();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await phone.lockActions.setCode(budget.id, '1234');
    await syncing;
    expect(find(await phone.load(), budget.id)?.lock?.locked).toBe(true);
    expect(find(await phone.sync(), budget.id)?.lock?.locked).toBe(true);
  });

  it('forgets a lock from before codes, which the server never had', async () => {
    const { phone, budget } = await aliceOnTwoDevices();
    await phone.storage.setBudgetLock(budget.id, { locked: true, autoLockMinutes: 5 });
    expect(phone.lock.isBudgetLocked(find(await phone.load(), budget.id))).toBe(false);
    expect(find(await phone.sync(), budget.id)?.lock?.locked).toBe(false);
  });

  it('leaves the locks alone when the server can’t be asked for them', async () => {
    const { user, phone, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    // A laptop whose request for locks starts failing (a dropped connection part-way through a pass).
    let offline = false;
    const flaky = new Proxy(user.client, {
      get: (target, prop, receiver) =>
        prop === 'from'
          ? (table: string) =>
              offline && table === 'budget_locks'
                ? { select: async () => ({ data: null, error: { message: 'Failed to fetch', code: '' } }) }
                : target.from(table)
          : Reflect.get(target, prop, receiver),
    });
    const laptop = await createDevice({ ...user, client: flaky });
    expect(find(await laptop.sync(), budget.id)?.lock?.locked).toBe(true);

    offline = true;
    const during = find(await laptop.sync(), budget.id)!;
    // Never read as "no locks", and the budget itself still syncs.
    expect(during.lock?.locked).toBe(true);
    expect(laptop.lock.isBudgetLocked(during)).toBe(true);
  });
});

describe('a forgotten code', () => {
  it('is cleared with the account’s password, on every device', async () => {
    const { user, phone, laptop, budget } = await aliceOnTwoDevices();
    await phone.lockActions.setCode(budget.id, '1234');
    await laptop.sync();

    const wrong = await laptop.lockActions.resetLockWithPassword(budget.id, user.email, 'not the password');
    expect(wrong).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await lockRows(budget.id)).toHaveLength(1);

    const right = await laptop.lockActions.resetLockWithPassword(budget.id, user.email, user.password);
    expect(right).toEqual({ ok: true });
    expect(await lockRows(budget.id)).toEqual([]);
    expect(find(await phone.sync(), budget.id)?.lock?.locked).toBe(false);
  });
});
