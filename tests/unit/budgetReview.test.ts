import { describe, expect, it } from 'vitest';
import { bucketForCategory, furthestOff, reviewBudget, statusFor, type BucketId } from '../../utils/budgetReview';
import type { Expense, Frequency, Person } from '../../types/budget';

const person = (monthlyIncome: number, id = 'p1'): Person => ({
  id,
  name: id,
  income: [{ id: `${id}-i`, amount: monthlyIncome, label: 'Pay', frequency: 'monthly', personId: id }],
});

let n = 0;
const expense = (
  amount: number,
  categoryTag: string | undefined,
  over: Partial<Expense> = {},
  frequency: Frequency = 'monthly'
): Expense => ({
  id: `e${n++}`,
  amount,
  description: categoryTag ?? 'none',
  category: 'household',
  frequency,
  date: '2026-01-01',
  categoryTag,
  ...over,
});

const bucket = (r: NonNullable<ReturnType<typeof reviewBudget>>, id: BucketId) => r.buckets.find((b) => b.id === id)!;

describe('bucketForCategory', () => {
  it('sorts the built-in categories', () => {
    expect(bucketForCategory('Rent').bucket).toBe('needs');
    expect(bucketForCategory('Mortgage').bucket).toBe('needs');
    expect(bucketForCategory('Loan').bucket).toBe('needs');
    expect(bucketForCategory('Credit Card').bucket).toBe('needs');
    expect(bucketForCategory('Eating Out').bucket).toBe('wants');
    expect(bucketForCategory('Misc').bucket).toBe('wants');
    expect(bucketForCategory('Savings').bucket).toBe('savings');
    expect(bucketForCategory('Investments').bucket).toBe('savings');
  });

  it('ignores case and stray spaces', () => {
    expect(bucketForCategory('  eating OUT ').bucket).toBe('wants');
    expect(bucketForCategory('GROCERIES').bucket).toBe('needs');
  });

  it('treats a missing tag as Misc, and a custom category as a want', () => {
    expect(bucketForCategory(undefined)).toEqual({ bucket: 'wants', custom: false });
    expect(bucketForCategory('Childcare')).toEqual({ bucket: 'wants', custom: true });
  });
});

describe('statusFor', () => {
  it('judges Needs and Wants as ceilings', () => {
    expect(statusFor('needs', 40)).toBe('onTrack');
    expect(statusFor('needs', 50)).toBe('onTrack');
    expect(statusFor('needs', 51)).toBe('close');
    expect(statusFor('needs', 55)).toBe('close');
    expect(statusFor('needs', 56)).toBe('off');
    expect(statusFor('wants', 30)).toBe('onTrack');
    expect(statusFor('wants', 35)).toBe('close');
    expect(statusFor('wants', 36)).toBe('off');
  });

  it('judges Savings as a floor', () => {
    expect(statusFor('savings', 35)).toBe('onTrack');
    expect(statusFor('savings', 20)).toBe('onTrack');
    expect(statusFor('savings', 19)).toBe('close');
    expect(statusFor('savings', 15)).toBe('close');
    expect(statusFor('savings', 14)).toBe('off');
    expect(statusFor('savings', 0)).toBe('off');
  });
});

