import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createUser, deleteUser, makeAdmin, removeAdmin, TestUser, withDb } from '../helpers/localSupabase';
import { makeBudget, makeExpense } from '../helpers/fixtures';

// The admin panel's numbers (supabase/migrations/*_admin_overview.sql): who may
// ask for them, that they carry no budget content, and that they add up.

let alice: TestUser;
let boss: TestUser;
beforeAll(async () => {
  [alice, boss] = await Promise.all([createUser('alice'), createUser('boss')]);
  await makeAdmin(boss);
});
afterAll(async () => {
  await Promise.all([deleteUser(alice), deleteUser(boss)]);
});

describe('who can ask', () => {
  it('only admins get the overview', async () => {
    expect((await alice.client.rpc('is_admin')).data).toBe(false);
    const denied = await alice.client.rpc('admin_overview');
    expect(denied.error?.code).toBe('42501');
    expect(denied.data).toBeNull();

    expect((await boss.client.rpc('is_admin')).data).toBe(true);
    const granted = await boss.client.rpc('admin_overview');
    expect(granted.error).toBeNull();
    expect(Object.keys(granted.data).sort()).toEqual(['budgets', 'content', 'generated_at', 'health', 'users']);
  });

  it('is closed to signed-out requests', async () => {
    const anon = anonClient();
    expect((await anon.rpc('is_admin')).error).not.toBeNull();
    expect((await anon.rpc('admin_overview')).error).not.toBeNull();
  });

  it('cannot be granted from the app', async () => {
    const selfGrant = await alice.client.schema('private' as any).from('admins').insert({ user_id: alice.id });
    expect(selfGrant.error).not.toBeNull();
    expect((await alice.client.rpc('is_admin')).data).toBe(false);
  });

  it('stops working the moment the admin row goes', async () => {
    const temp = await createUser('temp-admin');
    try {
      await makeAdmin(temp);
      expect((await temp.client.rpc('admin_overview')).error).toBeNull();
      await removeAdmin(temp);
      expect((await temp.client.rpc('is_admin')).data).toBe(false);
      expect((await temp.client.rpc('admin_overview')).error?.code).toBe('42501');
    } finally {
      await deleteUser(temp);
    }
  });

  it('adds no read access to anyone else’s budgets', async () => {
    const budget = makeBudget();
    expect((await alice.client.rpc('create_budget', { p_id: budget.id, p_data: budget })).error).toBeNull();
    const { data } = await boss.client.from('budgets').select('id').eq('id', budget.id);
    expect(data).toEqual([]);
  });
});

