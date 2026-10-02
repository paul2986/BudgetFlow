import { Expense, Person } from '../types/budget';
import { calculateAnnualAmount, calculateTotalIncome, isExpenseActive } from './calculations';

/**
 * 50/30/20 budget review: sorts a budget's active expenses into Needs, Wants and
 * Savings and measures each against income. All maths for the review lives here
 * so the screen only draws it.
 *
 * Totals use the same helpers as the Overview (annual amounts, active expenses
 * only), so the figures reconcile with the dashboard.
 */

export type BucketId = 'needs' | 'wants' | 'savings';
export type BucketStatus = 'onTrack' | 'close' | 'off';

export const BUCKET_ORDER: BucketId[] = ['needs', 'wants', 'savings'];

/** The framework: share of income each bucket should take. Needs and Wants are ceilings, Savings is a floor. */
export const TARGET_PCT: Record<BucketId, number> = { needs: 50, wants: 30, savings: 20 };

/** Percentage points either side of a target that still counts as "close" rather than "off". */
export const CLOSE_MARGIN = 5;

/**
 * Where each built-in category lands. Loan and Credit Card sit in Needs because
 * the app can't tell a minimum payment (a need) from an extra one (saving).
 * Anything not listed, including custom categories, counts as a want.
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

/** The bucket a category counts towards, and whether that's a built-in decision or the custom-category default. */
export const bucketForCategory = (tag: string | undefined): { bucket: BucketId; custom: boolean } => {
  const known = BUCKET_BY_CATEGORY[categoryKey(tag)];
  return known ? { bucket: known, custom: false } : { bucket: 'wants', custom: true };
};

export interface CategoryShare {
  name: string;
  monthly: number;
  /** Share of income, in percent. */
  pct: number;
  /** A custom category, counted as a want by default. */
  custom: boolean;
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
  categories: CategoryShare[];
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

/**
 * Review the budget against 50/30/20. Returns null when there is no income to
 * measure against. An empty expense list is a valid review (all zeros), left to
 * the caller to present.
 */
export const reviewBudget = (people: Person[], expenses: Expense[], asOf?: string): BudgetReview | null => {
  const incomeAnnual = cents(calculateTotalIncome(people ?? []));
  if (incomeAnnual <= 0) return null;

  const annualByBucket: Record<BucketId, number> = { needs: 0, wants: 0, savings: 0 };
  const categoryAnnual: Record<BucketId, Map<string, { name: string; annual: number; custom: boolean }>> = {
    needs: new Map(),
    wants: new Map(),
    savings: new Map(),
  };

  for (const expense of expenses ?? []) {
    if (!expense || typeof expense.amount !== 'number' || isNaN(expense.amount)) continue;
    if (!isExpenseActive(expense, asOf)) continue;
    const annual = cents(calculateAnnualAmount(expense.amount, expense.frequency));
    const { bucket, custom } = bucketForCategory(expense.categoryTag);
    annualByBucket[bucket] += annual;

    const key = categoryKey(expense.categoryTag);
    const entry = categoryAnnual[bucket].get(key);
    if (entry) entry.annual += annual;
    else categoryAnnual[bucket].set(key, { name: (expense.categoryTag || 'Misc').trim() || 'Misc', annual, custom });
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
      .map((c) => ({ name: c.name, monthly: monthly(c.annual), pct: (c.annual / incomeAnnual) * 100, custom: c.custom }));
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
