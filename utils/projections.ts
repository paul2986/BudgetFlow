/**
 * Pure maths behind the Tools screens: the savings projection and the mortgage
 * amortization. No UI, no storage, so they are unit-tested on their own.
 */

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------

export type ContributionFrequency = 'daily' | 'weekly' | 'monthly';

export const CONTRIBUTIONS_PER_YEAR: Record<ContributionFrequency, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
};

export interface SavingsInputs {
  startingBalance: number;
  /** Amount added each `frequency`. */
  contribution: number;
  frequency: ContributionFrequency;
  /** Effective annual rate in percent, as banks advertise it (AER / APY). */
  annualRatePct: number;
  years: number;
}

export interface SavingsPoint {
  /** Months from now; 0 is today. */
  month: number;
  /** Starting balance plus every deposit so far. */
  contributed: number;
  balance: number;
}

export interface SavingsYear {
  year: number;
  contributed: number;
  interest: number;
  balance: number;
}

export interface SavingsProjection {
  inputs: SavingsInputs;
  /** The contribution spread over a month (daily and weekly amounts are converted). */
  monthlyContribution: number;
  /** One point per month, from month 0 to the end of the horizon. */
  points: SavingsPoint[];
  /** Year-end snapshots, for the table. */
  yearly: SavingsYear[];
  finalBalance: number;
  totalContributed: number;
  interestEarned: number;
}

/**
 * Projects a savings pot month by month.
 *
 * The rate is an effective annual rate, so a year of growth on its own adds
 * exactly that percentage. Deposits land at the end of each month, which is
 * marginally cautious for daily and weekly saving (they would really earn a
 * little interest within the month).
 */
export const projectSavings = (inputs: SavingsInputs): SavingsProjection => {
  const start = Math.max(0, inputs.startingBalance || 0);
  const contribution = Math.max(0, inputs.contribution || 0);
  const ratePct = Math.max(0, inputs.annualRatePct || 0);
  const totalMonths = Math.max(0, Math.round((inputs.years || 0) * 12));

  const monthlyContribution = (contribution * CONTRIBUTIONS_PER_YEAR[inputs.frequency]) / 12;
  const monthlyRate = Math.pow(1 + ratePct / 100, 1 / 12) - 1;

  const points: SavingsPoint[] = [{ month: 0, contributed: start, balance: start }];
  const yearly: SavingsYear[] = [];
  let balance = start;
  let previousYearBalance = start;
  let previousYearContributed = start;

  for (let month = 1; month <= totalMonths; month++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    const contributed = start + monthlyContribution * month;
    points.push({ month, contributed, balance });

    if (month % 12 === 0 || month === totalMonths) {
      const deposited = contributed - previousYearContributed;
      yearly.push({
        year: Math.ceil(month / 12),
        contributed,
        interest: balance - previousYearBalance - deposited,
        balance,
      });
      previousYearBalance = balance;
      previousYearContributed = contributed;
    }
  }

  const totalContributed = start + monthlyContribution * totalMonths;
  return {
    inputs,
    monthlyContribution,
    points,
    yearly,
    finalBalance: balance,
    totalContributed,
    interestEarned: balance - totalContributed,
  };
};

// ---------------------------------------------------------------------------
// Mortgage
// ---------------------------------------------------------------------------

export interface LoanYear {
  year: number;
  principal: number;
  interest: number;
  /** Balance still owed at the end of the year. */
  balance: number;
}

export interface LoanSchedule {
  /** Payments made before the balance reaches zero. */
  months: number;
  /** The scheduled monthly payment (the last one is usually smaller). */
  payment: number;
  totalInterest: number;
  totalPaid: number;
  /** Balance after each month; [0] is the opening balance. */
  balances: number[];
  yearly: LoanYear[];
}

/** Stop simulating after this long: a payment that barely covers interest. */
const MAX_MONTHS = 1200;
/** A balance under half a cent is paid off. */
export const PAID_OFF = 0.005;

/**
 * One month of a fixed-rate loan: interest builds on what is owed, then the payment
 * is made, but never more than what is owed plus that interest (the last payment is
 * smaller). Shared by the loan simulator and the credit card tool, so both agree.
 */
