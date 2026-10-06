import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

// The local stack started by `supabase start`. The defaults are the Supabase
// CLI's standard local development keys (public, local-only); CI can override.
const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(URL)) {
  // These tests create and delete users; never point them at a real project.
  throw new Error(`Refusing to run db tests against ${URL}: use a local Supabase (supabase start).`);
}

const DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(DB_URL)) {
  throw new Error(`Refusing to run db tests against ${DB_URL}: use a local Supabase (supabase start).`);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = createClient(URL, SERVICE_ROLE_KEY, options);
export const anonClient = () => createClient(URL, ANON_KEY, options);

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

// A fresh signed-in user. Random emails keep runs independent, so the
// database never needs resetting between them.
export const createUser = async (label: string): Promise<TestUser> => {
  const email = `${label}-${randomUUID().slice(0, 8)}@test.local`;
  const password = randomUUID();
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = anonClient();
  const { data, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, password, client };
};

export const deleteUser = async (user: TestUser) => {
  await admin.auth.admin.deleteUser(user.id);
};

// Plain SQL, for what the API can't reach (the private schema), the way the SQL
// editor is used in production.
export const withDb = async <T>(run: (db: Client) => Promise<T>): Promise<T> => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
};

// Admins can only be added with SQL; there is no in-app way to grant it.
export const makeAdmin = (user: TestUser) =>
  withDb((db) => db.query('insert into private.admins (user_id) values ($1)', [user.id]));

export const removeAdmin = (user: TestUser) =>
  withDb((db) => db.query('delete from private.admins where user_id = $1', [user.id]));

// Owner-side helpers, as the app does them.
export const createInvite = async (owner: TestUser, budgetId: string, expiresAt?: string) => {
  const { data, error } = await (expiresAt ? admin : owner.client)
    .from('budget_invites')
    .insert({ budget_id: budgetId, created_by: owner.id, ...(expiresAt ? { expires_at: expiresAt } : {}) })
    .select('token')
    .single();
  if (error) throw error;
  return data.token as string;
};

export const serverBudget = async (id: string) =>
  (await admin.from('budgets').select('data, revision, updated_by').eq('id', id).maybeSingle()).data;

export const members = async (budgetId: string) =>
  (await admin.from('budget_members').select('user_id, role').eq('budget_id', budgetId)).data || [];
