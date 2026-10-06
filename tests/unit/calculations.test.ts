import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeExpense } from '../helpers/fixtures';
import {
  calculateAnnualAmount,
  calculateHouseholdExpenses,
  calculateHouseholdShare,
  calculateMonthlyAmount,
  calculatePersonIncome,
  calculatePersonalExpenses,
  calculateTotalExpenses,
  calculateTotalIncome,
  getEndingSoon,
  isExpenseActive,
} from '../../utils/calculations';
import type { Expense, Frequency, Income, Person } from '../../types/budget';

// "Today" is 6 Oct 2026 in these tests.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

const income = (amount: number, frequency: Frequency = 'monthly', id = `i${amount}${frequency}`): Income => ({
  id,
  amount,
  label: 'Pay',
  frequency,
  personId: 'p',
});
const person = (id: string, incomes: Income[], extra: Partial<Person> = {}): Person => ({ id, name: id, income: incomes, ...extra });
const exp = (overrides: Partial<Expense>) => makeExpense({ frequency: 'monthly', ...overrides });

describe('turning an amount into a yearly and monthly one', () => {
  it('multiplies by how often it happens', () => {
    expect(calculateAnnualAmount(10, 'daily')).toBe(3650);
    expect(calculateAnnualAmount(10, 'weekly')).toBe(520);
    expect(calculateAnnualAmount(10, 'monthly')).toBe(120);
    expect(calculateAnnualAmount(10, 'yearly')).toBe(10);
    expect(calculateAnnualAmount(10, 'one-time')).toBe(10);
  });

  it('works in whole pennies, so fractions of a penny do not creep in', () => {
    expect(calculateAnnualAmount(0.1, 'monthly')).toBe(1.2);
    expect(calculateAnnualAmount(19.99, 'weekly')).toBe(1039.48);
    expect(calculateAnnualAmount(0.1 + 0.2, 'yearly')).toBe(0.3);
  });

  it('treats an amount that is not a number as nothing', () => {
    expect(calculateAnnualAmount(NaN, 'monthly')).toBe(0);
    expect(calculateAnnualAmount('5' as any, 'monthly')).toBe(0);
  });

  it('treats an unknown frequency as once', () => {
    expect(calculateAnnualAmount(10, 'fortnightly' as any)).toBe(10);
  });

  it('divides the year by twelve, to the penny', () => {
    expect(calculateMonthlyAmount(120, 'yearly')).toBe(10);
    expect(calculateMonthlyAmount(100, 'yearly')).toBe(8.33);
    expect(calculateMonthlyAmount(5, 'daily')).toBe(152.08);
    expect(calculateMonthlyAmount(NaN, 'daily')).toBe(0);
  });
});

describe('income', () => {
  const alex = person('alex', [income(3000), income(100, 'weekly')]);
  const sam = person('sam', [income(24000, 'yearly')]);

  it('adds up a person’s income for the year', () => {
    expect(calculatePersonIncome(alex)).toBe(36000 + 5200);
    expect(calculatePersonIncome(person('none', []))).toBe(0);
  });

  it('adds up everyone’s', () => {
    expect(calculateTotalIncome([alex, sam])).toBe(36000 + 5200 + 24000);
    expect(calculateTotalIncome([])).toBe(0);
  });

  it('skips income without a usable amount', () => {
    const messy = person('m', [income(NaN), null as any, income(10, 'yearly'), { ...income(5), amount: '5' as any }]);
    expect(calculatePersonIncome(messy)).toBe(10);
    expect(calculateTotalIncome([messy, null as any, { id: 'x', name: 'x' } as any])).toBe(10);
  });

  it('reads a missing list or person as nothing', () => {
    expect(calculateTotalIncome(undefined as any)).toBe(0);
    expect(calculatePersonIncome(undefined as any)).toBe(0);
    expect(calculatePersonIncome({ id: 'x', name: 'x' } as any)).toBe(0);
  });
});

describe('which expenses count today', () => {
  it('counts one-time expenses and recurring ones with no end date', () => {
    expect(isExpenseActive(exp({ frequency: 'one-time', endDate: '2020-01-01' }))).toBe(true);
    expect(isExpenseActive(exp({ endDate: undefined }))).toBe(true);
    expect(isExpenseActive(exp({ endDate: '' }))).toBe(true);
  });

  it('counts a recurring expense through its end date, and not after', () => {
    expect(isExpenseActive(exp({ endDate: '2026-10-06' }))).toBe(true);
    expect(isExpenseActive(exp({ endDate: '2026-10-05' }))).toBe(false);
    expect(isExpenseActive(exp({ endDate: '2026-10-06T23:00:00.000Z' }))).toBe(true);
  });

  it('can be asked about another day', () => {
    const e = exp({ endDate: '2026-12-31' });
    expect(isExpenseActive(e, '2026-12-31')).toBe(true);
    expect(isExpenseActive(e, '2027-01-01')).toBe(false);
  });

  it('does not count nothing', () => {
    expect(isExpenseActive(undefined as any)).toBe(false);
  });
});

