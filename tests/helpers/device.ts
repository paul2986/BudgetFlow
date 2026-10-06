import { vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createMemoryStorage } from './memoryStorage';
import { anonClient, type TestUser } from './localSupabase';
import type { AppDataV2, BudgetSharing } from '../../types/budget';

const SUPABASE_MODULE = fileURLToPath(new URL('../../utils/supabase.ts', import.meta.url));

// One device signed in as `user`: its own storage and its own copy of the
// app's storage and sync modules (they keep state in module scope). Pass the
// `disk` of an earlier device to sign a different account in on the same one,
// or to open a second tab on it. `claim: false` skips the session-start claim.
export const createDevice = async (user: TestUser, disk = createMemoryStorage(), { claim = true } = {}) => {
  vi.resetModules();
  vi.doMock('@react-native-async-storage/async-storage', () => ({ default: disk }));
  vi.doMock(SUPABASE_MODULE, () => ({
    supabase: user.client,
    // The account's password, checked on a client of its own as the app does.
    verifyAccountPassword: async (email: string, password: string) => {
      const { error } = await anonClient().auth.signInWithPassword({ email, password });
      return !error;
    },
  }));
  const storage = await import('../../utils/storage');
  const sync = await import('../../utils/budgetSync');
  const lock = await import('../../utils/budgetLock');
  const lockActions = await import('../../utils/budgetLockActions');

  // What useBudgetData does when the session starts.
  if (claim) await storage.claimDeviceData(user.id);

  const device = {
    user,
    disk,
    storage,
    // The budget lock rules and what the lock screens do, on this device.
    lock,
    lockActions,
    sharing: {} as Record<string, BudgetSharing>,
    load: () => storage.loadAppData(),
    // One sync pass (it saves its result to the device).
    sync: async (): Promise<AppDataV2> => {
      const result = await sync.syncBudgets(user.id, storage.loadAppData);
      if (!result.ok) throw result.error;
      device.sharing = result.sharing;
      return storage.loadAppData();
    },
    // A sync pass without waiting for it, for overlapping passes.
    syncNow: () => sync.syncBudgets(user.id, storage.loadAppData),
    // A sync pass on this device for some other account's id.
    syncAs: (userId: string) => sync.syncBudgets(userId, storage.loadAppData),
    // Edit a budget on this device the way the app's save does.
    edit: async (budgetId: string, change: (b: AppDataV2['budgets'][number]) => void) => {
      const data = await storage.loadAppData();
      const budget = data.budgets.find((b) => b.id === budgetId);
      if (!budget) throw new Error(`${budgetId} is not on this device`);
      change(budget);
      budget.modifiedAt = Date.now();
      await storage.saveAppData(data);
    },
  };
  return device;
};

export type Device = Awaited<ReturnType<typeof createDevice>>;
