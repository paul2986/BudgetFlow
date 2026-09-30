import type { ColorTokens } from '../styles/tokens';

/**
 * Label, icon and colour pair for a debt repayment type, shared by Home's debt
 * card and the expense list/table so a loan looks the same everywhere.
 */
export interface DebtMeta {
  label: string;
  icon: string;
  color: string;
  subtle: string;
}

export function debtMeta(type: string | undefined, colors: ColorTokens): DebtMeta {
  switch (type) {
    case 'mortgage':
      return { label: 'Mortgage', icon: 'business-outline', color: colors.mortgage, subtle: colors.mortgageSubtle };
    case 'loan':
      return { label: 'Loan', icon: 'cash-outline', color: colors.loan, subtle: colors.loanSubtle };
    case 'credit_card':
      return { label: 'Credit card', icon: 'card-outline', color: colors.creditCard, subtle: colors.creditCardSubtle };
    default:
      return { label: 'Debt', icon: 'trending-down-outline', color: colors.brand, subtle: colors.brandSubtle };
  }
}