describe('what it says', () => {
  it('never carries budget content, names or emails', async () => {
    const budget = makeBudget({
      name: 'ZZ-secret-budget-name',
      people: [{ id: 'p1', name: 'ZZ-secret-person', income: [] }],
      expenses: [
        makeExpense({ description: 'ZZ-secret-expense', notes: 'ZZ-secret-notes', amount: 987654.32 }),
        // Stored values outside the app's own list are lumped together, not echoed.
        makeExpense({ frequency: 'ZZ-secret-frequency' as any }),
      ],
      customCategories: [{ name: 'ZZ-secret-category', updatedAt: 1 }],
    });
    expect((await alice.client.rpc('create_budget', { p_id: budget.id, p_data: budget })).error).toBeNull();

    const { data, error } = await boss.client.rpc('admin_overview');
    expect(error).toBeNull();
    const text = JSON.stringify(data);
    for (const secret of ['ZZ-secret', '987654', budget.id, alice.email, alice.id]) {
      expect(text).not.toContain(secret);
    }
  });

  it('adds up', async () => {
    await withDb(async (db) => {
      // One transaction with a stable snapshot, rolled back at the end: the
      // before/after difference is exactly the fixtures below, whatever other
      // tests are doing at the same time, and nothing is left behind.
      await db.query('begin isolation level repeatable read');
      try {
        // Lets fixtures carry their own timestamps instead of "now".
        await db.query('set local session_replication_role = replica');

        const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
        const insertUser = (id: string, confirmed: boolean, daysAgo: number) =>
          db.query(
            `insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
             values ($1, 'authenticated', 'authenticated', $2, $3, $4, $4)`,
            [id, `${id}@test.local`, confirmed ? iso(daysAgo) : null, iso(daysAgo)]
          );
        const insertBudget = (budget: object & { id: string }, createdDaysAgo: number, editedDaysAgo: number, editor: string) =>
          db.query(
            'insert into public.budgets (id, data, created_at, updated_at, updated_by) values ($1, $2, $3, $4, $5)',
            [budget.id, JSON.stringify(budget), iso(createdDaysAgo), iso(editedDaysAgo), editor]
          );
        const addMember = (budgetId: string, userId: string, role: 'owner' | 'editor') =>
          db.query('insert into public.budget_members (budget_id, user_id, role) values ($1, $2, $3)', [budgetId, userId, role]);
        const addInvite = (budgetId: string, by: string, expiresInDays: number, acceptedBy: string | null) =>
          db.query(
            'insert into public.budget_invites (budget_id, created_by, expires_at, accepted_by, accepted_at) values ($1, $2, $3, $4, $5)',
            [budgetId, by, iso(-expiresInDays), acceptedBy, acceptedBy ? iso(0) : null]
          );
        const overview = async () => (await db.query('select public.admin_overview() as overview')).rows[0].overview;

        // The caller: an admin, signed in the way the API does it.
        const asker = randomUUID();
        await insertUser(asker, true, 0);
        await db.query('insert into private.admins (user_id) values ($1)', [asker]);
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: asker, role: 'authenticated' })]);

        const before = await overview();

        const [u1, u2, u3] = [randomUUID(), randomUUID(), randomUUID()];
        await insertUser(u1, true, 0);
        await insertUser(u2, false, 0);
        await insertUser(u3, true, 20);

        // Solo, new, edited now.
        const b1 = makeBudget({
          people: [{ id: 'p1', name: 'One', income: [] }],
          expenses: [makeExpense({ frequency: 'monthly' }), makeExpense({ frequency: 'weekly' })],
        });
        await insertBudget(b1, 0, 0, u1);
        await addMember(b1.id, u1, 'owner');

        // Shared, old and untouched for 40 days.
        const b2 = makeBudget({
          people: [{ id: 'p1', name: 'One', income: [] }, { id: 'p2', name: 'Two', income: [] }],
          expenses: [
            makeExpense({ frequency: 'monthly' }),
            makeExpense({ frequency: 'one-time' }),
            makeExpense({ frequency: 'not a frequency' as any }),
          ],
        });
        await insertBudget(b2, 40, 40, u2);
        await addMember(b2.id, u1, 'owner');
        await addMember(b2.id, u2, 'editor');

        // Malformed expenses, edited 3 days ago, and nobody owns it.
        const b3 = { ...makeBudget(), expenses: 'oops' };
        await insertBudget(b3, 20, 3, u3);
        await addMember(b3.id, u3, 'editor');

        await addInvite(b1.id, u1, 7, null); // pending
        await addInvite(b1.id, u1, 7, u2); // accepted
        await addInvite(b1.id, u1, -1, null); // expired yesterday

        const after = await overview();
        const change = (section: string, key: string) => after[section][key] - before[section][key];
        const frequency = (o: any, key: string) => o.content.expenses_by_frequency[key] ?? 0;

        // The DB (Docker VM) and the host keep separate clocks, so allow a little skew.
        expect(new Date(after.generated_at).getTime()).toBeLessThanOrEqual(Date.now() + 2000);

        expect(['total', 'confirmed', 'unconfirmed', 'signups_7d', 'signups_30d', 'active_editors_7d', 'active_editors_30d']
          .map((key) => change('users', key))).toEqual([3, 2, 1, 2, 3, 2, 2]);

        expect(['total', 'solo', 'shared', 'created_7d', 'created_30d', 'edited_7d', 'edited_30d', 'dormant_30d']
          .map((key) => change('budgets', key))).toEqual([3, 2, 1, 1, 2, 2, 2, 1]);
        expect(['invites_pending', 'invites_accepted', 'invites_expired'].map((key) => change('budgets', key))).toEqual([1, 1, 1]);
        expect(after.budgets.avg_members).toBeGreaterThan(0);

        expect([change('content', 'expenses'), change('content', 'people')]).toEqual([5, 3]);
        expect(after.content.max_expenses_per_budget).toBeGreaterThanOrEqual(3);
        expect(['monthly', 'weekly', 'one-time', 'other', 'daily', 'yearly'].map((key) => frequency(after, key) - frequency(before, key)))
          .toEqual([2, 1, 1, 1, 0, 0]);
        expect(Object.keys(after.content.expenses_by_frequency).every((key) =>
          ['daily', 'weekly', 'monthly', 'yearly', 'one-time', 'other'].includes(key))).toBe(true);

        expect(after.health.largest_budget_bytes).toBeGreaterThan(0);
        expect(change('health', 'budgets_without_owner')).toBe(1);
      } finally {
        await db.query('rollback');
      }
    });
  });
});
