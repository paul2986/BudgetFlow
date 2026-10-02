import { describe, expect, it } from 'vitest';
import { makeExpense } from '../helpers/fixtures';
import { applyBulkEdit, isBulkPatchEmpty } from '../../utils/bulkEdit';

const NOW = 5_000;

const byId = <T extends { id: string }>(list: T[], id: string): T => list.find((e) => e.id === id)!;

describe('applyBulkEdit', () => {
  it('changes only the selected expenses', () => {
    const a = makeExpense({ id: 'a', frequency: 'monthly' });
    const b = makeExpense({ id: 'b', frequency: 'monthly' });
    const result = applyBulkEdit([a, b], ['a'], { frequency: 'yearly' }, NOW);
    expect(byId(result.expenses, 'a').frequency).toBe('yearly');
    expect(result.expenses[1]).toBe(b);
    expect(result.changedIds).toEqual(['a']);
  });

  it('leaves every field the patch does not mention alone', () => {
    const a = makeExpense({ id: 'a', category: 'personal', personId: 'p1', categoryTag: 'Rent', endDate: '2027-01-31' });
    const result = applyBulkEdit([a], ['a'], { frequency: 'weekly' }, NOW);
    expect(result.expenses[0]).toMatchObject({
      frequency: 'weekly',
      category: 'personal',
      personId: 'p1',
      categoryTag: 'Rent',
      endDate: '2027-01-31',
    });
  });

  it('stamps updatedAt on changed expenses only', () => {
    const changed = makeExpense({ id: 'a', frequency: 'monthly', updatedAt: 10 });
    const alreadyYearly = makeExpense({ id: 'b', frequency: 'yearly', updatedAt: 10 });
    const result = applyBulkEdit([changed, alreadyYearly], ['a', 'b'], { frequency: 'yearly' }, NOW);
    expect(byId(result.expenses, 'a').updatedAt).toBe(NOW);
    // Unchanged: same object, old stamp, so it can't beat a partner's later edit in a merge.
    expect(result.expenses[1]).toBe(alreadyYearly);
    expect(result.expenses[1].updatedAt).toBe(10);
    expect(result.changedIds).toEqual(['a']);
  });

  it('keeps the previous version of each changed expense for undo', () => {
    const a = makeExpense({ id: 'a', frequency: 'monthly' });
    const result = applyBulkEdit([a], ['a'], { frequency: 'yearly' }, NOW);
    expect(result.previous).toEqual([a]);
  });

  describe('who pays', () => {
    it('household clears the person', () => {
      const a = makeExpense({ id: 'a', category: 'personal', personId: 'p1' });
      const [e] = applyBulkEdit([a], ['a'], { who: { kind: 'household' } }, NOW).expenses;
      expect(e.category).toBe('household');
      expect('personId' in e).toBe(false);
    });

    it('a person makes it personal to them, from household or from someone else', () => {
      const household = makeExpense({ id: 'a', category: 'household' });
      const other = makeExpense({ id: 'b', category: 'personal', personId: 'p1' });
      const { expenses } = applyBulkEdit([household, other], ['a', 'b'], { who: { kind: 'person', personId: 'p2' } }, NOW);
      expect(expenses.map((e) => [e.category, e.personId])).toEqual([
        ['personal', 'p2'],
        ['personal', 'p2'],
      ]);
    });
  });

  describe('category', () => {
    it('sets the tag and derives the debt repayment type', () => {
      const a = makeExpense({ id: 'a', categoryTag: 'Misc' });
      const [e] = applyBulkEdit([a], ['a'], { categoryTag: 'Loan' }, NOW).expenses;
      expect(e.categoryTag).toBe('Loan');
      expect(e.debtRepayment).toBe('loan');
    });

    it('drops the debt type when moving to a non-debt category', () => {
      const a = makeExpense({ id: 'a', categoryTag: 'Mortgage', debtRepayment: 'mortgage' });
      const [e] = applyBulkEdit([a], ['a'], { categoryTag: 'Groceries' }, NOW).expenses;
      expect(e.categoryTag).toBe('Groceries');
      expect('debtRepayment' in e).toBe(false);
    });

    it('treats a missing tag as Misc, and a same-tag edit as no change', () => {
      const a = makeExpense({ id: 'a', categoryTag: undefined });
      const result = applyBulkEdit([a], ['a'], { categoryTag: 'Misc' }, NOW);
      expect(result.changedIds).toEqual([]);
      expect(result.expenses[0]).toBe(a);
    });
  });

  describe('frequency and end dates', () => {
    it('changing to one-time clears the end date', () => {
      const a = makeExpense({ id: 'a', frequency: 'monthly', endDate: '2027-01-31' });
      const [e] = applyBulkEdit([a], ['a'], { frequency: 'one-time' }, NOW).expenses;
      expect(e.frequency).toBe('one-time');
      expect('endDate' in e).toBe(false);
    });

    it('sets and removes end dates on recurring expenses', () => {
      const a = makeExpense({ id: 'a', frequency: 'monthly' });
      const b = makeExpense({ id: 'b', frequency: 'weekly', endDate: '2027-01-31' });
      const set = applyBulkEdit([a, b], ['a', 'b'], { endDate: { kind: 'set', date: '2027-06-30' } }, NOW);
      expect(set.expenses.map((e) => e.endDate)).toEqual(['2027-06-30', '2027-06-30']);

      const removed = applyBulkEdit([a, b], ['a', 'b'], { endDate: { kind: 'remove' } }, NOW);
      expect('endDate' in removed.expenses[1]).toBe(false);
      // `a` never had one, so there was nothing to change.
      expect(removed.changedIds).toEqual(['b']);
    });

    it('skips one-time expenses and says how many', () => {
      const once = makeExpense({ id: 'a', frequency: 'one-time' });
      const monthly = makeExpense({ id: 'b', frequency: 'monthly' });
      const result = applyBulkEdit([once, monthly], ['a', 'b'], { endDate: { kind: 'set', date: '2027-06-30' } }, NOW);
      expect(result.skippedOneTime).toBe(1);
      expect(result.expenses[0]).toBe(once);
      expect(byId(result.expenses, 'b').endDate).toBe('2027-06-30');
    });

    it('judges the end date against the frequency the expense ends up with', () => {
      const a = makeExpense({ id: 'a', frequency: 'monthly' });
      const toOnce = applyBulkEdit([a], ['a'], { frequency: 'one-time', endDate: { kind: 'set', date: '2027-06-30' } }, NOW);
      expect(toOnce.skippedOneTime).toBe(1);
      expect(toOnce.expenses[0].frequency).toBe('one-time');
      expect('endDate' in toOnce.expenses[0]).toBe(false);

      const once = makeExpense({ id: 'b', frequency: 'one-time' });
      const toMonthly = applyBulkEdit([once], ['b'], { frequency: 'monthly', endDate: { kind: 'set', date: '2027-06-30' } }, NOW);
      expect(toMonthly.skippedOneTime).toBe(0);
      expect(toMonthly.expenses[0]).toMatchObject({ frequency: 'monthly', endDate: '2027-06-30' });
    });

    it('refuses an end date before the start date, but allows the same day', () => {
      const early = makeExpense({ id: 'a', frequency: 'monthly', date: '2026-10-01T00:00:00.000Z' });
      const late = makeExpense({ id: 'b', frequency: 'monthly', date: '2026-03-01T00:00:00.000Z' });
      const result = applyBulkEdit([early, late], ['a', 'b'], { endDate: { kind: 'set', date: '2026-10-01' } }, NOW);
      expect(result.skippedBeforeStart).toBe(0);
      expect(result.expenses.map((e) => e.endDate)).toEqual(['2026-10-01', '2026-10-01']);

      const tooEarly = applyBulkEdit([early], ['a'], { endDate: { kind: 'set', date: '2026-09-30' } }, NOW);
      expect(tooEarly.skippedBeforeStart).toBe(1);
      expect(tooEarly.expenses[0]).toBe(early);
    });
  });

  it('applies several fields in one pass', () => {
    const a = makeExpense({ id: 'a', category: 'household', frequency: 'monthly', categoryTag: 'Misc' });
    const [e] = applyBulkEdit(
      [a],
      ['a'],
      {
        frequency: 'yearly',
        who: { kind: 'person', personId: 'p1' },
        categoryTag: 'Credit Card',
        endDate: { kind: 'set', date: '2028-01-01' },
      },
      NOW
    ).expenses;
    expect(e).toMatchObject({
      frequency: 'yearly',
      category: 'personal',
      personId: 'p1',
      categoryTag: 'Credit Card',
      debtRepayment: 'credit_card',
      endDate: '2028-01-01',
      updatedAt: NOW,
    });
  });

  it('ignores ids that no longer exist', () => {
    const a = makeExpense({ id: 'a' });
    const result = applyBulkEdit([a], ['gone'], { frequency: 'yearly' }, NOW);
    expect(result.changedIds).toEqual([]);
    expect(result.expenses[0]).toBe(a);
  });
});

describe('isBulkPatchEmpty', () => {
  it('is true until a field is chosen', () => {
    expect(isBulkPatchEmpty({})).toBe(true);
    expect(isBulkPatchEmpty({ endDate: { kind: 'remove' } })).toBe(false);
  });
});
