import React from 'react';
import { Text, TextStyle } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { type, tabularNums } from '../../styles/tokens';

/**
 * Currency amount text — always tabular numerals, always formatted through the
 * currency hook (DESIGN.md §2.2 "Numerals first").
 */

interface AmountTextProps {
  value: number;
  /** Text role for sizing; defaults to bodyMed. */
  role?: keyof typeof type;
  /** Semantic coloring; 'auto' = income when >= 0, expense when < 0. */
  tone?: 'default' | 'muted' | 'income' | 'expense' | 'auto';
  /** Append a suffix such as "/mo" in caption size. */
  suffix?: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}

export default function AmountText({
  value,
  role = 'bodyMed',
  tone = 'default',
  suffix,
  style,
  numberOfLines,
}: AmountTextProps) {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();

  const resolvedTone = tone === 'auto' ? (value < 0 ? 'expense' : 'income') : tone;
  const color =
    resolvedTone === 'income'
      ? tokens.colors.income
      : resolvedTone === 'expense'
        ? tokens.colors.expense
        : resolvedTone === 'muted'
          ? tokens.colors.textMuted
          : tokens.colors.text;

  return (
    <Text
      style={[type[role], tabularNums, { color }, style]}
      numberOfLines={numberOfLines}
    >
      {formatCurrency(value)}
      {suffix ? (
        <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted }]}>
          {suffix}
        </Text>
      ) : null}
    </Text>
  );
}
