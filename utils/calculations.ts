
import { Person, Expense, Frequency, CreditCardPayoffResult, CreditCardPaymentRow } from '../types/budget';
import { toYMD } from './dates';
import { payMonth } from './projections';

const todayYMD = (): string => toYMD(new Date());

// Active if:
// - One-time: always included (treated as active on totals)
// - Recurring: no endDate or endDate >= asOf
export const isExpenseActive = (expense: Expense, asOfDate?: string): boolean => {
  if (!expense) return false;
  const asOf = asOfDate || todayYMD();
  if (expense.frequency === 'one-time') return true;
  const end = (expense.endDate || '').slice(0, 10);
  if (!end) return true;
  return end >= asOf;
};

const asList = <T,>(list: readonly T[] | null | undefined): readonly T[] => (Array.isArray(list) ? list : []);

/** Times a year each frequency happens; a one-time amount counts once. */
export const ANNUAL_MULTIPLIER: Record<Frequency, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  yearly: 1,
  'one-time': 1,
};

// Money is added up in whole pennies, so fractions of a penny never creep in.
const toCents = (num: number): number => Math.round(num * 100);
const fromCents = (cents: number): number => cents / 100;

/** The yearly cost of an amount, in pennies; nothing when it isn't a number. */
const annualCents = (amount: number, frequency: Frequency): number =>
  typeof amount === 'number' && !isNaN(amount) ? toCents(amount) * (ANNUAL_MULTIPLIER[frequency] ?? 1) : 0;

export const calculateAnnualAmount = (amount: number, frequency: Frequency): number => fromCents(annualCents(amount, frequency));

export const calculateMonthlyAmount = (amount: number, frequency: Frequency): number =>
  fromCents(Math.round(annualCents(amount, frequency) / 12));

const personIncomeCents = (person: Person): number => {
  let cents = 0;
  for (const income of asList(person?.income)) {
    if (income) cents += annualCents(income.amount, income.frequency);
  }
  return cents;
};

export const calculateTotalIncome = (people: Person[]): number =>
  fromCents(asList(people).reduce((cents, person) => cents + personIncomeCents(person), 0));

export const calculatePersonIncome = (person: Person): number => fromCents(personIncomeCents(person));

/** The yearly total of the expenses that pass `include` and still count today. */
const expenseTotal = (expenses: Expense[], include: (expense: Expense) => boolean): number => {
  const asOf = todayYMD();
  let cents = 0;
  for (const expense of asList(expenses)) {
    if (expense && include(expense) && isExpenseActive(expense, asOf)) cents += annualCents(expense.amount, expense.frequency);
  }
  return fromCents(cents);
};

export const calculateTotalExpenses = (expenses: Expense[]): number => expenseTotal(expenses, () => true);

export const calculateHouseholdExpenses = (expenses: Expense[]): number =>
  expenseTotal(expenses, (e) => e.category === 'household');

export const calculatePersonalExpenses = (expenses: Expense[], personId?: string): number =>
  expenseTotal(expenses, (e) => e.category === 'personal' && (!personId || e.personId === personId));

export const calculateHouseholdShare = (
  householdExpenses: number,
  people: Person[],
  distributionMethod: 'even' | 'income-based',
  personId: string
): number => {
  if (asList(people).length === 0 || typeof householdExpenses !== 'number' || isNaN(householdExpenses)) return 0;
  const householdCents = toCents(householdExpenses);

  // People excluded from the household share pay nothing toward it and the
  // rest split it. If everyone is excluded, someone still has to cover the
  // costs, so fall back to splitting between everyone.
  const included = asList(people).filter((p) => p && !p.excludeFromHouseholdShare);
  const payers = included.length > 0 ? included : asList(people);
  const payer = payers.find((p) => p && p.id === personId);
  if (!payer) return 0;

  const evenShare = fromCents(Math.round(householdCents / payers.length));
  if (distributionMethod === 'even') return evenShare;

  const totalIncome = calculateTotalIncome([...payers]);
  if (totalIncome === 0) return evenShare;
  return fromCents(Math.round((calculatePersonIncome(payer) / totalIncome) * householdCents));
};

