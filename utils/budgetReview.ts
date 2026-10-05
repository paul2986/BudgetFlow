import type { BucketId, Budget, Expense, Person } from '../types/budget';
import { calculateAnnualAmount, calculateTotalIncome, isExpenseActive } from './calculations';

/**
 * 50/30/20 budget review: sorts a budget's active expenses into Needs, Wants and
 * Savings and measures each against income. All maths for the review lives here
 * so the screen only draws it.
 *
 * Totals use the same helpers as the Overview (annual amounts, active expenses
 * only), so the figures reconcile with the dashboard.
 */

export type { BucketId };
export type BucketStatus = 'onTrack' | 'close' | 'off';

export const BUCKET_ORDER: BucketId[] = ['needs', 'wants', 'savings'];

/** The framework: share of income each bucket should take. Needs and Wants are ceilings, Savings is a floor. */
export const TARGET_PCT: Record<BucketId, number> = { needs: 50, wants: 30, savings: 20 };

/** Percentage points either side of a target that still counts as "close" rather than "off". */
export const CLOSE_MARGIN = 5;

/**
 * Where each built-in category lands. Loan and Credit Card sit in Needs because
 * the app can't tell a minimum payment (a need) from an extra one (saving).
 * Anything not listed, including custom categories, counts as a want. People
 * sharing a budget can move any category to another bucket (Budget.categoryBuckets),
 * and any single expense can count somewhere else again (Expense.bucket).
 */
const BUCKET_BY_CATEGORY: Record<string, BucketId> = {
  rent: 'needs',
  mortgage: 'needs',
  utilities: 'needs',
  groceries: 'needs',
  transport: 'needs',
  healthcare: 'needs',
  loan: 'needs',
  'credit card': 'needs',
  entertainment: 'wants',
  clothing: 'wants',
  takeaways: 'wants',
  'eating out': 'wants',
  misc: 'wants',
  savings: 'savings',
  investments: 'savings',
};

const categoryKey = (tag: string | undefined): string => (tag || 'Misc').trim().toLowerCase() || 'misc';

/** The default bucket for a category, and whether that's a built-in decision or the custom-category default. */
export const bucketForCategory = (tag: string | undefined): { bucket: BucketId; custom: boolean } => {
  const known = BUCKET_BY_CATEGORY[categoryKey(tag)];
  return known ? { bucket: known, custom: false } : { bucket: 'wants', custom: true };
};

export const isBucketId = (value: unknown): value is BucketId =>
  value === 'needs' || value === 'wants' || value === 'savings';

/** The budget's category choices by lower-cased name, leaving out "back to default" entries. */
export type CategoryBucketLookup = ReadonlyMap<string, BucketId>;

export const categoryBucketLookup = (choices: Budget['categoryBuckets']): CategoryBucketLookup => {
  const lookup = new Map<string, BucketId>();
  for (const [name, entry] of Object.entries(choices ?? {})) {
    if (entry?.bucket) lookup.set(categoryKey(name), entry.bucket);
  }
  return lookup;
};

/** Where a category counts once the budget's own choices are applied. */
export const resolveBucket = (
  tag: string | undefined,
  lookup?: CategoryBucketLookup
): { bucket: BucketId; defaultBucket: BucketId; custom: boolean; moved: boolean } => {
  const { bucket: defaultBucket, custom } = bucketForCategory(tag);
  const chosen = lookup?.get(categoryKey(tag));
  const bucket = chosen ?? defaultBucket;
  return { bucket, defaultBucket, custom, moved: bucket !== defaultBucket };
};

/**
 * Where an expense counts in the review: its own choice, else where its category
 * counts. The one place the Expenses filter, the bulk edit and the review itself
 * agree on this.
 */
export const bucketOfExpense = (expense: Pick<Expense, 'bucket' | 'categoryTag'>, lookup?: CategoryBucketLookup): BucketId =>
  isBucketId(expense.bucket) ? expense.bucket : resolveBucket(expense.categoryTag, lookup).bucket;

/** What to store for a choice: picking a category's default bucket clears the choice (null). */
export const bucketToStore = (tag: string | undefined, chosen: BucketId): BucketId | null =>
  chosen === bucketForCategory(tag).bucket ? null : chosen;

