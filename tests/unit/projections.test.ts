import { describe, expect, it } from 'vitest';
import { amortizeLoan, monthlyPayment, projectMortgage, projectSavings } from '../../utils/projections';
import { computeCreditCardPayoff } from '../../utils/calculations';

const savings = (over: Partial<Parameters<typeof projectSavings>[0]> = {}) =>
  projectSavings({ startingBalance: 0, contribution: 100, frequency: 'monthly', annualRatePct: 0, years: 10, ...over });

describe('projectSavings', () => {
  it('adds up plain deposits at 0%', () => {
    const p = savings({ startingBalance: 500 });
    expect(p.finalBalance).toBeCloseTo(500 + 100 * 120, 6);
    expect(p.totalContributed).toBeCloseTo(12500, 6);
    expect(p.interestEarned).toBeCloseTo(0, 6);
  });

  it('grows a lump sum by exactly the effective annual rate', () => {
    const p = savings({ startingBalance: 1000, contribution: 0, annualRatePct: 5, years: 1 });
    expect(p.finalBalance).toBeCloseTo(1050, 6);
    const ten = savings({ startingBalance: 1000, contribution: 0, annualRatePct: 5, years: 10 });
    expect(ten.finalBalance).toBeCloseTo(1000 * Math.pow(1.05, 10), 6);
  });

  it('matches the annuity formula for end-of-month deposits', () => {
    const rate = 4;
    const i = Math.pow(1.04, 1 / 12) - 1;
    const n = 20 * 12;
    const expected = 250 * ((Math.pow(1 + i, n) - 1) / i);
    const p = savings({ contribution: 250, annualRatePct: rate, years: 20 });
    expect(p.finalBalance).toBeCloseTo(expected, 4);
  });

  it('converts weekly and daily amounts to a month', () => {
    expect(savings({ contribution: 10, frequency: 'weekly' }).monthlyContribution).toBeCloseTo((10 * 52) / 12, 9);
    expect(savings({ contribution: 5, frequency: 'daily' }).monthlyContribution).toBeCloseTo((5 * 365) / 12, 9);
    // 52 weekly deposits ≈ 12 monthly ones of a twelfth: same yearly total at 0%.
    expect(savings({ contribution: 10, frequency: 'weekly', years: 1 }).finalBalance).toBeCloseTo(520, 6);
  });

  it('returns a point per month, a row per year, and a split that adds up', () => {
    const p = savings({ startingBalance: 200, annualRatePct: 6, years: 7 });
    expect(p.points).toHaveLength(7 * 12 + 1);
    expect(p.points[0]).toEqual({ month: 0, contributed: 200, balance: 200 });
    expect(p.yearly).toHaveLength(7);
    expect(p.yearly.at(-1)!.balance).toBeCloseTo(p.finalBalance, 9);
    expect(p.totalContributed + p.interestEarned).toBeCloseTo(p.finalBalance, 9);
    // Yearly interest sums to the total.
    expect(p.yearly.reduce((sum, y) => sum + y.interest, 0)).toBeCloseTo(p.interestEarned, 6);
  });

  it('handles a part-year horizon and empty inputs', () => {
    const p = savings({ years: 2.5 });
    expect(p.points).toHaveLength(31);
    expect(p.yearly.map((y) => y.year)).toEqual([1, 2, 3]);
    const none = savings({ contribution: 0, startingBalance: 0, years: 0 });
    expect(none.finalBalance).toBe(0);
    expect(none.points).toHaveLength(1);
  });
});

describe('monthlyPayment', () => {
  it('matches a known mortgage figure', () => {
    // 200,000 over 30 years at 6%: the textbook 1,199.10.
    expect(monthlyPayment(200000, 6, 360)).toBeCloseTo(1199.1, 2);
  });

  it('splits the balance evenly at 0%', () => {
    expect(monthlyPayment(12000, 0, 120)).toBeCloseTo(100, 9);
  });
});

