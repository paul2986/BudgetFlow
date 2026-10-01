import { AppDataV2, Budget, BudgetSharing } from '../types/budget';
import { supabase } from './supabase';
import {
  addCategoriesToBudget,
  loadSyncedBudgetIds,
  saveSyncedBudgetIds,
  validateAppData,
} from './storage';

// Each budget syncs as its own server row (public.budgets), readable and
// writable by its members. A sync pass downloads every budget the user can
// open, merges each with the device's copy entity by entity, and writes back
// any budget whose merged copy differs, conditional on the revision it read.

// Tombstones older than this are ignored when merging (matches storage pruning).
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Union two tombstone maps, keeping the latest deletion time per id and dropping
// entries that have aged out.
const mergeDeletions = (
  a?: Record<string, number>,
  b?: Record<string, number>
): Record<string, number> => {
  const out: Record<string, number> = {};
  const now = Date.now();
  const absorb = (m?: Record<string, number>) => {
    if (!m) return;
    for (const [id, ts] of Object.entries(m)) {
      if (typeof ts !== 'number' || now - ts > TOMBSTONE_TTL_MS) continue;
      if (!(id in out) || ts > out[id]) out[id] = ts;
    }
  };
  absorb(a);
  absorb(b);
  return out;
};

// Effective last-modified time for an entity. Legacy entities without their own
// timestamp fall back to their budget's modifiedAt, preserving prior behaviour.
const entityTime = (entity: { updatedAt?: number }, budgetModifiedAt: number): number =>
  typeof entity?.updatedAt === 'number' ? entity.updatedAt : budgetModifiedAt;

// Merge two lists of id'd entities (expenses or people): union by id, pick the
// most-recently-updated copy for conflicts, and drop anything a newer tombstone
// has deleted. This is what prevents concurrent edits on two devices from wiping
// each other's additions.
const mergeEntities = <T extends { id: string; updatedAt?: number }>(
  localArr: T[] = [],
  remoteArr: T[] = [],
  localMod: number,
  remoteMod: number,
  deletions: Record<string, number>
): T[] => {
  const byId = new Map<string, { entity: T; time: number }>();
  const consider = (arr: T[], mod: number) => {
    for (const e of arr) {
      if (!e || !e.id) continue;
      const t = entityTime(e, mod);
      const existing = byId.get(e.id);
      if (!existing || t >= existing.time) byId.set(e.id, { entity: e, time: t });
    }
  };
  consider(localArr, localMod);
  consider(remoteArr, remoteMod);

  const result: T[] = [];
  byId.forEach(({ entity, time }) => {
    const deletedAt = deletions[entity.id];
    // Tombstone wins only if the deletion is at least as recent as the last edit;
    // an edit that happened after a delete intentionally resurrects the entity.
    if (typeof deletedAt === 'number' && deletedAt >= time) return;
    result.push(entity);
  });
  return result;
};

// Merge a budget held both locally and remotely, at the entity level. The lock
// is device-only, so the local one always wins.
export const mergeBudget = (local: Budget, remote: Budget): Budget => {
  const localMod = local.modifiedAt || 0;
  const remoteMod = remote.modifiedAt || 0;
  // Budget-level scalar fields (name, householdSettings) use whole-budget LWW.
  const base = remoteMod > localMod ? remote : local;
  const deletions = mergeDeletions(local.deletions, remote.deletions);
  const categories = addCategoriesToBudget(
    { ...local, deletedCategories: mergeDeletions(local.deletedCategories, remote.deletedCategories) },
    remote.customCategories || []
  );

  return {
    ...base,
    expenses: mergeEntities(local.expenses, remote.expenses, localMod, remoteMod, deletions),
    people: mergeEntities(local.people, remote.people, localMod, remoteMod, deletions),
    deletions,
    customCategories: categories.customCategories,
    deletedCategories: categories.deletedCategories,
    modifiedAt: Math.max(localMod, remoteMod),
    lock: local.lock,
  };
};

// JSON.stringify with object keys sorted, for comparing budgets by content.
// Postgres jsonb stores keys in its own order, so a plain stringify of the
// server copy never matches an identical local copy.
export const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v
  );

// The shared copy of a budget: everything except this device's lock.
export const toServerBudget = (budget: Budget): Omit<Budget, 'lock'> => {
  const { lock: _lock, ...shared } = budget;
  return shared;
};