const roundTo = (val: number, digits: number): number => {
  if (typeof val !== 'number' || isNaN(val) || typeof digits !== 'number' || isNaN(digits)) {
    return 0;
  }
  const factor = Math.pow(10, digits);
  // Prevent floating point representation errors in rounding with Math.sign(val) * Number.EPSILON
  return Math.round((val + Math.sign(val) * Number.EPSILON) * factor) / factor;
};

/**
 * Compute the interest-only minimum payment suggestion.
 * Monthly rate i = APR / 12 / 100
 * Minimum = round(balance * i, fractionDigits)
 */
export const computeInterestOnlyMinimum = (
  balance: number,
  aprPercent: number,
  fractionDigits: number = 2
): number => {
  const B = Math.max(0, balance || 0);
  const i = Math.max(0, aprPercent || 0) / 12 / 100;
  return roundTo(B * i, fractionDigits);
};

/** The first months of paying a balance down at a fixed payment, as the credit card tool lists them. */
const firstMonths = (balance: number, monthlyRate: number, payment: number, count: number): CreditCardPaymentRow[] => {
  const rows: CreditCardPaymentRow[] = [];
  let owed = balance;
  for (let month = 1; month <= count && owed > 0; month++) {
    const step = payMonth(owed, monthlyRate, payment);
    owed = step.owed;
    rows.push({ month, payment: step.paid, interest: step.interest, principal: step.principal, remaining: owed });
  }
  return rows;
};

/**
 * Compute credit card payoff metrics.
 * i = APR / 12 / 100
 * If P <= i * B -> never repaid
 * months n = ceil( ln(P / (P - i*B)) / ln(1+i) )
 * total interest = (n - 1) * P + final payment - B, where the final payment is
 * whatever is left to clear (the last payment is smaller than P, so n * P - B
 * would overstate the interest).
 * For i=0, n = ceil(B / P), interest=0
 * The months and interest come from these formulas, which hold however long it takes
 * (the loan simulator in projections.ts stops at 100 years); the first three months
 * listed are stepped through with the same month step as that simulator.
 */
export const computeCreditCardPayoff = (balance: number, aprPercent: number, monthlyPayment: number): CreditCardPayoffResult => {
  const B = Math.max(0, balance || 0);
  const P = Math.max(0, monthlyPayment || 0);
  const apr = Math.max(0, aprPercent || 0);
  const i = apr / 12 / 100;

  const result = (neverRepaid: boolean, months: number, totalInterest: number, schedule: CreditCardPaymentRow[]): CreditCardPayoffResult => ({
    neverRepaid,
    months,
    totalInterest,
    schedule,
    inputs: { balance: B, apr, monthlyPayment: P },
    monthlyRate: i,
  });

  // Nothing owed or nothing paid, or a payment that only covers the interest.
  if (B === 0 || P === 0 || (i > 0 && P <= i * B)) return result(true, 0, 0, []);

  // No interest accrues at 0% APR; the last payment just clears what is left.
  if (i === 0) return result(false, Math.ceil(B / P), 0, firstMonths(B, i, P, 3));

  const n = Math.max(1, Math.ceil(Math.log(P / (P - i * B)) / Math.log(1 + i)));
  // The balance after n-1 full payments, plus its last month of interest, is the final payment.
  const growth = Math.pow(1 + i, n - 1);
  const balanceBeforeLast = B * growth - (P * (growth - 1)) / i;
  const finalPayment = balanceBeforeLast * (1 + i);
  const totalInterest = Math.max(0, (n - 1) * P + finalPayment - B);

  return result(false, n, totalInterest, firstMonths(B, i, P, 3));
};