describe('amortizeLoan', () => {
  it('clears a loan in exactly its term at the scheduled payment', () => {
    const payment = monthlyPayment(200000, 6, 360);
    const s = amortizeLoan(200000, 6, payment)!;
    expect(s.months).toBe(360);
    expect(s.balances).toHaveLength(361);
    expect(s.balances[360]).toBe(0);
    expect(s.totalInterest).toBeCloseTo(payment * 360 - 200000, 4);
    expect(s.totalPaid).toBeCloseTo(200000 + s.totalInterest, 6);
  });

  it('rolls years up and keeps principal summing to the balance', () => {
    const s = amortizeLoan(150000, 4.5, monthlyPayment(150000, 4.5, 25 * 12))!;
    expect(s.yearly).toHaveLength(25);
    expect(s.yearly.reduce((sum, y) => sum + y.principal, 0)).toBeCloseTo(150000, 4);
    expect(s.yearly.reduce((sum, y) => sum + y.interest, 0)).toBeCloseTo(s.totalInterest, 6);
    expect(s.yearly.at(-1)!.balance).toBe(0);
    // Early years are mostly interest, late years mostly principal.
    expect(s.yearly[0].interest).toBeGreaterThan(s.yearly[0].principal);
    expect(s.yearly.at(-1)!.principal).toBeGreaterThan(s.yearly.at(-1)!.interest);
  });

  it('reports a part-year at the end', () => {
    const s = amortizeLoan(10000, 5, monthlyPayment(10000, 5, 30))!;
    expect(s.months).toBe(30);
    expect(s.yearly.map((y) => y.year)).toEqual([1, 2, 3]);
  });

  it('refuses a payment that only covers the interest', () => {
    expect(amortizeLoan(100000, 6, 500)).toBeNull(); // interest alone is 500
    expect(amortizeLoan(100000, 6, 0)).toBeNull();
  });

  it('refuses a payoff that would take over a hundred years', () => {
    expect(amortizeLoan(100000, 6, 500.01)).toBeNull();
  });
});

describe('projectMortgage', () => {
  const base = { balance: 250000, annualRatePct: 5.5, termYears: 30, extraMonthly: 0 };

  it('has no extra scenario without extra', () => {
    const p = projectMortgage(base)!;
    expect(p.baseline.months).toBe(360);
    expect(p.withExtra).toBeNull();
    expect(p.interestSaved).toBe(0);
    expect(p.monthsSaved).toBe(0);
  });

  it('shows what extra payments save', () => {
    const p = projectMortgage({ ...base, extraMonthly: 200 })!;
    expect(p.withExtra!.months).toBeLessThan(360);
    expect(p.monthsSaved).toBe(360 - p.withExtra!.months);
    expect(p.interestSaved).toBeGreaterThan(0);
    expect(p.interestSaved).toBeCloseTo(p.baseline.totalInterest - p.withExtra!.totalInterest, 6);
    // The last payment is smaller than the scheduled one.
    expect(p.withExtra!.totalPaid).toBeLessThan(p.withExtra!.payment * p.withExtra!.months);
  });

  it('handles 0% and rejects inputs that are not a loan', () => {
    const zero = projectMortgage({ ...base, annualRatePct: 0 })!;
    expect(zero.baseline.totalInterest).toBeCloseTo(0, 6);
    expect(zero.payment).toBeCloseTo(250000 / 360, 9);
    expect(projectMortgage({ ...base, balance: 0 })).toBeNull();
    expect(projectMortgage({ ...base, termYears: 0 })).toBeNull();
  });
});

describe('computeCreditCardPayoff total interest', () => {
  const simulate = (balance: number, apr: number, payment: number) => {
    let owed = balance;
    let interest = 0;
    let months = 0;
    while (owed > 1e-9) {
      const m = owed * (apr / 1200);
      interest += m;
      owed = owed + m - Math.min(payment, owed + m);
      months++;
    }
    return { interest, months };
  };

  it('counts the smaller last payment', () => {
    for (const [balance, apr, payment] of [
      [1000, 20, 100],
      [5000, 22.9, 175],
      [12345.67, 17.5, 400],
    ] as const) {
      const r = computeCreditCardPayoff(balance, apr, payment);
      const sim = simulate(balance, apr, payment);
      expect(r.months).toBe(sim.months);
      expect(r.totalInterest).toBeCloseTo(sim.interest, 4);
      // The old n * P - B overstated it.
      expect(r.totalInterest).toBeLessThan(r.months * payment - balance);
    }
  });

  it('charges no interest at 0% APR', () => {
    const r = computeCreditCardPayoff(1000, 0, 300);
    expect(r.months).toBe(4);
    expect(r.totalInterest).toBe(0);
  });
});
