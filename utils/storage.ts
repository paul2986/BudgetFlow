
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImportedBudget } from './budgetWorkbook/import';
import { AppDataV2, BucketId, Budget, CategoryBucketEntry, CustomCategory, Expense, Person, ExpenseCategory, DEFAULT_CATEGORIES, BudgetLockSettings, HouseholdSettings, debtRepaymentForCategory } from '../types/budget';
import { NO_ATTEMPTS, unlockSession, type AttemptState } from './budgetLock';
import { newId } from './ids';

// Storage keys for versions
const STORAGE_KEYS = {
  // The retired single-budget key (v1). Never read now; still cleared on sign-out
  // and erase, so nothing is left behind on a device that once held it.
  BUDGET_DATA: 'budget_data',
  // New multi-budget app data key (v2)
  APP_DATA_V2: 'app_data_v2',
  EXPENSES_FILTERS: 'expenses_filters_v1',
  // This account's chosen expense list sort, kept on the device like filters.
  EXPENSES_SORT: 'expenses_sort_v1',
  // Legacy device-only custom categories; now synced on each budget and
  // absorbed from here on first load.
  CUSTOM_EXPENSE_CATEGORIES: 'custom_expense_categories_v1',
  // Ids of budgets this device has seen on the server, so a budget missing
  // from the server later is known to be deleted rather than new.
  SYNCED_BUDGET_IDS: 'synced_budget_ids_v1',
  // The account the budget data on this device belongs to.
  DEVICE_OWNER: 'device_owner_v1',
  // Wrong budget-lock codes per budget on this device, so quitting the app doesn't clear the wait.
  LOCK_ATTEMPTS: 'lock_attempts_v1',
  // The budget each account last had open here, by account id. Unlike the budgets it
  // survives sign-out, so signing back in returns to it. Holds ids only, no budget data.
  LAST_ACTIVE_BUDGETS: 'last_active_budgets_v1',
};

// Budgets are always listed oldest first, wherever they came from (the server
// returns them in no particular order). Budgets with the same date keep the order
// they arrived in.
export const sortBudgetsByCreated = <T extends { createdAt: number }>(budgets: T[]): T[] =>
  budgets
    .map((budget, index) => ({ budget, index }))
    .sort((a, b) => a.budget.createdAt - b.budget.createdAt || a.index - b.index)
    .map(({ budget }) => budget);

// Normalize and validate category names
export const normalizeCategoryName = (name: any): string => {
  if (typeof name !== 'string') return 'Misc';
  // Allow only letters, numbers and spaces
  let cleaned = name.replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Misc';
  // Title Case
  cleaned = cleaned
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
  // Enforce max length 20
  if (cleaned.length > 20) cleaned = cleaned.slice(0, 20).trim();
  return cleaned;
};

// Defaults and custom categories are both kept as their normalized name.
const sanitizeCategoryTag = (tag: any): ExpenseCategory => normalizeCategoryName(tag) as ExpenseCategory;

// An expense's own budget-review bucket, or nothing when it's missing or not one of the three.
const sanitizeExpenseBucket = (bucket: any): { bucket: BucketId } | {} =>
  bucket === 'needs' || bucket === 'wants' || bucket === 'savings' ? { bucket } : {};

const sanitizeEndDate = (frequency: string, endDate: any): string | undefined => {
  if (frequency === 'one-time') return undefined;
  if (typeof endDate !== 'string') return undefined;
  const v = endDate.slice(0, 10);
  // basic YYYY-MM-DD check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return v;
};

// Default lock settings
const getDefaultLockSettings = (): BudgetLockSettings => ({
  locked: false,
  autoLockMinutes: 0,
});

// Tombstones older than this are pruned so the deletions map can't grow unbounded.
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Validate and prune a budget's deletions (tombstone) map
const sanitizeDeletions = (raw: any): Record<string, number> => {
  if (!raw || typeof raw !== 'object') return {};
  const now = Date.now();
  const out: Record<string, number> = {};
  for (const [id, ts] of Object.entries(raw)) {
    if (typeof id === 'string' && typeof ts === 'number' && now - ts <= TOMBSTONE_TTL_MS) {
      out[id] = ts;
    }
  }
  return out;
};

// v2 app data saving protection and in-memory cache
let appDataCache: AppDataV2 | null = null;
let appDataLoadingPromise: Promise<AppDataV2> | null = null;

// Reset the in-memory cache. Used on sign-out so a different account on the
// same device/browser cannot read the previous user's data from memory.
export const resetAppDataCache = (): void => {
  appDataCache = null;
  appDataLoadingPromise = null;
};

// Tabs of the web app share storage but each keeps its own cache. When another
// tab changes the budgets or who owns them (or clears storage), drop ours and
// read storage afresh, rather than later saving a stale copy over theirs.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEYS.APP_DATA_V2 || event.key === STORAGE_KEYS.DEVICE_OWNER) {
      resetAppDataCache();
    }
  });
}

/**
 * True when this device already holds at least one budget, i.e. it has been
 * used before. A first launch (or one after sign-out) holds none. Read straight
 * from storage, without the cache or any sync.
 */
export const hasLocalBudgets = async (): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.APP_DATA_V2);
    if (!raw) return false;
    const budgets = JSON.parse(raw)?.budgets;
    return Array.isArray(budgets) && budgets.length > 0;
  } catch {
    return false;
  }
};

