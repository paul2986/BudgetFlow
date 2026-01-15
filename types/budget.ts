
export interface Person {
  id: string;
  name: string;
  income: Income[];
}

export interface Income {
  id: string;
  amount: number;
  label: string;
  frequency: Frequency;
  personId: string;
}

export type ExpenseCategory = string;

export const DEFAULT_CATEGORIES: string[] = [
  'Groceries',
  'Rent',
  'Mortgage',
  'Utilities',
  'Transport',
  'Entertainment',
  'Healthcare',
  'Clothing',
  'Takeaways',
  'Eating Out',
  'Savings',
  'Investments',
  'Misc',
];

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time';

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: 'household' | 'personal';
  frequency: Frequency;
  personId?: string; // Optional for household expenses, required for personal expenses
  date: string; // ISO string for the start/added date
  notes?: string; // Optional notes for additional context
  categoryTag?: ExpenseCategory; // Optional category tag for filtering/reporting (default 'Misc')
  endDate?: string; // YYYY-MM-DD, optional end date for recurring expenses (frequency != 'one-time')
}

export interface HouseholdSettings {
  distributionMethod: 'even' | 'income-based';
}

// Budget lock settings
export interface BudgetLockSettings {
  locked: boolean;
  autoLockMinutes: number;
  lastUnlockAt?: string;
}

// New multi-budget entities (v2)
export interface Budget {
  id: string;
  name: string;
  people: Person[];
  expenses: Expense[];
  householdSettings: HouseholdSettings;
  createdAt: number; // epoch millis
  modifiedAt: number; // epoch millis
  lock?: BudgetLockSettings; // Default: { locked: false, autoLockMinutes: 0 }
}

export interface AppDataV2 {
  version: 2;
  budgets: Budget[];
  activeBudgetId: string;
}

/**
 * Types for Tools: Credit Card Payoff Calculator
 */
export interface CreditCardPaymentRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  remaining: number;
}

export interface CreditCardPayoffResult {
  neverRepaid: boolean;
  months: number;
  totalInterest: number;
  schedule: CreditCardPaymentRow[];
  inputs: { balance: number; apr: number; monthlyPayment: number };
  monthlyRate: number;
}