export const payMonth = (owed: number, monthlyRate: number, payment: number) => {
  const interest = owed * monthlyRate;
  const paid = Math.min(payment, owed + interest);
  const principal = paid - interest;
  const left = Math.max(0, owed - principal);
  return { interest, paid, principal, owed: left < PAID_OFF ? 0 : left };
};

/** Fixed monthly payment that clears `balance` in `termMonths` (principal and interest only). */
export const monthlyPayment = (balance: number, annualRatePct: number, termMonths: number): number => {
  const B = Math.max(0, balance || 0);
  const n = Math.max(1, Math.round(termMonths || 0));
  const i = Math.max(0, annualRatePct || 0) / 12 / 100;
  if (B === 0) return 0;
  if (i === 0) return B / n;
  return (B * i) / (1 - Math.pow(1 + i, -n));
};

/**
 * Walks a loan forward month by month at a fixed rate and payment. Returns
 * null when the payment can't clear it: no more than the interest, or more
 * than 100 years away.
 */
export const amortizeLoan = (balance: number, annualRatePct: number, payment: number): LoanSchedule | null => {
  const B = Math.max(0, balance || 0);
  const P = Math.max(0, payment || 0);
  const i = Math.max(0, annualRatePct || 0) / 12 / 100;
  if (B === 0) return { months: 0, payment: P, totalInterest: 0, totalPaid: 0, balances: [0], yearly: [] };
  if (P <= B * i || P === 0) return null;

  const balances = [B];
  const yearly: LoanYear[] = [];
  let owed = B;
  let totalInterest = 0;
  let totalPaid = 0;
  let yearPrincipal = 0;
  let yearInterest = 0;
  let month = 0;

  while (owed > PAID_OFF && month < MAX_MONTHS) {
    month++;
    const step = payMonth(owed, i, P);
    const { interest, paid, principal } = step;
    owed = step.owed;

    totalInterest += interest;
    totalPaid += paid;
    yearPrincipal += principal;
    yearInterest += interest;
    balances.push(owed);

    if (month % 12 === 0 || owed === 0) {
      yearly.push({ year: Math.ceil(month / 12), principal: yearPrincipal, interest: yearInterest, balance: owed });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }

  if (owed > 0) return null;
  return { months: month, payment: P, totalInterest, totalPaid, balances, yearly };
};

export interface MortgageInputs {
  /** What is still owed. */
  balance: number;
  annualRatePct: number;
  /** Time left on the loan. */
  termYears: number;
  /** Extra paid on top of the scheduled payment every month. */
  extraMonthly: number;
}

export interface MortgageProjection {
  inputs: MortgageInputs;
  /** The required monthly payment, principal and interest only. */
  payment: number;
  /** Paying exactly the scheduled amount. */
  baseline: LoanSchedule;
  /** Paying the extra every month; null when there is no extra. */
  withExtra: LoanSchedule | null;
  interestSaved: number;
  monthsSaved: number;
}

/** Null when the inputs can't describe a loan (no balance or no term). */
export const projectMortgage = (inputs: MortgageInputs): MortgageProjection | null => {
  const balance = Math.max(0, inputs.balance || 0);
  const termMonths = Math.round((inputs.termYears || 0) * 12);
  if (balance <= 0 || termMonths < 1) return null;

  const rate = Math.max(0, inputs.annualRatePct || 0);
  const extra = Math.max(0, inputs.extraMonthly || 0);
  const payment = monthlyPayment(balance, rate, termMonths);

  const baseline = amortizeLoan(balance, rate, payment);
  if (!baseline) return null;
  const withExtra = extra > 0 ? amortizeLoan(balance, rate, payment + extra) : null;

  return {
    inputs,
    payment,
    baseline,
    withExtra,
    interestSaved: withExtra ? Math.max(0, baseline.totalInterest - withExtra.totalInterest) : 0,
    monthsSaved: withExtra ? Math.max(0, baseline.months - withExtra.months) : 0,
  };
};
