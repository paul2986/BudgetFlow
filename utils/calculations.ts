
import { Person, Expense, Frequency, CreditCardPayoffResult, CreditCardPaymentRow } from '../types/budget';

const toYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

// Returns recurring expenses with an endDate that is either already ended OR
// will end within the next N days. Sorted by endDate ascending.
export const getEndingSoon = (expenses: Expense[], days: number = 30): { expiringSoon: Expense[], ended: Expense[] } => {
  // Add comprehensive null checks for expenses array
  if (!expenses || !Array.isArray(expenses)) {
    console.log('getEndingSoon: expenses is not an array:', expenses);
    return { expiringSoon: [], ended: [] };
  }

  const now = new Date();
  const startYMD = toYMD(now);
  const limit = new Date(now);
  limit.setDate(limit.getDate() + days);
  const limitYMD = toYMD(limit);

  const expiringSoon: Expense[] = [];
  const ended: Expense[] = [];

  expenses
    .filter((e) => e && e.frequency !== 'one-time' && typeof e.endDate === 'string' && e.endDate)
    .forEach((e) => {
      const end = (e.endDate as string).slice(0, 10);
      if (end < startYMD) {
        ended.push(e);
      } else if (end >= startYMD && end <= limitYMD) {
        expiringSoon.push(e);
      }
    });

  // Sort both arrays by endDate ascending
  const sortByEndDate = (a: Expense, b: Expense) => {
    const ea = (a.endDate as string).slice(0, 10);
    const eb = (b.endDate as string).slice(0, 10);
    return ea.localeCompare(eb);
  };

  expiringSoon.sort(sortByEndDate);
  ended.sort(sortByEndDate);

  // Remove duplicates by ID
  const dedupeById = (arr: Expense[]) => {
    const byId = new Map<string, Expense>();
    arr.forEach((e) => {
      if (e && e.id) {
        byId.set(e.id, e);
      }
    });
    return Array.from(byId.values());
  };

  return {
    expiringSoon: dedupeById(expiringSoon),
    ended: dedupeById(ended)
  };
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
    console.log('calculateTotalIncome: people is not an array:', people);
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
    console.log('calculatePersonIncome: person.income is not an array:', person);
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
    console.log('calculateTotalExpenses: expenses is not an array:', expenses);
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
    console.log('calculateHouseholdExpenses: expenses is not an array:', expenses);
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
    console.log('calculatePersonalExpenses: expenses is not an array:', expenses);
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
    console.log('calculateHouseholdShare: people is not an array or is empty:', people);
    return 0;
  }

  if (typeof householdExpenses !== 'number' || isNaN(householdExpenses)) {
    return 0;
  }

  const householdCents = toCents(householdExpenses);

  if (distributionMethod === 'even') {
    return fromCents(Math.round(householdCents / people.length));
  } else {
    const totalIncome = calculateTotalIncome(people);
    if (totalIncome === 0) return fromCents(Math.round(householdCents / people.length));

    const person = people.find((p) => p && p.id === personId);
    if (!person) return 0;

    const personIncome = calculatePersonIncome(person);
    const shareCents = Math.round((personIncome / totalIncome) * householdCents);
    return fromCents(shareCents);
  }
};

export const roundTo = (val: number, digits: number): number => {
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

/**
 * Compute credit card payoff metrics.
 * i = APR / 12 / 100
 * If P <= i * B -> never repaid
 * months n = ceil( ln(P / (P - i*B)) / ln(1+i) )
 * total interest = (n * P) - B
 * For i=0, n = ceil(B / P), interest=0
 */
export const computeCreditCardPayoff = (balance: number, aprPercent: number, monthlyPayment: number): CreditCardPayoffResult => {
  const B = Math.max(0, balance || 0);
  const P = Math.max(0, monthlyPayment || 0);
  const i = Math.max(0, aprPercent || 0) / 12 / 100;

  if (B === 0 || P === 0) {
    return {
      neverRepaid: true,
      months: 0,
      totalInterest: 0,
      schedule: [],
      inputs: { balance: B, apr: Math.max(0, aprPercent || 0), monthlyPayment: P },
      monthlyRate: i,
    };
  }

  if (i === 0) {
    const n = Math.ceil(B / P);
    const totalInterest = Math.max(0, n * P - B);
    const schedule: CreditCardPaymentRow[] = [];
    let bal = B;
    for (let m = 1; m <= 3 && bal > 0; m++) {
      const interest = 0;
      const principal = Math.min(P, bal);
      bal = Math.max(0, bal - principal);
      schedule.push({
        month: m,
        payment: principal + interest,
        interest,
        principal,
        remaining: bal,
      });
    }
    return {
      neverRepaid: false,
      months: n,
      totalInterest,
      schedule,
      inputs: { balance: B, apr: Math.max(0, aprPercent || 0), monthlyPayment: P },
      monthlyRate: i,
    };
  }

  // Never repaid if payment doesn't exceed monthly interest
  if (P <= i * B) {
    return {
      neverRepaid: true,
      months: 0,
      totalInterest: 0,
      schedule: [],
      inputs: { balance: B, apr: Math.max(0, aprPercent || 0), monthlyPayment: P },
      monthlyRate: i,
    };
  }

  // n = ceil( ln(P / (P - i*B)) / ln(1+i) )
  const numerator = Math.log(P / (P - i * B));
  const denominator = Math.log(1 + i);
  const nRaw = numerator / denominator;
  const n = Math.max(1, Math.ceil(nRaw));
  const totalInterest = Math.max(0, n * P - B);

  // First 3 months schedule
  const schedule: CreditCardPaymentRow[] = [];
  let bal = B;
  for (let m = 1; m <= 3 && bal > 0; m++) {
    const interest = bal * i;
    const principal = Math.max(0, P - interest);
    bal = Math.max(0, bal - principal);
    schedule.push({
      month: m,
      payment: Math.min(P, principal + interest),
      interest,
      principal: Math.min(principal, principal + interest), // guard
      remaining: bal,
    });
  }

  return {
    neverRepaid: false,
    months: n,
    totalInterest,
    schedule,
    inputs: { balance: B, apr: Math.max(0, aprPercent || 0), monthlyPayment: P },
    monthlyRate: i,
  };
};
