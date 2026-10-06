import type { Budget, Expense, Frequency } from '../types/budget';
import { parseYmd, reminderLead, type Ymd } from './expenseEnd';

/**
 * Which "this expense is about to end" notifications to schedule. Two per
 * recurring expense with an end date: one a single period ahead of it (a month
 * for a monthly expense, a week for a weekly one) and one on the day itself.
 * Pure: it only works out what and when; endReminderScheduler hands the result
 * to the phone.
 */

/** Local time of day the reminders arrive: a morning heads-up, not a midnight buzz. */
export const REMINDER_HOUR = 9;

/** iOS keeps at most 64 pending local notifications and silently drops the rest. */
export const MAX_REMINDERS = 60;

export interface EndReminder {
  id: string;
  kind: 'lead' | 'day';
  fireAt: Date;
  title: string;
  subtitle?: string;
  body: string;
  budgetId: string;
  expenseId: string;
}

export const REMINDER_ID_PREFIX = 'expense-end:';

const AHEAD: Partial<Record<Frequency, string>> = {
  daily: 'tomorrow',
  weekly: 'in 1 week',
  monthly: 'in 1 month',
  yearly: 'in 1 year',
};

const at9am = ({ y, m, d }: Ymd): Date => new Date(y, m - 1, d, REMINDER_HOUR, 0, 0, 0);

const longDay = (ymd: Ymd): string =>
  new Date(ymd.y, ymd.m - 1, ymd.d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const reminderFor = (
  budget: Budget,
  expense: Expense,
  kind: EndReminder['kind'],
  fireAt: Date,
  end: Ymd,
  multipleBudgets: boolean
): EndReminder => {
  // A locked budget's contents shouldn't show on a lock screen, so say only that something ends.
  const locked = !!budget.lock?.locked;
  const what = locked ? 'An expense' : expense.description || 'An expense';
  const when = kind === 'day' ? 'ends today' : `ends ${AHEAD[expense.frequency]}`;
  const body = locked
    ? `Unlock ${budget.name} to see which.`
    : kind === 'day'
      ? 'Today is its last day. Change the end date if it carries on.'
      : `Its last day is ${longDay(end)}.`;
  return {
    id: `${REMINDER_ID_PREFIX}${budget.id}:${expense.id}:${kind}`,
    kind,
    fireAt,
    title: `${what} ${when}`,
    subtitle: multipleBudgets || locked ? budget.name : undefined,
    body,
    budgetId: budget.id,
    expenseId: expense.id,
  };
};

/** The reminders still to come, soonest first, capped at what the phone will hold. */
export const planEndReminders = (budgets: Budget[], now: Date = new Date()): EndReminder[] => {
  const reminders: EndReminder[] = [];
  const multipleBudgets = (budgets?.length ?? 0) > 1;

  for (const budget of budgets ?? []) {
    for (const expense of budget.expenses ?? []) {
      if (!expense || expense.frequency === 'one-time') continue;
      const end = parseYmd(expense.endDate);
      if (!end) continue;

      // Already past (an expense added with its end date inside the period): skip it, the day-of one still comes.
      const lead = reminderLead(expense.frequency, end);
      if (lead) {
        const fireAt = at9am(lead);
        if (fireAt > now) reminders.push(reminderFor(budget, expense, 'lead', fireAt, end, multipleBudgets));
      }

      const dayAt = at9am(end);
      if (dayAt > now) reminders.push(reminderFor(budget, expense, 'day', dayAt, end, multipleBudgets));
    }
  }

  return reminders
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, MAX_REMINDERS);
};
