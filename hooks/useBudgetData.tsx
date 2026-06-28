import React, { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import {
  loadAppData,
  getActiveBudget,
  setActiveBudget as storageSetActiveBudget,
  addBudget as storageAddBudget,
  renameBudget as storageRenameBudget,
  deleteBudget as storageDeleteBudget,
  duplicateBudget as storageDuplicateBudget,
  updateBudget as storageUpdateBudget,
  clearAllAppData as storageClearAllAppData,
  saveAppData,
} from '../utils/storage';
import { Person, Expense, Income, HouseholdSettings, AppDataV2, Budget } from '../types/budget';
import { supabase } from '../utils/supabase';
import { useAuth } from './useAuth';

// Local type for the editable slice of a budget
type BudgetSlice = {
  people: Person[];
  expenses: Expense[];
  householdSettings: HouseholdSettings;
};

// Helper function to safely handle async operations
const safeAsync = async <T extends unknown>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string
): Promise<T> => {
  try {
    const result = await operation();
    return result;
  } catch (error) {
    console.error(`useBudgetData: Error in ${operationName}:`, error);
    return fallback;
  }
};

// Helper function to safely handle async operations that return result objects
const safeAsyncResult = async <T extends unknown>(
  operation: () => Promise<{ success: boolean; error?: Error } & T>,
  operationName: string
): Promise<{ success: boolean; error?: Error } & T> => {
  try {
    const result = await operation();
    return result;
  } catch (error) {
    console.error(`useBudgetData: Error in ${operationName}:`, error);
    return { success: false, error: error as Error } as { success: boolean; error?: Error } & T;
  }
};

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

// Merge a single budget that exists on both sides, at the entity level.
const mergeBudget = (local: Budget, remote: Budget): Budget => {
  const localMod = local.modifiedAt || 0;
  const remoteMod = remote.modifiedAt || 0;
  // Budget-level scalar fields (name, householdSettings, lock) use whole-budget LWW.
  const base = remoteMod > localMod ? remote : local;
  const deletions = mergeDeletions(local.deletions, remote.deletions);

  return {
    ...base,
    expenses: mergeEntities(local.expenses, remote.expenses, localMod, remoteMod, deletions),
    people: mergeEntities(local.people, remote.people, localMod, remoteMod, deletions),
    deletions,
    modifiedAt: Math.max(localMod, remoteMod),
  };
};

const mergeAppData = (local: AppDataV2, remote: AppDataV2): AppDataV2 => {
  if (!local || !local.budgets) return remote || { version: 2, budgets: [], activeBudgetId: '' };
  if (!remote || !remote.budgets) return local;

  const mergedBudgetsMap = new Map<string, Budget>();

  local.budgets.forEach(b => {
    if (b && b.id) {
      mergedBudgetsMap.set(b.id, b);
    }
  });

  remote.budgets.forEach(remoteBudget => {
    if (!remoteBudget || !remoteBudget.id) return;

    const localBudget = mergedBudgetsMap.get(remoteBudget.id);
    if (!localBudget) {
      // Budget only exists remotely: adopt it. (Whole-budget deletion across
      // devices is not yet tombstoned, so a budget deleted on one device can
      // reappear from another — a known, narrower limitation than data loss.)
      mergedBudgetsMap.set(remoteBudget.id, remoteBudget);
    } else {
      mergedBudgetsMap.set(remoteBudget.id, mergeBudget(localBudget, remoteBudget));
    }
  });

  const mergedBudgets = Array.from(mergedBudgetsMap.values());

  let activeBudgetId = local.activeBudgetId;
  if (activeBudgetId && !mergedBudgetsMap.has(activeBudgetId)) {
    activeBudgetId = remote.activeBudgetId;
  }
  if (!activeBudgetId || !mergedBudgetsMap.has(activeBudgetId)) {
    activeBudgetId = mergedBudgets[0]?.id || '';
  }

  return {
    version: 2,
    budgets: mergedBudgets,
    activeBudgetId
  };
};

// Context Type definition
type BudgetDataContextType = ReturnType<typeof useBudgetDataInternal>;

const BudgetDataContext = createContext<BudgetDataContextType | null>(null);

