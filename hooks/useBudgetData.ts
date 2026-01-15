
import { useState, useEffect, useCallback, useRef } from 'react';
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
const safeAsync = async <T>(
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
const safeAsyncResult = async <T>(
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

export const useBudgetData = () => {
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

  // Stable refresh function that doesn't depend on other state
  const refreshFromStorage = useCallback(async () => {
    console.log('useBudgetData: refreshFromStorage called');
    try {
      const loadedApp = await safeAsync(
        () => loadAppData(),
        { version: 2, budgets: [], activeBudgetId: '' },
        'loadAppData'
      );

      console.log('useBudgetData: loaded app data:', {
        budgetsCount: loadedApp.budgets?.length || 0,
        activeBudgetId: loadedApp.activeBudgetId,
        budgetNames: loadedApp.budgets?.map(b => b.name) || []
      });

      setAppData(loadedApp);
      const active = getActiveBudget(loadedApp);
      if (active) {
        console.log('useBudgetData: active budget:', {
          id: active.id,
          name: active.name,
          peopleCount: active.people?.length || 0,
          expensesCount: active.expenses?.length || 0
        });
        setData({ people: active.people, expenses: active.expenses, householdSettings: active.householdSettings });
      } else {
        console.log('useBudgetData: no active budget found - first-time user state');
        setData({
          people: [],
          expenses: [],
          householdSettings: { distributionMethod: 'even' },
        });
      }
    } catch (error) {
      console.error('useBudgetData: Error in refreshFromStorage:', error);
      // Set safe fallback state
      setAppData({ version: 2, budgets: [], activeBudgetId: '' });
      setData({
        people: [],
        expenses: [],
        householdSettings: { distributionMethod: 'even' },
      });
    }
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

  // Supabase sync effect
  useEffect(() => {
    const syncWithSupabase = async () => {
      if (!user) return;

      console.log('useBudgetData: Syncing with Supabase for user:', user.id);
      setIsSyncing(true);

      try {
        const { data: supabaseData, error } = await supabase
          .from('user_data')
          .select('app_data')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('useBudgetData: Supabase fetch error:', error);
          return;
        }

        if (supabaseData?.app_data) {
          console.log('useBudgetData: Data found on Supabase, comparing with local...');
          const remoteData = supabaseData.app_data as AppDataV2;

          // Simple conflict resolution: Remote wins for now if it exists
          // In a more complex app, we'd check timestamps
          await saveAppData(remoteData);
          await refreshFromStorage();
          setRefreshTrigger(prev => prev + 1);
        } else {
          console.log('useBudgetData: No data on Supabase, pushing local data...');
          const currentLocal = await loadAppData();
          if (currentLocal.budgets.length > 0) {
            await supabase.from('user_data').upsert({
              user_id: user.id,
              app_data: currentLocal
            });
          }
        }
      } catch (err) {
        console.error('useBudgetData: Sync failed:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    syncWithSupabase();
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

  // Atomic save operation with immediate state update
  const saveData = useCallback(
    async (newData: BudgetSlice): Promise<{ success: boolean; error?: Error }> => {
      try {
        console.log('useBudgetData: Atomic save operation started:', {
          peopleCount: newData.people?.length || 0,
          expensesCount: newData.expenses?.length || 0,
          expenseIds: newData.expenses?.map((e) => e.id) || [],
          distributionMethod: newData.householdSettings?.distributionMethod,
        });

        // Update state immediately for optimistic updates
        setData(newData);

        // Ensure we have a valid active budget to update
        const baseApp = appData.budgets.length > 0 ? appData : await safeAsync(
          () => loadAppData(),
          { version: 2, budgets: [], activeBudgetId: '' },
          'saveData-loadAppData'
        );

        const active = getActiveBudget(baseApp);
        if (!active || !active.id) {
          throw new Error('Active budget not available - cannot save data without a budget');
        }

        // Create updated active budget object and persist via storage v2 API
        const updatedActive: Budget = {
          ...active,
          ...newData,
        };

        const result = await safeAsyncResult(
          () => storageUpdateBudget(updatedActive),
          'storageUpdateBudget'
        );

        if (result.success) {
          console.log('useBudgetData: Data saved successfully');
          // Also update appData's active budget in memory to keep in sync
          const activeId = appData.activeBudgetId || active.id;
          const budgets = appData.budgets.length ? appData.budgets.map((b) => (b.id === activeId ? updatedActive : b)) : [updatedActive];
          const fullAppData = { version: 2 as const, activeBudgetId: activeId, budgets };

          setAppData(fullAppData);

          // Push to Supabase if user is logged in
          if (user) {
            console.log('useBudgetData: Pushing update to Supabase...');
            supabase.from('user_data').upsert({
              user_id: user.id,
              app_data: fullAppData
            }).then(({ error }) => {
              if (error) console.error('useBudgetData: Supabase push error:', error);
              else console.log('useBudgetData: Supabase sync successful');
            });
          }

          return { success: true };
        } else {
          console.error('useBudgetData: Save failed, reverting state:', result.error);
          // Revert state by reloading from storage
          await refreshFromStorage();
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('useBudgetData: Error in atomic save operation:', error);
        // Revert state by reloading from storage
        try {
          await refreshFromStorage();
        } catch (refreshError) {
          console.error('useBudgetData: Error reverting state:', refreshError);
        }
        return { success: false, error: error as Error };
      }
    },
    [appData, refreshFromStorage]
  );

  // Budget management APIs with comprehensive error handling
  const addBudget = useCallback(
    async (name: string) => {
      console.log('useBudgetData: addBudget called with name:', name);

      // Use setTimeout to defer the async operation and prevent UI blocking
      return new Promise<{ success: boolean; error?: Error; budget?: Budget }>((resolve) => {
        setTimeout(async () => {
          try {
            const res = await safeAsyncResult(
              () => storageAddBudget(name),
              'storageAddBudget'
            );
            console.log('useBudgetData: addBudget storage result:', res);
            if (res.success) {
              console.log('useBudgetData: addBudget success, refreshing from storage');
              try {
                await refreshFromStorage();
                // Trigger a refresh to ensure components re-render with new data
                setRefreshTrigger(prev => prev + 1);
              } catch (error) {
                console.error('useBudgetData: Error refreshing after addBudget:', error);
              }
            }
            resolve(res);
          } catch (error) {
            console.error('useBudgetData: Error in addBudget:', error);
            resolve({ success: false, error: error as Error });
          }
        }, 0);
      });
    },
    [refreshFromStorage]
  );

  const renameBudget = useCallback(
    async (budgetId: string, newName: string) => {
      // Use setTimeout to defer the async operation and prevent UI blocking
      return new Promise<{ success: boolean; error?: Error }>((resolve) => {
        setTimeout(async () => {
          try {
            const res = await safeAsyncResult(
              () => storageRenameBudget(budgetId, newName),
              'storageRenameBudget'
            );
            if (res.success) {
              try {
                await refreshFromStorage();
                setRefreshTrigger(prev => prev + 1);
              } catch (error) {
                console.error('useBudgetData: Error refreshing after renameBudget:', error);
              }
            }
            resolve(res);
          } catch (error) {
            console.error('useBudgetData: Error in renameBudget:', error);
            resolve({ success: false, error: error as Error });
          }
        }, 0);
      });
    },
    [refreshFromStorage]
  );

  const deleteBudget = useCallback(
    async (budgetId: string) => {
      console.log('useBudgetData: deleteBudget called with budgetId:', budgetId);

      // Use setTimeout to defer the async operation and prevent UI blocking
      return new Promise<{ success: boolean; error?: Error }>((resolve) => {
        setTimeout(async () => {
          try {
            const res = await safeAsyncResult(
              () => storageDeleteBudget(budgetId),
              'storageDeleteBudget'
            );
            console.log('useBudgetData: deleteBudget storage result:', res);
            if (res.success) {
              console.log('useBudgetData: deleteBudget success, refreshing from storage');
              try {
                await refreshFromStorage();
                setRefreshTrigger(prev => prev + 1);
              } catch (error) {
                console.error('useBudgetData: Error refreshing after deleteBudget:', error);
              }
            }
            resolve(res);
          } catch (error) {
            console.error('useBudgetData: Error in deleteBudget:', error);
            resolve({ success: false, error: error as Error });
          }
        }, 0);
      });
    },
    [refreshFromStorage]
  );

  const duplicateBudget = useCallback(
    async (budgetId: string, customName?: string) => {
      console.log('useBudgetData: duplicateBudget called with:', { budgetId, customName });

      // Use setTimeout to defer the async operation and prevent UI blocking
      return new Promise<{ success: boolean; error?: Error; budget?: Budget }>((resolve) => {
        setTimeout(async () => {
          try {
            const res = await safeAsyncResult(
              () => storageDuplicateBudget(budgetId, customName),
              'storageDuplicateBudget'
            );
            console.log('useBudgetData: duplicateBudget storage result:', res);
            if (res.success) {
              console.log('useBudgetData: duplicateBudget success, refreshing from storage');
              try {
                await refreshFromStorage();
                setRefreshTrigger(prev => prev + 1);
              } catch (error) {
                console.error('useBudgetData: Error refreshing after duplicateBudget:', error);
              }
            }
            resolve(res);
          } catch (error) {
            console.error('useBudgetData: Error in duplicateBudget:', error);
            resolve({ success: false, error: error as Error });
          }
        }, 0);
      });
    },
    [refreshFromStorage]
  );

  const setActiveBudget = useCallback(
    async (budgetId: string) => {
      console.log('useBudgetData: setActiveBudget called with:', budgetId);
      const res = await safeAsyncResult(
        () => storageSetActiveBudget(budgetId),
        'storageSetActiveBudget'
      );
      console.log('useBudgetData: setActiveBudget storage result:', res);
      if (res.success) {
        console.log('useBudgetData: setActiveBudget success, refreshing from storage');
        try {
          await refreshFromStorage();
          // Trigger a refresh to ensure components re-render with new data
          setRefreshTrigger(prev => prev + 1);
        } catch (error) {
          console.error('useBudgetData: Error refreshing after setActiveBudget:', error);
        }
      }
      return res;
    },
    [refreshFromStorage]
  );

  const addPerson = useCallback(
    async (person: Person): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Adding person:', person);
      return queueSave(async () => {
        const newData = await createDataCopy();
        newData.people.push(person);
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

        // Remove person and their associated expenses
        newData.people = newData.people.filter((p) => p.id !== personId);
        newData.expenses = newData.expenses.filter((e) => e.personId !== personId);

        console.log('useBudgetData: New data after removing person:', {
          peopleCount: newData.people.length,
          expensesCount: newData.expenses.length,
        });

        return await saveData(newData);
      });
    },
    [queueSave, createDataCopy, saveData]
  );

  const updatePerson = useCallback(
    async (updatedPerson: Person): Promise<{ success: boolean; error?: Error }> => {
      console.log('useBudgetData: Updating person:', updatedPerson);
      return queueSave(async () => {
        const newData = await createDataCopy();
        newData.people = newData.people.map((p) => (p.id === updatedPerson.id ? updatedPerson : p));
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

      return queueSave(async () => {
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

        // Verify that exactly one expense was removed
        if (originalCount - newCount !== 1) {
          console.error('useBudgetData: Unexpected number of expenses removed:', {
            expected: 1,
            actual: originalCount - newCount,
          });
          throw new Error('Unexpected number of expenses removed');
        }

        return await saveData(newData);
      });
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

        newData.expenses = newData.expenses.map((e) => (e.id === updatedExpense.id ? updatedExpense : e));

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

  // Clear ALL app data - delete all budgets, people, and expenses
  const clearAllData = useCallback(async (): Promise<{ success: boolean; error?: Error }> => {
    console.log('useBudgetData: Clearing ALL app data - deleting all budgets, people, expenses, and custom categories...');
    try {
      const result = await safeAsyncResult(
        () => storageClearAllAppData(),
        'storageClearAllAppData'
      );
      if (result.success) {
        console.log('useBudgetData: All app data cleared successfully, refreshing from storage');
        try {
          await refreshFromStorage();
          // Multiple refresh triggers to ensure all components update
          setRefreshTrigger(prev => prev + 1);
          // Add a small delay and trigger again to ensure layout updates
          setTimeout(() => {
            setRefreshTrigger(prev => prev + 1);
          }, 50);
        } catch (error) {
          console.error('useBudgetData: Error refreshing after clearAllData:', error);
        }
      }
      return result;
    } catch (error) {
      console.error('useBudgetData: Error clearing all app data:', error);
      return { success: false, error: error as Error };
    }
  }, [refreshFromStorage]);

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
