import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  loadAppData,
  getActiveBudget,
  setActiveBudget as storageSetActiveBudget,
  addBudget as storageAddBudget,
  renameBudget as storageRenameBudget,
  deleteBudget as storageDeleteBudget,
  duplicateBudget as storageDuplicateBudget,
  importBudget as storageImportBudget,
  clearAllAppData as storageClearAllAppData,
  saveAppData,
  claimDeviceData,
  rememberActiveBudget,
  saveCustomExpenseCategories as storageSaveCustomCategories,
  renameCustomExpenseCategory as storageRenameCustomCategory,
  setCategoryBucket as storageSetCategoryBucket,
} from '../utils/storage';
import { Person, Expense, Income, HouseholdSettings, AppDataV2, Budget, BudgetSharing, BucketId } from '../types/budget';
import { supabase } from '../utils/supabase';
import { syncBudgets, stableStringify } from '../utils/budgetSync';
import { applyBulkEdit, type BulkEditPatch, type BulkEditResult } from '../utils/bulkEdit';
import { categoryBucketLookup } from '../utils/budgetReview';
import { useAuth } from './useAuth';
import type { ImportedBudget } from '../utils/budgetWorkbook/import';

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
  // Every caller is inside the provider (app/_layout.tsx). A fallback that built a
  // second store here would call a hook conditionally and sync on its own, so fail loudly.
  if (!context) throw new Error('useBudgetData must be used within a BudgetDataProvider');
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
  // Each synced budget's role and member count for the signed-in user.
  const [sharing, setSharing] = useState<Record<string, BudgetSharing>>({});
  // The account this device's data has been claimed for (see claimDeviceData).
  // Syncs wait for it, so they never run against another account's data.
  const claimedForRef = useRef<string | null>(null);
  // The account whose budgets have been shown at least once since sign-in. Until
  // then the empty in-memory data isn't "no budgets", it's "not loaded yet".
  const [readyFor, setReadyFor] = useState<string | null>(null);

  // What is on screen now, for showAppData to compare against.
  const appDataRef = useRef(appData);
  appDataRef.current = appData;
  const dataRef = useRef(data);
  dataRef.current = data;

  // Show app data in the UI: the full set, and the active budget's editable slice.
  const showAppData = useCallback((app: AppDataV2) => {
    const active = getActiveBudget(app);
    const slice: BudgetSlice = active
      ? {
        people: active.people || [],
        expenses: active.expenses || [],
        householdSettings: active.householdSettings || { distributionMethod: 'even' },
      }
      : { people: [], expenses: [], householdSettings: { distributionMethod: 'even' } };
    // Every focus refreshes, and storage hands back a fresh deep copy each time. Swapping
    // identical data for new objects re-renders and recalculates every mounted screen
    // right as the next one slides in (blank or janky frames on a phone), so leave the
    // state alone when nothing differs from what's showing.
    if (
      stableStringify(app) === stableStringify(appDataRef.current) &&
      stableStringify(slice) === stableStringify(dataRef.current)
    ) {
      return;
    }
    setAppData(app);
    setData(slice);
  }, []);

  // Sync every budget with the server. The device copy is read when the pass
  // runs (so it includes the latest save); the sync saves the merged result,
  // and the UI picks it up when it differs.
  const pushToCloud = useCallback(async () => {
    if (!user || claimedForRef.current !== user.id) return;
    const before = stableStringify(await loadAppData());
    const result = await syncBudgets(user.id, loadAppData);
    if (!result.ok) {
      console.error('useBudgetData: Sync failed:', result.error);
      return;
    }
    // Same reason: a sync that finds nothing new shouldn't hand every screen a new object.
    setSharing((prev) => (stableStringify(prev) === stableStringify(result.sharing) ? prev : result.sharing));
    if (stableStringify(result.data) !== before) {
      showAppData(await loadAppData());
    }
  }, [user, showAppData]);

  // One refresh pass: show the device copy, then (when `cloud`) sync it when signed in.
  // Moving between screens only needs the device copy; the cloud sync is for sign-in,
  // Realtime changes, returning to the app, and saves.
  const syncOnce = useCallback(async (cloud: boolean) => {
    // Don't refresh mid-save: the save syncs when it finishes.
    if (saving || isQueueRunning.current) {
      return;
    }
    // Until the device's data is claimed, it may be another account's: don't show it.
    if (user && claimedForRef.current !== user.id) return;
    try {
      showAppData(await loadAppData());
      if (user && cloud) await pushToCloud();
    } catch (error) {
      console.error('useBudgetData: Error in refreshFromStorage:', error);
    }
  }, [user, saving, pushToCloud, showAppData]);
  const syncOnceRef = useRef(syncOnce);
  syncOnceRef.current = syncOnce;

  // Mount, sign-in and focus all ask for a refresh, often at once. Run one sync
  // at a time: parallel passes each push to the cloud and bump the revision
  // under one another until a write gives up. A call made mid-sync joins it and
  // gets one more pass afterwards, so changes made meanwhile still sync.
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshAgainRef = useRef(false);
  // A cloud sync asked for while a pass is running still happens, in the next pass.
  const cloudWantedRef = useRef(false);
  const refreshFromStorage = useCallback((cloud: boolean = true): Promise<void> => {
    if (cloud) cloudWantedRef.current = true;
    if (refreshInFlightRef.current) {
      refreshAgainRef.current = true;
      return refreshInFlightRef.current;
    }
    const run = (async () => {
      try {
        do {
          refreshAgainRef.current = false;
          const withCloud = cloudWantedRef.current;
          cloudWantedRef.current = false;
          await syncOnceRef.current(withCloud);
        } while (refreshAgainRef.current);
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = run;
    return run;
  }, []);

  // Function to get the most current data - ALWAYS load from AsyncStorage for operations
  const getCurrentData = useCallback(async (): Promise<BudgetSlice> => {
    try {
      const loadedApp = await safeAsync(
        () => loadAppData(),
        { version: 2, budgets: [], activeBudgetId: '' },
        'getCurrentData-loadAppData'
      );

      const active = getActiveBudget(loadedApp);
      if (!active) {
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
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
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

  // When an account's session starts, make sure the device's data is its own
  // (another account's is wiped), then sync.
  const hadUserRef = useRef(false);
  useEffect(() => {
    if (user) {
      hadUserRef.current = true;
      claimDeviceData(user.id)
        .then(async () => {
          claimedForRef.current = user.id;
          // A returning device already has this account's budgets: show them now.
          // A fresh one has to wait for the first sync before it can say "none".
          if ((await loadAppData()).budgets.length > 0) setReadyFor(user.id);
          return refreshFromStorage();
        })
        .catch((error) => console.error('useBudgetData: Could not claim device data:', error))
        .finally(() => setReadyFor(user.id));
    } else if (hadUserRef.current) {
      // Transitioned from signed-in to signed-out: drop in-memory data so the
      // provider doesn't hold the previous account's budgets (local storage and
      // cache are already wiped by signOut). Guarded so we don't clear during the
      // initial unauthenticated load.
      hadUserRef.current = false;
      claimedForRef.current = null;
      setReadyFor(null);
      setSharing({});
      setAppData({ version: 2, budgets: [], activeBudgetId: '' });
      setData({ people: [], expenses: [], householdSettings: { distributionMethod: 'even' } });
    }
  }, [user, refreshFromStorage]);

  // Signing out wipes the device's budgets, so note which one is open for the
  // sync to return to after the next sign-in.
  const openBudgetId = appData.activeBudgetId;
  useEffect(() => {
    if (!user || !openBudgetId || claimedForRef.current !== user.id) return;
    rememberActiveBudget(user.id, openBudgetId).catch((error) =>
      console.error('useBudgetData: Could not remember the open budget:', error)
    );
  }, [user, openBudgetId]);

  // Pick up other people's (and other devices') changes as they happen: the
  // server announces changes to budgets and memberships this user can see, and
  // returning to the app catches anything missed while it was in the background.
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshFromStorage(), 400);
    };
    const channel = supabase
      .channel(`budgets:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, refreshSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_members' }, refreshSoon)
      .subscribe();
    // A lock turned on, off or changed on another device. On a channel of its own: a
    // subscription Realtime can't set up (say, a database that hasn't got the table yet)
    // fails the whole channel, and must not take the budgets' live updates with it.
    const lockChannel = supabase
      .channel(`budget_locks:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_locks' }, refreshSoon)
      .subscribe();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSoon();
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
      supabase.removeChannel(channel);
      supabase.removeChannel(lockChannel);
    };
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
      return;
    }

    isQueueRunning.current = true;

    while (saveQueue.current.length > 0) {
      const saveFn = saveQueue.current.shift();
      if (saveFn) {
        setSaving(true);
        try {
          await saveFn();
        } catch (error) {
          console.error('useBudgetData: Error during queued save operation:', error);
        } finally {
          setSaving(false);
        }
      }
    }

    isQueueRunning.current = false;
  }, []);

  // Queue save operations to prevent race conditions
  const queueSave = useCallback(
    (saveFn: () => Promise<{ success: boolean; error?: Error }>): Promise<{ success: boolean; error?: Error }> => {
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
        // Update state immediately for optimistic updates
        setData(newData);

        // ALWAYS load the absolute latest app data from storage to avoid stale state
        const fullAppData = await loadAppData();
        const active = getActiveBudget(fullAppData);

        if (!active || !active.id) {
          console.error('useBudgetData: No active budget found!');
          throw new Error('Active budget not available');
        }

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

        // Update in the full app data array
        const updatedBudgets = fullAppData.budgets.map((b) => (b.id === active.id ? updatedActive : b));
        const updatedAppData = { ...fullAppData, budgets: updatedBudgets };

        // 1. Save locally
        const result = await saveAppData(updatedAppData);

        if (result.success) {
          setAppData(updatedAppData);

          // 2. Push to Supabase if user is logged in
          if (user) {
            setIsSyncing(true);
            try {
              await pushToCloud();
            } catch (error) {
              console.error('useBudgetData: Supabase mutation sync error:', error);
            } finally {
              setIsSyncing(false);
            }
          }

          return { success: true };
        } else {
          console.error('useBudgetData: Local save failed:', result.error);
          // Don't refresh from storage here - it would overwrite our changes
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('useBudgetData: Error in atomic save operation:', error);
        // Don't refresh from storage here - it would overwrite our changes
        return { success: false, error: error as Error };
      }
    },
    [user, pushToCloud]
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
        await pushToCloud();
      } catch (error) {
        console.error('useBudgetData: Supabase sync error:', error);
      } finally {
        setIsSyncing(false);
      }
    }

    // Trigger a refresh for components
    setRefreshTrigger(prev => prev + 1);
    return { success: true };
  }, [user, pushToCloud]);

  const addBudget = useCallback(
    async (name: string) => queueSave(async () => {
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

  // Delete a budget. When it's shared and the user owns it, it's deleted for
  // everyone, which needs the server now; otherwise the next sync handles it.
  const deleteBudget = useCallback(
    async (budgetId: string) => queueSave(async () => {
      const access = sharing[budgetId];
      if (access?.role === 'owner' && access.memberCount > 1) {
        const { error } = await supabase.from('budgets').delete().eq('id', budgetId);
        if (error) return { success: false, error: new Error('Couldn’t delete the budget. Check your connection and try again.') };
      }
      const res = await storageDeleteBudget(budgetId);
      if (res.success) {
        const updated = await loadAppData();
        await syncFullAppData(updated);
      } else {
        console.error('useBudgetData: deleteBudget failed', res.error);
      }
      return res;
    }),
    [queueSave, syncFullAppData, sharing]
  );

  // Stop sharing a budget someone else owns. It leaves this account's devices;
  // the others keep it. Allowed even when it's the only budget here.
  const leaveBudget = useCallback(
    async (budgetId: string) => queueSave(async () => {
      const res = await storageDeleteBudget(budgetId, true);
      if (res.success) await syncFullAppData(await loadAppData());
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

  // Add a budget read from a spreadsheet as a new budget and switch to it.
  const importBudget = useCallback(
    async (draft: ImportedBudget) => queueSave(async () => {
      const res = await storageImportBudget(draft);
      if (res.success) await syncFullAppData(await loadAppData());
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  // Custom categories are account-wide and sync with the rest of the app data.
  const saveCustomCategories = useCallback(
    async (categories: string[]) => queueSave(async () => {
      const res = await storageSaveCustomCategories(categories);
      if (res.success) await syncFullAppData(await loadAppData());
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  const renameCustomCategory = useCallback(
    async (oldName: string, newName: string) => queueSave(async () => {
      const res = await storageRenameCustomCategory(oldName, newName);
      if (res.success) await syncFullAppData(await loadAppData());
      return res;
    }),
    [queueSave, syncFullAppData]
  );

  // Which budget-review bucket a category counts towards (null: its default),
  // shared with everyone on the budget.
  const setCategoryBucket = useCallback(
    async (category: string, bucket: BucketId | null) => queueSave(async () => {
      const res = await storageSetCategoryBucket(category, bucket);
      if (res.success) await syncFullAppData(await loadAppData());
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

        return await saveData(newData, [personId, ...removedExpenseIds]);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const updatePerson = useCallback(
    async (updatedPerson: Person): Promise<{ success: boolean; error?: Error }> => {
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

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const removeIncome = useCallback(
    async (personId: string, incomeId: string): Promise<{ success: boolean; error?: Error }> => {
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

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const updateIncome = useCallback(
    async (personId: string, incomeId: string, updates: Partial<Income>): Promise<{ success: boolean; error?: Error }> => {
      return queueSave(async () => {
        const newData = await createDataCopy();

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

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const addExpense = useCallback(
    async (expense: Expense): Promise<{ success: boolean; error?: Error }> => {
      return queueSave(async () => {
        const newData = await createDataCopy();

        // Generate a proper ID if not provided
        const expenseWithId = {
          ...expense,
          id: expense.id || `expense_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          updatedAt: Date.now(),
        };

        newData.expenses.push(expenseWithId);

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const removeExpense = useCallback(
    async (expenseId: string): Promise<{ success: boolean; error?: Error }> => {
      // First, let's get the current data to verify the expense exists
      const currentData = await getCurrentData();

      // Verify expense exists before attempting removal
      const expenseExists = currentData.expenses.find((e) => e.id === expenseId);
      if (!expenseExists) {
        console.error('useBudgetData: Expense not found:', expenseId);
        return { success: false, error: new Error('Expense not found') };
      }

      const result = await queueSave(async () => {
        // Get fresh data again for the actual removal operation
        const newData = await createDataCopy();

        // Double-check the expense still exists in the fresh data
        const expenseStillExists = newData.expenses.find((e) => e.id === expenseId);
        if (!expenseStillExists) {
          console.error('useBudgetData: Expense no longer exists in fresh data:', expenseId);
          throw new Error('Expense no longer exists');
        }

        // Remove the expense
        newData.expenses = newData.expenses.filter((e) => e.id !== expenseId);

        const saveResult = await saveData(newData, [expenseId]);
        return saveResult;
      });

      return result;
    },
    [queueSave, createDataCopy, saveData, getCurrentData]
  );

  const updateExpense = useCallback(
    async (updatedExpense: Expense): Promise<{ success: boolean; error?: Error }> => {
      return queueSave(async () => {
        const newData = await createDataCopy();

        // Verify expense exists before attempting update
        const expenseExists = newData.expenses.find((e) => e.id === updatedExpense.id);
        if (!expenseExists) {
          console.error('useBudgetData: Expense not found for update:', updatedExpense.id);
          throw new Error('Expense not found');
        }

        newData.expenses = newData.expenses.map((e) => (e.id === updatedExpense.id ? { ...updatedExpense, updatedAt: Date.now() } : e));

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  // The bulk calls below make one save for the whole selection. Looping
  // updateExpense/removeExpense would save locally and push to the cloud once
  // per expense.
  const bulkEditExpenses = useCallback(
    async (
      ids: string[],
      patch: BulkEditPatch
    ): Promise<{ success: boolean; error?: Error; result?: BulkEditResult }> => {
      let outcome: BulkEditResult | undefined;
      const res = await queueSave(async () => {
        const newData = await createDataCopy();
        const active = getActiveBudget(await loadAppData());
        const result = applyBulkEdit(newData.expenses, ids, patch, Date.now(), categoryBucketLookup(active?.categoryBuckets));
        outcome = result;
        if (result.changedIds.length === 0) return { success: true };
        newData.expenses = result.expenses;
        return saveData(newData);
      });
      return { ...res, result: res.success ? outcome : undefined };
    },
    [queueSave, createDataCopy, saveData]
  );

  // Undo for bulkEditExpenses: puts back each expense that is still exactly as
  // the edit left it (same `updatedAt`), so a later edit to one isn't undone.
  const undoBulkEdit = useCallback(
    async (result: BulkEditResult): Promise<{ success: boolean; error?: Error }> =>
      queueSave(async () => {
        const newData = await createDataCopy();
        const before = new Map(result.previous.map((e) => [e.id, e]));
        const restoredAt = Date.now();
        let restored = 0;
        newData.expenses = newData.expenses.map((e) => {
          const old = before.get(e.id);
          if (!old || e.updatedAt !== result.stampedAt) return e;
          restored++;
          return { ...old, updatedAt: restoredAt };
        });
        if (restored === 0) return { success: true };
        return saveData(newData);
      }),
    [queueSave, createDataCopy, saveData]
  );

  const removeExpenses = useCallback(
    async (ids: string[]): Promise<{ success: boolean; error?: Error; removed: number }> => {
      let removed = 0;
      const res = await queueSave(async () => {
        const newData = await createDataCopy();
        const doomed = new Set(ids);
        const gone = newData.expenses.filter((e) => doomed.has(e.id)).map((e) => e.id);
        if (gone.length === 0) return { success: true };
        newData.expenses = newData.expenses.filter((e) => !doomed.has(e.id));
        removed = gone.length;
        return saveData(newData, gone);
      });
      return { ...res, removed: res.success ? removed : 0 };
    },
    [queueSave, createDataCopy, saveData]
  );

  const updateHouseholdSettings = useCallback(
    async (settings: Partial<HouseholdSettings>): Promise<{ success: boolean; error?: Error }> => {
      return queueSave(async () => {
        const newData = await createDataCopy();

        newData.householdSettings = {
          ...newData.householdSettings,
          ...settings,
        };

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  // Refresh function with improved logic - stable function that doesn't change
  // Screens call this when they come into focus, and only need the device copy: pass
  // `cloud` to also pull from the server (joining a budget, the sharing screen).
  const refreshData = useCallback(
    async (force: boolean = false, cloud: boolean = false) => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;

      if (isQueueRunning.current && !force) {
        return;
      }

      if (timeSinceLastRefresh < 500 && !force) {
        return;
      }

      if (isLoadingRef.current) {
        let attempts = 0;
        while (isLoadingRef.current && attempts < 20) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          attempts++;
        }
        if (isLoadingRef.current) {
          return;
        }
      }

      try {
        await refreshFromStorage(cloud);
        lastRefreshTimeRef.current = Date.now();
      } catch (error) {
        console.error('useBudgetData: Error during refresh:', error);
      }
    },
    [refreshFromStorage]
  );

  // Clear ALL app data. Budgets only this account uses are deleted everywhere;
  // shared ones are left, and carry on for the people sharing them.
  const clearAllData = useCallback(async (): Promise<{ success: boolean; error?: Error }> => {
    try {
      showAppData({ version: 2, budgets: [], activeBudgetId: '' });
      const result = await storageClearAllAppData();
      if (!result.success) {
        console.error('useBudgetData: Failed to clear local storage:', result.error);
        return result;
      }
      if (user) {
        setIsSyncing(true);
        try {
          await pushToCloud();
        } finally {
          setIsSyncing(false);
        }
      }
      setRefreshTrigger(prev => prev + 1);
      return { success: true };
    } catch (error) {
      console.error('useBudgetData: Error in clearAllData:', error);
      setIsSyncing(false);
      return { success: false, error: error as Error };
    }
  }, [user, pushToCloud, showAppData]);

  return {
    appData,
    activeBudget: getActiveBudget(appData),
    data,
    loading: loading || (!!user && readyFor !== user.id),
    saving,
    isSyncing,
    user,
    refreshTrigger, // Add this to help components know when data has changed
    // budget ops
    addBudget,
    renameBudget,
    deleteBudget,
    leaveBudget,
    duplicateBudget,
    importBudget,
    setActiveBudget,
    customCategories: (getActiveBudget(appData)?.customCategories || []).map((c) => c.name),
    sharing,
    saveCustomCategories,
    renameCustomCategory,
    setCategoryBucket,
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
    bulkEditExpenses,
    undoBulkEdit,
    removeExpenses,
    updateHouseholdSettings,
    clearAllData,
    refreshData,
  };
};