// Wipe all locally persisted app data from device storage. This is a local-only
// operation (no cloud interaction) intended for sign-out, so the next account on
// this device starts from a clean slate instead of inheriting/merging stale data.
export const clearLocalAppData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.APP_DATA_V2,
      STORAGE_KEYS.BUDGET_DATA,
      STORAGE_KEYS.CUSTOM_EXPENSE_CATEGORIES,
      STORAGE_KEYS.EXPENSES_FILTERS,
      STORAGE_KEYS.EXPENSES_SORT,
      STORAGE_KEYS.SYNCED_BUDGET_IDS,
      STORAGE_KEYS.DEVICE_OWNER,
      STORAGE_KEYS.LOCK_ATTEMPTS,
    ]);
  } catch (e) {
    console.error('storage: clearLocalAppData error', e);
  } finally {
    resetAppDataCache();
    // Whatever was unlocked stays behind with the account that unlocked it.
    unlockSession.lockAll();
  }
};

// Budget data on a device belongs to one account. A device can be left
// holding data after its session ends elsewhere (signing out ends every
// device's session, but only clears the device it was done on), so the next
// account to sign in must never inherit it.
export const getDeviceOwner = async (): Promise<string | null> => AsyncStorage.getItem(STORAGE_KEYS.DEVICE_OWNER);

// Call when an account's session starts on this device, before syncing:
// another account's data is wiped; unclaimed data becomes this account's.
export const claimDeviceData = async (userId: string): Promise<void> => {
  // A session starting here means anything this tab holds in memory may be
  // another account's; read storage afresh.
  resetAppDataCache();
  const owner = await getDeviceOwner();
  if (owner === userId) return;
  if (owner) await clearLocalAppData();
  await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_OWNER, userId);
};

// Call when no one is signed in. Data with no recorded owner is left over
// from before owners were recorded and can't be attributed, so it goes; data
// with an owner stays for that account's next sign-in (claimDeviceData wipes
// it if someone else signs in instead).
export const clearUnownedDeviceData = async (): Promise<void> => {
  if (!(await getDeviceOwner())) await clearLocalAppData();
};

const readLastActiveBudgets = async (): Promise<Record<string, string>> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_BUDGETS);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch (e) {
    console.error('storage: readLastActiveBudgets error', e);
    return {};
  }
};

// Signing out wipes the device's budgets, including which one was open. These keep
// that choice per account, so signing back in returns to it (see syncBudgets).
export const rememberActiveBudget = async (userId: string, budgetId: string): Promise<void> => {
  const remembered = await readLastActiveBudgets();
  if (remembered[userId] === budgetId) return;
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_BUDGETS, JSON.stringify({ ...remembered, [userId]: budgetId }));
};

export const loadRememberedBudget = async (userId: string): Promise<string | null> =>
  (await readLastActiveBudgets())[userId] ?? null;

// For a deleted account, which has nothing left to return to.
export const forgetRememberedBudget = async (userId: string): Promise<void> => {
  const remembered = await readLastActiveBudgets();
  if (!(userId in remembered)) return;
  delete remembered[userId];
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_BUDGETS, JSON.stringify(remembered));
};

export const loadSyncedBudgetIds = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_BUDGET_IDS);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch (e) {
    console.error('storage: loadSyncedBudgetIds error', e);
    return [];
  }
};

export const saveSyncedBudgetIds = async (ids: string[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.SYNCED_BUDGET_IDS, JSON.stringify(ids));
};

// Custom categories belong to the active budget.
export const getCustomExpenseCategories = async (): Promise<string[]> => {
  try {
    const active = getActiveBudget(await loadAppData());
    return (active?.customCategories || []).map((c) => c.name);
  } catch (e) {
    console.error('storage: getCustomExpenseCategories error', e);
    return [];
  }
};

// Set a budget's custom category list. Removed names get a tombstone so the
// removal syncs; new names are stamped so they survive a merge with an older delete.
const withCustomCategories = (budget: Budget, categories: string[]): Budget => {
  const now = Date.now();
  const next = new Set(
    categories.map((c) => normalizeCategoryName(c)).filter((c) => c && !DEFAULT_CATEGORIES.includes(c))
  );
  const current = budget.customCategories || [];
  const deletedCategories = { ...(budget.deletedCategories || {}) };
  current.forEach((c) => {
    if (!next.has(c.name)) deletedCategories[c.name] = now;
  });
  const kept = current.filter((c) => next.has(c.name));
  const added: CustomCategory[] = Array.from(next)
    .filter((name) => !kept.some((c) => c.name === name))
    .map((name) => ({ name, updatedAt: now }));
  const changed = added.length > 0 || kept.length !== current.length;
  if (!changed) return budget;
  // A deleted category's bucket choice goes with it, so a category added later
  // under the same name starts from the default.
  const removed = current.filter((c) => !next.has(c.name)).map((c) => c.name);
  const categoryBuckets = resetCategoryBuckets(budget.categoryBuckets, removed, now);
  return {
    ...budget,
    customCategories: sanitizeCustomCategories([...kept, ...added]),
    deletedCategories,
    modifiedAt: now,
    ...(categoryBuckets ? { categoryBuckets } : {}),
  };
};

const replaceBudget = (appData: AppDataV2, budget: Budget): AppDataV2 => ({
  ...appData,
  budgets: appData.budgets.map((b) => (b.id === budget.id ? budget : b)),
});

