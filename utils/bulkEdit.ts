import { Expense, Frequency, debtRepaymentForCategory } from '../types/budget';

/**
 * Bulk edit for the Expenses screen. Every field of the patch is optional;
 * a field that is absent is left exactly as it is on each expense. The rules
 * mirror what the single-expense form does on save, so a bulk edit and the
 * same edit made one by one end in the same data.
 */

export type BulkWho = { kind: 'household' } | { kind: 'person'; personId: string };

/** `date` is YYYY-MM-DD. */
export type BulkEndDate = { kind: 'set'; date: string } | { kind: 'remove' };

export interface BulkEditPatch {
  frequency?: Frequency;
  who?: BulkWho;
  categoryTag?: string;
  endDate?: BulkEndDate;
}

export interface BulkEditResult {
  /** The whole list after the edit; untouched expenses keep their object. */
  expenses: Expense[];
  /** Expenses whose content changed. Only these are stamped `updatedAt`. */
  changedIds: string[];
  /** The expenses as they were before the edit, for undo. */
  previous: Expense[];
  /** The `updatedAt` given to each changed expense. */
  stampedAt: number;
  /** End-date changes that didn't apply because the expense is one-time. */
  skippedOneTime: number;
  /** "Set end date" refused because it falls before the expense's start. */
  skippedBeforeStart: number;
}

export const isBulkPatchEmpty = (patch: BulkEditPatch): boolean =>
  !patch.frequency && !patch.who && !patch.categoryTag && !patch.endDate;

const startYMD = (expense: Expense): string => (expense.date || '').slice(0, 10);

const sameValue = (a: unknown, b: unknown) => (a ?? undefined) === (b ?? undefined);

const FIELDS: (keyof Expense)[] = ['frequency', 'category', 'personId', 'categoryTag', 'debtRepayment', 'endDate'];

/**
 * Applies `patch` to the expenses whose ids are in `ids`.
 * - Frequency to one-time drops the end date (one-time expenses have none).
 * - Who pays: household clears the person; a person makes it personal.
 * - Category re-derives the debt tag (Loan / Mortgage / Credit Card).
 * - End date is judged against the frequency the expense ends up with; it
 *   never applies to one-time expenses or before an expense's start date.
 * - An expense the patch leaves unchanged is returned as the same object with
 *   its `updatedAt` intact, so it can't win a sync merge against someone
 *   else's edit it didn't make.
 */
export const applyBulkEdit = (
  expenses: Expense[],
  ids: Iterable<string>,
  patch: BulkEditPatch,
  now: number = Date.now()
): BulkEditResult => {
  const selected = new Set(ids);
  const changedIds: string[] = [];
  const previous: Expense[] = [];
  let skippedOneTime = 0;
  let skippedBeforeStart = 0;

  const next = expenses.map((original) => {
    if (!selected.has(original.id)) return original;

    const e: Expense = { ...original };

    if (patch.frequency) {
      e.frequency = patch.frequency;
      if (patch.frequency === 'one-time') delete e.endDate;
    }

    if (patch.who) {
      if (patch.who.kind === 'household') {
        e.category = 'household';
        delete e.personId;
      } else {
        e.category = 'personal';
        e.personId = patch.who.personId;
      }
    }

    if (patch.categoryTag && patch.categoryTag.toLowerCase() !== (e.categoryTag || 'Misc').toLowerCase()) {
      e.categoryTag = patch.categoryTag;
      const debt = debtRepaymentForCategory(patch.categoryTag);
      if (debt) e.debtRepayment = debt;
      else delete e.debtRepayment;
    }

    if (patch.endDate) {
      if (e.frequency === 'one-time') {
        skippedOneTime++;
      } else if (patch.endDate.kind === 'remove') {
        delete e.endDate;
      } else if (patch.endDate.date < startYMD(e)) {
        skippedBeforeStart++;
      } else {
        e.endDate = patch.endDate.date;
      }
    }

    if (FIELDS.every((f) => sameValue(e[f], original[f]))) return original;

    changedIds.push(e.id);
    previous.push(original);
    return { ...e, updatedAt: now };
  });

  return { expenses: next, changedIds, previous, stampedAt: now, skippedOneTime, skippedBeforeStart };
};

/** The shared count line for the sheet and the toast: "3 expenses". */
export const countLabel = (n: number): string => `${n} ${n === 1 ? 'expense' : 'expenses'}`;
