import type { Expense, Frequency } from '../types/budget';

/**
 * Everything about an expense's end date that the dashboard and the end
 * reminders share: calendar-date arithmetic, how far along an expense is, and
 * how long it has left. Dates are calendar days (YYYY-MM-DD, as stored), never
 * instants, so none of this moves with the time zone or a DST change.
 */

export interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

const DAY_MS = 86_400_000;

export const parseYmd = (value: string | undefined): Ymd | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const ymd = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  // Rejects 2026-02-31 and the like, which Date would quietly roll into March.
  const check = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  return check.getUTCFullYear() === ymd.y && check.getUTCMonth() === ymd.m - 1 && check.getUTCDate() === ymd.d
    ? ymd
    : null;
};

export const todayYmd = (now: Date = new Date()): Ymd => ({
  y: now.getFullYear(),
  m: now.getMonth() + 1,
  d: now.getDate(),
});

/** Whole days since 1970-01-01; subtracting two gives the days between them. */
const dayNumber = ({ y, m, d }: Ymd): number => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);

const fromDayNumber = (n: number): Ymd => {
  const date = new Date(n * DAY_MS);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
};

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const compareYmd = (a: Ymd, b: Ymd): number => dayNumber(a) - dayNumber(b);

export const addDays = (ymd: Ymd, days: number): Ymd => fromDayNumber(dayNumber(ymd) + days);

/** Moves by calendar months; a day that doesn't exist in the target month lands on its last day (31 Mar - 1 month = 28 Feb). */
export const addMonths = (ymd: Ymd, months: number): Ymd => {
  const index = ymd.y * 12 + (ymd.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return { y, m, d: Math.min(ymd.d, daysInMonth(y, m)) };
};

export interface Remaining {
  years: number;
  months: number;
  days: number;
}

/** The calendar time from one day to a later one, as years, then months, then days. Zero when `to` isn't after `from`. */
export const timeBetween = (from: Ymd, to: Ymd): Remaining => {
  if (compareYmd(from, to) >= 0) return { years: 0, months: 0, days: 0 };
  let months = (to.y - from.y) * 12 + (to.m - from.m);
  if (compareYmd(addMonths(from, months), to) > 0) months -= 1;
  const days = dayNumber(to) - dayNumber(addMonths(from, months));
  return { years: Math.floor(months / 12), months: months % 12, days };
};

const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 yrs 3 mos 5 days", leaving out what is zero. Empty for no time at all. */
export const formatSpan = ({ years, months, days }: Remaining, long = false): string => {
  const parts: string[] = [];
  if (years) parts.push(long ? unit(years, 'year', 'years') : unit(years, 'yr', 'yrs'));
  if (months) parts.push(long ? unit(months, 'month', 'months') : unit(months, 'mo', 'mos'));
  if (days) parts.push(unit(days, 'day', 'days'));
  return parts.join(' ');
};

export type EndState = 'running' | 'endsToday' | 'ended';

export interface EndProgress {
  state: EndState;
  /** 0 to 1: how much of the time from the start date to the end date has passed. Null when there is no usable start date. */
  fraction: number | null;
  remaining: Remaining;
  /** Days until the end date; 0 on the day itself, negative once it has passed. */
  daysLeft: number;
}

/** How far along an expense is towards its own end date. The end date itself is the last day it counts. */
export const endProgress = (expense: Pick<Expense, 'date' | 'endDate'>, now: Date = new Date()): EndProgress | null => {
  const end = parseYmd(expense.endDate);
  if (!end) return null;
  const today = todayYmd(now);
  const daysLeft = dayNumber(end) - dayNumber(today);
  const state: EndState = daysLeft < 0 ? 'ended' : daysLeft === 0 ? 'endsToday' : 'running';

  const start = parseYmd(expense.date);
  let fraction: number | null = null;
  if (start) {
    const span = dayNumber(end) - dayNumber(start);
    fraction =
      state !== 'running' ? 1 : span <= 0 ? 0 : Math.min(1, Math.max(0, (dayNumber(today) - dayNumber(start)) / span));
  }
  return { state, fraction, remaining: timeBetween(today, end), daysLeft };
};

/** What is left, in words: "2 yrs 3 mos left", "Ends today", "Ended". */
export const describeRemaining = (progress: EndProgress, long = false): string => {
  if (progress.state === 'ended') return 'Ended';
  if (progress.state === 'endsToday') return 'Ends today';
  return `${formatSpan(progress.remaining, long)} left`;
};

/**
 * Expenses that have an end date, split into those still running (soonest end
 * first) and those that have ended (most recent first). One-time expenses
 * can't have an end date, so they never appear.
 */
export const splitByEndDate = (
  expenses: Expense[],
  now: Date = new Date()
): { running: Expense[]; ended: Expense[] } => {
  const today = dayNumber(todayYmd(now));
  const withEnd: { expense: Expense; end: number }[] = [];
  const seen = new Set<string>();
  for (const expense of expenses ?? []) {
    if (!expense || expense.frequency === 'one-time' || seen.has(expense.id)) continue;
    const end = parseYmd(expense.endDate);
    if (!end) continue;
    seen.add(expense.id);
    withEnd.push({ expense, end: dayNumber(end) });
  }
  const running = withEnd.filter((e) => e.end >= today).sort((a, b) => a.end - b.end);
  const ended = withEnd.filter((e) => e.end < today).sort((a, b) => b.end - a.end);
  return { running: running.map((e) => e.expense), ended: ended.map((e) => e.expense) };
};

/**
 * How long before the end date to give the first reminder: one of the
 * expense's own periods, so a monthly expense warns a month ahead and a weekly
 * one a week ahead. Null for one-time expenses, which have no end date.
 */
export const reminderLead = (frequency: Frequency, end: Ymd): Ymd | null => {
  switch (frequency) {
    case 'daily':
      return addDays(end, -1);
    case 'weekly':
      return addDays(end, -7);
    case 'monthly':
      return addMonths(end, -1);
    case 'yearly':
      return addMonths(end, -12);
    default:
      return null;
  }
};