export const saveCustomExpenseCategories = async (categories: string[]): Promise<{ success: boolean; error?: Error }> => {
  const appData = await loadAppData();
  const active = getActiveBudget(appData);
  if (!active) return { success: false, error: new Error('No active budget') };
  return await saveAppData(replaceBudget(appData, withCustomCategories(active, categories)));
};

// Choose which budget-review bucket a category counts towards on the active
// budget (null: back to the default). Shared with everyone on the budget.
export const setCategoryBucket = async (category: string, bucket: BucketId | null): Promise<{ success: boolean; error?: Error }> => {
  try {
    const name = normalizeCategoryName(category);
    const appData = await loadAppData();
    const active = getActiveBudget(appData);
    if (!active) return { success: false, error: new Error('No active budget') };
    // Nothing to record when it would change nothing.
    if ((active.categoryBuckets?.[name]?.bucket ?? null) === bucket) return { success: true };
    const now = Date.now();
    const categoryBuckets = sanitizeCategoryBuckets({ ...active.categoryBuckets, [name]: { bucket, updatedAt: now } });
    return await saveAppData(replaceBudget(appData, { ...active, categoryBuckets, modifiedAt: now }));
  } catch (error) {
    console.error('storage: setCategoryBucket error', error);
    return { success: false, error: error as Error };
  }
};

export const renameCustomExpenseCategory = async (oldName: string, newName: string): Promise<{ success: boolean; error?: Error }> => {
  try {
    const normalizedOldName = normalizeCategoryName(oldName);
    const normalizedNewName = normalizeCategoryName(newName);

    // Validate new name
    if (!normalizedNewName || normalizedNewName === normalizedOldName) {
      return { success: false, error: new Error('Invalid new category name') };
    }

    // Check if new name conflicts with default categories
    if (DEFAULT_CATEGORIES.includes(normalizedNewName)) {
      return { success: false, error: new Error('Cannot rename to a default category name') };
    }

    // Get current custom categories
    const customCategories = await getCustomExpenseCategories();

    // Check if old category exists
    if (!customCategories.includes(normalizedOldName)) {
      return { success: false, error: new Error('Category not found') };
    }

    // Check if new name already exists
    if (customCategories.includes(normalizedNewName)) {
      return { success: false, error: new Error('A category with this name already exists') };
    }

    // Rename in the active budget's list and retag its expenses, in one save.
    // Retagged expenses get a fresh updatedAt, or a merge would keep another
    // device's copy still tagged with the old name.
    const appData = await loadAppData();
    const active = getActiveBudget(appData);
    if (!active) return { success: false, error: new Error('No active budget') };
    const now = Date.now();
    const expenses = active.expenses.map(expense =>
      normalizeCategoryName(expense.categoryTag || 'Misc') === normalizedOldName
        ? { ...expense, categoryTag: normalizedNewName, updatedAt: now }
        : expense
    );
    const renamed = withCustomCategories(
      { ...active, expenses },
      customCategories.map(cat => (cat === normalizedOldName ? normalizedNewName : cat))
    );
    // Its bucket choice follows the new name (withCustomCategories has already
    // reset the old one).
    const choice = active.categoryBuckets?.[normalizedOldName]?.bucket ?? null;
    const withChoice: Budget = choice
      ? {
          ...renamed,
          categoryBuckets: sanitizeCategoryBuckets({ ...renamed.categoryBuckets, [normalizedNewName]: { bucket: choice, updatedAt: now } }),
        }
      : renamed;
    return await saveAppData(replaceBudget(appData, withChoice));
  } catch (error) {
    console.error('storage: renameCustomExpenseCategory error', error);
    return { success: false, error: error as Error };
  }
};

export type ExpensesFilters = {
  category: string | null; // null means All
  search: string;
  hasEndDate: boolean; // New filter for expenses with end dates
  filter: 'all' | 'household' | 'personal'; // Expense type filter
  personFilter: string | null; // Person filter
  debtFilter?: 'all' | 'any' | 'loan' | 'mortgage' | 'credit_card'; // Debt repayment filter
  bucketFilter?: 'all' | BucketId; // Where the expense counts in the budget review
};

export const getExpensesFilters = async (): Promise<ExpensesFilters> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.EXPENSES_FILTERS);
    if (!raw) return { category: null, search: '', hasEndDate: false, filter: 'all', personFilter: null, debtFilter: 'all', bucketFilter: 'all' };
    const parsed = JSON.parse(raw);
    const category = parsed && typeof parsed.category === 'string' ? normalizeCategoryName(parsed.category) : null;
    const search = parsed && typeof parsed.search === 'string' ? parsed.search : '';
    const hasEndDate = parsed && typeof parsed.hasEndDate === 'boolean' ? parsed.hasEndDate : false;
    const filter = parsed && ['all', 'household', 'personal'].includes(parsed.filter) ? parsed.filter : 'all';
    const personFilter = parsed && typeof parsed.personFilter === 'string' ? parsed.personFilter : null;
    const debtFilter = parsed && ['all', 'any', 'loan', 'mortgage', 'credit_card'].includes(parsed.debtFilter) ? parsed.debtFilter : 'all';
    const bucketFilter = parsed && BUCKET_IDS.includes(parsed.bucketFilter) ? parsed.bucketFilter : 'all';
    return { category, search, hasEndDate, filter, personFilter, debtFilter, bucketFilter };
  } catch (e) {
    console.error('storage: getExpensesFilters error', e);
    return { category: null, search: '', hasEndDate: false, filter: 'all', personFilter: null, debtFilter: 'all', bucketFilter: 'all' };
  }
};

