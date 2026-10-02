import { AppDataV2, Budget, BudgetSharing } from '../types/budget';
import { supabase } from './supabase';
import {
  addCategoriesToBudget,
  getDeviceOwner,
  loadSyncedBudgetIds,
  saveAppData,
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
// Returns false when its id is already taken: ids are random, so that means
// it's a copy of a budget that exists but the user can't open (another
// account's, or one they left or were removed from). That copy must never be
// uploaded under a new id; the caller drops it.
const createBudget = async (budget: Budget): Promise<boolean> => {
  const { error } = await supabase.rpc('create_budget', {
    p_id: budget.id,
    p_data: toServerBudget(budget),
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
};

// Before shared budgets, the account's budgets lived in user_data; the
// migration copied them to their own rows. A device still on the old version
// may keep writing there, so fold those edits into budgets that still exist on
// the server, then empty user_data. Budgets found only there are not brought
// back: the old device uploads its own copy once it updates.
const readLegacyBudgets = async (
  userId: string
): Promise<{ budgets: Budget[]; clear: (() => Promise<void>) | null }> => {
  const { data: row, error } = await supabase
    .from('user_data')
    .select('app_data, revision')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !row || !Array.isArray(row.app_data?.budgets) || row.app_data.budgets.length === 0) {
    return { budgets: [], clear: null };
  }
  const clear = async () => {
    await supabase
      .from('user_data')
      .update({ app_data: { version: 2, budgets: [], activeBudgetId: '' } })
      .eq('user_id', userId)
      .eq('revision', row.revision);
  };
  return { budgets: validateAppData(row.app_data).budgets, clear };
};

// Fold the sync result into the device copy as it is now: anything saved on
// this device while the sync was talking to the server is merged in, not lost.
// `settled` are removals the server has now carried out.
const reconcile = (
  snapshot: AppDataV2,
  synced: AppDataV2,
  latest: AppDataV2,
  settled: Set<string>
): AppDataV2 => {
  const before = new Map(snapshot.budgets.map((b) => [b.id, b]));
  const now = new Map(latest.budgets.map((b) => [b.id, b]));
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
  // Pending removals: drop the settled ones, unless the budget was deleted
  // again meanwhile (a newer entry).
  const deletedBudgets = { ...(latest.deletedBudgets || {}) };
  settled.forEach((id) => {
    if (deletedBudgets[id] === snapshot.deletedBudgets?.[id]) delete deletedBudgets[id];
  });
  let activeBudgetId = latest.activeBudgetId;
  if (!budgets.some((b) => b.id === activeBudgetId)) {
    activeBudgetId = budgets.some((b) => b.id === synced.activeBudgetId) ? synced.activeBudgetId : budgets[0]?.id || '';
  }
  return { version: 2, budgets, activeBudgetId, deletedBudgets };
};

const syncOnce = async (userId: string, load: () => Promise<AppDataV2>): Promise<SyncResult> => {
  try {
    // Never upload one account's device data as another's (see claimDeviceData).
    if ((await getDeviceOwner()) !== userId) throw new Error('This device’s data belongs to another account');
    const snapshot = await load();
    const [budgetsRes, membersRes, legacy] = await Promise.all([
      supabase.from('budgets').select('id, data, revision'),
      supabase.from('budget_members').select('budget_id, user_id, role, joined_at'),
      readLegacyBudgets(userId),
    ]);
    if (budgetsRes.error) throw budgetsRes.error;
    if (membersRes.error) throw membersRes.error;

    const sharing: Record<string, BudgetSharing> = {};
    const joinedAt: Record<string, number> = {};
    for (const m of membersRes.data) {
      const entry = sharing[m.budget_id] || { role: 'editor', memberCount: 0 };
      entry.memberCount += 1;
      if (m.user_id === userId) {
        entry.role = m.role as BudgetSharing['role'];
        joinedAt[m.budget_id] = Date.parse(m.joined_at);
      }
      sharing[m.budget_id] = entry;
    }

    const server = new Map((budgetsRes.data as ServerBudget[]).map((b) => [b.id, b]));
    const localById = new Map(snapshot.budgets.map((b) => [b.id, b]));
    for (const old of legacy.budgets) {
      if (!server.has(old.id)) continue;
      const mine = localById.get(old.id);
      localById.set(old.id, mine ? mergeBudget(mine, old) : old);
    }
    const pendingRemovals = snapshot.deletedBudgets || {};
    const settled = new Set<string>();
    const knownSyncedIds = await loadSyncedBudgetIds();
    const syncedIds = new Set(knownSyncedIds);
    const result: Budget[] = [];

    // Budgets on the server: merge, or carry out a removal made on this device.
    for (const remote of server.values()) {
      const mine = localById.get(remote.id);
      const removedAt = pendingRemovals[remote.id];
      if (!mine && typeof removedAt === 'number') {
        if ((joinedAt[remote.id] ?? 0) > removedAt) {
          // They rejoined after removing it here; the removal is stale.
          settled.add(remote.id);
        } else {
          // Delete it outright if nobody else shares it; otherwise just leave,
          // and it carries on for the others.
          const access = sharing[remote.id];
          const { error } =
            access?.role === 'owner' && access.memberCount <= 1
              ? await supabase.from('budgets').delete().eq('id', remote.id)
              : await supabase.from('budget_members').delete().eq('budget_id', remote.id).eq('user_id', userId);
          if (error) throw error;
          settled.add(remote.id);
          syncedIds.delete(remote.id);
          delete sharing[remote.id];
          continue;
        }
      }
      // A budget new to this device arrives unlocked; locks are set per device.
      const merged = mine ? mergeBudget(mine, remote.data) : { ...remote.data, lock: { locked: false, autoLockMinutes: 0 } };
      result.push(await writeBudget(merged, remote));
      syncedIds.add(remote.id);
    }

    // Removals of budgets the server no longer has are already done.
    for (const id of Object.keys(pendingRemovals)) {
      if (!server.has(id)) settled.add(id);
    }

    // Budgets only on this device: new ones are created; ones the server used
    // to have were deleted by their owner or the user was removed, so drop
    // them, as are ones whose id turns out to belong to a budget elsewhere.
    for (const budget of localById.values()) {
      if (server.has(budget.id)) continue;
      if (syncedIds.has(budget.id)) {
        syncedIds.delete(budget.id);
        continue;
      }
      if (await createBudget(budget)) {
        result.push(budget);
        syncedIds.add(budget.id);
        sharing[budget.id] = { role: 'owner', memberCount: 1 };
      }
    }

    const nowSyncedIds = Array.from(syncedIds);
    if (nowSyncedIds.length !== knownSyncedIds.length || nowSyncedIds.some((id) => !knownSyncedIds.includes(id))) {
      await saveSyncedBudgetIds(nowSyncedIds);
    }
    if (legacy.clear) await legacy.clear();

    let activeBudgetId = snapshot.activeBudgetId;
    if (!result.some((b) => b.id === activeBudgetId)) activeBudgetId = result[0]?.id || '';

    // Keep the device's order, with newly arrived budgets at the end.
    const order = new Map(snapshot.budgets.map((b, i) => [b.id, i]));
    result.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));

    // Saved here, inside the queue, so the next pass starts from this result;
    // otherwise it would re-create budgets this pass gave new ids.
    const synced: AppDataV2 = { version: 2, budgets: result, activeBudgetId };
    const current = await load();
    const data = reconcile(snapshot, synced, current, settled);
    // The usual pass finds nothing new: rewriting every budget (validated twice, written,
    // read back) each time was the bulk of the work behind every screen change.
    if (stableStringify(data) !== stableStringify(current)) {
      const saved = await saveAppData(data);
      if (!saved.success) throw saved.error;
    }
    return { ok: true, data, sharing };
  } catch (error) {
    return { ok: false, error };
  }
};

// One sync at a time: overlapping passes would race to create the same budget.
// `load` reads the device copy when the pass starts and again when it ends;
// the merged result is saved to the device before the next pass begins.
let queue: Promise<unknown> = Promise.resolve();

// Several tabs of the web app share one device storage but run separately, so
// on web the passes also take turns across tabs (Web Locks), or two tabs could
// each save their own view of the device data over the other's.
const withDeviceLock = <T>(task: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' ? (navigator as { locks?: LockManager }).locks : undefined;
  return locks ? locks.request('budgetflow-sync', task) : task();
};

export const syncBudgets = (userId: string, load: () => Promise<AppDataV2>): Promise<SyncResult> => {
  const run = queue.then(() => withDeviceLock(() => syncOnce(userId, load)));
  queue = run.catch(() => undefined);
  return run;
};
