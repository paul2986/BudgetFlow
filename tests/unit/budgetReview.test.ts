import { describe, expect, it } from 'vitest';
import {
  bucketForCategory,
  bucketOfExpense,
  bucketToStore,
  categoryBucketLookup,
  furthestOff,
  resolveBucket,
  reviewBudget,
  statusFor,
  suggestSaving,
  type BucketId,
} from '../../utils/budgetReview';
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
      { asOf: '2026-10-02' }
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

describe('category choices', () => {
  const choice = (bucket: BucketId | null) => ({ bucket, updatedAt: 1 });

  it('applies a choice whatever the case, and says where the category moved from', () => {
    const lookup = categoryBucketLookup({ Childcare: choice('needs'), Loan: choice('savings') });
    expect(resolveBucket('childcare', lookup)).toEqual({ bucket: 'needs', defaultBucket: 'wants', custom: true, moved: true });
    expect(resolveBucket('Loan', lookup)).toMatchObject({ bucket: 'savings', defaultBucket: 'needs', custom: false, moved: true });
    expect(resolveBucket('Rent', lookup)).toMatchObject({ bucket: 'needs', moved: false });
    expect(resolveBucket('Rent')).toMatchObject({ bucket: 'needs', moved: false });
  });

  it('ignores "back to default" entries', () => {
    const lookup = categoryBucketLookup({ Loan: choice(null) });
    expect(lookup.size).toBe(0);
    expect(resolveBucket('Loan', lookup)).toMatchObject({ bucket: 'needs', moved: false });
  });

  it('stores nothing when the choice is the default', () => {
    expect(bucketToStore('Loan', 'needs')).toBeNull();
    expect(bucketToStore('Loan', 'savings')).toBe('savings');
    expect(bucketToStore('Childcare', 'wants')).toBeNull();
    expect(bucketToStore('Childcare', 'needs')).toBe('needs');
  });

  it('moves a category’s spending to the chosen bucket and marks it moved', () => {
    const expenses = [expense(2000, 'Rent'), expense(500, 'Childcare'), expense(300, 'Eating Out')];
    const before = reviewBudget([person(4000)], expenses)!;
    expect(bucket(before, 'wants').monthly).toBe(800);

    const after = reviewBudget([person(4000)], expenses, { buckets: { Childcare: choice('needs') } })!;
    expect(bucket(after, 'needs').monthly).toBe(2500);
    expect(bucket(after, 'wants').monthly).toBe(300);
    expect(after.spendingMonthly).toBe(before.spendingMonthly);
    const moved = bucket(after, 'needs').categories.find((c) => c.name === 'Childcare')!;
    expect(moved).toMatchObject({ moved: true, defaultBucket: 'wants', custom: true });
    expect(bucket(after, 'needs').categories.find((c) => c.name === 'Rent')!.moved).toBe(false);
  });

  it('lets a built-in category move too', () => {
    const r = reviewBudget([person(4000)], [expense(400, 'Loan')], { buckets: { Loan: choice('savings') } })!;
    expect(bucket(r, 'savings').monthly).toBe(400);
    expect(bucket(r, 'needs').monthly).toBe(0);
    expect(bucket(r, 'savings').status).toBe('off');
  });

  it('changes nothing for a category with no expenses', () => {
    const expenses = [expense(1000, 'Rent')];
    const r = reviewBudget([person(4000)], expenses, { buckets: { Pets: choice('needs') } })!;
    expect(r).toEqual(reviewBudget([person(4000)], expenses)!);
  });
});