export const saveExpensesFilters = async (filters: ExpensesFilters): Promise<void> => {
  try {
    const toSave: ExpensesFilters = {
      category: filters.category ? normalizeCategoryName(filters.category) : null,
      search: filters.search || '',
      hasEndDate: filters.hasEndDate || false,
      filter: filters.filter || 'all',
      personFilter: filters.personFilter || null,
      debtFilter: filters.debtFilter || 'all',
      bucketFilter: filters.bucketFilter && BUCKET_IDS.includes(filters.bucketFilter as BucketId) ? filters.bucketFilter : 'all',
    };
    await AsyncStorage.setItem(STORAGE_KEYS.EXPENSES_FILTERS, JSON.stringify(toSave));
  } catch (e) {
    console.error('storage: saveExpensesFilters error', e);
  }
};

export type ExpensesSort = {
  by: 'date' | 'alphabetical' | 'cost' | 'type' | 'assignedTo' | 'frequency' | 'categoryTag' | 'endDate' | 'debtRepayment';
  order: 'asc' | 'desc';
};

export const DEFAULT_EXPENSES_SORT: ExpensesSort = { by: 'date', order: 'desc' };

const SORT_FIELDS: ExpensesSort['by'][] = ['date', 'alphabetical', 'cost', 'type', 'assignedTo', 'frequency', 'categoryTag', 'endDate', 'debtRepayment'];

// Sort is per account, not per budget: device data belongs to one account
// (see claimDeviceData), so members of a shared budget each keep their own.
export const getExpensesSort = async (): Promise<ExpensesSort> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.EXPENSES_SORT);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && SORT_FIELDS.includes(parsed.by) && (parsed.order === 'asc' || parsed.order === 'desc')) {
      return { by: parsed.by, order: parsed.order };
    }
  } catch (e) {
    console.error('storage: getExpensesSort error', e);
  }
  return DEFAULT_EXPENSES_SORT;
};

export const saveExpensesSort = async (sort: ExpensesSort): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.EXPENSES_SORT, JSON.stringify({ by: sort.by, order: sort.order }));
  } catch (e) {
    console.error('storage: saveExpensesSort error', e);
  }
};

// Create an empty budget entity
const createEmptyBudget = (name: string): Budget => {
  const now = Date.now();
  return {
    id: newId('budget'),
    name,
    people: [],
    expenses: [],
    householdSettings: { distributionMethod: 'even' },
    createdAt: now,
    modifiedAt: now,
    lock: getDefaultLockSettings(),
  };
};

// The people, expenses and household settings of one budget, validated
type BudgetContents = {
  people: Person[];
  expenses: Expense[];
  householdSettings: HouseholdSettings;
};

const sanitizeBudgetContents = (data: any): BudgetContents => {
  const safeData: any = data && typeof data === 'object' ? data : {};
  const people: Person[] = Array.isArray(safeData.people)
    ? safeData.people
      .filter((p: any) => p && typeof p === 'object' && p.id && typeof p.name === 'string')
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        excludeFromHouseholdShare: p.excludeFromHouseholdShare === true ? true : undefined,
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : undefined,
        income: Array.isArray(p.income)
          ? p.income
            .filter((i: any) => i && typeof i === 'object' && i.id && typeof i.amount === 'number')
            .map((i: any) => ({
              id: i.id,
              amount: i.amount,
              label: typeof i.label === 'string' ? i.label : 'Income',
              frequency: typeof i.frequency === 'string' ? i.frequency : 'monthly',
              personId: p.id
            }))
          : [],
      }))
    : [];
  const validFreq = ['daily', 'weekly', 'monthly', 'yearly', 'one-time'];
  const expenses = Array.isArray(safeData.expenses)
    ? safeData.expenses
      .filter(
        (e: any) =>
          e &&
          typeof e === 'object' &&
          e.id &&
          typeof e.amount === 'number' &&
          typeof e.description === 'string' &&
          ['household', 'personal'].includes(e.category) &&
          validFreq.includes(e.frequency) &&
          e.date
      )
      .map((e: any) => {
        // Handle personId based on expense category
        let personId: string | undefined = typeof e.personId === 'string' ? e.personId : undefined;

        // For personal expenses, require a personId - assign to first person if missing
        if (e.category === 'personal') {
          if (!personId && people.length > 0) {
            personId = people[0].id;
          }
          // If still no personId for personal expense, skip this expense
          if (!personId) {
            console.warn('storage: Skipping personal expense without valid person assignment:', e.description);
            return null;
          }
        }

        // For household expenses, personId is optional - can be undefined
        if (e.category === 'household') {
          // If personId exists but person doesn't exist anymore, clear it
          if (personId && !people.find((p: Person) => p.id === personId)) {
            personId = undefined;
          }
        }

        return {
          id: e.id,
          amount: typeof e.amount === 'number' ? e.amount : 0,
          description: typeof e.description === 'string' ? e.description : '',
          category: (['household', 'personal'].includes(e.category) ? e.category : 'household') as 'household' | 'personal',
          frequency: validFreq.includes(e.frequency) ? e.frequency : 'monthly',
          personId: personId, // Optional for household, required for personal
          date: typeof e.date === 'string' ? e.date : new Date().toISOString(),
          notes: typeof e.notes === 'string' ? e.notes : '',
          categoryTag: sanitizeCategoryTag(e.categoryTag || 'Misc'),
          endDate: sanitizeEndDate(e.frequency, e.endDate),
          debtRepayment: e.debtRepayment,
          ...sanitizeExpenseBucket(e.bucket),
          updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : undefined,
        };
      })
      .filter((e: any) => e !== null) // Remove null entries (invalid personal expenses)
    : [];
  const distribution =
    safeData?.householdSettings &&
      typeof safeData.householdSettings === 'object' &&
      ['even', 'income-based'].includes(safeData.householdSettings.distributionMethod)
      ? (safeData.householdSettings.distributionMethod as 'even' | 'income-based')
      : 'even';

  const validated: BudgetContents = {
    people,
    expenses,
    householdSettings: { distributionMethod: distribution },
  };
  return validated;
};

