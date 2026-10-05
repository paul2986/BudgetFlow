import { describe, expect, it } from 'vitest';
import {
  DISMISS_DAYS,
  OVERSPEND_PCT,
  UNSECURED_DEBT_PCT,
  debtHelpSignal,
  isNudgeDismissed,
  nudgeMessage,
} from '../../utils/debtHelpNudge';
import { reviewBudget } from '../../utils/budgetReview';
import type { Budget, Expense, Person } from '../../types/budget';

const person = (monthlyIncome: number): Person => ({
  id: 'p1',
  name: 'p1',
  income: [{ id: 'p1-i', amount: monthlyIncome, label: 'Pay', frequency: 'monthly', personId: 'p1' }],
});

let n = 0;
const expense = (amount: number, categoryTag: string): Expense => ({
  id: `e${n++}`,
  amount,
  description: categoryTag,
  category: 'household',
  frequency: 'monthly',
  date: '2026-01-01',
  categoryTag,
});

const signalFor = (income: number, spending: [string, number][], buckets?: Budget['categoryBuckets']) =>
  debtHelpSignal(reviewBudget([person(income)], spending.map(([tag, amount]) => expense(amount, tag)), { buckets }));

describe('debtHelpSignal: spending over income', () => {
  it('stays quiet for a month that is only slightly over', () => {
    expect(signalFor(2000, [['Rent', 1000], ['Groceries', 500], ['Eating Out', 560]])).toBeNull(); // 3% over
  });

  it('speaks up at the threshold, and names how far over', () => {
    expect(signalFor(2000, [['Rent', 1100], ['Groceries', 500], ['Eating Out', 500]])).toEqual({ reason: 'overspent', pct: OVERSPEND_PCT });
    expect(signalFor(2000, [['Rent', 1200], ['Groceries', 600], ['Eating Out', 400]])).toEqual({ reason: 'overspent', pct: 10 });
  });

  it('judges on the rounded percentage that the message shows', () => {
    // 4.5% over rounds to 5, so it counts; 4.4% rounds to 4, so it does not.
    expect(signalFor(2000, [['Rent', 2090]])?.reason).toBe('overspent');
    expect(signalFor(2000, [['Rent', 2088]])).toBeNull();
  });

  it('is quiet when spending is within income', () => {
    expect(signalFor(3000, [['Rent', 1000], ['Groceries', 400]])).toBeNull();
  });
});

describe('debtHelpSignal: loan and credit card payments', () => {
  it('speaks up when they take the threshold share of income', () => {
    const s = signalFor(2500, [['Rent', 800], ['Loan', 450], ['Credit Card', 300]]); // 750 = 30%
    expect(s).toEqual({ reason: 'debtPayments', pct: UNSECURED_DEBT_PCT });
  });

  it('stays quiet just under it', () => {
    expect(signalFor(2500, [['Rent', 800], ['Loan', 400], ['Credit Card', 300]])).toBeNull(); // 28%
  });

  it('does not count a mortgage', () => {
    expect(signalFor(2500, [['Mortgage', 1500], ['Groceries', 300]])).toBeNull(); // 60% on mortgage
  });

  it('still counts a loan the budget has moved to another bucket', () => {
    const moved = { Loan: { bucket: 'wants' as const, updatedAt: 1 }, 'Credit Card': { bucket: 'savings' as const, updatedAt: 1 } };
    expect(signalFor(2500, [['Rent', 800], ['Loan', 450], ['Credit Card', 400]], moved)?.reason).toBe('debtPayments');
  });

  it('still counts a loan or card payment that a single expense has moved to Wants', () => {
    const review = reviewBudget(
      [person(2500)],
      [expense(800, 'Rent'), { ...expense(450, 'Loan'), bucket: 'wants' }, { ...expense(300, 'Credit Card'), bucket: 'savings' }]
    );
    expect(review!.buckets.find((b) => b.id === 'needs')!.categories.map((c) => c.name)).toEqual(['Rent']); // nothing debt left in Needs
    expect(debtHelpSignal(review)).toEqual({ reason: 'debtPayments', pct: UNSECURED_DEBT_PCT });
  });

  it('puts overspending first when both apply', () => {
    expect(signalFor(2000, [['Rent', 1000], ['Loan', 700], ['Credit Card', 600]])?.reason).toBe('overspent');
  });
});

describe('debtHelpSignal: nothing to judge', () => {
  it('is null without a review (no income, or locked)', () => {
    expect(debtHelpSignal(null)).toBeNull();
    expect(debtHelpSignal(reviewBudget([], [expense(500, 'Rent')]))).toBeNull();
  });
});

describe('isNudgeDismissed', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 4);

  it('is not dismissed when never dismissed', () => {
    expect(isNudgeDismissed(null, now)).toBe(false);
  });

  it('hides it for the dismissal period, then lets it back', () => {
    expect(isNudgeDismissed(now - 1 * DAY, now)).toBe(true);
    expect(isNudgeDismissed(now - (DISMISS_DAYS * DAY - 1), now)).toBe(true);
    expect(isNudgeDismissed(now - DISMISS_DAYS * DAY, now)).toBe(false);
    expect(isNudgeDismissed(now - 90 * DAY, now)).toBe(false);
  });

  it('does not trust a dismissal from the future (clock moved)', () => {
    expect(isNudgeDismissed(now + 5 * DAY, now)).toBe(false);
  });
});

describe('nudgeMessage', () => {
  it('says what it saw, in plain words, with the percentage', () => {
    expect(nudgeMessage({ reason: 'overspent', pct: 12 })).toMatch(/about 12% more than your income/);
    expect(nudgeMessage({ reason: 'debtPayments', pct: 34 })).toMatch(/Loan and credit card payments take about 34% of your income/);
  });

  it('offers help without alarm or advice', () => {
    for (const s of [{ reason: 'overspent', pct: 9 }, { reason: 'debtPayments', pct: 40 }] as const) {
      expect(nudgeMessage(s)).toMatch(/free, impartial debt advice is available/);
      expect(nudgeMessage(s)).not.toMatch(/you must|urgent|danger|crisis|bankrupt/i);
    }
  });
});