describe('reviewBudget', () => {
  it('has nothing to measure against without income', () => {
    expect(reviewBudget([], [expense(100, 'Rent')])).toBeNull();
    expect(reviewBudget([person(0)], [expense(100, 'Rent')])).toBeNull();
  });

  it('reads a budget that matches the rule exactly', () => {
    const r = reviewBudget([person(4000)], [expense(2000, 'Rent'), expense(1200, 'Eating Out'), expense(800, 'Savings')])!;
    expect(r.incomeMonthly).toBe(4000);
    expect(r.spendingMonthly).toBe(4000);
    expect(r.leftoverMonthly).toBe(0);
    expect(r.overspent).toBe(false);
    expect(r.onTrackCount).toBe(3);
    expect(bucket(r, 'needs')).toMatchObject({ monthly: 2000, targetMonthly: 2000, gapMonthly: 0, shownPct: 50, status: 'onTrack' });
    expect(bucket(r, 'wants')).toMatchObject({ monthly: 1200, targetMonthly: 1200, shownPct: 30, status: 'onTrack' });
    expect(bucket(r, 'savings')).toMatchObject({ monthly: 800, targetMonthly: 800, shownPct: 20, status: 'onTrack' });
  });

  it('reports the gap to each target in money', () => {
    const r = reviewBudget([person(4000)], [expense(2400, 'Rent'), expense(1000, 'Entertainment'), expense(200, 'Savings')])!;
    expect(bucket(r, 'needs')).toMatchObject({ gapMonthly: 400, shownPct: 60, status: 'off' });
    expect(bucket(r, 'wants')).toMatchObject({ gapMonthly: -200, shownPct: 25, status: 'onTrack' });
    expect(bucket(r, 'savings')).toMatchObject({ gapMonthly: -600, shownPct: 5, status: 'off' });
    expect(r.onTrackCount).toBe(1);
    expect(r.leftoverMonthly).toBe(400);
  });

  it('judges the percentage that is shown, so a displayed 50% is never "over"', () => {
    // 2,010 of 4,000 is 50.25%: shown as 50%, on track.
    const r = reviewBudget([person(4000)], [expense(2010, 'Rent')])!;
    expect(bucket(r, 'needs').shownPct).toBe(50);
    expect(bucket(r, 'needs').status).toBe('onTrack');
  });

  it('flags spending beyond income and keeps the shares of income', () => {
    const r = reviewBudget([person(1000)], [expense(800, 'Rent'), expense(500, 'Takeaways')])!;
    expect(r.overspent).toBe(true);
    expect(r.leftoverMonthly).toBe(-300);
    expect(bucket(r, 'needs').shownPct).toBe(80);
    expect(bucket(r, 'wants').shownPct).toBe(50);
  });

  it('adds up several people and income sources, whatever the frequency', () => {
    const people: Person[] = [
      person(2000, 'a'),
      { id: 'b', name: 'b', income: [{ id: 'b1', amount: 500, label: 'Pay', frequency: 'weekly', personId: 'b' }] },
    ];
    const r = reviewBudget(people, [])!;
    // 2,000 a month plus 500 a week (26,000 a year) = 24,000 + 26,000 = 50,000 a year.
    expect(r.incomeMonthly).toBeCloseTo(50000 / 12, 2);
  });

  it('normalises frequencies to a monthly figure', () => {
    const r = reviewBudget(
      [person(5200)],
      [expense(100, 'Groceries', {}, 'weekly'), expense(1200, 'Utilities', {}, 'yearly'), expense(10, 'Transport', {}, 'daily')]
    )!;
    // 5,200 + 1,200 + 3,650 a year = 10,050 a year.
    expect(bucket(r, 'needs').monthly).toBeCloseTo(10050 / 12, 2);
  });

  it('leaves out expenses that have ended, keeps those with a future end date', () => {
    const r = reviewBudget(
      [person(4000)],
      [
        expense(500, 'Rent', { endDate: '2020-01-01' }),
        expense(300, 'Loan', { endDate: '2099-01-01' }),
        expense(100, 'Utilities'),
      ],
      '2026-10-02'
    )!;
    expect(bucket(r, 'needs').monthly).toBe(400);
  });

  it('counts both household and personal expenses', () => {
    const r = reviewBudget(
      [person(4000)],
      [expense(1000, 'Rent'), expense(200, 'Clothing', { category: 'personal', personId: 'p1' })]
    )!;
    expect(bucket(r, 'needs').monthly).toBe(1000);
    expect(bucket(r, 'wants').monthly).toBe(200);
  });

  it('groups categories within a bucket, biggest first, merging case variants', () => {
    const r = reviewBudget(
      [person(4000)],
      [expense(300, 'Groceries'), expense(1000, 'Rent'), expense(100, 'groceries'), expense(50, 'Childcare')]
    )!;
    expect(bucket(r, 'needs').categories.map((c) => [c.name, c.monthly])).toEqual([
      ['Rent', 1000],
      ['Groceries', 400],
    ]);
    const childcare = bucket(r, 'wants').categories[0];
    expect(childcare).toMatchObject({ name: 'Childcare', monthly: 50, custom: true });
    expect(childcare.pct).toBeCloseTo(1.25, 6);
  });

  it('gives an empty budget all zeros, with savings off and the rest on track', () => {
    const r = reviewBudget([person(3000)], [])!;
    expect(r.spendingMonthly).toBe(0);
    expect(r.leftoverMonthly).toBe(3000);
    expect(bucket(r, 'savings').status).toBe('off');
    expect(r.onTrackCount).toBe(2);
  });

  it('survives junk in the expense list', () => {
    const r = reviewBudget([person(1000)], [null as unknown as Expense, expense(NaN, 'Rent'), expense(100, 'Rent')])!;
    expect(bucket(r, 'needs').monthly).toBe(100);
  });
});

describe('furthestOff', () => {
  it('is null when every bucket is on track', () => {
    const r = reviewBudget([person(4000)], [expense(2000, 'Rent'), expense(1200, 'Eating Out'), expense(800, 'Savings')])!;
    expect(furthestOff(r)).toBeNull();
  });

  it('picks the bucket furthest from its target in points', () => {
    // Needs 60% (10 over), Wants 25% (fine), Savings 5% (15 under).
    const r = reviewBudget([person(4000)], [expense(2400, 'Rent'), expense(1000, 'Entertainment'), expense(200, 'Savings')])!;
    expect(furthestOff(r)?.id).toBe('savings');
  });
});