// Validate AppDataV2
export const validateAppData = (data: any): AppDataV2 => {
  if (!data || typeof data !== 'object') {
    return { version: 2, budgets: [], activeBudgetId: '' };
  }

  const makeSafeBudget = (b: any): Budget => {
    const contents = sanitizeBudgetContents(b);
    // Ensure all expenses have valid categoryTag, properly sanitized endDate, household constraint, and debtRepayment tag
    const sanitizedExpenses = (contents.expenses || []).map((e: Expense) => {
      const isHousehold = e.category === 'household';
      const categoryTag = sanitizeCategoryTag((e as any).categoryTag || 'Misc');
      const drRaw = (e as any).debtRepayment;
      // A debt category decides the tag; other categories keep any legacy tag.
      const debtRepayment =
        debtRepaymentForCategory(categoryTag) ?? (['loan', 'mortgage', 'credit_card'].includes(drRaw) ? drRaw : undefined);
      return {
        ...e,
        personId: isHousehold ? undefined : e.personId,
        categoryTag,
        endDate: sanitizeEndDate((e as any).frequency, (e as any).endDate),
        debtRepayment,
      };
    });

    // Ensure lock settings exist with defaults
    const lockSettings: BudgetLockSettings = {
      locked: b?.lock?.locked === true,
      autoLockMinutes: typeof b?.lock?.autoLockMinutes === 'number' ? b.lock.autoLockMinutes : 0,
      lastUnlockAt: typeof b?.lock?.lastUnlockAt === 'string' ? b.lock.lastUnlockAt : undefined,
      pinVerifier: typeof b?.lock?.pinVerifier === 'string' ? b.lock.pinVerifier : undefined,
      biometrics: b?.lock?.biometrics === true ? true : undefined,
    };

    const categoryBuckets = sanitizeCategoryBuckets(b?.categoryBuckets);

    const now = Date.now();
    const createdAt = typeof b?.createdAt === 'number' ? b.createdAt : now;
    const modifiedAt = typeof b?.modifiedAt === 'number' ? b.modifiedAt : createdAt;

    return {
      id: typeof b?.id === 'string' ? b.id : newId('budget'),
      name: typeof b?.name === 'string' ? b.name : 'My Budget',
      people: contents.people,
      expenses: sanitizedExpenses,
      householdSettings: contents.householdSettings,
      createdAt,
      modifiedAt,
      lock: lockSettings,
      deletions: sanitizeDeletions(b?.deletions),
      customCategories: sanitizeCustomCategories(b?.customCategories),
      deletedCategories: sanitizeDeletions(b?.deletedCategories),
      ...(categoryBuckets ? { categoryBuckets } : {}),
    };
  };

  // Allow empty budgets array for first-time users
  let budgets: Budget[] = Array.isArray(data.budgets) ? sortBudgetsByCreated(data.budgets.map((b: any) => makeSafeBudget(b))) : [];

  // Categories used to be account-wide; hand any account-level list to every budget.
  const accountCategories = sanitizeCustomCategories(data.customCategories);
  const accountCategoryDeletions = sanitizeDeletions(data.deletedCategories);
  if (accountCategories.length || Object.keys(accountCategoryDeletions).length) {
    budgets = budgets.map((b) => addCategoriesToBudget(b, accountCategories, accountCategoryDeletions));
  }

  let activeBudgetId = typeof data.activeBudgetId === 'string' ? data.activeBudgetId : '';
  if (budgets.length > 0 && !budgets.find((b) => b.id === activeBudgetId)) {
    activeBudgetId = budgets[0].id;
  }

  return {
    version: 2 as const,
    budgets,
    activeBudgetId,
    deletedBudgets: sanitizeDeletions(data.deletedBudgets),
  };
};

// Union categories (and their tombstones) into a budget, dropping any a newer
// tombstone has deleted.
export const addCategoriesToBudget = (
  budget: Budget,
  categories: CustomCategory[],
  deletions: Record<string, number> = {}
): Budget => {
  const deletedCategories = { ...(budget.deletedCategories || {}) };
  for (const [name, ts] of Object.entries(deletions)) {
    if (!(name in deletedCategories) || ts > deletedCategories[name]) deletedCategories[name] = ts;
  }
  const customCategories = sanitizeCustomCategories([...(budget.customCategories || []), ...categories])
    .filter((c) => !(deletedCategories[c.name] >= c.updatedAt));
  return { ...budget, customCategories, deletedCategories };
};

