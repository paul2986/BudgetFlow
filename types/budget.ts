
export interface Person {
  id: string;
  name: string;
  income: Income[];
  excludeFromHouseholdShare?: boolean; // pays nothing toward household expenses; the others split them
  updatedAt?: number; // epoch millis; bumped on any change to this person (incl. their income) for sync merging
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
  'Loan',
  'Credit Card',
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

export type DebtRepaymentType = 'loan' | 'mortgage' | 'credit_card';

// The debt categories drive the debt repayment tag; the form has no separate picker.
const DEBT_REPAYMENT_BY_CATEGORY: Record<string, DebtRepaymentType> = {
  Loan: 'loan',
  Mortgage: 'mortgage',
  'Credit Card': 'credit_card',
};

export const CATEGORY_BY_DEBT_REPAYMENT: Record<DebtRepaymentType, string> = {
  loan: 'Loan',
  mortgage: 'Mortgage',
  credit_card: 'Credit Card',
};

export const debtRepaymentForCategory = (categoryTag: string | undefined): DebtRepaymentType | undefined =>
  categoryTag ? DEBT_REPAYMENT_BY_CATEGORY[categoryTag] : undefined;

export type Frequency ='daily' | 'weekly' | 'monthly' | 'yearly' | 'one-time';

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
  debtRepayment?: DebtRepaymentType; // Derived from categoryTag (Loan / Mortgage / Credit Card)
  updatedAt?: number; // epoch millis; bumped on add/update for sync merging
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
  // Tombstones for deleted people/expenses: id -> deletion epoch millis. Used so a
  // delete on one device isn't resurrected when merging with another device's copy.
  deletions?: Record<string, number>;
  // Categories travel with the budget, so everyone sharing it sees the same list.
  customCategories?: CustomCategory[];
  deletedCategories?: Record<string, number>; // category name -> deletion epoch millis
}

// A user-created expense category. `name` is the normalized name and doubles
// as its id; `updatedAt` (epoch millis) decides merges against deletions.
export interface CustomCategory {
  name: string;
  updatedAt: number;
}

// The device's copy of everything the account can open. Each budget syncs as
// its own server row; `activeBudgetId` and `deletedBudgets` stay on the device.
export interface AppDataV2 {
  version: 2;
  budgets: Budget[];
  activeBudgetId: string;
  // Budgets deleted or left on this device (id -> epoch millis), so the next
  // sync removes them from the server instead of downloading them again.
  deletedBudgets?: Record<string, number>;
}

// What the signed-in user can do with a synced budget.
export interface BudgetSharing {
  role: 'owner' | 'editor';
  memberCount: number;
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
