import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createUser, deleteUser, makeAdmin, TestUser, withDb } from '../helpers/localSupabase';

// Feedback (supabase/migrations/*_feedback.sql): who can send and read what, that
// a sender's email reaches an admin only when they share it, and that the read
// markers (needs you / unread) follow the conversation.

// Sending is rate limited per person, so each test signs up its own people.
let boss: TestUser;
const created: TestUser[] = [];
const fresh = async (label: string) => {
  const user = await createUser(label);
  created.push(user);
  return user;
};
beforeAll(async () => {
  boss = await fresh('boss');
  await makeAdmin(boss);
});
afterAll(async () => {
  await Promise.all(created.map(deleteUser));
});

const send = async (user: TestUser, body: string, shareEmail = false) => {
  const { data, error } = await user.client.rpc('submit_feedback', {
    p_body: body,
    p_share_email: shareEmail,
    p_app_version: '1.12.0 (abc1234)',
    p_platform: 'web',
  });
  expect(error).toBeNull();
  return data as string;
};
const mine = async (user: TestUser) => {
  const { data, error } = await user.client.rpc('my_feedback');
  expect(error).toBeNull();
  return data as any[];
};
const adminItem = async (id: string) => {
  const { data, error } = await boss.client.rpc('admin_feedback_get', { p_id: id });
  expect(error).toBeNull();
  return data as any;
};
const adminList = async (args: { p_status?: string; p_needs_you?: boolean } = {}) => {
  const { data, error } = await boss.client.rpc('admin_feedback_list', args);
  expect(error).toBeNull();
  return data as any[];
};

describe('sending', () => {
  it('stores what was sent, trimmed, with the app version and platform', async () => {
    const alice = await fresh('alice');
    const id = await send(alice, '  Add a dark mode scheduler  ');
    const item = (await mine(alice)).find((f) => f.id === id);
    expect(item).toMatchObject({ body: 'Add a dark mode scheduler', status: 'new', unread: false, messages: [] });

    const seen = await adminItem(id);
    expect(seen).toMatchObject({ app_version: '1.12.0 (abc1234)', platform: 'web' });
  });

  it('keeps only known platforms and caps the version', async () => {
    const user = await fresh('platform');
    const { data: id } = await user.client.rpc('submit_feedback', {
      p_body: 'platform check',
      p_platform: 'beos',
      p_app_version: 'v'.repeat(200),
    });
    const item = await adminItem(id as string);
    expect(item.platform).toBeNull();
    expect(item.app_version).toHaveLength(50);
  });

  it('rejects empty, blank and over-long feedback', async () => {
    const alice = await fresh('alice');
    for (const body of ['', '   \n  ', 'x'.repeat(2001)]) {
      const { error } = await alice.client.rpc('submit_feedback', { p_body: body });
      expect(error?.code).toBe('22023');
    }
    const { error } = await alice.client.rpc('submit_feedback', { p_body: 'x'.repeat(2000) });
    expect(error).toBeNull();
  });

  it('is closed to signed-out requests', async () => {
    const anon = anonClient();
    for (const [fn, args] of [
      ['submit_feedback', { p_body: 'hello' }],
      ['my_feedback', {}],
      ['my_feedback_unread', {}],
      ['mark_feedback_seen', { p_feedback_id: randomUUID() }],
      ['reply_to_feedback', { p_feedback_id: randomUUID(), p_body: 'hello' }],
    ] as const) {
      expect((await anon.rpc(fn, args)).error, fn).not.toBeNull();
    }
  });

  it('stops at 5 new items an hour, for that person only', async () => {
    const [spammer, bob] = [await fresh('spammer'), await fresh('bob')];
    for (let i = 0; i < 5; i++) await send(spammer, `idea ${i}`);
    const sixth = await spammer.client.rpc('submit_feedback', { p_body: 'idea 5' });
    expect(sixth.error?.code).toBe('54000');
    await send(bob, 'bob is unaffected');
  });

  it('stops at 20 follow-ups an hour', async () => {
    const chatty = await fresh('chatty');
    const id = await send(chatty, 'conversation starter');
    for (let i = 0; i < 20; i++) {
      const { error } = await chatty.client.rpc('reply_to_feedback', { p_feedback_id: id, p_body: `message ${i}` });
      expect(error).toBeNull();
    }
    const twentyFirst = await chatty.client.rpc('reply_to_feedback', { p_feedback_id: id, p_body: 'one more' });
    expect(twentyFirst.error?.code).toBe('54000');
  });
});

