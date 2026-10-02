import { useMemo } from 'react';
import { useCurrency, displaySymbol } from '../../hooks/useCurrency';
import { compactMoney } from './chartScale';

/**
 * Money formats for charts: whole units for readouts (a projection has no
 * pennies), and a compact form for axis labels where space is short.
 */
export const useChartFormat = () => {
  const { currency } = useCurrency();
  return useMemo(() => {
    const symbol = displaySymbol(currency.symbol);
    let formatter: Intl.NumberFormat | null = null;
    try {
      formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    } catch {
      // An unknown currency code: fall back to the symbol.
    }
    return {
      whole: (value: number) =>
        formatter ? formatter.format(Math.round(value)) : `${symbol}${Math.round(value).toLocaleString('en-US')}`,
      axis: (value: number) => compactMoney(value, symbol),
    };
  }, [currency]);
};
