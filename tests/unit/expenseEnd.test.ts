import { describe, expect, it } from 'vitest';
import {
  addMonths,
  describeRemaining,
  endProgress,
  formatSpan,
  parseYmd,
  reminderLead,
  splitByEndDate,
  timeBetween,
} from '../../utils/expenseEnd';
import type { Expense } from '../../types/budget';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0);

let n = 0;
const expense = (over: Partial<Expense> = {}): Expense => ({
  id: `e${n++}`,
  amount: 10,
  description: 'Gym',
  category: 'household',
  frequency: 'monthly',
  date: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('calendar dates', () => {
  it('reads a stored date and refuses one that does not exist', () => {
    expect(parseYmd('2026-03-09')).toEqual({ y: 2026, m: 3, d: 9 });
    expect(parseYmd('2026-03-09T00:00:00.000Z')).toEqual({ y: 2026, m: 3, d: 9 });
    expect(parseYmd('2026-02-31')).toBeNull();
    expect(parseYmd('soon')).toBeNull();
    expect(parseYmd(undefined)).toBeNull();
  });

  it('moves by months, landing on the last day when the day does not exist', () => {
    expect(addMonths({ y: 2026, m: 3, d: 31 }, -1)).toEqual({ y: 2026, m: 2, d: 28 });
    expect(addMonths({ y: 2028, m: 3, d: 31 }, -1)).toEqual({ y: 2028, m: 2, d: 29 });
    expect(addMonths({ y: 2026, m: 1, d: 15 }, -1)).toEqual({ y: 2025, m: 12, d: 15 });
    expect(addMonths({ y: 2026, m: 11, d: 30 }, 3)).toEqual({ y: 2027, m: 2, d: 28 });
  });
});

describe('time between two days', () => {
  it('counts years, then months, then days', () => {
    expect(timeBetween({ y: 2026, m: 10, d: 6 }, { y: 2028, m: 1, d: 11 })).toEqual({ years: 1, months: 3, days: 5 });
    expect(timeBetween({ y: 2026, m: 10, d: 6 }, { y: 2026, m: 10, d: 7 })).toEqual({ years: 0, months: 0, days: 1 });
    expect(timeBetween({ y: 2026, m: 10, d: 6 }, { y: 2027, m: 10, d: 6 })).toEqual({ years: 1, months: 0, days: 0 });
  });

  it('does not count a month that has not finished', () => {
    // 31 Jan to 28 Feb is the whole of February's worth of a month, not 28 days.
    expect(timeBetween({ y: 2026, m: 1, d: 31 }, { y: 2026, m: 2, d: 28 })).toEqual({ years: 0, months: 1, days: 0 });
    expect(timeBetween({ y: 2026, m: 1, d: 31 }, { y: 2026, m: 2, d: 27 })).toEqual({ years: 0, months: 0, days: 27 });
  });

  it('is zero when there is no time left', () => {
    expect(timeBetween({ y: 2026, m: 10, d: 6 }, { y: 2026, m: 10, d: 6 })).toEqual({ years: 0, months: 0, days: 0 });
    expect(timeBetween({ y: 2026, m: 10, d: 6 }, { y: 2026, m: 9, d: 1 })).toEqual({ years: 0, months: 0, days: 0 });
  });

  it('writes only the units that are not zero', () => {
    expect(formatSpan({ years: 2, months: 0, days: 1 })).toBe('2 yrs 1 day');
    expect(formatSpan({ years: 1, months: 1, days: 0 })).toBe('1 yr 1 mo');
    expect(formatSpan({ years: 0, months: 3, days: 12 }, true)).toBe('3 months 12 days');
  });
});

describe('progress towards the end date', () => {
  const e = expense({ date: '2026-01-01T00:00:00.000Z', endDate: '2026-01-11' });

  it('is the share of the days from start to end that have passed', () => {
    expect(endProgress(e, at(2026, 1, 1))?.fraction).toBe(0);
    expect(endProgress(e, at(2026, 1, 6))?.fraction).toBe(0.5);
    expect(endProgress(e, at(2025, 12, 1))?.fraction).toBe(0);
  });

  it('keeps the end date itself as a running day, then is full', () => {
    const onTheDay = endProgress(e, at(2026, 1, 11));
    expect(onTheDay).toMatchObject({ state: 'endsToday', fraction: 1, daysLeft: 0 });
    expect(describeRemaining(onTheDay!)).toBe('Ends today');

    const after = endProgress(e, at(2026, 1, 12));
    expect(after).toMatchObject({ state: 'ended', fraction: 1, daysLeft: -1 });
    expect(describeRemaining(after!)).toBe('Ended');
  });

  it('says how long is left', () => {
    const p = endProgress(expense({ endDate: '2028-01-11' }), at(2026, 10, 6))!;
    expect(p.state).toBe('running');
    expect(describeRemaining(p)).toBe('1 yr 3 mos 5 days left');
    expect(describeRemaining(p, true)).toBe('1 year 3 months 5 days left');
  });

  it('has no bar without a usable start date, but still counts down', () => {
    const p = endProgress(expense({ date: 'unknown', endDate: '2026-12-01' }), at(2026, 10, 6))!;
    expect(p.fraction).toBeNull();
    expect(describeRemaining(p)).toBe('1 mo 25 days left');
  });

  it('is empty rather than full for an end date on or before the start', () => {
    const p = endProgress(expense({ date: '2026-06-01T00:00:00.000Z', endDate: '2026-06-01' }), at(2026, 5, 1))!;
    expect(p.fraction).toBe(0);
  });

  it('is null with no end date', () => {
    expect(endProgress(expense(), at(2026, 1, 1))).toBeNull();
  });
});

describe('expenses with an end date', () => {
  const now = at(2026, 10, 6);

  it('splits running from ended, soonest end first and latest ended first', () => {
    const far = expense({ endDate: '2028-01-01' });
    const soon = expense({ endDate: '2026-10-20' });
    const today = expense({ endDate: '2026-10-06' });
    const old = expense({ endDate: '2026-01-01' });
    const newer = expense({ endDate: '2026-09-30' });
    const { running, ended } = splitByEndDate([far, old, soon, newer, today], now);
    expect(running.map((x) => x.id)).toEqual([today.id, soon.id, far.id]);
    expect(ended.map((x) => x.id)).toEqual([newer.id, old.id]);
  });

  it('leaves out one-time expenses, ones with no end date and repeats', () => {
    const a = expense({ endDate: '2027-01-01' });
    const list = [
      a,
      { ...a },
      expense({ frequency: 'one-time', endDate: '2027-01-01' }),
      expense(),
      expense({ endDate: 'nonsense' }),
    ];
    expect(splitByEndDate(list, now).running).toHaveLength(1);
  });
});

describe('how far ahead to remind', () => {
  const end = { y: 2026, m: 12, d: 15 };

  it('is one period of the expense', () => {
    expect(reminderLead('daily', end)).toEqual({ y: 2026, m: 12, d: 14 });
    expect(reminderLead('weekly', end)).toEqual({ y: 2026, m: 12, d: 8 });
    expect(reminderLead('monthly', end)).toEqual({ y: 2026, m: 11, d: 15 });
    expect(reminderLead('yearly', end)).toEqual({ y: 2025, m: 12, d: 15 });
    expect(reminderLead('one-time', end)).toBeNull();
  });
});