export interface CategoryShare {
  name: string;
  monthly: number;
  /** Share of income, in percent. */
  pct: number;
  /** A custom category, counted as a want unless it has been moved. */
  custom: boolean;
  /** Where it would count with no choice made. */
  defaultBucket: BucketId;
  /** Counted somewhere other than its default. */
  moved: boolean;
}

/** One expense counted here by its own choice rather than by its category's. */
export interface ExpenseShare {
  id: string;
  description: string;
  /** The expense's category, as written. */
  category: string;
  monthly: number;
  /** Share of income, in percent. */
  pct: number;
  /** Where its category counts, so the row can say what it was moved from. */
  categoryBucket: BucketId;
}

export interface BucketReview {
  id: BucketId;
  targetPct: number;
  /** Rounded for display; `status` is judged on this, so what's shown never contradicts the verdict. */
  shownPct: number;
  pct: number;
  monthly: number;
  targetMonthly: number;
  /** Actual minus target, per month: positive means above the target. */
  gapMonthly: number;
  status: BucketStatus;
  /** The bucket's categories, not counting expenses that chose a bucket of their own. */
  categories: CategoryShare[];
  /** Expenses counted here by their own choice, largest first. */
  expenses: ExpenseShare[];
}

export interface BudgetReview {
  incomeMonthly: number;
  spendingMonthly: number;
  /** Income minus spending; negative when spending exceeds income. */
  leftoverMonthly: number;
  overspent: boolean;
  buckets: BucketReview[];
  onTrackCount: number;
}

const cents = (n: number): number => Math.round(n * 100);
const monthly = (annualCents: number): number => Math.round(annualCents / 12) / 100;

/** Needs and Wants must not exceed their target; Savings must reach it. */
export const statusFor = (id: BucketId, shownPct: number): BucketStatus => {
  const target = TARGET_PCT[id];
  const shortfall = id === 'savings' ? target - shownPct : shownPct - target;
  if (shortfall <= 0) return 'onTrack';
  return shortfall <= CLOSE_MARGIN ? 'close' : 'off';
};

/** How far a bucket is on the wrong side of its target, in percentage points (0 when on track). */
export const missPoints = (b: Pick<BucketReview, 'id' | 'shownPct' | 'targetPct'>): number =>
  Math.max(0, b.id === 'savings' ? b.targetPct - b.shownPct : b.shownPct - b.targetPct);

/** The bucket furthest from its target, or null when every one is on track. */
export const furthestOff = (review: BudgetReview): BucketReview | null => {
  let worst: BucketReview | null = null;
  for (const b of review.buckets) {
    if (b.status !== 'onTrack' && (!worst || missPoints(b) > missPoints(worst))) worst = b;
  }
  return worst;
};

export interface ReviewOptions {
  /** The date to judge "active" by; today unless a test says otherwise. */
  asOf?: string;
  /** The budget's own choices of where categories count (Budget.categoryBuckets). */
  buckets?: Budget['categoryBuckets'];
}

/**
 * Review the budget against 50/30/20. Returns null when there is no income to
 * measure against. An empty expense list is a valid review (all zeros), left to
 * the caller to present.
 */