describe('who can see what', () => {
  it('keeps each person to their own feedback', async () => {
    const [alice, bob] = [await fresh('alice'), await fresh('bob')];
    const id = await send(alice, 'ZZ-alice-only idea');
    expect(JSON.stringify(await mine(bob))).not.toContain('ZZ-alice-only');

    // Nor can bob write into her thread, mark it read, or reach the tables.
    const reply = await bob.client.rpc('reply_to_feedback', { p_feedback_id: id, p_body: 'hijack' });
    expect(reply.error?.code).toBe('P0002');
    expect((await bob.client.from('feedback').select('id')).error).not.toBeNull();
    expect((await bob.client.from('feedback_messages').select('id')).error).not.toBeNull();
    expect((await bob.client.from('feedback').insert({ user_id: bob.id, body: 'direct' })).error).not.toBeNull();
    expect((await bob.client.from('feedback').update({ status: 'done' }).eq('id', id)).error).not.toBeNull();
    expect((await alice.client.from('feedback').select('id')).error).not.toBeNull();
    expect((await adminItem(id)).status).toBe('new');
  });

  it('only admins reach the admin functions', async () => {
    const [alice, bob] = [await fresh('alice'), await fresh('bob')];
    const id = await send(alice, 'who may look');
    const anon = anonClient();
    for (const [fn, args] of [
      ['admin_feedback_list', {}],
      ['admin_feedback_get', { p_id: id }],
      ['admin_feedback_reply', { p_id: id, p_body: 'hello' }],
      ['admin_feedback_set_status', { p_id: id, p_status: 'done' }],
      ['admin_feedback_counts', {}],
    ] as const) {
      const denied = await alice.client.rpc(fn, args);
      expect(denied.error?.code, fn).toBe('42501');
      expect(denied.data, fn).toBeNull();
      expect((await anon.rpc(fn, args)).error, fn).not.toBeNull();
      expect((await boss.client.rpc(fn, args)).error, fn).toBeNull();
    }
    // Nothing the non-admin tried changed anything: the admin's own calls above did.
    expect((await adminItem(id)).status).toBe('done');
  });

  it('shows an admin the sender’s email only when they chose to share it', async () => {
    const [alice, bob] = [await fresh('alice'), await fresh('bob')];
    const quiet = await send(alice, 'ZZ-quiet idea', false);
    const open = await send(bob, 'ZZ-open idea', true);

    const items = await adminList();
    const quietItem = items.find((f) => f.id === quiet);
    const openItem = items.find((f) => f.id === open);
    expect(quietItem.sender_email).toBeNull();
    expect(openItem.sender_email).toBe(bob.email);

    // Not in the thread view or after a reply either, and never an account id.
    await boss.client.rpc('admin_feedback_reply', { p_id: quiet, p_body: 'Thanks!' });
    const everything = JSON.stringify([await adminList(), await adminItem(quiet), await adminItem(open)]);
    expect(everything).not.toContain(alice.email);
    expect(everything).not.toContain(alice.id);
    expect(everything).not.toContain(bob.id);
  });

  it('never tells a sender which admin replied', async () => {
    const [alice, bob] = [await fresh('alice'), await fresh('bob')];
    const id = await send(alice, 'who answers');
    await boss.client.rpc('admin_feedback_reply', { p_id: id, p_body: 'Good idea.' });
    const item = (await mine(alice)).find((f) => f.id === id);
    expect(item.messages).toHaveLength(1);
    expect(Object.keys(item.messages[0]).sort()).toEqual(['body', 'created_at', 'from_admin', 'id']);
    expect(item.messages[0].from_admin).toBe(true);
    expect(JSON.stringify(item)).not.toContain(boss.id);
    expect(JSON.stringify(item)).not.toContain(boss.email);
  });
});

