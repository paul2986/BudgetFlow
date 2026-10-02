import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createInvite, createUser, deleteUser, members, serverBudget, TestUser } from '../helpers/localSupabase';
import { makeBudget, uniqueId } from '../helpers/fixtures';

// Who can do what with shared budgets (supabase/migrations/*_shared_budgets.sql).

const createBudget = async (owner: TestUser, name = 'Family') => {
  const budget = makeBudget({ name });
  const { error } = await owner.client.rpc('create_budget', { p_id: budget.id, p_data: budget });
  if (error) throw error;
  return budget;
};

const join = async (user: TestUser, owner: TestUser, budgetId: string) => {
  const { error } = await user.client.rpc('accept_budget_invite', { p_token: await createInvite(owner, budgetId) });
  if (error) throw error;
};

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createUser('alice'), createUser('bob'), createUser('carol')]);
});

describe('outsiders', () => {
  it('cannot see, edit, invite to or join a budget', async () => {
    const budget = await createBudget(alice);

    const { data: visible } = await bob.client.from('budgets').select('id').eq('id', budget.id);
    expect(visible).toEqual([]);

    const { data: updated } = await bob.client.from('budgets').update({ data: { ...budget, name: 'x' } }).eq('id', budget.id).select();
    expect(updated).toEqual([]);

    const invite = await bob.client.from('budget_invites').insert({ budget_id: budget.id, created_by: bob.id });
    expect(invite.error).not.toBeNull();

    const selfAdd = await bob.client.from('budget_members').insert({ budget_id: budget.id, user_id: bob.id, role: 'editor' });
    expect(selfAdd.error).not.toBeNull();

    const { data: list } = await bob.client.rpc('get_budget_members', { p_budget_id: budget.id });
    expect(list).toEqual([]);
  });

  it('get nothing when signed out', async () => {
    const anon = anonClient();
    const read = await anon.from('budgets').select('id');
    expect(read.data ?? []).toEqual([]);
    const rpc = await anon.rpc('create_budget', { p_id: uniqueId('budget'), p_data: {} });
    expect(rpc.error).not.toBeNull();
  });
});

describe('creating budgets', () => {
  it('makes the creator the owner', async () => {
    const budget = await createBudget(carol);
    expect(await members(budget.id)).toEqual([{ user_id: carol.id, role: 'owner' }]);
  });

  it('rejects data whose id does not match, and ids already taken', async () => {
    const mismatch = await carol.client.rpc('create_budget', { p_id: uniqueId('budget'), p_data: makeBudget() });
    expect(mismatch.error).not.toBeNull();
    const taken = await createBudget(alice);
    const steal = await carol.client.rpc('create_budget', { p_id: taken.id, p_data: { ...taken, name: 'Mine now' } });
    expect(steal.error?.code).toBe('23505');
    expect((await serverBudget(taken.id))?.data.name).toBe('Family');
  });
});

describe('invites', () => {
  it('preview, then join as an editor', async () => {
    const budget = await createBudget(alice, 'Holiday');
    const token = await createInvite(alice, budget.id);
    const { data: preview } = await bob.client.rpc('get_budget_invite', { p_token: token });
    expect(preview).toEqual([{ budget_id: budget.id, budget_name: 'Holiday', status: 'valid' }]);

    const { data: joined, error } = await bob.client.rpc('accept_budget_invite', { p_token: token });
    expect(error).toBeNull();
    expect(joined).toBe(budget.id);
    expect(await members(budget.id)).toContainEqual({ user_id: bob.id, role: 'editor' });
  });

  it('work once', async () => {
    const budget = await createBudget(alice);
    const token = await createInvite(alice, budget.id);
    await bob.client.rpc('accept_budget_invite', { p_token: token });
    const reuse = await carol.client.rpc('accept_budget_invite', { p_token: token });
    expect(reuse.error?.message).toMatch(/already used/);
    // Accepting again as someone already in is harmless.
    const again = await bob.client.rpc('accept_budget_invite', { p_token: token });
    expect(again.error).toBeNull();
  });

  it('expire', async () => {
    const budget = await createBudget(alice);
    const token = await createInvite(alice, budget.id, new Date(Date.now() - 1000).toISOString());
    const { data: preview } = await carol.client.rpc('get_budget_invite', { p_token: token });
    expect(preview?.[0]?.status).toBe('expired');
    const accept = await carol.client.rpc('accept_budget_invite', { p_token: token });
    expect(accept.error?.message).toMatch(/expired/);
  });

  it('are visible and revocable only by the owner', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);
    const token = await createInvite(alice, budget.id);

    const { data: bobSees } = await bob.client.from('budget_invites').select('token').eq('budget_id', budget.id);
    expect(bobSees).toEqual([]);
    const { data: aliceSees } = await alice.client.from('budget_invites').select('token').eq('token', token);
    expect(aliceSees).toHaveLength(1);

    await alice.client.from('budget_invites').delete().eq('token', token);
    const { data: preview } = await carol.client.rpc('get_budget_invite', { p_token: token });
    expect(preview).toEqual([]);
  });
});

