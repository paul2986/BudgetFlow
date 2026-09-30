import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { Expense, Person } from '../types/budget';
import { calculateMonthlyAmount } from '../utils/calculations';
import Icon from './Icon';
import { AmountText, Chip, ChoicePills, EmptyState, ListRow } from './ui';
import { type, space, radius } from '../styles/tokens';

interface DebtRepaymentSectionProps {
  expenses: Expense[];
  people: Person[];
}

export default function DebtRepaymentSection({ expenses, people = [] }: DebtRepaymentSectionProps) {
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const debtExpenses = useMemo(() => {
    return (expenses || []).filter((e) => !!e.debtRepayment);
  }, [expenses]);

  const filteredDebtExpenses = useMemo(() => {
    const filtered = debtExpenses.filter((e) => {
      if (selectedFilter === 'all') return true;
      if (selectedFilter === 'household') return e.category === 'household';
      return e.category === 'personal' && e.personId === selectedFilter;
    });

    // Sort highest to lowest monthly amount
    return [...filtered].sort((a, b) => {
      const amountA = calculateMonthlyAmount(a.amount, a.frequency);
      const amountB = calculateMonthlyAmount(b.amount, b.frequency);
      return amountB - amountA;
    });
  }, [debtExpenses, selectedFilter]);

  const { totalMonthlyDebt, loanTotal, mortgageTotal, creditCardTotal } = useMemo(() => {
    let total = 0;
    let loan = 0;
    let mortgage = 0;
    let card = 0;

    filteredDebtExpenses.forEach((e) => {
      const monthly = calculateMonthlyAmount(e.amount, e.frequency);
      total += monthly;
      if (e.debtRepayment === 'loan') loan += monthly;
      else if (e.debtRepayment === 'mortgage') mortgage += monthly;
      else if (e.debtRepayment === 'credit_card') card += monthly;
    });

    return {
      totalMonthlyDebt: total,
      loanTotal: loan,
      mortgageTotal: mortgage,
      creditCardTotal: card,
    };
  }, [filteredDebtExpenses]);

  const DEBT_META: Record<string, { label: string; icon: string; color: string; subtle: string }> = {
    mortgage: { label: 'Mortgage', icon: 'business-outline', color: tokens.colors.mortgage, subtle: tokens.colors.mortgageSubtle },
    loan: { label: 'Loan', icon: 'cash-outline', color: tokens.colors.loan, subtle: tokens.colors.loanSubtle },
    credit_card: { label: 'Credit card', icon: 'card-outline', color: tokens.colors.creditCard, subtle: tokens.colors.creditCardSubtle },
  };
  const meta = (type?: string) =>
    DEBT_META[type || ''] || { label: 'Debt', icon: 'trending-down-outline', color: tokens.colors.brand, subtle: tokens.colors.brandSubtle };

  if (debtExpenses.length === 0) {
    return (
      <EmptyState
        icon="cash-outline"
        title="No debt repayments"
        caption="Tag an expense as a loan, mortgage or credit card to track it here."
      />
    );
  }

  const selectedLabel =
    selectedFilter === 'all'
      ? 'All debt repayments'
      : selectedFilter === 'household'
        ? 'Household debt repayments'
        : `${people.find((p) => p.id === selectedFilter)?.name || 'Personal'}'s debt repayments`;

  const breakdown = [
    { key: 'mortgage', total: mortgageTotal },
    { key: 'loan', total: loanTotal },
    { key: 'credit_card', total: creditCardTotal },
  ].filter((b) => b.total > 0);

  return (
    <View style={{ padding: space.s4 }}>
      <ChoicePills
        label="Show"
        showLabel={false}
        value={selectedFilter}
        onChange={setSelectedFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'household', label: 'Household', icon: 'home-outline' },
          ...people.map((p) => ({ value: p.id, label: p.name, icon: 'person-outline' })),
        ]}
        style={{ marginBottom: space.s4 }}
      />

      <Text style={[type.caption, { color: tokens.colors.textMuted }]}>{selectedLabel}</Text>
      <AmountText value={totalMonthlyDebt} role="h1" suffix="/mo" style={{ marginTop: space.s1 }} />

      {breakdown.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, marginTop: space.s3 }}>
          {breakdown.map((b) => {
            const m = meta(b.key);
            return (
              <Chip
                key={b.key}
                icon={m.icon}
                label={`${m.label} ${formatCurrency(b.total)}`}
                color={m.color}
                backgroundColor={m.subtle}
              />
            );
          })}
        </View>
      ) : null}

      <View style={{ marginTop: space.s4, marginHorizontal: -space.s4 }}>
        {filteredDebtExpenses.length === 0 ? (
          <Text style={[type.caption, { color: tokens.colors.textMuted, textAlign: 'center', padding: space.s5 }]}>
            No debt repayments for this selection.
          </Text>
        ) : (
          filteredDebtExpenses.map((expense, idx) => {
            const m = meta(expense.debtRepayment);
            return (
              <ListRow
                key={expense.id}
                title={expense.description}
                caption={
                  (expense.categoryTag || 'Misc').toLowerCase() === m.label.toLowerCase()
                    ? m.label
                    : `${m.label} · ${expense.categoryTag || 'Misc'}`
                }
                leading={
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.full,
                      backgroundColor: m.subtle,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={m.icon as any} size={18} color={m.color} />
                  </View>
                }
                trailing={
                  <AmountText value={calculateMonthlyAmount(expense.amount, expense.frequency)} role="bodyMed" suffix="/mo" />
                }
                onPress={() => router.push({ pathname: '/add-expense', params: { id: expense.id } })}
                accessibilityLabel={`Edit ${expense.description}`}
                chevron
                showSeparator={idx < filteredDebtExpenses.length - 1}
                style={{ minHeight: 56 } as any}
              />
            );
          })
        )}
      </View>
    </View>
  );
}