describe('the conversation', () => {
  it('follows who spoke last, for both sides', async () => {
    const user = await fresh('talker');
    {
      const id = await send(user, 'A conversation');
      expect((await mine(user))[0].unread).toBe(false);
      expect((await adminList({ p_needs_you: true })).some((f) => f.id === id)).toBe(true);

      // The admin answers and files it: handled, and the sender has something new.
      const reply = await boss.client.rpc('admin_feedback_reply', { p_id: id, p_body: 'On the list.', p_status: 'planned' });
      expect(reply.error).toBeNull();
      expect(reply.data).toMatchObject({ status: 'planned', needs_you: false, message_count: 1 });
      expect((await adminList({ p_needs_you: true })).some((f) => f.id === id)).toBe(false);
      expect((await adminList({ p_status: 'planned' })).some((f) => f.id === id)).toBe(true);
      expect((await user.client.rpc('my_feedback_unread')).data).toBe(1);
      expect((await mine(user))[0]).toMatchObject({ status: 'planned', unread: true });

      // Reading clears it.
      expect((await user.client.rpc('mark_feedback_seen', { p_feedback_id: id })).error).toBeNull();
      expect((await user.client.rpc('my_feedback_unread')).data).toBe(0);

      // The sender answers back: it is waiting on the admin again, thread in order.
      expect((await user.client.rpc('reply_to_feedback', { p_feedback_id: id, p_body: 'Thank you!' })).error).toBeNull();
      expect((await adminItem(id)).needs_you).toBe(true);
      const thread = (await adminItem(id)).messages;
      expect(thread.map((m: any) => [m.from_admin, m.body])).toEqual([[true, 'On the list.'], [false, 'Thank you!']]);
      expect((await user.client.rpc('my_feedback_unread')).data).toBe(0);

      // A status change alone, no reply, still reaches the sender.
      const changed = await boss.client.rpc('admin_feedback_set_status', { p_id: id, p_status: 'done' });
      expect(changed.data).toMatchObject({ status: 'done', needs_you: false, message_count: 2 });
      expect((await user.client.rpc('my_feedback_unread')).data).toBe(1);
      expect((await mine(user))[0]).toMatchObject({ status: 'done', unread: true });
    }
  });

  it('lists the most recently active first', async () => {
    const user = await fresh('ordering');
    const first = await send(user, 'first');
    const second = await send(user, 'second');
    expect((await mine(user)).map((f) => f.id)).toEqual([second, first]);
    await user.client.rpc('reply_to_feedback', { p_feedback_id: first, p_body: 'bump' });
    expect((await mine(user)).map((f) => f.id)).toEqual([first, second]);
  });

  it('only accepts the five statuses and valid replies', async () => {
    const [alice, bob] = [await fresh('alice'), await fresh('bob')];
    const id = await send(alice, 'status check');
    expect((await boss.client.rpc('admin_feedback_set_status', { p_id: id, p_status: 'shipped' })).error?.code).toBe('22023');
    expect((await boss.client.rpc('admin_feedback_set_status', { p_id: id, p_status: null })).error?.code).toBe('22023');
    expect((await boss.client.rpc('admin_feedback_list', { p_status: 'shipped' })).error?.code).toBe('22023');
    expect((await boss.client.rpc('admin_feedback_reply', { p_id: id, p_body: 'hi', p_status: 'shipped' })).error?.code).toBe('22023');
    expect((await boss.client.rpc('admin_feedback_reply', { p_id: id, p_body: '   ' })).error?.code).toBe('22023');
    expect((await boss.client.rpc('admin_feedback_reply', { p_id: randomUUID(), p_body: 'hi' })).error?.code).toBe('P0002');
    expect((await boss.client.rpc('admin_feedback_get', { p_id: randomUUID() })).error?.code).toBe('P0002');
    expect((await adminItem(id)).status).toBe('new');

    await withDb(async (db) => {
      await expect(db.query("update public.feedback set status = 'shipped' where id = $1", [id])).rejects.toThrow(/check/i);
    });
  });

  it('is removed with the account', async () => {
    const user = await createUser('leaver');
    const id = await send(user, 'goodbye');
    await user.client.rpc('reply_to_feedback', { p_feedback_id: id, p_body: 'and one more' });
    await deleteUser(user); // a throwaway user on the local stack
    await withDb(async (db) => {
      expect((await db.query('select 1 from public.feedback where id = $1', [id])).rowCount).toBe(0);
      expect((await db.query('select 1 from public.feedback_messages where feedback_id = $1', [id])).rowCount).toBe(0);
    });
  });
});

describe('the counts', () => {
  it('add up', async () => {
    await withDb(async (db) => {
      // One transaction with a stable snapshot, rolled back at the end: the
      // before/after difference is exactly the fixtures below, whatever other
      // tests are doing at the same time, and nothing is left behind.
      await db.query('begin isolation level repeatable read');
      try {
        await db.query('set local session_replication_role = replica');
        const asker = randomUUID();
        const sender = randomUUID();
        for (const id of [asker, sender]) {
          await db.query(
            `insert into auth.users (id, aud, role, email, email_confirmed_at)
             values ($1, 'authenticated', 'authenticated', $2, now())`,
            [id, `${id}@test.local`]
          );
        }
        await db.query('insert into private.admins (user_id) values ($1)', [asker]);
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: asker, role: 'authenticated' })]);
        const counts = async () => (await db.query('select public.admin_feedback_counts() as counts')).rows[0].counts;
        const before = await counts();

        const add = (status: string, handled: boolean) =>
          db.query(
            `insert into public.feedback (user_id, body, status, user_activity_at, admin_handled_at)
             values ($1, 'x', $2, now() - interval '1 hour', $3)`,
            [sender, status, handled ? new Date().toISOString() : null]
          );
        await add('new', false); // needs you
        await add('new', true); // answered, still filed as new
        await add('backlog', false); // needs you
        await add('planned', true);
        await add('done', true);
        await add('rejected', true);

        const after = await counts();
        const change = (key: string) => after[key] - before[key];
        expect(['total', 'needs_you', 'new', 'backlog', 'planned', 'done', 'rejected'].map(change)).toEqual([6, 2, 2, 1, 1, 1, 1]);
      } finally {
        await db.query('rollback');
      }
    });
  });
});
