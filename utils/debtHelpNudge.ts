import { debtRepaymentForCategory } from '../types/budget';
import type { BudgetReview } from './budgetReview';

/**
 * When to quietly mention Debt help. It reads the same monthly review as Budget
 * review (so the figures match what's on screen) and looks for two signs that
 * money may be stretched:
 *
 * - `overspent`: spending is at least OVERSPEND_PCT above income.
 * - `debtPayments`: loan and credit card payments take at least
 *   UNSECURED_DEBT_PCT of income. Mortgage is left out: it's secured, and a large
 *   mortgage is a housing cost more often than a sign of trouble.
 *
 * These are prompts to look at help, not a diagnosis, and are set high on purpose
 * so a slightly-over month doesn't raise it. Both are judged on the rounded
 * percentage that the message shows, as Budget review does with its statuses.
 */

export const OVERSPEND_PCT = 5;
export const UNSECURED_DEBT_PCT = 30;

/** "Not now" hides the prompt for this long; if the signs persist, it comes back. */
export const DISMISS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DebtHelpSignal =
  | { reason: 'overspent'; /** Percent of income that spending runs over by, rounded. */ pct: number }
  | { reason: 'debtPayments'; /** Percent of income that loan and credit card payments take, rounded. */ pct: number };

export const debtHelpSignal = (review: BudgetReview | null): DebtHelpSignal | null => {
  if (!review || review.incomeMonthly <= 0) return null;

  const overPct = Math.round((-review.leftoverMonthly / review.incomeMonthly) * 100);
  if (overPct >= OVERSPEND_PCT) return { reason: 'overspent', pct: overPct };

  // Wherever a category is counted (Needs by default, but it can be moved), its payments are still debt.
  let debtShare = 0;
  for (const bucket of review.buckets) {
    for (const category of bucket.categories) {
      const kind = debtRepaymentForCategory(category.name);
      if (kind === 'loan' || kind === 'credit_card') debtShare += category.pct;
    }
  }
  const debtPct = Math.round(debtShare);
  if (debtPct >= UNSECURED_DEBT_PCT) return { reason: 'debtPayments', pct: debtPct };

  return null;
};

/**
 * Whether a "Not now" at `dismissedAt` (epoch millis) still hides the prompt.
 * A time in the future means the clock moved, so it isn't trusted: better to show
 * the prompt than to hide it for far longer than intended.
 */
export const isNudgeDismissed = (dismissedAt: number | null, now: number): boolean =>
  dismissedAt != null && dismissedAt <= now && now - dismissedAt < DISMISS_DAYS * DAY_MS;

export const nudgeMessage = (signal: DebtHelpSignal): string =>
  signal.reason === 'overspent'
    ? `Your spending is about ${signal.pct}% more than your income. If that’s hard to keep up, free, impartial debt advice is available in the UK.`
    : `Loan and credit card payments take about ${signal.pct}% of your income. If that’s getting hard to manage, free, impartial debt advice is available in the UK.`;