// Normalize, drop defaults, dedupe (keeping the latest stamp) and sort by name,
// so two devices holding the same set produce identical JSON.
export const sanitizeCustomCategories = (raw: any): CustomCategory[] => {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, CustomCategory>();
  for (const c of raw) {
    if (!c || typeof c.name !== 'string') continue;
    const name = normalizeCategoryName(c.name);
    if (DEFAULT_CATEGORIES.includes(name)) continue;
    const updatedAt = typeof c.updatedAt === 'number' ? c.updatedAt : 0;
    const existing = byName.get(name);
    if (!existing || updatedAt > existing.updatedAt) byName.set(name, { name, updatedAt });
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const BUCKET_IDS: BucketId[] = ['needs', 'wants', 'savings'];
// Far more than anyone sorts by hand; a bound so a bad copy can't bloat the budget.
const MAX_CATEGORY_BUCKETS = 300;

// Normalize names, drop invalid entries, dedupe (keeping the latest stamp) and
// sort by name, so two devices holding the same choices produce identical JSON.
// A "back to default" entry is dropped once it is old enough that no device can
// still hold an older override (the same horizon as deletion records). Returns
// undefined when nothing is left, so budgets without choices stay free of the field.
export const sanitizeCategoryBuckets = (raw: any): Record<string, CategoryBucketEntry> | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const now = Date.now();
  const byName = new Map<string, CategoryBucketEntry>();
  for (const [key, value] of Object.entries(raw)) {
    if (!key.trim() || !value || typeof value !== 'object') continue;
    const { bucket, updatedAt } = value as Partial<CategoryBucketEntry>;
    if (bucket !== null && !BUCKET_IDS.includes(bucket as BucketId)) continue;
    const stamp = typeof updatedAt === 'number' ? updatedAt : 0;
    if (bucket === null && now - stamp > TOMBSTONE_TTL_MS) continue;
    const name = normalizeCategoryName(key);
    const existing = byName.get(name);
    if (!existing || stamp > existing.updatedAt) byName.set(name, { bucket: bucket as BucketId | null, updatedAt: stamp });
  }
  if (byName.size === 0) return undefined;
  const newest = Array.from(byName.entries()).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, MAX_CATEGORY_BUCKETS);
  return Object.fromEntries(newest.sort((a, b) => a[0].localeCompare(b[0])));
};

// Union two sets of category choices, the later choice winning per category. A
// tie (the same millisecond on two devices) is settled by value, so every device
// reaches the same answer and the budgets never keep rewriting each other.
export const mergeCategoryBuckets = (
  a?: Record<string, CategoryBucketEntry>,
  b?: Record<string, CategoryBucketEntry>
): Record<string, CategoryBucketEntry> | undefined => {
  const out: Record<string, CategoryBucketEntry> = { ...(sanitizeCategoryBuckets(a) || {}) };
  for (const [name, entry] of Object.entries(sanitizeCategoryBuckets(b) || {})) {
    const mine = out[name];
    const wins =
      !mine ||
      entry.updatedAt > mine.updatedAt ||
      (entry.updatedAt === mine.updatedAt && String(entry.bucket) > String(mine.bucket));
    if (wins) out[name] = entry;
  }
  return sanitizeCategoryBuckets(out);
};

// Put the named categories' choices back to the default (a recent "default"
// entry, so the reset syncs), for when the category itself goes away.
const resetCategoryBuckets = (
  buckets: Record<string, CategoryBucketEntry> | undefined,
  names: string[],
  now: number
): Record<string, CategoryBucketEntry> | undefined => {
  if (!buckets) return buckets;
  const next = { ...buckets };
  let touched = false;
  for (const name of names) {
    if (next[name]?.bucket) {
      next[name] = { bucket: null, updatedAt: now };
      touched = true;
    }
  }
  return touched ? sanitizeCategoryBuckets(next) : buckets;
};

// Fold the legacy device-only category list into the app data, then drop the
// legacy key. Each device does this once; the sync merge unions the results.
const absorbLegacyCustomCategories = async (appData: AppDataV2): Promise<AppDataV2> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_EXPENSE_CATEGORIES);
  if (!raw) return appData;
  let legacy: unknown;
  try {
    legacy = JSON.parse(raw);
  } catch {
    legacy = [];
  }
  const now = Date.now();
  const names = Array.isArray(legacy) ? legacy.filter((n): n is string => typeof n === 'string') : [];
  const categories = sanitizeCustomCategories(names.map((name) => ({ name, updatedAt: now })));
  const merged: AppDataV2 = {
    ...appData,
    budgets: appData.budgets.map((b) => addCategoriesToBudget(b, categories)),
  };
  appDataCache = merged;
  const res = await saveAppData(merged);
  if (res.success) await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOM_EXPENSE_CATEGORIES);
  return merged;
};

// Load AppDataV2
export const loadAppData = async (): Promise<AppDataV2> => {
  // If we already have a cache, return a clone to prevent external mutations
  if (appDataCache) {
    return JSON.parse(JSON.stringify(appDataCache));
  }

  // If we are already loading, wait for that promise
  if (appDataLoadingPromise) {
    return appDataLoadingPromise;
  }

  appDataLoadingPromise = (async () => {
    try {
      const v2Raw = await AsyncStorage.getItem(STORAGE_KEYS.APP_DATA_V2);
      if (v2Raw) {
        const parsed = JSON.parse(v2Raw);
        const validated = validateAppData(parsed);
        appDataCache = validated;
        return await absorbLegacyCustomCategories(validated);
      }

      // No data at all, return empty state for first-time user
      const freshEmpty = { version: 2 as const, budgets: [], activeBudgetId: '' };
      appDataCache = freshEmpty;
      return freshEmpty;
    } catch (error) {
      console.error('storage: Error loading AppDataV2:', error);
      const fallback = { version: 2 as const, budgets: [], activeBudgetId: '' };
      appDataCache = fallback;
      return fallback;
    } finally {
      appDataLoadingPromise = null;
    }
  })();

  return appDataLoadingPromise;
};