describe('editors', () => {
  it('can edit; the server stamps revision and author', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);
    const { data, error } = await bob.client
      .from('budgets')
      .update({ data: { ...budget, name: 'Edited' } })
      .eq('id', budget.id)
      .eq('revision', 1)
      .select('revision, updated_by');
    expect(error).toBeNull();
    expect(data).toEqual([{ revision: 2, updated_by: bob.id }]);

    // A write based on a stale revision matches nothing.
    const { data: stale } = await alice.client.from('budgets').update({ data: budget }).eq('id', budget.id).eq('revision', 1).select();
    expect(stale).toEqual([]);
  });

  it('cannot set the revision, delete the budget or remove the owner', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);

    const revision = await bob.client.from('budgets').update({ revision: 99 }).eq('id', budget.id);
    expect(revision.error).not.toBeNull();

    const { data: deleted } = await bob.client.from('budgets').delete().eq('id', budget.id).select();
    expect(deleted).toEqual([]);

    const { data: removed } = await bob.client.from('budget_members').delete().eq('budget_id', budget.id).eq('user_id', alice.id).select();
    expect(removed).toEqual([]);

    const { data: list } = await bob.client.rpc('get_budget_members', { p_budget_id: budget.id });
    expect(list.map((m: { email: string; role: string }) => `${m.email}:${m.role}`)).toEqual([`${alice.email}:owner`, `${bob.email}:editor`]);
  });

  it('can leave', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);
    await bob.client.from('budget_members').delete().eq('budget_id', budget.id).eq('user_id', bob.id);
    expect(await members(budget.id)).toEqual([{ user_id: alice.id, role: 'owner' }]);
  });
});

describe('owners', () => {
  it('can remove people and delete the budget for everyone', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);
    await alice.client.from('budget_members').delete().eq('budget_id', budget.id).eq('user_id', bob.id);
    expect(await members(budget.id)).toEqual([{ user_id: alice.id, role: 'owner' }]);

    await join(bob, alice, budget.id);
    await alice.client.from('budgets').delete().eq('id', budget.id);
    expect(await serverBudget(budget.id)).toBeNull();
    expect(await members(budget.id)).toEqual([]);
  });

  it('leaving hands the budget to the longest-standing member', async () => {
    const budget = await createBudget(alice);
    await join(bob, alice, budget.id);
    await join(carol, alice, budget.id);
    await alice.client.from('budget_members').delete().eq('budget_id', budget.id).eq('user_id', alice.id);
    const after = await members(budget.id);
    expect(after).toContainEqual({ user_id: bob.id, role: 'owner' });
    expect(after).toContainEqual({ user_id: carol.id, role: 'editor' });
  });
});

describe('deleting an account', () => {
  it('deletes budgets nobody else shares and hands shared ones on', async () => {
    const dave = await createUser('dave');
    const solo = await createBudget(dave, 'Solo');
    const shared = await createBudget(dave, 'Shared');
    await join(bob, dave, shared.id);

    await deleteUser(dave);

    expect(await serverBudget(solo.id)).toBeNull();
    expect(await members(shared.id)).toEqual([{ user_id: bob.id, role: 'owner' }]);
  });
});
