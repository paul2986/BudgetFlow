import { describe, expect, it } from 'vitest';
import { makeExpense } from '../helpers/fixtures';
import {
  NO_FILTERS,
  filterExpenses,
  hasActiveFilters,
  parseSavedFilters,
  sortExpenses,
  toSavedFilters,
  type ExpenseFilters,
} from '../../utils/expenseFilters';
import type { BucketId, Expense, Person } from '../../types/budget';

const person = (id: string, name: string): Person => ({ id, name, income: [] });
const people = [person('p1', 'Alex'), person('p2', 'billie')];

const rent = makeExpense({ id: 'rent', description: 'Rent', amount: 1200, categoryTag: 'Rent', date: '2026-01-01' });
const coffee = makeExpense({ id: 'coffee', description: 'Coffee beans', amount: 5, frequency: 'daily', categoryTag: 'Groceries', date: '2026-03-01' });
const gym = makeExpense({ id: 'gym', description: 'Gym', amount: 40, category: 'personal', personId: 'p1', categoryTag: 'Misc', endDate: '2026-12-31', date: '2026-02-01' });
const phone = makeExpense({ id: 'phone', description: 'Phone', amount: 30, category: 'personal', personId: 'p2', categoryTag: 'Utilities', date: '2026-04-01' });
const card = makeExpense({ id: 'card', description: 'Credit card', amount: 100, categoryTag: 'Credit Card', debtRepayment: 'credit_card', date: '2026-05-01' });
const loan = makeExpense({ id: 'loan', description: 'Car loan', amount: 250, categoryTag: 'Loan', debtRepayment: 'loan', endDate: '2027-06-30', date: '2026-06-01' });
const holiday = makeExpense({ id: 'holiday', description: 'Holiday', amount: 900, frequency: 'one-time', endDate: '2026-08-01', categoryTag: 'Misc', date: '2026-07-01' });
const all = [rent, coffee, gym, phone, card, loan, holiday];

const bucketOf = (e: Expense): BucketId => (e.id === 'coffee' || e.id === 'rent' ? 'needs' : e.id === 'gym' ? 'savings' : 'wants');
const ids = (list: Expense[]) => list.map((e) => e.id);
const pick = (changes: Partial<ExpenseFilters>) => ids(filterExpenses(all, { ...NO_FILTERS, ...changes }, bucketOf));

