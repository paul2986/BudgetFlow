
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

const toCents = (num: number): number => Math.round(num * 100);
const fromCents = (cents: number): number => cents / 100;

export const calculateAnnualAmount = (amount: number, frequency: Frequency): number => {
  if (typeof amount !== 'number' || isNaN(amount)) return 0;
  
  const cents = toCents(amount);
  let annualCents = 0;
  switch (frequency) {
    case 'daily':
      annualCents = cents * 365;
      break;
    case 'weekly':
      annualCents = cents * 52;
      break;
    case 'monthly':
      annualCents = cents * 12;
      break;
    case 'yearly':
    case 'one-time':
    default:
      annualCents = cents;
      break;
  }
  return fromCents(annualCents);
};

export const calculateMonthlyAmount = (amount: number, frequency: Frequency): number => {
  const annualCents = toCents(calculateAnnualAmount(amount, frequency));
  return fromCents(Math.round(annualCents / 12));
};

export const calculateTotalIncome = (people: Person[]): number => {
  // Add comprehensive null checks for people array
  if (!people || !Array.isArray(people)) {
    return 0;
  }

  let totalCents = 0;
  people.forEach((person) => {
    if (person && person.income && Array.isArray(person.income)) {
      person.income.forEach((income) => {
        if (income && typeof income.amount === 'number' && !isNaN(income.amount)) {
          totalCents += toCents(calculateAnnualAmount(income.amount, income.frequency));
        }
      });
    }
  });
  return fromCents(totalCents);
};

export const calculatePersonIncome = (person: Person): number => {
  // Add comprehensive null checks for person and person.income
  if (!person || !person.income || !Array.isArray(person.income)) {
    return 0;
  }

  let totalCents = 0;
  person.income.forEach((income) => {
    if (income && typeof income.amount === 'number' && !isNaN(income.amount)) {
      totalCents += toCents(calculateAnnualAmount(income.amount, income.frequency));
    }
  });
  return fromCents(totalCents);
};

export const calculateTotalExpenses = (expenses: Expense[]): number => {
  // Add comprehensive null checks for expenses array
  if (!expenses || !Array.isArray(expenses)) {
    return 0;
  }

  const asOf = todayYMD();
  let totalCents = 0;
  expenses.forEach((expense) => {
    if (expense && typeof expense.amount === 'number' && !isNaN(expense.amount) && isExpenseActive(expense, asOf)) {
      totalCents += toCents(calculateAnnualAmount(expense.amount, expense.frequency));
    }
  });
  return fromCents(totalCents);
};

export const calculateHouseholdExpenses = (expenses: Expense[]): number => {
  // Add comprehensive null checks for expenses array
  if (!expenses || !Array.isArray(expenses)) {
    return 0;
  }

  const asOf = todayYMD();
  let totalCents = 0;
  expenses
    .filter((expense) => expense && expense.category === 'household')
    .filter((expense) => isExpenseActive(expense, asOf))
    .forEach((expense) => {
      if (expense && typeof expense.amount === 'number' && !isNaN(expense.amount)) {
        totalCents += toCents(calculateAnnualAmount(expense.amount, expense.frequency));
      }
    });
  return fromCents(totalCents);
};

export const calculatePersonalExpenses = (expenses: Expense[], personId?: string): number => {
  // Add comprehensive null checks for expenses array
  if (!expenses || !Array.isArray(expenses)) {
    return 0;
  }

  const asOf = todayYMD();
  let totalCents = 0;
  expenses
    .filter((expense) => expense && expense.category === 'personal' && (!personId || expense.personId === personId))
    .filter((expense) => isExpenseActive(expense, asOf))
    .forEach((expense) => {
      if (expense && typeof expense.amount === 'number' && !isNaN(expense.amount)) {
        totalCents += toCents(calculateAnnualAmount(expense.amount, expense.frequency));
      }
    });
  return fromCents(totalCents);
};

export const calculateHouseholdShare = (
  householdExpenses: number,
  people: Person[],
  distributionMethod: 'even' | 'income-based',
  personId: string
): number => {
  // Add comprehensive null checks for people array
  if (!people || !Array.isArray(people) || people.length === 0) {
    return 0;
  }

  if (typeof householdExpenses !== 'number' || isNaN(householdExpenses)) {
    return 0;
  }

  const householdCents = toCents(householdExpenses);

  // People excluded from the household share pay nothing toward it and the
  // rest split it. If everyone is excluded, someone still has to cover the
  // costs, so fall back to splitting between everyone.
  const included = people.filter((p) => p && !p.excludeFromHouseholdShare);
  const payers = included.length > 0 ? included : people;
  if (!payers.some((p) => p && p.id === personId)) return 0;

  if (distributionMethod === 'even') {
    return fromCents(Math.round(householdCents / payers.length));
  } else {
    const totalIncome = calculateTotalIncome(payers);
    if (totalIncome === 0) return fromCents(Math.round(householdCents / payers.length));

    const person = payers.find((p) => p && p.id === personId);
    if (!person) return 0;

    const personIncome = calculatePersonIncome(person);
    const shareCents = Math.round((personIncome / totalIncome) * householdCents);
    return fromCents(shareCents);
  }
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
