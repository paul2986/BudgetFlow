import { describe, expect, it } from 'vitest';
import { MAX_REMINDERS, REMINDER_HOUR, planEndReminders } from '../../utils/endReminders';
import type { Budget, Expense } from '../../types/budget';

const at = (y: number, m: number, d: number, h = 8) => new Date(y, m - 1, d, h, 0, 0);

const ymdh = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()];

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

const budget = (expenses: Expense[], over: Partial<Budget> = {}): Budget => ({
  id: 'b1',
  name: 'Home',
  people: [],
  expenses,
  householdSettings: { distributionMethod: 'even' },
  createdAt: 0,
  modifiedAt: 0,
  ...over,
});

const now = at(2026, 10, 6);

describe('end reminders', () => {
  it('reminds a month ahead for a monthly expense, and on the day', () => {
    const plan = planEndReminders([budget([expense({ endDate: '2026-12-15' })])], now);
    expect(plan.map((r) => [r.kind, ...ymdh(r.fireAt)])).toEqual([
      ['lead', 2026, 11, 15, REMINDER_HOUR],
      ['day', 2026, 12, 15, REMINDER_HOUR],
    ]);
    expect(plan[0].title).toBe('Gym ends in 1 month');
    expect(plan[1].title).toBe('Gym ends today');
  });

  it('follows the expense frequency', () => {
    const lead = (frequency: Expense['frequency']) =>
      planEndReminders([budget([expense({ frequency, endDate: '2027-06-15' })])], now).find((r) => r.kind === 'lead');
    expect(ymdh(lead('daily')!.fireAt)).toEqual([2027, 6, 14, REMINDER_HOUR]);
    expect(lead('daily')!.title).toBe('Gym ends tomorrow');
    expect(ymdh(lead('weekly')!.fireAt)).toEqual([2027, 6, 8, REMINDER_HOUR]);
    expect(lead('weekly')!.title).toBe('Gym ends in 1 week');
    // A yearly expense ending in a year and a half is reminded a year ahead; one ending in 8 months is too close for that.
    const yearly = (endDate: string) =>
      planEndReminders([budget([expense({ frequency: 'yearly', endDate })])], now).find((r) => r.kind === 'lead');
    expect(ymdh(yearly('2028-06-15')!.fireAt)).toEqual([2027, 6, 15, REMINDER_HOUR]);
    expect(yearly('2027-06-15')).toBeUndefined();
  });

  it('skips a heads-up that is already past but keeps the day itself', () => {
    const plan = planEndReminders([budget([expense({ endDate: '2026-10-20' })])], now);
    expect(plan.map((r) => r.kind)).toEqual(['day']);
  });

  it('still reminds on the morning of the end date until the time has passed', () => {
    const e = expense({ endDate: '2026-10-06' });
    expect(planEndReminders([budget([e])], at(2026, 10, 6, 8)).map((r) => r.kind)).toEqual(['day']);
    expect(planEndReminders([budget([e])], at(2026, 10, 6, 10))).toEqual([]);
  });

  it('never reminds about ended, one-time or open-ended expenses', () => {
    const plan = planEndReminders(
      [
        budget([
          expense({ endDate: '2026-09-01' }),
          expense({ frequency: 'one-time', endDate: '2027-01-01' }),
          expense(),
          expense({ endDate: 'garbage' }),
        ]),
      ],
      now
    );
    expect(plan).toEqual([]);
  });

  it('gives each reminder a stable id, so an unchanged plan is recognisably the same', () => {
    const e = expense({ endDate: '2026-12-15' });
    const a = planEndReminders([budget([e])], now).map((r) => r.id);
    const b = planEndReminders([budget([e])], at(2026, 10, 7)).map((r) => r.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it('names the budget only when there is more than one', () => {
    const e = expense({ endDate: '2026-12-15' });
    expect(planEndReminders([budget([e])], now)[0].subtitle).toBeUndefined();
    const two = planEndReminders([budget([e]), budget([], { id: 'b2', name: 'Cabin' })], now);
    expect(two[0].subtitle).toBe('Home');
  });

  it('keeps a locked budget’s expenses off the lock screen', () => {
    const locked = budget([expense({ description: 'Therapy', endDate: '2026-12-15' })], {
      lock: { locked: true, autoLockMinutes: 0 },
    });
    for (const r of planEndReminders([locked], now)) {
      expect(`${r.title} ${r.body}`).not.toContain('Therapy');
      expect(r.subtitle).toBe('Home');
    }
  });

  it('holds to what the phone can keep, soonest first', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      expense({ endDate: `2027-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}` })
    );
    const plan = planEndReminders([budget(many)], now);
    expect(plan).toHaveLength(MAX_REMINDERS);
    const times = plan.map((r) => r.fireAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