describe('expense choices', () => {
  const choice = (b: BucketId | null) => ({ bucket: b, updatedAt: 1 });
  const onlyBucket = (id: BucketId, over: Partial<Expense> = {}, amount = 300, tag = 'Loan') =>
    expense(amount, tag, { bucket: id, ...over });

  it('counts one expense in its own bucket while the rest of its category stays put', () => {
    const expenses = [expense(1000, 'Rent'), expense(250, 'Loan', { description: 'Car loan' }), onlyBucket('wants', { description: 'Sofa loan' })];
    const before = reviewBudget([person(4000)], expenses.map(({ bucket, ...e }) => e))!;
    const r = reviewBudget([person(4000)], expenses)!;

    expect(bucket(r, 'needs').monthly).toBe(1250);
    expect(bucket(r, 'wants').monthly).toBe(300);
    expect(r.spendingMonthly).toBe(before.spendingMonthly);

    // The category row keeps only what follows the category; the choice has a row of its own.
    expect(bucket(r, 'needs').categories.find((c) => c.name === 'Loan')!.monthly).toBe(250);
    expect(bucket(r, 'wants').categories).toEqual([]);
    expect(bucket(r, 'wants').expenses).toEqual([
      { id: expenses[2].id, description: 'Sofa loan', category: 'Loan', monthly: 300, pct: 7.5, categoryBucket: 'needs' },
    ]);
    expect(bucket(r, 'needs').expenses).toEqual([]);
  });

  it('beats the budget’s choice for the category, and the others still follow that choice', () => {
    const expenses = [expense(200, 'Loan', { description: 'Kept' }), onlyBucket('wants', { description: 'Sofa loan' })];
    const r = reviewBudget([person(4000)], expenses, { buckets: { Loan: choice('savings') } })!;
    expect(bucket(r, 'savings').monthly).toBe(200);
    expect(bucket(r, 'wants').monthly).toBe(300);
    expect(bucket(r, 'needs').monthly).toBe(0);
    expect(bucket(r, 'wants').expenses[0]).toMatchObject({ description: 'Sofa loan', categoryBucket: 'savings' });
  });

  it('changes nothing when the choice is where the category already counts', () => {
    const plain = [expense(1000, 'Rent'), expense(300, 'Loan')];
    const pinned = [expense(1000, 'Rent'), expense(300, 'Loan', { bucket: 'needs' })];
    const r = reviewBudget([person(4000)], pinned)!;
    expect(bucket(r, 'needs').expenses).toEqual([]);
    expect(bucket(r, 'needs').categories.map((c) => c.name)).toEqual(['Rent', 'Loan']);
    expect(r.buckets.map((b) => b.monthly)).toEqual(reviewBudget([person(4000)], plain)!.buckets.map((b) => b.monthly));
  });

  it('ignores a value that is not one of the three buckets', () => {
    const r = reviewBudget([person(4000)], [expense(300, 'Loan', { bucket: 'sideways' as any })])!;
    expect(bucket(r, 'needs').monthly).toBe(300);
    expect(bucket(r, 'needs').expenses).toEqual([]);
  });

  it('leaves out one that has ended, like any other', () => {
    const r = reviewBudget([person(4000)], [onlyBucket('wants', { endDate: '2026-01-31' })], { asOf: '2026-06-01' })!;
    expect(bucket(r, 'wants').monthly).toBe(0);
    expect(bucket(r, 'wants').expenses).toEqual([]);
  });

  it('lists them largest first, as monthly amounts, and names an untitled one by its category', () => {
    const r = reviewBudget(
      [person(4000)],
      [
        onlyBucket('wants', { description: 'Small' }, 50),
        onlyBucket('wants', { description: '   ' }, 12 * 40, 'Credit Card'), // 40/mo when yearly
        onlyBucket('wants', { description: 'Big' }, 400),
      ].map((e, i) => (i === 1 ? { ...e, frequency: 'yearly' as Frequency } : e))
    )!;
    expect(bucket(r, 'wants').expenses.map((e) => [e.description, e.monthly])).toEqual([
      ['Big', 400],
      ['Small', 50],
      ['Credit Card', 40],
    ]);
  });

  it('lets an expense move into Savings, and out of it', () => {
    const r = reviewBudget([person(4000)], [onlyBucket('savings', { description: 'Extra payment' }, 200), expense(100, 'Savings', { bucket: 'wants' })])!;
    expect(bucket(r, 'savings').monthly).toBe(200);
    expect(bucket(r, 'wants').monthly).toBe(100);
    expect(bucket(r, 'wants').expenses[0]).toMatchObject({ category: 'Savings', categoryBucket: 'savings' });
  });
});

