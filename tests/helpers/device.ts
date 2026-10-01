import { vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createMemoryStorage } from './memoryStorage';
import type { TestUser } from './localSupabase';
import type { AppDataV2, BudgetSharing } from '../../types/budget';

const SUPABASE_MODULE = fileURLToPath(new URL('../../utils/supabase.ts', import.meta.url));

// One device signed in as `user`: its own storage and its own copy of the
// app's storage and sync modules (they keep state in module scope).
export const createDevice = async (user: TestUser) => {
  const disk = createMemoryStorage();
  vi.resetModules();
  vi.doMock('@react-native-async-storage/async-storage', () => ({ default: disk }));
  vi.doMock(SUPABASE_MODULE, () => ({ supabase: user.client }));
  const storage = await import('../../utils/storage');
  const sync = await import('../../utils/budgetSync');

  const device = {
    user,
    storage,
    sharing: {} as Record<string, BudgetSharing>,
    load: () => storage.loadAppData(),
    // One sync pass, adopted the way useBudgetData does it.
    sync: async (): Promise<AppDataV2> => {
      const result = await sync.syncBudgets(user.id, storage.loadAppData);
      if (!result.ok) throw result.error;
      await storage.saveAppData(result.data);
      device.sharing = result.sharing;
      return storage.loadAppData();
    },
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
