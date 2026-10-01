import React, { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
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
  updateBudget as storageUpdateBudget,
  clearAllAppData as storageClearAllAppData,
  saveAppData,
  claimDeviceData,
  saveCustomExpenseCategories as storageSaveCustomCategories,
  renameCustomExpenseCategory as storageRenameCustomCategory,
} from '../utils/storage';
import { Person, Expense, Income, HouseholdSettings, AppDataV2, Budget, BudgetSharing } from '../types/budget';
import { supabase } from '../utils/supabase';
import { syncBudgets, stableStringify } from '../utils/budgetSync';
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

  // Show app data in the UI: the full set, and the active budget's editable slice.
  const showAppData = useCallback((app: AppDataV2) => {
    setAppData(app);
    const active = getActiveBudget(app);
    setData(
      active
        ? {
          people: active.people || [],
          expenses: active.expenses || [],
          householdSettings: active.householdSettings || { distributionMethod: 'even' },
        }
        : { people: [], expenses: [], householdSettings: { distributionMethod: 'even' } }
    );
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
    setSharing(result.sharing);
    if (stableStringify(result.data) !== before) {
      console.log('useBudgetData: Adopting synced budgets');
      showAppData(await loadAppData());
    }
  }, [user, showAppData]);

  // One refresh pass: show the device copy, then sync it when signed in.
  const syncOnce = useCallback(async () => {
    // Don't refresh mid-save: the save syncs when it finishes.
    if (saving || isQueueRunning.current) {
      console.log('useBudgetData: Save in progress, skipping refresh');
      return;
    }
    // Until the device's data is claimed, it may be another account's: don't show it.
    if (user && claimedForRef.current !== user.id) return;
    try {
      showAppData(await loadAppData());
      if (user) await pushToCloud();
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
  const refreshFromStorage = useCallback((): Promise<void> => {
    if (refreshInFlightRef.current) {
      refreshAgainRef.current = true;
      return refreshInFlightRef.current;
    }
    const run = (async () => {
      try {
        do {
          refreshAgainRef.current = false;
          await syncOnceRef.current();
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
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSoon();
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
      supabase.removeChannel(channel);
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
              await pushToCloud();
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
        console.log('useBudgetData: Pushing full app data update to Supabase...');
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

  // Delete a budget. When it's shared and the user owns it, it's deleted for
  // everyone, which needs the server now; otherwise the next sync handles it.
  const deleteBudget = useCallback(
    async (budgetId: string) => queueSave(async () => {
      console.log('useBudgetData: deleteBudget called for', budgetId);
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

  // Clear ALL app data. Budgets only this account uses are deleted everywhere;
  // shared ones are left, and carry on for the people sharing them.
  const clearAllData = useCallback(async (): Promise<{ success: boolean; error?: Error }> => {
    console.log('useBudgetData: ===== CLEARING ALL DATA =====');
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