export const BudgetDataProvider = ({ children }: { children: ReactNode }) => {
  const value = useBudgetDataInternal();
  return (
    <BudgetDataContext.Provider value={value}>
      {children}
    </BudgetDataContext.Provider>
  );
};

export const useBudgetData = () => {
  const context = useContext(BudgetDataContext);
  if (!context) {
    // Fallback to local state if used outside of provider (for safety/backward compatibility)
    return useBudgetDataInternal();
  }
  return context;
};

const useBudgetDataInternal = () => {
  const { user } = useAuth();
  const [appData, setAppData] = useState<AppDataV2>({ version: 2, budgets: [], activeBudgetId: '' });
  const [data, setData] = useState<BudgetSlice>({
    people: [],
    expenses: [],
    householdSettings: { distributionMethod: 'even' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Save operation queue to prevent concurrent saves
  const saveQueue = useRef<(() => Promise<{ success: boolean; error?: Error }>)[]>([]);
  const isQueueRunning = useRef(false);
  const isLoadingRef = useRef(false);
  const lastRefreshTimeRef = useRef<number>(0);
  const justClearedData = useRef(false); // Flag to prevent immediate Supabase sync after clear

  // Stable refresh function that avoids overwriting local state if Supabase has less data
  const refreshFromStorage = useCallback(async () => {
    // DO NOT refresh if we are currently saving or if the queue is running
    // This prevents overwriting the user's just-saved data with stale data from Supabase/Disk
    if (saving || isQueueRunning.current) {
      console.log('useBudgetData: Save in progress, skipping refresh');
      return;
    }

    console.log('useBudgetData: refreshFromStorage called');
    try {
      // 1. Load local data first to have a baseline
      const localApp = await loadAppData();

      // 2. If logged in, fetch from Supabase (unless we just cleared data)
      if (user && !justClearedData.current) {
        console.log('useBudgetData: User present, syncing from Supabase...');
        const { data: supabaseData, error } = await supabase
          .from('user_data')
          .select('app_data')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('useBudgetData: Supabase fetch error:', error);
        }

        if (!error && supabaseData?.app_data) {
          const remoteData = supabaseData.app_data as AppDataV2;

          const merged = mergeAppData(localApp, remoteData);
          const localJson = JSON.stringify(localApp);
          const remoteJson = JSON.stringify(remoteData);
          const mergedJson = JSON.stringify(merged);

          const hasLocalUpdates = mergedJson !== remoteJson;
          const hasRemoteUpdates = mergedJson !== localJson;

          console.log('useBudgetData: Sync conflict check via budget merging', {
            localBudgetsCount: localApp.budgets.length,
            remoteBudgetsCount: remoteData.budgets.length,
            mergedBudgetsCount: merged.budgets.length,
            hasLocalUpdates,
            hasRemoteUpdates
          });

          if (hasRemoteUpdates) {
            console.log('useBudgetData: Cloud data has newer/different budgets, adopting them');
            setAppData(merged);
            const active = getActiveBudget(merged);
            if (active) {
              setData({
                people: active.people || [],
                expenses: active.expenses || [],
                householdSettings: active.householdSettings || { distributionMethod: 'even' }
              });
            }
            await saveAppData(merged);
          } else {
            // Even if no remote changes are merged in, keep our local appData state in sync
            setAppData(localApp);
            const active = getActiveBudget(localApp);
            if (active) {
              setData({
                people: active.people || [],
                expenses: active.expenses || [],
                householdSettings: active.householdSettings || { distributionMethod: 'even' }
              });
            }
          }

          if (hasLocalUpdates) {
            console.log('useBudgetData: Local data has newer/different budgets, pushing merged state to cloud...');
            const { error: pushError } = await supabase.from('user_data').upsert(
              {
                user_id: user.id,
                app_data: merged,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'user_id' }
            );
            if (pushError) console.error('useBudgetData: Failed to push merged state to cloud:', pushError);
            else console.log('useBudgetData: Successfully pushed merged state to cloud');
          }
          return;
        } else if (error && error.code === 'PGRST116') {
          // No cloud data yet, push local if it exists and has real data (unless we just cleared)
          if (localApp.budgets.length > 0 && !justClearedData.current) {
            console.log('useBudgetData: No cloud data, pushing local state to cloud');
            await supabase.from('user_data').upsert(
              {
                user_id: user.id,
                app_data: localApp,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'user_id' }
            );
          } else if (justClearedData.current) {
            console.log('useBudgetData: Skipping cloud push - data was just cleared');
          }
        }
      }

      // Fallback to local if not logged in or Supabase empty/failed (and logic above fell through)
      console.log('useBudgetData: Using local data');
      setAppData(localApp);
      const active = getActiveBudget(localApp);
      if (active) {
        setData({
          people: active.people || [],
          expenses: active.expenses || [],
          householdSettings: active.householdSettings || { distributionMethod: 'even' }
        });
      } else {
        setData({ people: [], expenses: [], householdSettings: { distributionMethod: 'even' } });
      }
    } catch (error) {
      console.error('useBudgetData: Error in refreshFromStorage:', error);
    }
  }, [user, saving]);

  // Function to get the most current data - ALWAYS load from AsyncStorage for operations
  const getCurrentData = useCallback(async (): Promise<BudgetSlice> => {
    console.log('useBudgetData: getCurrentData called, loading fresh app data from AsyncStorage');
    try {
      const loadedApp = await safeAsync(
        () => loadAppData(),
        { version: 2, budgets: [], activeBudgetId: '' },
        'getCurrentData-loadAppData'
      );

      const active = getActiveBudget(loadedApp);
      if (!active) {
        console.log('useBudgetData: No active budget found, returning empty data');
        return {
          people: [],
          expenses: [],
          householdSettings: { distributionMethod: 'even' },
        };
      }
      const freshData: BudgetSlice = {
        people: active.people,
        expenses: active.expenses,
        householdSettings: active.householdSettings,
      };
      console.log('useBudgetData: Fresh data loaded:', {
        peopleCount: freshData.people.length,
        expensesCount: freshData.expenses.length,
        expenseIds: freshData.expenses.map((e) => e.id),
      });
      return freshData;
    } catch (error) {
      console.error('useBudgetData: Error loading fresh data, falling back to state:', error);
      return data;
    }
  }, [data]);

  // Helper function to create deep copy of data for immutability
  const createDataCopy = useCallback(async (sourceData?: BudgetSlice): Promise<BudgetSlice> => {
    try {
      const dataToUse = sourceData || (await getCurrentData());
      const copy: BudgetSlice = {
        people: dataToUse.people.map((person) => ({
          ...person,
          income: [...person.income.map((income) => ({ ...income }))],
        })),
        expenses: [...dataToUse.expenses.map((expense) => ({ ...expense }))],
        householdSettings: { ...dataToUse.householdSettings },
      };
      console.log('useBudgetData: Created data copy:', {
        peopleCount: copy.people.length,
        expensesCount: copy.expenses.length,
        expenseIds: copy.expenses.map((e) => e.id),
      });
      return copy;
    } catch (error) {
      console.error('useBudgetData: Error creating data copy:', error);
      // Return safe fallback
      return {
        people: [],
        expenses: [],
        householdSettings: { distributionMethod: 'even' },
      };
    }
  }, [getCurrentData]);

  // Stable loadData function that doesn't change on every render
  const loadData = useCallback(async () => {
    if (isLoadingRef.current) {
      console.log('useBudgetData: Load already in progress, skipping...');
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      console.log('useBudgetData: Loading app data...');
      await refreshFromStorage();
      lastRefreshTimeRef.current = Date.now();
    } catch (error) {
      console.error('useBudgetData: Error loading budget data:', error);
    } finally {
      // Add a small delay to prevent flickering
      setTimeout(() => {
        setLoading(false);
        isLoadingRef.current = false;
      }, 100);
    }
  }, [refreshFromStorage]);

  // Supabase sync effect - simplified to just trigger on user change
  const hadUserRef = useRef(false);
  useEffect(() => {
    if (user) {
      hadUserRef.current = true;
      refreshFromStorage();
    } else if (hadUserRef.current) {
      // Transitioned from signed-in to signed-out: drop in-memory data so the
      // provider doesn't hold the previous account's budgets (local storage and
      // cache are already wiped by signOut). Guarded so we don't clear during the
      // initial unauthenticated load.
      hadUserRef.current = false;
      setAppData({ version: 2, budgets: [], activeBudgetId: '' });
      setData({ people: [], expenses: [], householdSettings: { distributionMethod: 'even' } });
    }
  }, [user, refreshFromStorage]);

  // Load data only once on mount
  useEffect(() => {
    // Wrap in async function to handle any potential promise rejections
    const initializeData = async () => {
      try {
        await loadData();
      } catch (error) {
        console.error('useBudgetData: Error initializing data:', error);
      }
    };

    initializeData();
  }, [loadData]);

  const runQueue = useCallback(async () => {
    if (isQueueRunning.current) {
      console.log('useBudgetData: Queue already running, skipping');
      return;
    }

    isQueueRunning.current = true;
    console.log('useBudgetData: Starting queue processing');

    while (saveQueue.current.length > 0) {
      const saveFn = saveQueue.current.shift();
      if (saveFn) {
        setSaving(true);
        try {
          await saveFn();
          console.log('useBudgetData: Queue operation completed successfully');
        } catch (error) {
          console.error('useBudgetData: Error during queued save operation:', error);
        } finally {
          setSaving(false);
        }
      }
    }

    isQueueRunning.current = false;
    console.log('useBudgetData: Queue processing completed');
  }, []);

  // Queue save operations to prevent race conditions
  const queueSave = useCallback(
    (saveFn: () => Promise<{ success: boolean; error?: Error }>): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Queueing save operation');

      return new Promise((resolve) => {
        const wrappedSaveFn = async () => {
          try {
            const result = await saveFn();
            resolve(result);
            return result;
          } catch (error) {
            const errorResult = { success: false, error: error as Error };
            resolve(errorResult);
            return errorResult;
          }
        };

        saveQueue.current.push(wrappedSaveFn);

        // Use setTimeout to avoid potential synchronous promise rejection
        setTimeout(() => {
          if (!isQueueRunning.current) {
            runQueue().catch((error) => {
              console.error('useBudgetData: Error running queue:', error);
            });
          }
        }, 0);
      });
    },
    [runQueue]
  );

  // Atomic save operation with immediate state update.
  // `deletedIds` records tombstones for removed people/expenses so the deletion
  // survives a later merge with another device that still has those entities.
  const saveData = useCallback(
    async (newData: BudgetSlice, deletedIds?: string[]): Promise<{ success: boolean; error?: Error }> => {
      try {
        console.log('useBudgetData: ===== SAVE DATA CALLED =====');
        console.log('useBudgetData: Atomic save operation started');
        console.log('useBudgetData: New data to save:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
        });

        // Update state immediately for optimistic updates
        console.log('useBudgetData: Setting optimistic state...');
        setData(newData);

        // ALWAYS load the absolute latest app data from storage to avoid stale state
        console.log('useBudgetData: Loading app data from storage...');
        const fullAppData = await loadAppData();
        const active = getActiveBudget(fullAppData);

        if (!active || !active.id) {
          console.error('useBudgetData: No active budget found!');
          throw new Error('Active budget not available');
        }

        console.log('useBudgetData: Active budget found:', active.id, active.name);

        // Create updated active budget object. `...newData` (the editable slice)
        // has no `deletions` key, so the existing tombstones from `...active` are
        // preserved; we then stamp any newly deleted ids.
        const updatedActive: Budget = {
          ...active,
          ...newData,
          modifiedAt: Date.now(),
        };

        if (deletedIds && deletedIds.length) {
          const now = Date.now();
          const deletions = { ...(active.deletions || {}) };
          deletedIds.forEach((id) => { deletions[id] = now; });
          updatedActive.deletions = deletions;
        }

        console.log('useBudgetData: Updated active budget created');

        // Update in the full app data array
        const updatedBudgets = fullAppData.budgets.map((b) => (b.id === active.id ? updatedActive : b));
        const updatedAppData = { ...fullAppData, budgets: updatedBudgets };

        console.log('useBudgetData: Updated app data created, saving locally...');

        // 1. Save locally
        const result = await saveAppData(updatedAppData);

        console.log('useBudgetData: saveAppData result:', result);

        if (result.success) {
          console.log('useBudgetData: Data saved locally successfully');
          setAppData(updatedAppData);

          // 2. Push to Supabase if user is logged in
          if (user) {
            console.log('useBudgetData: User logged in, syncing mutation to Supabase...');
            setIsSyncing(true);
            try {
              const { error } = await supabase.from('user_data').upsert(
                {
                  user_id: user.id,
                  app_data: updatedAppData,
                  updated_at: new Date().toISOString()
                },
                { onConflict: 'user_id' }
              );
              if (error) throw error;
              console.log('useBudgetData: Supabase mutation sync successful');
            } catch (error) {
              console.error('useBudgetData: Supabase mutation sync error:', error);
            } finally {
              setIsSyncing(false);
            }
          } else {
            console.log('useBudgetData: No user logged in, skipping Supabase sync');
          }

          console.log('useBudgetData: ===== SAVE DATA SUCCESS =====');
          return { success: true };
        } else {
          console.error('useBudgetData: Local save failed:', result.error);
          // Don't refresh from storage here - it would overwrite our changes
          console.log('useBudgetData: ===== SAVE DATA FAILED =====');
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('useBudgetData: Error in atomic save operation:', error);
        // Don't refresh from storage here - it would overwrite our changes
        console.log('useBudgetData: ===== SAVE DATA ERROR =====');
        return { success: false, error: error as Error };
      }
    },
    [user]
  );

  const syncFullAppData = useCallback(async (updatedAppData: AppDataV2) => {
    // 1. Immediately update React state for UI responsiveness
    setAppData(updatedAppData);
    const active = getActiveBudget(updatedAppData);
    if (active) {
      setData({
        people: active.people || [],
        expenses: active.expenses || [],
        householdSettings: active.householdSettings || { distributionMethod: 'even' }
      });
    }

    // 2. Persist to storage
    const localRes = await saveAppData(updatedAppData);
    if (!localRes.success) {
      console.error('useBudgetData: Local save failed during sync');
      return localRes;
    }

    // 3. Sync to Supabase if logged in
    if (user) {
      setIsSyncing(true);
      try {
        console.log('useBudgetData: Pushing full app data update to Supabase...');
        const { error } = await supabase.from('user_data').upsert(
          {
            user_id: user.id,
            app_data: updatedAppData,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );
        if (error) throw error;
        console.log('useBudgetData: Full app data Supabase sync successful');
      } catch (error) {
        console.error('useBudgetData: Supabase sync error:', error);
      } finally {
        setIsSyncing(false);
      }
    }

    // Trigger a refresh for components
    setRefreshTrigger(prev => prev + 1);
    return { success: true };
  }, [user]);

  const addBudget = useCallback(
    async (name: string) => queueSave(async () => {
      console.log('useBudgetData: addBudget called');
      const res = await storageAddBudget(name);
      if (res.success) {
        const updated = await loadAppData();
        await syncFullAppData(updated);
      }
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  const renameBudget = useCallback(
    async (budgetId: string, newName: string) => queueSave(async () => {
      const res = await storageRenameBudget(budgetId, newName);
      if (res.success) {
        const updated = await loadAppData();
        await syncFullAppData(updated);
      }
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  const deleteBudget = useCallback(
    async (budgetId: string) => queueSave(async () => {
      console.log('useBudgetData: deleteBudget called for', budgetId);
      const res = await storageDeleteBudget(budgetId);
      if (res.success) {
        const updated = await loadAppData();
        await syncFullAppData(updated);
      } else {
        console.error('useBudgetData: deleteBudget failed', res.error);
      }
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  const duplicateBudget = useCallback(
    async (budgetId: string, customName?: string) => queueSave(async () => {
      const res = await storageDuplicateBudget(budgetId, customName);
      if (res.success) {
        const updated = await loadAppData();
        await syncFullAppData(updated);
      }
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  const setActiveBudget = useCallback(
    async (budgetId: string) => queueSave(async () => {
      const res = await storageSetActiveBudget(budgetId);
      if (res.success) {
        const updated = await loadAppData();
        await syncFullAppData(updated);
      }
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  const addPerson = useCallback(
    async (person: Person): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Adding person:', person);
      return queueSave(async () => {
        const newData = await createDataCopy();
        newData.people.push({ ...person, updatedAt: Date.now() });
        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const removePerson = useCallback(
    async (personId: string): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Removing person:', personId);
      return queueSave(async () => {
        const newData = await createDataCopy();

        // Verify person exists before attempting removal
        const personExists = newData.people.find((p) => p.id === personId);
        if (!personExists) {
          console.error('useBudgetData: Person not found:', personId);
          throw new Error('Person not found');
        }

        // Remove person and their associated expenses, tombstoning all removed ids
        const removedExpenseIds = newData.expenses.filter((e) => e.personId === personId).map((e) => e.id);
        newData.people = newData.people.filter((p) => p.id !== personId);
        newData.expenses = newData.expenses.filter((e) => e.personId !== personId);

        console.log('useBudgetData: New data after removing person:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
        });

        return await saveData(newData, [personId, ...removedExpenseIds]);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const updatePerson = useCallback(
    async (updatedPerson: Person): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Updating person:', updatedPerson);
      return queueSave(async () => {
        const newData = await createDataCopy();
        newData.people = newData.people.map((p) => (p.id === updatedPerson.id ? { ...updatedPerson, updatedAt: Date.now() } : p));
        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const addIncome = useCallback(
    async (personId: string, income: Income): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Adding income to person:', personId, income);
      return queueSave(async () => {
        const newData = await createDataCopy();

        // Find the person first to verify they exist
        const personIndex = newData.people.findIndex((p) => p.id === personId);
        if (personIndex === -1) {
          console.error('useBudgetData: Person not found:', personId);
          throw new Error('Person not found');
        }

        newData.people[personIndex].income.push(income);
        newData.people[personIndex].updatedAt = Date.now();

        console.log('useBudgetData: New data after adding income:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          incomeCount: newData.people[personIndex].income.length,
        });

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const removeIncome = useCallback(
    async (personId: string, incomeId: string): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Removing income from person:', personId, incomeId);
      return queueSave(async () => {
        const newData = await createDataCopy();

        // Find the person first to verify they exist
        const personIndex = newData.people.findIndex((p) => p.id === personId);
        if (personIndex === -1) {
          console.error('useBudgetData: Person not found:', personId);
          throw new Error('Person not found');
        }

        // Check if the income exists
        const incomeExists = newData.people[personIndex].income.find((i) => i.id === incomeId);
        if (!incomeExists) {
          console.error('useBudgetData: Income not found:', incomeId);
          throw new Error('Income not found');
        }

        // Remove the income
        newData.people[personIndex].income = newData.people[personIndex].income.filter((i) => i.id !== incomeId);
        newData.people[personIndex].updatedAt = Date.now();

        console.log('useBudgetData: New data after removing income:', {
          personId,
          incomeId,
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
          remainingIncomeCount: newData.people[personIndex].income.length,
        });

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const updateIncome = useCallback(
    async (personId: string, incomeId: string, updates: Partial<Income>): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Updating income:', personId, incomeId, updates);
      return queueSave(async () => {
        const newData = await createDataCopy();

        console.log('useBudgetData: Current data for income update:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
        });

        // Find the person first to verify they exist
        const personIndex = newData.people.findIndex((p) => p.id === personId);
        if (personIndex === -1) {
          console.error('useBudgetData: Person not found:', personId);
          throw new Error('Person not found');
        }

        // Check if the income exists
        const incomeIndex = newData.people[personIndex].income.findIndex((i) => i.id === incomeId);
        if (incomeIndex === -1) {
          console.error('useBudgetData: Income not found:', incomeId);
          throw new Error('Income not found');
        }

        // Update the specific income
        newData.people[personIndex].income[incomeIndex] = {
          ...newData.people[personIndex].income[incomeIndex],
          ...updates,
        };
        newData.people[personIndex].updatedAt = Date.now();

        console.log('useBudgetData: New data after updating income:', {
          personId,
          incomeId,
          updates,
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
          updatedIncome: newData.people[personIndex].income[incomeIndex],
        });

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const addExpense = useCallback(
    async (expense: Expense): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Adding expense:', expense);
      return queueSave(async () => {
        const newData = await createDataCopy();

        // Generate a proper ID if not provided
        const expenseWithId = {
          ...expense,
          id: expense.id || `expense_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          updatedAt: Date.now(),
        };

        console.log('useBudgetData: Expense with ID:', expenseWithId);

        newData.expenses.push(expenseWithId);

        console.log('useBudgetData: New data after adding expense:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
        });

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const removeExpense = useCallback(
    async (expenseId: string): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: ===== REMOVE EXPENSE CALLED =====');
      console.log('useBudgetData: Removing expense:', expenseId);

      // First, let's get the current data to verify the expense exists
      const currentData = await getCurrentData();
      console.log('useBudgetData: Current data before expense removal:', {
        expensesCount: currentData.expenses.length,
        expenseIds: currentData.expenses.map((e) => e.id),
        targetExpenseId: expenseId,
      });

      // Verify expense exists before attempting removal
      const expenseExists = currentData.expenses.find((e) => e.id === expenseId);
      if (!expenseExists) {
        console.error('useBudgetData: Expense not found:', expenseId);
        return { success: false, error: new Error('Expense not found') };
      }

      console.log('useBudgetData: Expense found, proceeding with removal:', expenseExists);
      console.log('useBudgetData: About to call queueSave...');

      const result = await queueSave(async () => {
        console.log('useBudgetData: Inside queueSave callback');
        // Get fresh data again for the actual removal operation
        const newData = await createDataCopy();

        console.log('useBudgetData: Fresh data for removal operation:', {
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
          targetExpenseId: expenseId,
        });

        // Double-check the expense still exists in the fresh data
        const expenseStillExists = newData.expenses.find((e) => e.id === expenseId);
        if (!expenseStillExists) {
          console.error('useBudgetData: Expense no longer exists in fresh data:', expenseId);
          throw new Error('Expense no longer exists');
        }

        // Remove the expense
        const originalCount = newData.expenses.length;
        newData.expenses = newData.expenses.filter((e) => e.id !== expenseId);
        const newCount = newData.expenses.length;

        console.log('useBudgetData: Expense removal completed:', {
          expenseId,
          originalCount,
          newCount,
          removed: originalCount - newCount,
          peopleCount: newData.people.length,
          remainingExpenseIds: newData.expenses.map((e) => e.id),
        });

        console.log('useBudgetData: About to call saveData...');
        const saveResult = await saveData(newData, [expenseId]);
        console.log('useBudgetData: saveData result:', saveResult);
        return saveResult;
      });

      console.log('useBudgetData: queueSave completed with result:', result);
      console.log('useBudgetData: ===== REMOVE EXPENSE FINISHED =====');
      return result;
    },
    [queueSave, createDataCopy, saveData, getCurrentData]
  );

  const updateExpense = useCallback(
    async (updatedExpense: Expense): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Updating expense:', updatedExpense);
      return queueSave(async () => {
        const newData = await createDataCopy();

        console.log('useBudgetData: Current data before expense update:', {
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
          targetExpenseId: updatedExpense.id,
        });

        // Verify expense exists before attempting update
        const expenseExists = newData.expenses.find((e) => e.id === updatedExpense.id);
        if (!expenseExists) {
          console.error('useBudgetData: Expense not found for update:', updatedExpense.id);
          throw new Error('Expense not found');
        }

        newData.expenses = newData.expenses.map((e) => (e.id === updatedExpense.id ? { ...updatedExpense, updatedAt: Date.now() } : e));

        console.log('useBudgetData: New data after updating expense:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
        });

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const updateHouseholdSettings = useCallback(
    async (settings: Partial<HouseholdSettings>): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Updating household settings:', settings);
      return queueSave(async () => {
        const newData = await createDataCopy();

        console.log('useBudgetData: Current data before household settings update:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
          oldSettings: newData.householdSettings,
        });

        newData.householdSettings = {
          ...newData.householdSettings,
          ...settings,
        };

        console.log('useBudgetData: New data with updated household settings:', {
          newSettings: newData.householdSettings,
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
          expenseIds: newData.expenses.map((e) => e.id),
        });

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  // Refresh function with improved logic - stable function that doesn't change
  const refreshData = useCallback(
    async (force: boolean = false) => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;

      console.log('useBudgetData: Refresh requested...', {
        force,
        saving,
        loading,
        isLoading: isLoadingRef.current,
        queueRunning: isQueueRunning.current,
        lastRefreshTime: lastRefreshTimeRef.current,
        timeSinceLastRefresh,
      });

      if (isQueueRunning.current && !force) {
        console.log('useBudgetData: Skipping refresh - save operation in progress');
        return;
      }

      if (timeSinceLastRefresh < 500 && !force) {
        console.log('useBudgetData: Skipping refresh - too soon since last refresh');
        return;
      }

      if (isLoadingRef.current) {
        console.log('useBudgetData: Load already in progress, waiting...');
        let attempts = 0;
        while (isLoadingRef.current && attempts < 20) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          attempts++;
        }
        if (isLoadingRef.current) {
          console.log('useBudgetData: Load still in progress after waiting, skipping refresh');
          return;
        }
      }

      console.log('useBudgetData: Executing refresh...');
      try {
        await refreshFromStorage();
        lastRefreshTimeRef.current = Date.now();
      } catch (error) {
        console.error('useBudgetData: Error during refresh:', error);
      }
    },
    [refreshFromStorage, saving, loading] // Remove dependencies that could cause loops
  );

  // Clear ALL app data - delete all budgets, people, and expenses everywhere
  const clearAllData = useCallback(async (): Promise<{ success: boolean; error?: Error }> => {
    console.log('useBudgetData: ===== CLEARING ALL DATA =====');
    try {
      // Set flag to prevent immediate Supabase sync
      justClearedData.current = true;

      // 1. Clear local state FIRST (optimistic)
      const emptyApp = { version: 2 as const, budgets: [], activeBudgetId: '' };
      setAppData(emptyApp);
      setData({ people: [], expenses: [], householdSettings: { distributionMethod: 'even' } });
      console.log('useBudgetData: Local state cleared');

      // 2. Clear local storage
      console.log('useBudgetData: Clearing AsyncStorage...');
      const result = await storageClearAllAppData();
      console.log('useBudgetData: AsyncStorage clear result:', result);

      if (!result.success) {
        console.error('useBudgetData: Failed to clear local storage:', result.error);
        justClearedData.current = false;
        return result;
      }

      // 3. Clear Supabase if logged in - UPDATE with empty data instead of DELETE
      if (user) {
        setIsSyncing(true);
        console.log('useBudgetData: Clearing cloud data for user:', user.id);
        try {
          const emptyCloudData = { version: 2 as const, budgets: [], activeBudgetId: '' };
          const { error } = await supabase
            .from('user_data')
            .upsert(
              {
                user_id: user.id,
                app_data: emptyCloudData,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'user_id' }
            );

          if (error) {
            console.error('useBudgetData: Supabase clear error:', error);
          } else {
            console.log('useBudgetData: Cloud data cleared successfully (set to empty)');
          }
        } catch (error) {
          console.error('useBudgetData: Error clearing Supabase data:', error);
        } finally {
          setIsSyncing(false);
        }
      }

      setRefreshTrigger(prev => prev + 1);

      // Reset the flag after 2 seconds to allow normal syncing to resume
      setTimeout(() => {
        justClearedData.current = false;
        console.log('useBudgetData: justClearedData flag reset, normal sync can resume');
      }, 2000);

      console.log('useBudgetData: ===== ALL DATA CLEARED SUCCESSFULLY =====');
      return { success: true };
    } catch (error) {
      console.error('useBudgetData: Error in clearAllData:', error);
      setIsSyncing(false);
      justClearedData.current = false;
      return { success: false, error: error as Error };
    }
  }, [user]);

  return {
    appData,
    activeBudget: getActiveBudget(appData),
    data,
    loading,
    saving,
    isSyncing,
    user,
    refreshTrigger, // Add this to help components know when data has changed
    // budget ops
    addBudget,
    renameBudget,
    deleteBudget,
    duplicateBudget,
    setActiveBudget,
    // existing ops scoped to active budget
    addPerson,
    removePerson,
    updatePerson,
    addIncome,
    removeIncome,
    updateIncome,
    addExpense,
    removeExpense,
    updateExpense,
    updateHouseholdSettings,
    clearAllData,
    refreshData,
  };
};
