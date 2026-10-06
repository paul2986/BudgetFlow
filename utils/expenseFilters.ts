import type { BucketId, DebtRepaymentType, Expense, Person } from '../types/budget';
import { normalizeCategoryName } from './categories';

/**
 * What the Expenses list shows and in what order, in one place: the screen, its
 * filter bar and the filter sheet all read these types and call these functions,
 * so the list and the sheet's live counts can never disagree.
 */

export type TypeFilter = 'all' | 'household' | 'personal';
export type DebtFilter = 'all' | 'any' | DebtRepaymentType;
export type BucketFilter = 'all' | BucketId;

export interface ExpenseFilters {
  type: TypeFilter;
  personId: string | null;
  /** Normalized category names; none means every category. */
  categories: string[];
  search: string;
  /** Only recurring expenses that have an end date. */
  hasEndDate: boolean;
  debt: DebtFilter;
  /** Where the expense counts in the budget review. */
  bucket: BucketFilter;
}

export const NO_FILTERS: ExpenseFilters = {
  type: 'all',
  personId: null,
  categories: [],
  search: '',
  hasEndDate: false,
  debt: 'all',
  bucket: 'all',
};

/** Whether any filter, or a search, narrows the list. */
export const hasActiveFilters = (f: ExpenseFilters): boolean =>
  f.type !== 'all' ||
  f.personId !== null ||
  f.categories.length > 0 ||
  f.search.trim() !== '' ||
  f.hasEndDate ||
  f.debt !== 'all' ||
  f.bucket !== 'all';

/** The expenses that pass every filter. `bucketOf` says where an expense counts in the budget review. */
export const filterExpenses = (
  expenses: Expense[],
  f: ExpenseFilters,
  bucketOf: (expense: Expense) => BucketId
): Expense[] => {
  const categories = f.categories.map(normalizeCategoryName);
  const query = f.search.trim().toLowerCase();
  return expenses.filter((e) => {
    if (f.type !== 'all' && e.category !== f.type) return false;
    if (f.personId && e.personId !== f.personId) return false;
    if (categories.length > 0 && !categories.includes(normalizeCategoryName(e.categoryTag || 'Misc'))) return false;
    if (query && !e.description.toLowerCase().includes(query)) return false;
    if (f.hasEndDate && !(e.endDate && e.frequency !== 'one-time')) return false;
    if (f.debt === 'any' && !e.debtRepayment) return false;
    if (f.debt !== 'all' && f.debt !== 'any' && e.debtRepayment !== f.debt) return false;
    if (f.bucket !== 'all' && bucketOf(e) !== f.bucket) return false;
    return true;
  });
};

export type SortOption =
  | 'date'
  | 'alphabetical'
  | 'cost'
  | 'type'
  | 'assignedTo'
  | 'frequency'
  | 'categoryTag'
  | 'endDate'
  | 'debtRepayment';
export type SortOrder = 'asc' | 'desc';
export type ExpensesSort = { by: SortOption; order: SortOrder };

export const SORT_FIELDS: SortOption[] = [
  'date',
  'alphabetical',
  'cost',
  'type',
  'assignedTo',
  'frequency',
  'categoryTag',
  'endDate',
  'debtRepayment',
];

export const DEFAULT_EXPENSES_SORT: ExpensesSort = { by: 'date', order: 'desc' };

const DEBT_SORT_LABEL: Record<string, string> = { credit_card: 'credit card', loan: 'loan', mortgage: 'mortgage' };

const compare = (a: Expense, b: Expense, by: SortOption, personName: (id?: string) => string): number => {
  switch (by) {
    case 'alphabetical':
      return a.description.toLowerCase().localeCompare(b.description.toLowerCase());
    case 'cost':
      return a.amount - b.amount;
    case 'type':
      return a.category.toLowerCase().localeCompare(b.category.toLowerCase());
    case 'assignedTo':
      return personName(a.personId).localeCompare(personName(b.personId));
    case 'frequency':
      return a.frequency.toLowerCase().localeCompare(b.frequency.toLowerCase());
    case 'categoryTag':
      return (a.categoryTag || 'Misc').toLowerCase().localeCompare((b.categoryTag || 'Misc').toLowerCase());
    case 'endDate': {
      // Expenses with no end date sort after those that have one (so first when descending).
      const ea = a.endDate || '';
      const eb = b.endDate || '';
      if (!ea && !eb) return 0;
      if (!ea) return 1;
      if (!eb) return -1;
      return ea.localeCompare(eb);
    }
    case 'debtRepayment':
      return (DEBT_SORT_LABEL[a.debtRepayment || ''] ?? 'general').localeCompare(DEBT_SORT_LABEL[b.debtRepayment || ''] ?? 'general');
    case 'date':
    default:
      return new Date(a.date).getTime() - new Date(b.date).getTime();
  }
};

/** A sorted copy of the expenses. */
export const sortExpenses = (expenses: Expense[], sort: ExpensesSort, people: Person[]): Expense[] => {
  const names = new Map(people.map((p) => [p.id, p.name.toLowerCase()]));
  // Household expenses (no person) sort as "household".
  const personName = (id?: string) => (id ? names.get(id) ?? '' : 'household');
  const sign = sort.order === 'asc' ? 1 : -1;
  return [...expenses].sort((a, b) => sign * compare(a, b, sort.by, personName));
};

/**
 * The saved form keeps the field names older versions wrote, plus the full
 * category list; `category` still holds the first one so a device on an older
 * version reads something sensible.
 */
export const toSavedFilters = (f: ExpenseFilters) => {
  const categories = f.categories.map(normalizeCategoryName);
  return {
    category: categories[0] ?? null,
    categories,
    search: f.search,
    hasEndDate: f.hasEndDate,
    filter: f.type,
    personFilter: f.personId,
    debtFilter: f.debt,
    bucketFilter: f.bucket,
  };
};

const DEBT_VALUES = ['all', 'any', 'loan', 'mortgage', 'credit_card'];
const BUCKET_VALUES = ['all', 'needs', 'wants', 'savings'];

/** Filters read back from storage; anything unreadable counts as no filter. */
export const parseSavedFilters = (raw: unknown): ExpenseFilters => {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  // Saved before the full list existed: only the first category was kept.
  const categories = Array.isArray(p.categories)
    ? p.categories.filter((c: unknown): c is string => typeof c === 'string').map(normalizeCategoryName)
    : typeof p.category === 'string'
      ? [normalizeCategoryName(p.category)]
      : [];
  return {
    type: ['household', 'personal'].includes(p.filter) ? p.filter : 'all',
    personId: typeof p.personFilter === 'string' ? p.personFilter : null,
    categories: [...new Set(categories)],
    search: typeof p.search === 'string' ? p.search : '',
    hasEndDate: p.hasEndDate === true,
    debt: DEBT_VALUES.includes(p.debtFilter) ? p.debtFilter : 'all',
    bucket: BUCKET_VALUES.includes(p.bucketFilter) ? p.bucketFilter : 'all',
  };
};