// Queue to prevent concurrent writes to AsyncStorage
let savePromise: Promise<void> = Promise.resolve();

const performAppSave = async (data: AppDataV2): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.APP_DATA_V2, JSON.stringify(validateAppData(data)));
};

export const saveAppData = async (data: AppDataV2): Promise<{ success: boolean; error?: Error }> => {
  try {
    // 1. Update in-memory cache IMMEDIATELY
    appDataCache = JSON.parse(JSON.stringify(data));

    // 2. Chain the save operation to ensure sequential writes
    const currentSave = savePromise.then(async () => {
      try {
        await performAppSave(data);
      } catch (e) {
        console.error('storage: Background save error', e);
        throw e;
      }
    });

    // Update the queue tail
    savePromise = currentSave.catch(() => { });

    // Await the save to ensure data is persisted before returning success
    await currentSave;

    return { success: true };
  } catch (error) {
    console.error('storage: saveAppData failed', error);
    return { success: false, error: error as Error };
  }
};

export const getActiveBudget = (appData: AppDataV2): Budget | null => {
  // Add better null checks and logging
  if (!appData) {
    console.error('storage: getActiveBudget called with null/undefined appData');
    return null;
  }

  if (!appData.budgets || !Array.isArray(appData.budgets) || appData.budgets.length === 0) {
    return null;
  }

  const active = appData.budgets.find((b) => b && b.id === appData.activeBudgetId);
  const result = active || appData.budgets[0];

  return result;
};

export const setActiveBudget = async (budgetId: string): Promise<{ success: boolean; error?: Error }> => {
  const appData = await loadAppData();
  if (!appData.budgets || !Array.isArray(appData.budgets) || !appData.budgets.find((b) => b && b.id === budgetId)) {
    return { success: false, error: new Error('Budget not found') };
  }
  const newAppData: AppDataV2 = { ...appData, activeBudgetId: budgetId };
  return await saveAppData(newAppData);
};

export const addBudget = async (name: string): Promise<{ success: boolean; error?: Error; budget?: Budget }> => {
  const appData = await loadAppData();
  // Start with the current budget's custom categories, as they were once shared by every budget,
  // and how its categories are sorted in the budget review.
  const now = Date.now();
  const current = getActiveBudget(appData);
  const inherited = (current?.customCategories || []).map((c) => ({ name: c.name, updatedAt: now }));
  const categoryBuckets = sanitizeCategoryBuckets(current?.categoryBuckets);
  const newBudget = {
    ...createEmptyBudget(name || 'New Budget'),
    customCategories: inherited,
    ...(categoryBuckets ? { categoryBuckets } : {}),
  };
  const budgets = appData.budgets && Array.isArray(appData.budgets) ? appData.budgets : [];
  const newAppData: AppDataV2 = { ...appData, budgets: [...budgets, newBudget], activeBudgetId: newBudget.id };
  const res = await saveAppData(newAppData);
  return { ...res, budget: newBudget };
};

// Save a budget read from a workbook as a new budget (never over an existing
// one) and make it the active budget. Its people and expenses already carry
// fresh ids, so they can't collide with anything on this device or in the cloud.
export const importBudget = async (draft: ImportedBudget): Promise<{ success: boolean; error?: Error; budget?: Budget }> => {
  try {
    const appData = await loadAppData();
    const now = Date.now();
    const budget: Budget = {
      ...createEmptyBudget(draft.name.trim() || 'Imported budget'),
      people: draft.people,
      expenses: draft.expenses,
      householdSettings: draft.householdSettings,
      customCategories: sanitizeCustomCategories(draft.customCategories.map((name) => ({ name, updatedAt: now }))),
    };
    const budgets = Array.isArray(appData.budgets) ? appData.budgets : [];
    const res = await saveAppData({ ...appData, budgets: [...budgets, budget], activeBudgetId: budget.id });
    return { ...res, budget };
  } catch (error) {
    console.error('storage: Error in importBudget:', error);
    return { success: false, error: error as Error };
  }
};

export const renameBudget = async (budgetId: string, newName: string): Promise<{ success: boolean; error?: Error }> => {
  const appData = await loadAppData();
  if (!appData.budgets || !Array.isArray(appData.budgets)) {
    return { success: false, error: new Error('No budgets found') };
  }
  const idx = appData.budgets.findIndex((b) => b && b.id === budgetId);
  if (idx === -1) return { success: false, error: new Error('Budget not found') };
  const budgets = [...appData.budgets];
  budgets[idx] = { ...budgets[idx], name: newName || budgets[idx].name, modifiedAt: Date.now() };
  return await saveAppData({ ...appData, budgets });
};