describe('bucketOfExpense', () => {
  const choice = (b: BucketId | null) => ({ bucket: b, updatedAt: 1 });

  it('is the expense’s own choice, else where its category counts', () => {
    expect(bucketOfExpense({ categoryTag: 'Loan' })).toBe('needs');
    expect(bucketOfExpense({ categoryTag: 'Loan', bucket: 'wants' })).toBe('wants');
    expect(bucketOfExpense({ categoryTag: undefined })).toBe('wants');
    expect(bucketOfExpense({ categoryTag: 'Childcare' })).toBe('wants');
  });

  it('follows the budget’s category choices, which an own choice still beats', () => {
    const lookup = categoryBucketLookup({ Loan: choice('savings') });
    expect(bucketOfExpense({ categoryTag: 'loan' }, lookup)).toBe('savings');
    expect(bucketOfExpense({ categoryTag: 'Loan', bucket: 'wants' }, lookup)).toBe('wants');
  });

  it('ignores a value that is not a bucket', () => {
    expect(bucketOfExpense({ categoryTag: 'Rent', bucket: 'sideways' as any })).toBe('needs');
  });

  it('agrees with where the review counts each expense', () => {
    const lookup = categoryBucketLookup({ Pets: choice('needs') });
    const expenses = [
      expense(500, 'Rent'),
      expense(200, 'Loan', { bucket: 'wants' }),
      expense(100, 'Pets'),
      expense(50, 'Eating Out'),
      expense(75, 'Savings', { bucket: 'needs' }),
    ];
    const r = reviewBudget([person(5000)], expenses, { buckets: { Pets: choice('needs') } })!;
    for (const id of ['needs', 'wants', 'savings'] as BucketId[]) {
      const viaFilter = expenses.filter((e) => bucketOfExpense(e, lookup) === id).reduce((sum, e) => sum + e.amount, 0);
      expect(bucket(r, id).monthly).toBe(viaFilter);
    }
  });
});

describe('suggestSaving', () => {
  const suggest = (income: number, expenses: Expense[]) => suggestSaving(reviewBudget([person(income)], expenses)!);

  it('offers the whole 20% target when there is more than enough free', () => {
    // 5000 income, nothing saved, 3500 spent: 1500 free, 1000 target.
    expect(suggest(5000, [expense(3500, 'Rent')])).toEqual({ amount: 1000, mode: 'reaches', pctAfter: 20 });
  });

  it('offers all the free money when it falls short of the target', () => {
    // 4600 spent: 400 free against a 1000 target.
    expect(suggest(5000, [expense(4600, 'Rent')])).toEqual({ amount: 400, mode: 'short', pctAfter: 8 });
  });

  it('counts what Savings already holds, so the amount is the gap, not the full target', () => {
    // 600 saved, 3700 other, 700 free: gap to 1000 is 400, not the 700 free.
    expect(suggest(5000, [expense(3700, 'Rent'), expense(600, 'Savings')])).toEqual({ amount: 400, mode: 'reaches', pctAfter: 20 });
  });

  it('offers all the free money once Savings already meets its target', () => {
    // 1100 saved (22%), 3600 spent elsewhere, 300 free.
    expect(suggest(5000, [expense(3600, 'Rent'), expense(1100, 'Savings')])).toEqual({ amount: 300, mode: 'bonus', pctAfter: 28 });
  });

  it('treats a gap under one unit as the target met', () => {
    // 999.5 saved against 1000: free money is a bonus, not a 0 top-up.
    expect(suggest(5000, [expense(3500, 'Rent'), expense(999.5, 'Savings')])).toEqual({ amount: 500, mode: 'bonus', pctAfter: 30 });
  });

  it('follows a category moved into Savings', () => {
    const r = reviewBudget([person(5000)], [expense(3500, 'Rent'), expense(500, 'Loan')], { buckets: { Loan: { bucket: 'savings', updatedAt: 1 } } })!;
    // 500 saved, 1000 free, gap 500.
    expect(suggestSaving(r)).toEqual({ amount: 500, mode: 'reaches', pctAfter: 20 });
  });

  it('rounds down to whole units so it never promises more than is free', () => {
    // 4999.5 spent: 0.5 free, under one unit.
    expect(suggest(5000, [expense(4999.5, 'Rent')])).toBeNull();
    // 4000.4 spent: 999.6 free, target 1000: offers 999, which still rounds to 20%.
    expect(suggest(5000, [expense(4000.4, 'Rent')])).toEqual({ amount: 999, mode: 'reaches', pctAfter: 20 });
  });

  it('offers nothing when nothing is free or the budget is overspent', () => {
    expect(suggest(5000, [expense(5000, 'Rent')])).toBeNull();
    expect(suggest(5000, [expense(5200, 'Rent')])).toBeNull();
  });
});