export const reviewBudget = (
  people: Person[],
  expenses: Expense[],
  { asOf, buckets: choices }: ReviewOptions = {}
): BudgetReview | null => {
  const incomeAnnual = cents(calculateTotalIncome(people ?? []));
  if (incomeAnnual <= 0) return null;

  const annualByBucket: Record<BucketId, number> = { needs: 0, wants: 0, savings: 0 };
  const lookup = categoryBucketLookup(choices);
  type CategoryTotal = { name: string; annual: number; custom: boolean; defaultBucket: BucketId };
  const categoryAnnual: Record<BucketId, Map<string, CategoryTotal>> = {
    needs: new Map(),
    wants: new Map(),
    savings: new Map(),
  };
  type ExpenseTotal = Omit<ExpenseShare, 'monthly' | 'pct'> & { annual: number };
  const ownChoice: Record<BucketId, ExpenseTotal[]> = { needs: [], wants: [], savings: [] };

  for (const expense of expenses ?? []) {
    if (!expense || typeof expense.amount !== 'number' || isNaN(expense.amount)) continue;
    if (!isExpenseActive(expense, asOf)) continue;
    const annual = cents(calculateAnnualAmount(expense.amount, expense.frequency));
    const resolved = resolveBucket(expense.categoryTag, lookup);
    const name = (expense.categoryTag || 'Misc').trim() || 'Misc';

    // An expense's own choice beats its category's. One that matches the
    // category's bucket changes nothing, so it stays in the category's row.
    const own = isBucketId(expense.bucket) ? expense.bucket : undefined;
    if (own && own !== resolved.bucket) {
      annualByBucket[own] += annual;
      ownChoice[own].push({
        id: expense.id,
        description: (expense.description || '').trim() || name,
        category: name,
        annual,
        categoryBucket: resolved.bucket,
      });
      continue;
    }

    const { bucket, custom, defaultBucket } = resolved;
    annualByBucket[bucket] += annual;

    const key = categoryKey(expense.categoryTag);
    const entry = categoryAnnual[bucket].get(key);
    if (entry) entry.annual += annual;
    else categoryAnnual[bucket].set(key, { name, annual, custom, defaultBucket });
  }

  const incomeMonthly = monthly(incomeAnnual);
  const buckets: BucketReview[] = BUCKET_ORDER.map((id) => {
    const bucketAnnual = annualByBucket[id];
    const pct = (bucketAnnual / incomeAnnual) * 100;
    const shownPct = Math.round(pct);
    const targetPct = TARGET_PCT[id];
    const bucketMonthly = monthly(bucketAnnual);
    const targetMonthly = Math.round((incomeAnnual * targetPct) / 100 / 12) / 100;
    const categories: CategoryShare[] = Array.from(categoryAnnual[id].values())
      .sort((a, b) => b.annual - a.annual)
      .map((c) => ({
        name: c.name,
        monthly: monthly(c.annual),
        pct: (c.annual / incomeAnnual) * 100,
        custom: c.custom,
        defaultBucket: c.defaultBucket,
        moved: c.defaultBucket !== id,
      }));
    const expenseShares: ExpenseShare[] = ownChoice[id]
      .sort((a, b) => b.annual - a.annual || a.description.localeCompare(b.description))
      .map(({ annual, ...rest }) => ({ ...rest, monthly: monthly(annual), pct: (annual / incomeAnnual) * 100 }));
    return {
      id,
      targetPct,
      shownPct,
      pct,
      monthly: bucketMonthly,
      targetMonthly,
      gapMonthly: Math.round((bucketMonthly - targetMonthly) * 100) / 100,
      status: statusFor(id, shownPct),
      categories,
      expenses: expenseShares,
    };
  });

  const spendingAnnual = annualByBucket.needs + annualByBucket.wants + annualByBucket.savings;
  const leftoverAnnual = incomeAnnual - spendingAnnual;

  return {
    incomeMonthly,
    spendingMonthly: monthly(spendingAnnual),
    leftoverMonthly: monthly(leftoverAnnual),
    overspent: leftoverAnnual < 0,
    buckets,
    onTrackCount: buckets.filter((b) => b.status === 'onTrack').length,
  };
};

/**
 * How `suggestSaving` reached its amount:
 * - `reaches`: the amount closes the gap to the Savings target, with money to spare or none.
 * - `short`: all the free money, and Savings still falls under its target.
 * - `bonus`: Savings already meets its target, so the free money is extra.
 */
export type SavingMode = 'reaches' | 'short' | 'bonus';

export interface SavingSuggestion {
  /** Whole currency units per month, rounded down so it never promises more than is free. */
  amount: number;
  mode: SavingMode;
  /** Savings as a share of income if the amount went in, rounded like `shownPct`. */
  pctAfter: number;
}

/**
 * The monthly amount to hand to the savings calculator: unallocated money, up to
 * what Savings is short of its target. Savings is a floor, so once it's met the
 * free money is all offered. Returns null when nothing is free to move.
 */
export const suggestSaving = (review: BudgetReview): SavingSuggestion | null => {
  const savings = review.buckets.find((b) => b.id === 'savings');
  if (!savings || review.overspent || review.incomeMonthly <= 0) return null;

  // A gap under one unit is a rounding sliver: the target is met, as far as anyone can tell.
  const gap = savings.targetMonthly - savings.monthly;
  const closing = gap >= 1;
  const free = review.leftoverMonthly;
  const amount = Math.floor(closing ? Math.min(gap, free) : free);
  if (amount < 1) return null;

  const pctAfter = Math.round(((savings.monthly + amount) / review.incomeMonthly) * 100);
  const mode: SavingMode = !closing ? 'bonus' : pctAfter >= savings.targetPct ? 'reaches' : 'short';
  return { amount, mode, pctAfter };
};