// Remove a budget from this device and queue its removal; the next sync
// deletes it on the server, or leaves it when other people still share it.
// `allowLast` permits removing the only budget (leaving a shared budget).
export const deleteBudget = async (budgetId: string, allowLast = false): Promise<{ success: boolean; error?: Error }> => {
  const appData = await loadAppData();
  if (!appData.budgets || !Array.isArray(appData.budgets) || (appData.budgets.length <= 1 && !allowLast)) {
    return { success: false, error: new Error('Cannot delete the last budget') };
  }
  const budgets = appData.budgets.filter((b) => b && b.id !== budgetId);
  let activeBudgetId = appData.activeBudgetId;
  if (activeBudgetId === budgetId) {
    activeBudgetId = budgets[0]?.id || '';
  }
  const deletedBudgets = { ...(appData.deletedBudgets || {}), [budgetId]: Date.now() };
  return await saveAppData({ ...appData, budgets, activeBudgetId, deletedBudgets });
};

export const duplicateBudget = async (budgetId: string, customName?: string): Promise<{ success: boolean; error?: Error; budget?: Budget }> => {
  try {
    const appData = await loadAppData();
    const original = appData.budgets.find((b) => b.id === budgetId);
    if (!original) return { success: false, error: new Error('Budget not found') };

    // Everything gets a new id; expenses follow their person to the new one.
    const now = Date.now();
    const newPersonIds = new Map<string, string>();
    const people = original.people.map((person) => {
      const id = newId('person');
      newPersonIds.set(person.id, id);
      return { ...person, id, income: person.income.map((income) => ({ ...income, id: newId('income') })) };
    });
    const expenses = original.expenses.map((expense) => {
      const copy = { ...expense, id: newId('expense') };
      const mapped = expense.personId ? newPersonIds.get(expense.personId) : undefined;
      if (expense.category === 'personal') {
        // A personal expense always has a person: its own, else the first.
        copy.personId = mapped ?? people[0]?.id;
      } else if (expense.personId) {
        // A household expense may have none: drop one that no longer exists.
        copy.personId = mapped;
      }
      return copy;
    });

    const duplicate: Budget = {
      ...original,
      id: newId('budget'),
      name: customName || `${original.name} (Copy)`,
      createdAt: now,
      modifiedAt: now,
      people,
      expenses,
      householdSettings: original.householdSettings || { distributionMethod: 'even' },
      // The lock is not copied.
      lock: getDefaultLockSettings(),
    };

    const res = await saveAppData({ ...appData, budgets: [...appData.budgets, duplicate] });
    return { ...res, budget: duplicate };
  } catch (error) {
    console.error('storage: Error in duplicateBudget:', error);
    return { success: false, error: error as Error };
  }
};

export const setBudgetLock = async (budgetId: string, patch: Partial<BudgetLockSettings>): Promise<{ success: boolean; error?: Error }> => {
  const appData = await loadAppData();
  if (!appData.budgets || !Array.isArray(appData.budgets)) {
    return { success: false, error: new Error('No budgets found') };
  }
  const budgetIndex = appData.budgets.findIndex((b) => b && b.id === budgetId);
  if (budgetIndex === -1) return { success: false, error: new Error('Budget not found') };

  const budget = appData.budgets[budgetIndex];
  const currentLock = budget.lock || getDefaultLockSettings();
  const updatedLock = { ...currentLock, ...patch };

  // Lock settings stay on this device (they aren't synced), so changing them
  // isn't an edit to the budget.
  const updatedBudget = { ...budget, lock: updatedLock };
  const budgets = [...appData.budgets];
  budgets[budgetIndex] = updatedBudget;

  return await saveAppData({ ...appData, budgets });
};

// Wrong codes entered for a budget on this device, kept so that quitting the app
// doesn't clear the wait that follows too many of them.
const loadLockAttempts = async (): Promise<Record<string, AttemptState>> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOCK_ATTEMPTS);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getLockAttempts = async (budgetId: string): Promise<AttemptState> => {
  const state = (await loadLockAttempts())[budgetId];
  return state && typeof state.failures === 'number' && typeof state.blockedUntil === 'number' ? state : NO_ATTEMPTS;
};

export const saveLockAttempts = async (budgetId: string, state: AttemptState): Promise<void> => {
  const all = await loadLockAttempts();
  if (state.failures === 0) delete all[budgetId];
  else all[budgetId] = state;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LOCK_ATTEMPTS, JSON.stringify(all));
  } catch (e) {
    console.error('storage: saveLockAttempts error', e);
  }
};

// Clear ALL app data - delete all budgets, people, and expenses
export const clearAllAppData = async (): Promise<{ success: boolean; error?: Error }> => {
  try {
    // Queue every budget for removal, so the next sync deletes it on the server
    // (or leaves it, when it's shared) instead of downloading it again.
    const previous = await loadAppData();
    const now = Date.now();
    const deletedBudgets = { ...(previous.deletedBudgets || {}) };
    previous.budgets.forEach((b) => { deletedBudgets[b.id] = now; });

    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CUSTOM_EXPENSE_CATEGORIES,
      STORAGE_KEYS.EXPENSES_FILTERS,
      STORAGE_KEYS.BUDGET_DATA,
      STORAGE_KEYS.APP_DATA_V2,
    ]);

    // An empty app state with no budgets (the first-time user state).
    const result = await saveAppData({ version: 2, budgets: [], activeBudgetId: '', deletedBudgets });
    if (!result.success) console.error('storage: Failed to clear all app data:', result.error);
    return result;
  } catch (error) {
    console.error('storage: Error clearing all app data:', error);
    return { success: false, error: error as Error };
  }
};
