import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, ReactNode } from 'react';
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
import { newId } from '../utils/ids';
import { createChangeBatch, forgetRevisions } from '../utils/realtimeGate';
import type { ImportedBudget } from '../utils/budgetWorkbook/import';

// Local type for the editable slice of a budget
type BudgetSlice = {
  people: Person[];
  expenses: Expense[];
  householdSettings: HouseholdSettings;
};

type SaveResult = { success: boolean; error?: Error };

// The person with this id in a draft of the budget's data.
const personIn = (draft: BudgetSlice, personId: string): Person => {
  const person = draft.people.find((p) => p.id === personId);
  if (!person) throw new Error('Person not found');
  return person;
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
  const [isSyncing, setIsSyncing] = useState(false);

  // Save operation queue to prevent concurrent saves
  const saveQueue = useRef<(() => Promise<SaveResult>)[]>([]);
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

  // The active budget's data as stored now. Operations always start from storage,
  // never from what a screen last rendered.
  const getCurrentData = useCallback(async (): Promise<BudgetSlice> => {
    const active = getActiveBudget(await loadAppData());
    return active
      ? { people: active.people, expenses: active.expenses, householdSettings: active.householdSettings }
      : { people: [], expenses: [], householdSettings: { distributionMethod: 'even' } };
  }, []);

  // A copy of the stored data that an operation can change freely: the first load
  // after launch hands out the cache itself, which must not be edited in place.
  const createDataCopy = useCallback(async (): Promise<BudgetSlice> => {
    const current = await getCurrentData();
    return {
      people: current.people.map((person) => ({ ...person, income: person.income.map((income) => ({ ...income })) })),
      expenses: current.expenses.map((expense) => ({ ...expense })),
      householdSettings: { ...current.householdSettings },
    };
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
      forgetRevisions();
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
    // Changes arrive in bursts; sync once for the burst, and only if something in it is
    // news. The server announces our own saves back to us too (see realtimeGate).
    const changes = createChangeBatch();
    const syncSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (changes.needsSync()) refreshFromStorage();
      }, 400);
    };
    const refreshSoon = () => {
      changes.otherChanged();
      syncSoon();
    };
    const channel = supabase
      .channel(`budgets:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, (change) => {
        changes.budgetChanged(change);
        syncSoon();
      })
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
    <R extends SaveResult>(saveFn: () => Promise<R>): Promise<R> => {
      return new Promise((resolve) => {
        const wrappedSaveFn = async (): Promise<SaveResult> => {
          try {
            const result = await saveFn();
            resolve(result);
            return result;
          } catch (error) {
            const errorResult = { success: false, error: error as Error };
            resolve(errorResult as R);
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

  // Sync with the server after a local change, with Settings' "Syncing…" showing.
  const syncAfterChange = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await pushToCloud();
    } catch (error) {
      console.error('useBudgetData: Supabase sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [user, pushToCloud]);

  // Atomic save operation with immediate state update.
  // `deletedIds` records tombstones for removed people/expenses so the deletion
  // survives a later merge with another device that still has those entities.
  const saveData = useCallback(
    async (newData: BudgetSlice, deletedIds?: string[]): Promise<SaveResult> => {
      try {
        // Update state immediately for optimistic updates
        setData(newData);

        // ALWAYS load the absolute latest app data from storage to avoid stale state
        const fullAppData = await loadAppData();
        const active = getActiveBudget(fullAppData);
        if (!active || !active.id) throw new Error('Active budget not available');

        // `...newData` (the editable slice) has no `deletions` key, so the existing
        // tombstones from `...active` are preserved; stamp any newly deleted ids.
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

        const updatedAppData = {
          ...fullAppData,
          budgets: fullAppData.budgets.map((b) => (b.id === active.id ? updatedActive : b)),
        };

        const result = await saveAppData(updatedAppData);
        if (!result.success) {
          // Don't refresh from storage here - it would overwrite our changes
          console.error('useBudgetData: Local save failed:', result.error);
          return { success: false, error: result.error };
        }
        setAppData(updatedAppData);
        await syncAfterChange();
        return { success: true };
      } catch (error) {
        console.error('useBudgetData: Error in atomic save operation:', error);
        return { success: false, error: error as Error };
      }
    },
    [syncAfterChange]
  );

  const syncFullAppData = useCallback(async (updatedAppData: AppDataV2): Promise<SaveResult> => {
    // Show it at once, then persist and sync.
    setAppData(updatedAppData);
    const active = getActiveBudget(updatedAppData);
    if (active) {
      setData({
        people: active.people || [],
        expenses: active.expenses || [],
        householdSettings: active.householdSettings || { distributionMethod: 'even' }
      });
    }
    const localRes = await saveAppData(updatedAppData);
    if (!localRes.success) {
      console.error('useBudgetData: Local save failed during sync');
      return localRes;
    }
    await syncAfterChange();
    return { success: true };
  }, [syncAfterChange]);

  // A change made by a storage function (the budget list, categories, the open
  // budget): run it, then show the result and sync it, queued with the other saves.
  const storageOp = useCallback(
    <R extends SaveResult>(op: () => Promise<R>): Promise<R> =>
      queueSave(async () => {
        const res = await op();
        if (res.success) await syncFullAppData(await loadAppData());
        return res;
      }),
    [queueSave, syncFullAppData]
  );

  // A change to the active budget's people, expenses or household settings: `edit`
  // changes a copy of what is stored (throwing cancels with that error), then it is
  // saved. It returns the ids it deleted, so the deletion syncs, or `false` when
  // nothing changed and there is nothing to save.
  const editData = useCallback(
    (edit: (draft: BudgetSlice) => string[] | false | void | Promise<string[] | false | void>) =>
      queueSave(async (): Promise<SaveResult> => {
        const draft = await createDataCopy();
        const deleted = await edit(draft);
        if (deleted === false) return { success: true };
        return saveData(draft, deleted || undefined);
      }),
    [queueSave, createDataCopy, saveData]
  );

  const addBudget = useCallback((name: string) => storageOp(() => storageAddBudget(name)), [storageOp]);

  const renameBudget = useCallback(
    (budgetId: string, newName: string) => storageOp(() => storageRenameBudget(budgetId, newName)),
    [storageOp]
  );

  // Delete a budget. When it's shared and the user owns it, it's deleted for
  // everyone, which needs the server now; otherwise the next sync handles it.
  const deleteBudget = useCallback(
    (budgetId: string) =>
      storageOp(async () => {
        const access = sharing[budgetId];
        if (access?.role === 'owner' && access.memberCount > 1) {
          const { error } = await supabase.from('budgets').delete().eq('id', budgetId);
          if (error) return { success: false, error: new Error('Couldn’t delete the budget. Check your connection and try again.') };
        }
        return storageDeleteBudget(budgetId);
      }),
    [storageOp, sharing]
  );

  // Stop sharing a budget someone else owns. It leaves this account's devices;
  // the others keep it. Allowed even when it's the only budget here.
  const leaveBudget = useCallback((budgetId: string) => storageOp(() => storageDeleteBudget(budgetId, true)), [storageOp]);

  const duplicateBudget = useCallback(
    (budgetId: string, customName?: string) => storageOp(() => storageDuplicateBudget(budgetId, customName)),
    [storageOp]
  );

  // Add a budget read from a spreadsheet as a new budget and switch to it.
  const importBudget = useCallback((draft: ImportedBudget) => storageOp(() => storageImportBudget(draft)), [storageOp]);

  // Custom categories belong to the active budget and sync with it.
  const saveCustomCategories = useCallback(
    (categories: string[]) => storageOp(() => storageSaveCustomCategories(categories)),
    [storageOp]
  );

  const renameCustomCategory = useCallback(
    (oldName: string, newName: string) => storageOp(() => storageRenameCustomCategory(oldName, newName)),
    [storageOp]
  );

  // Which budget-review bucket a category counts towards (null: its default),
  // shared with everyone on the budget.
  const setCategoryBucket = useCallback(
    (category: string, bucket: BucketId | null) => storageOp(() => storageSetCategoryBucket(category, bucket)),
    [storageOp]
  );

  const setActiveBudget = useCallback((budgetId: string) => storageOp(() => storageSetActiveBudget(budgetId)), [storageOp]);

  const addPerson = useCallback(
    (person: Person) =>
      editData((draft) => {
        draft.people.push({ ...person, updatedAt: Date.now() });
      }),
    [editData]
  );

  const removePerson = useCallback(
    (personId: string) =>
      editData((draft) => {
        personIn(draft, personId);
        // Remove the person and their expenses, tombstoning every removed id.
        const removedExpenseIds = draft.expenses.filter((e) => e.personId === personId).map((e) => e.id);
        draft.people = draft.people.filter((p) => p.id !== personId);
        draft.expenses = draft.expenses.filter((e) => e.personId !== personId);
        return [personId, ...removedExpenseIds];
      }),
    [editData]
  );

  const updatePerson = useCallback(
    (updatedPerson: Person) =>
      editData((draft) => {
        draft.people = draft.people.map((p) => (p.id === updatedPerson.id ? { ...updatedPerson, updatedAt: Date.now() } : p));
      }),
    [editData]
  );

  const addIncome = useCallback(
    (personId: string, income: Income) =>
      editData((draft) => {
        const person = personIn(draft, personId);
        person.income.push(income);
        person.updatedAt = Date.now();
      }),
    [editData]
  );

  const removeIncome = useCallback(
    (personId: string, incomeId: string) =>
      editData((draft) => {
        const person = personIn(draft, personId);
        if (!person.income.some((i) => i.id === incomeId)) throw new Error('Income not found');
        person.income = person.income.filter((i) => i.id !== incomeId);
        person.updatedAt = Date.now();
      }),
    [editData]
  );

  const updateIncome = useCallback(
    (personId: string, incomeId: string, updates: Partial<Income>) =>
      editData((draft) => {
        const person = personIn(draft, personId);
        const index = person.income.findIndex((i) => i.id === incomeId);
        if (index === -1) throw new Error('Income not found');
        person.income[index] = { ...person.income[index], ...updates };
        person.updatedAt = Date.now();
      }),
    [editData]
  );

  const addExpense = useCallback(
    (expense: Expense) =>
      editData((draft) => {
        draft.expenses.push({ ...expense, id: expense.id || newId('expense'), updatedAt: Date.now() });
      }),
    [editData]
  );

  const removeExpense = useCallback(
    (expenseId: string) =>
      editData((draft) => {
        if (!draft.expenses.some((e) => e.id === expenseId)) throw new Error('Expense not found');
        draft.expenses = draft.expenses.filter((e) => e.id !== expenseId);
        return [expenseId];
      }),
    [editData]
  );

  const updateExpense = useCallback(
    (updatedExpense: Expense) =>
      editData((draft) => {
        if (!draft.expenses.some((e) => e.id === updatedExpense.id)) throw new Error('Expense not found');
        draft.expenses = draft.expenses.map((e) => (e.id === updatedExpense.id ? { ...updatedExpense, updatedAt: Date.now() } : e));
      }),
    [editData]
  );

  // The bulk calls below make one save for the whole selection. Looping
  // updateExpense/removeExpense would save locally and push to the cloud once
  // per expense.
  const bulkEditExpenses = useCallback(
    async (ids: string[], patch: BulkEditPatch): Promise<SaveResult & { result?: BulkEditResult }> => {
      let outcome: BulkEditResult | undefined;
      const res = await editData(async (draft) => {
        const active = getActiveBudget(await loadAppData());
        outcome = applyBulkEdit(draft.expenses, ids, patch, Date.now(), categoryBucketLookup(active?.categoryBuckets));
        if (outcome.changedIds.length === 0) return false;
        draft.expenses = outcome.expenses;
      });
      return { ...res, result: res.success ? outcome : undefined };
    },
    [editData]
  );

  // Undo for bulkEditExpenses: puts back each expense that is still exactly as
  // the edit left it (same `updatedAt`), so a later edit to one isn't undone.
  const undoBulkEdit = useCallback(
    (result: BulkEditResult) =>
      editData((draft) => {
        const before = new Map(result.previous.map((e) => [e.id, e]));
        const restoredAt = Date.now();
        let restored = 0;
        draft.expenses = draft.expenses.map((e) => {
          const old = before.get(e.id);
          if (!old || e.updatedAt !== result.stampedAt) return e;
          restored++;
          return { ...old, updatedAt: restoredAt };
        });
        if (restored === 0) return false;
      }),
    [editData]
  );

  const removeExpenses = useCallback(
    async (ids: string[]): Promise<SaveResult & { removed: number }> => {
      let removed = 0;
      const res = await editData((draft) => {
        const doomed = new Set(ids);
        const gone = draft.expenses.filter((e) => doomed.has(e.id)).map((e) => e.id);
        if (gone.length === 0) return false;
        draft.expenses = draft.expenses.filter((e) => !doomed.has(e.id));
        removed = gone.length;
        return gone;
      });
      return { ...res, removed: res.success ? removed : 0 };
    },
    [editData]
  );

  const updateHouseholdSettings = useCallback(
    (settings: Partial<HouseholdSettings>) =>
      editData((draft) => {
        draft.householdSettings = { ...draft.householdSettings, ...settings };
      }),
    [editData]
  );

  // Screens call this when they come into focus, and only need the device copy: pass
  // `cloud` to also pull from the server (joining a budget, the sharing screen).
  // Unless `force`, it skips while a save is running or one just ran (a refresh
  // already in flight is joined by refreshFromStorage, not repeated).
  const refreshData = useCallback(
    async (force: boolean = false, cloud: boolean = false) => {
      if (!force && (isQueueRunning.current || Date.now() - lastRefreshTimeRef.current < 500)) return;
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
  const clearAllData = useCallback(async (): Promise<SaveResult> => {
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
      return { success: true };
    } catch (error) {
      console.error('useBudgetData: Error in clearAllData:', error);
      setIsSyncing(false);
      return { success: false, error: error as Error };
    }
  }, [user, pushToCloud, showAppData]);

  const activeBudget = useMemo(() => getActiveBudget(appData), [appData]);
  const customCategories = useMemo(() => (activeBudget?.customCategories || []).map((c) => c.name), [activeBudget]);
  const isLoading = loading || (!!user && readyFor !== user.id);

  // One value until something it holds changes, so a parent re-render alone
  // doesn't re-render every screen that reads it.
  return useMemo(
    () => ({
      appData,
      activeBudget,
      data,
      loading: isLoading,
      saving,
      isSyncing,
      user,
      // budget ops
      addBudget,
      renameBudget,
      deleteBudget,
      leaveBudget,
      duplicateBudget,
      importBudget,
      setActiveBudget,
      customCategories,
      sharing,
      saveCustomCategories,
      renameCustomCategory,
      setCategoryBucket,
      // ops scoped to the active budget
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
    }),
    [
      appData, activeBudget, data, isLoading, saving, isSyncing, user, sharing, customCategories,
      addBudget, renameBudget, deleteBudget, leaveBudget, duplicateBudget, importBudget, setActiveBudget,
      saveCustomCategories, renameCustomCategory, setCategoryBucket,
      addPerson, removePerson, updatePerson, addIncome, removeIncome, updateIncome,
      addExpense, removeExpense, updateExpense, bulkEditExpenses, undoBulkEdit, removeExpenses,
      updateHouseholdSettings, clearAllData, refreshData,
    ]
  );
};