describe('expense totals (for the year)', () => {
  const list: Expense[] = [
    exp({ id: 'rent', amount: 1000, category: 'household' }),
    exp({ id: 'coffee', amount: 5, frequency: 'daily', category: 'household' }),
    exp({ id: 'gym', amount: 40, category: 'personal', personId: 'alex' }),
    exp({ id: 'phone', amount: 30, category: 'personal', personId: 'sam' }),
    exp({ id: 'old', amount: 999, category: 'household', endDate: '2026-01-01' }),
    exp({ id: 'holiday', amount: 800, frequency: 'one-time', category: 'household', endDate: '2020-01-01' }),
    exp({ id: 'oldgym', amount: 50, category: 'personal', personId: 'alex', endDate: '2026-06-01' }),
  ];

  it('adds up what still counts', () => {
    expect(calculateTotalExpenses(list)).toBe(12000 + 1825 + 480 + 360 + 800);
  });

  it('adds up household expenses', () => {
    expect(calculateHouseholdExpenses(list)).toBe(12000 + 1825 + 800);
  });

  it('adds up personal expenses: everyone’s, or one person’s', () => {
    expect(calculatePersonalExpenses(list)).toBe(480 + 360);
    expect(calculatePersonalExpenses(list, 'alex')).toBe(480);
    expect(calculatePersonalExpenses(list, 'sam')).toBe(360);
    expect(calculatePersonalExpenses(list, 'nobody')).toBe(0);
  });

  it('works in pennies', () => {
    expect(calculateTotalExpenses([exp({ amount: 0.1 }), exp({ amount: 0.2 })])).toBe(3.6);
  });

  it('skips expenses without a usable amount, and empty slots', () => {
    const messy = [exp({ amount: NaN }), exp({ amount: '9' as any }), null as any, exp({ amount: 10 })];
    expect(calculateTotalExpenses(messy)).toBe(120);
    expect(calculateHouseholdExpenses(messy)).toBe(120);
    expect(calculatePersonalExpenses([...messy, exp({ amount: 7, category: 'personal' })])).toBe(84);
  });

  it('reads a missing list as nothing', () => {
    for (const total of [calculateTotalExpenses, calculateHouseholdExpenses, calculatePersonalExpenses]) {
      expect(total(undefined as any)).toBe(0);
    }
  });
});

describe('a person’s share of the household costs', () => {
  const alex = person('alex', [income(3000)]);
  const sam = person('sam', [income(1000)]);
  const kit = person('kit', [income(2000)], { excludeFromHouseholdShare: true });
  const share = (costs: number, people: Person[], how: 'even' | 'income-based', id: string) =>
    calculateHouseholdShare(costs, people, how, id);

  it('splits evenly', () => {
    expect(share(1000, [alex, sam], 'even', 'alex')).toBe(500);
    expect(share(100, [alex, sam, person('c', [])], 'even', 'sam')).toBe(33.33);
  });

  it('splits by income', () => {
    expect(share(1000, [alex, sam], 'income-based', 'alex')).toBe(750);
    expect(share(1000, [alex, sam], 'income-based', 'sam')).toBe(250);
  });

  it('splits evenly when nobody has any income', () => {
    expect(share(100, [person('a', []), person('b', [])], 'income-based', 'a')).toBe(50);
  });

  it('asks nothing of someone who is left out, and the rest split it', () => {
    expect(share(1000, [alex, sam, kit], 'even', 'kit')).toBe(0);
    expect(share(1000, [alex, sam, kit], 'even', 'alex')).toBe(500);
    // Kit's income does not count towards the income-based split either.
    expect(share(1000, [alex, sam, kit], 'income-based', 'alex')).toBe(750);
  });

  it('asks all of it of the one person who is not left out', () => {
    expect(share(900, [alex, kit], 'even', 'alex')).toBe(900);
    expect(share(900, [alex, kit], 'income-based', 'alex')).toBe(900);
    expect(share(900, [alex, kit], 'even', 'kit')).toBe(0);
  });

  it('splits between everyone when everyone is left out', () => {
    const a = person('a', [income(100)], { excludeFromHouseholdShare: true });
    const b = person('b', [income(100)], { excludeFromHouseholdShare: true });
    expect(share(100, [a, b], 'even', 'a')).toBe(50);
  });

  it('is nothing for someone who is not in the household, or with bad input', () => {
    expect(share(1000, [alex, sam], 'even', 'stranger')).toBe(0);
    expect(share(1000, [], 'even', 'alex')).toBe(0);
    expect(share(1000, undefined as any, 'even', 'alex')).toBe(0);
    expect(share(NaN, [alex], 'even', 'alex')).toBe(0);
  });
});

describe('expenses ending soon', () => {
  const list: Expense[] = [
    exp({ id: 'gone', endDate: '2026-09-01' }),
    exp({ id: 'yesterday', endDate: '2026-10-05' }),
    exp({ id: 'today', endDate: '2026-10-06' }),
    exp({ id: 'soon', endDate: '2026-10-20' }),
    exp({ id: 'edge', endDate: '2026-11-05' }),
    exp({ id: 'later', endDate: '2026-11-06' }),
    exp({ id: 'none' }),
    exp({ id: 'once', frequency: 'one-time', endDate: '2026-10-10' }),
  ];
  const ids = (xs: Expense[]) => xs.map((e) => e.id);

  it('lists what has ended and what ends within 30 days, soonest first', () => {
    const r = getEndingSoon(list);
    expect(ids(r.ended)).toEqual(['gone', 'yesterday']);
    expect(ids(r.expiringSoon)).toEqual(['today', 'soon', 'edge']);
  });

  it('takes the number of days', () => {
    expect(ids(getEndingSoon(list, 5).expiringSoon)).toEqual(['today']);
    expect(ids(getEndingSoon(list, 365).expiringSoon)).toEqual(['today', 'soon', 'edge', 'later']);
  });

  it('sorts by end date whatever order they come in, and lists an id once', () => {
    const shuffled = [list[3], list[0], list[2], exp({ id: 'soon', endDate: '2026-10-20' }), list[1]];
    const r = getEndingSoon(shuffled);
    expect(ids(r.ended)).toEqual(['gone', 'yesterday']);
    expect(ids(r.expiringSoon)).toEqual(['today', 'soon']);
  });

  it('reads a missing list as nothing', () => {
    expect(getEndingSoon(undefined as any)).toEqual({ expiringSoon: [], ended: [] });
  });
});
