import { Budget, Expense } from '../../types/budget';

let counter = 0;
export const uniqueId = (prefix: string) => `${prefix}_${Date.now()}_${counter++}_${Math.random().toString(36).slice(2, 7)}`;

export const makeBudget = (overrides: Partial<Budget> = {}): Budget => ({
  id: uniqueId('budget'),
  name: 'Family',
  people: [],
  expenses: [],
  householdSettings: { distributionMethod: 'even' },
  createdAt: 1,
  modifiedAt: 1,
  lock: { locked: false, autoLockMinutes: 0 },
  ...overrides,
});

export const makeExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: uniqueId('expense'),
  amount: 10,
  description: 'Expense',
  category: 'household',
  frequency: 'monthly',
  date: '2026-10-01',
  categoryTag: 'Misc',
  updatedAt: 1,
  ...overrides,
});

export const descriptions = (budget: Budget | undefined) =>
  (budget?.expenses || []).map((e) => e.description).sort();