const sameContent = (a: Budget, b: Budget): boolean =>
  stableStringify(toServerBudget(a)) === stableStringify(toServerBudget(b));

// A budget deleted on this device stays deleted unless it was edited afterwards.
const isTombstoned = (budget: Budget, deletedBudgets: Record<string, number> = {}): boolean => {
  const deletedAt = deletedBudgets[budget.id];
  return typeof deletedAt === 'number' && deletedAt >= (budget.modifiedAt || 0);
};

const newBudgetId = () => `budget_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

type ServerBudget = { id: string; data: Budget; revision: number };

export type SyncResult =
  | { ok: true; data: AppDataV2; sharing: Record<string, BudgetSharing> }
  | { ok: false; error: unknown };

// Write a merged budget back, conditional on the revision it was merged
// against. If someone else wrote in between, merge with their copy and retry.
const writeBudget = async (budget: Budget, server: ServerBudget): Promise<Budget> => {
  let toWrite = budget;
  let current = server;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (sameContent(toWrite, current.data)) return toWrite;
    const { data: updated, error } = await supabase
      .from('budgets')
      .update({ data: toServerBudget(toWrite) })
      .eq('id', toWrite.id)
      .eq('revision', current.revision)
      .select('revision');
    if (error) throw error;
    if (updated.length === 1) return toWrite;

    const { data: fresh, error: fetchError } = await supabase
      .from('budgets')
      .select('id, data, revision')
      .eq('id', toWrite.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!fresh) return toWrite; // Deleted meanwhile; the next sync drops it.
    current = fresh as ServerBudget;
    toWrite = mergeBudget(toWrite, current.data);
  }
  throw new Error('Budget kept changing during save');
};

// Create a budget that has never been on the server, with the user as owner.
// If its id is already taken by a budget the user can't see, it gets a new id.
const createBudget = async (budget: Budget): Promise<Budget> => {
  let toCreate = budget;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.rpc('create_budget', {
      p_id: toCreate.id,
      p_data: toServerBudget(toCreate),
    });
    if (!error) return toCreate;
    if (error.code !== '23505') throw error;
    toCreate = { ...toCreate, id: newBudgetId() };
  }
  throw new Error('Could not create budget');
};

// Before shared budgets, the account's budgets lived in user_data. Fold any
// still there (from this update's first run, or from a not-yet-updated device)
// into the local copy, then empty them out of user_data.
const absorbLegacyBudgets = async (
  userId: string,
  local: AppDataV2
): Promise<{ data: AppDataV2; clear: (() => Promise<void>) | null }> => {
  const { data: row, error } = await supabase
    .from('user_data')
    .select('app_data, revision')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !row || !Array.isArray(row.app_data?.budgets) || row.app_data.budgets.length === 0) {
    return { data: local, clear: null };
  }

  const legacy = validateAppData(row.app_data);
  const byId = new Map(local.budgets.map((b) => [b.id, b]));
  for (const budget of legacy.budgets) {
    if (isTombstoned(budget, local.deletedBudgets)) continue;
    const existing = byId.get(budget.id);
    byId.set(budget.id, existing ? mergeBudget(existing, budget) : budget);
  }

  const clear = async () => {
    await supabase
      .from('user_data')
      .update({ app_data: { version: 2, budgets: [], activeBudgetId: '' } })
      .eq('user_id', userId)
      .eq('revision', row.revision);
  };
  return { data: { ...local, budgets: Array.from(byId.values()) }, clear };
};

// Fold the sync result into the device copy as it is now: anything saved on
// this device while the sync was talking to the server is merged in, not lost.
const reconcile = (snapshot: AppDataV2, synced: AppDataV2, latest: AppDataV2): AppDataV2 => {
  const before = new Map(snapshot.budgets.map((b) => [b.id, b]));
  const now = new Map(latest.budgets.map((b) => [b.id, b]));
  const deletedBudgets = mergeDeletions(synced.deletedBudgets, latest.deletedBudgets);
  const budgets: Budget[] = [];
  for (const budget of synced.budgets) {
    const current = now.get(budget.id);
    if (!current && before.has(budget.id)) continue; // Deleted meanwhile.
    // Merging is idempotent, so an unchanged device copy just yields `budget`.
    budgets.push(current ? mergeBudget(current, budget) : budget);
  }
  // Budgets created meanwhile haven't been synced yet; keep them for next time.
  for (const budget of latest.budgets) {
    if (!before.has(budget.id) && !budgets.some((b) => b.id === budget.id)) budgets.push(budget);
  }
  let activeBudgetId = latest.activeBudgetId;
  if (!budgets.some((b) => b.id === activeBudgetId)) {
    activeBudgetId = budgets.some((b) => b.id === synced.activeBudgetId) ? synced.activeBudgetId : budgets[0]?.id || '';
  }
  return { version: 2, budgets, activeBudgetId, deletedBudgets };
};

const syncOnce = async (userId: string, load: () => Promise<AppDataV2>): Promise<SyncResult> => {
  try {
    const snapshot = await load();
    const { data: local, clear: clearLegacy } = await absorbLegacyBudgets(userId, snapshot);

    const [budgetsRes, membersRes] = await Promise.all([
      supabase.from('budgets').select('id, data, revision'),
      supabase.from('budget_members').select('budget_id, user_id, role'),
    ]);
    if (budgetsRes.error) throw budgetsRes.error;
    if (membersRes.error) throw membersRes.error;

    const sharing: Record<string, BudgetSharing> = {};
    for (const m of membersRes.data) {
      const entry = sharing[m.budget_id] || { role: 'editor', memberCount: 0 };
      entry.memberCount += 1;
      if (m.user_id === userId) entry.role = m.role as BudgetSharing['role'];
      sharing[m.budget_id] = entry;
    }

    const server = new Map((budgetsRes.data as ServerBudget[]).map((b) => [b.id, b]));
    const localById = new Map(local.budgets.map((b) => [b.id, b]));
    const deletedBudgets = { ...(local.deletedBudgets || {}) };
    const syncedIds = new Set(await loadSyncedBudgetIds());
    const result: Budget[] = [];

    // Budgets on the server: merge, or remove ones this device deleted.
    for (const remote of server.values()) {
      const mine = localById.get(remote.id);
      if (!mine && isTombstoned(remote.data, deletedBudgets)) {
        // Deleted here. Delete it outright if nobody else shares it; otherwise
        // just leave, and it carries on for the others.
        const access = sharing[remote.id];
        const { error } =
          access?.role === 'owner' && access.memberCount <= 1
            ? await supabase.from('budgets').delete().eq('id', remote.id)
            : await supabase.from('budget_members').delete().eq('budget_id', remote.id).eq('user_id', userId);
        if (error) throw error;
        syncedIds.delete(remote.id);
        delete sharing[remote.id];
        continue;
      }
      // A budget new to this device arrives unlocked; locks are set per device.
      const merged = mine ? mergeBudget(mine, remote.data) : { ...remote.data, lock: { locked: false, autoLockMinutes: 0 } };
      result.push(await writeBudget(merged, remote));
      syncedIds.add(remote.id);
    }

    // Budgets only on this device: new ones are created; ones the server used
    // to have were deleted by their owner or the user was removed, so drop them.
    for (const budget of local.budgets) {
      if (server.has(budget.id)) continue;
      if (syncedIds.has(budget.id)) {
        syncedIds.delete(budget.id);
        deletedBudgets[budget.id] = Date.now();
        continue;
      }
      const created = await createBudget(budget);
      result.push(created);
      syncedIds.add(created.id);
      sharing[created.id] = { role: 'owner', memberCount: 1 };
    }

    await saveSyncedBudgetIds(Array.from(syncedIds));
    if (clearLegacy) await clearLegacy();

    let activeBudgetId = local.activeBudgetId;
    if (!result.some((b) => b.id === activeBudgetId)) activeBudgetId = result[0]?.id || '';

    // Keep the device's order, with newly arrived budgets at the end.
    const order = new Map(local.budgets.map((b, i) => [b.id, i]));
    result.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));

    const synced: AppDataV2 = { version: 2, budgets: result, activeBudgetId, deletedBudgets };
    return { ok: true, data: reconcile(snapshot, synced, await load()), sharing };
  } catch (error) {
    return { ok: false, error };
  }
};

// One sync at a time: overlapping passes would race to create the same budget.
// `load` reads the device copy when the pass starts and again when it ends.
let queue: Promise<unknown> = Promise.resolve();

export const syncBudgets = (userId: string, load: () => Promise<AppDataV2>): Promise<SyncResult> => {
  const run = queue.then(() => syncOnce(userId, load));
  queue = run.catch(() => undefined);
  return run;
};