describe('filtering expenses', () => {
  it('shows everything when nothing is filtered', () => {
    expect(pick({})).toEqual(ids(all));
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it('filters by household or personal', () => {
    expect(pick({ type: 'personal' })).toEqual(['gym', 'phone']);
    expect(pick({ type: 'household' })).toEqual(['rent', 'coffee', 'card', 'loan', 'holiday']);
  });

  it('filters by person', () => {
    expect(pick({ personId: 'p2' })).toEqual(['phone']);
  });

  it('filters by one or several categories, ignoring how they are written', () => {
    expect(pick({ categories: ['Misc'] })).toEqual(['gym', 'holiday']);
    expect(pick({ categories: ['groceries', 'LOAN'] })).toEqual(['coffee', 'loan']);
  });

  it('counts an expense with no category as Misc', () => {
    const untagged = makeExpense({ id: 'x', categoryTag: undefined as any });
    expect(filterExpenses([untagged], { ...NO_FILTERS, categories: ['Misc'] }, bucketOf)).toHaveLength(1);
  });

  it('searches descriptions, ignoring case and surrounding spaces', () => {
    expect(pick({ search: '  COFFEE ' })).toEqual(['coffee']);
    expect(pick({ search: '   ' })).toEqual(ids(all));
  });

  it('only recurring expenses with an end date pass the end date filter', () => {
    expect(pick({ hasEndDate: true })).toEqual(['gym', 'loan']);
  });

  it('filters debt repayments: any, or one kind', () => {
    expect(pick({ debt: 'any' })).toEqual(['card', 'loan']);
    expect(pick({ debt: 'loan' })).toEqual(['loan']);
    expect(pick({ debt: 'mortgage' })).toEqual([]);
  });

  it('filters by where the expense counts in the budget review', () => {
    expect(pick({ bucket: 'needs' })).toEqual(['rent', 'coffee']);
    expect(pick({ bucket: 'savings' })).toEqual(['gym']);
  });

  it('applies every filter together', () => {
    expect(pick({ type: 'household', debt: 'any', search: 'car loan' })).toEqual(['loan']);
    expect(hasActiveFilters({ ...NO_FILTERS, search: 'car' })).toBe(true);
  });

  it('does not change the list it is given', () => {
    const before = ids(all);
    filterExpenses(all, { ...NO_FILTERS, type: 'personal' }, bucketOf);
    expect(ids(all)).toEqual(before);
  });
});

describe('sorting expenses', () => {
  const sorted = (by: any, order: 'asc' | 'desc' = 'asc') => ids(sortExpenses(all, { by, order }, people));

  it('sorts by date, name and amount', () => {
    expect(sorted('date')).toEqual(['rent', 'gym', 'coffee', 'phone', 'card', 'loan', 'holiday']);
    expect(sorted('date', 'desc')).toEqual(['holiday', 'loan', 'card', 'phone', 'coffee', 'gym', 'rent']);
    expect(sorted('alphabetical')).toEqual(['loan', 'coffee', 'card', 'gym', 'holiday', 'phone', 'rent']);
    expect(sorted('cost', 'desc')).toEqual(['rent', 'holiday', 'loan', 'card', 'gym', 'phone', 'coffee']);
  });

  it('sorts by who it is assigned to, by name, with household expenses sorting as "household"', () => {
    // alex, billie (case-insensitive), then household; ties keep their order.
    expect(sorted('assignedTo')).toEqual(['gym', 'phone', 'rent', 'coffee', 'card', 'loan', 'holiday']);
  });

  it('sorts expenses with no end date after those that have one, and the reverse when descending', () => {
    expect(sorted('endDate').slice(0, 3)).toEqual(['holiday', 'gym', 'loan']);
    expect(sorted('endDate', 'desc').slice(-3)).toEqual(['loan', 'gym', 'holiday']);
  });

  it('sorts debt repayments by kind name, with everything else as "general"', () => {
    const kinds = sortExpenses(all, { by: 'debtRepayment', order: 'asc' }, people).map((e) => e.debtRepayment ?? 'general');
    // credit card, general, loan (alphabetical by label)
    expect(kinds).toEqual(['credit_card', ...Array(5).fill('general'), 'loan']);
  });

  it('returns a new array and leaves the original order alone', () => {
    const before = ids(all);
    sortExpenses(all, { by: 'cost', order: 'desc' }, people);
    expect(ids(all)).toEqual(before);
  });
});

describe('saving filters', () => {
  it('round-trips every filter', () => {
    const f: ExpenseFilters = { type: 'personal', personId: 'p1', categories: ['Loan', 'Misc'], search: 'x', hasEndDate: true, debt: 'loan', bucket: 'needs' };
    expect(parseSavedFilters(toSavedFilters(f))).toEqual(f);
  });

  it('keeps the first category where older versions look for it', () => {
    expect(toSavedFilters({ ...NO_FILTERS, categories: ['Loan', 'Misc'] }).category).toBe('Loan');
    expect(toSavedFilters(NO_FILTERS).category).toBeNull();
  });

  it('reads the old single category, and ignores junk', () => {
    expect(parseSavedFilters({ category: 'loan' }).categories).toEqual(['Loan']);
    expect(parseSavedFilters({ categories: ['Loan', 7, 'loan'] }).categories).toEqual(['Loan']);
    expect(parseSavedFilters({ filter: 'sideways', debtFilter: 4, bucketFilter: 'x', search: 9 })).toEqual(NO_FILTERS);
    expect(parseSavedFilters(null)).toEqual(NO_FILTERS);
  });
});
