import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useCurrency } from '../hooks/useCurrency';
import { Expense, Person } from '../types/budget';
import { calculateMonthlyAmount } from '../utils/calculations';
import Icon from './Icon';

interface DebtRepaymentSectionProps {
  expenses: Expense[];
  people: Person[];
}

export default function DebtRepaymentSection({ expenses, people = [] }: DebtRepaymentSectionProps) {
  const { currentColors } = useTheme();
  const { formatCurrency } = useCurrency();
  const { themedStyles } = useThemedStyles();
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

  const getDebtIcon = (type: string) => {
    switch (type) {
      case 'mortgage': return 'home-outline';
      case 'credit_card': return 'card-outline';
      case 'loan': return 'cash-outline';
      default: return 'trending-down-outline';
    }
  };

  const getDebtLabel = (type: string) => {
    switch (type) {
      case 'mortgage': return 'Mortgage';
      case 'credit_card': return 'Credit Card';
      case 'loan': return 'Loan';
      default: return 'Debt';
    }
  };

  const getDebtColor = (type: string) => {
    switch (type) {
      case 'mortgage': return '#FF9500'; // Orange
      case 'credit_card': return '#5856D6'; // Indigo/Purple
      case 'loan': return '#34C759'; // Green
      default: return currentColors.primary;
    }
  };

  if (debtExpenses.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <Icon name="cash-outline" size={40} style={{ color: currentColors.textSecondary, marginBottom: 12, opacity: 0.5 }} />
        <Text style={[themedStyles.textSecondary, { textAlign: 'center', fontSize: 13, lineHeight: 18 }]}>
          No expenses tagged as debt repayments yet. Edit or add an expense to tag it.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 16 }}>
      {/* Filter Selector */}
      <View style={{ marginBottom: 16 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          <TouchableOpacity
            onPress={() => setSelectedFilter('all')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: selectedFilter === 'all' ? currentColors.primary : currentColors.backgroundAlt,
              borderWidth: 1,
              borderColor: selectedFilter === 'all' ? currentColors.primary : currentColors.border,
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: '600',
              color: selectedFilter === 'all' ? '#FFFFFF' : currentColors.textSecondary
            }}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSelectedFilter('household')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: selectedFilter === 'household' ? currentColors.primary : currentColors.backgroundAlt,
              borderWidth: 1,
              borderColor: selectedFilter === 'household' ? currentColors.primary : currentColors.border,
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: '600',
              color: selectedFilter === 'household' ? '#FFFFFF' : currentColors.textSecondary
            }}>
              Household
            </Text>
          </TouchableOpacity>
          {people.map(person => (
            <TouchableOpacity
              key={person.id}
              onPress={() => setSelectedFilter(person.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: selectedFilter === person.id ? currentColors.primary : currentColors.backgroundAlt,
                borderWidth: 1,
                borderColor: selectedFilter === person.id ? currentColors.primary : currentColors.border,
              }}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: '600',
                color: selectedFilter === person.id ? '#FFFFFF' : currentColors.textSecondary
              }}>
                {person.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Summary Box */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: currentColors.backgroundAlt,
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: currentColors.border
      }}>
        <View>
          <Text style={[themedStyles.textSecondary, { fontSize: 13, fontWeight: '600', marginBottom: 2 }]}>
            {selectedFilter === 'all'
              ? 'Total Debt Repayments'
              : selectedFilter === 'household'
                ? 'Household Debt Repayments'
                : `${people.find(p => p.id === selectedFilter)?.name || 'Personal'}'s Debt Repayments`
            }
          </Text>
          <Text style={[themedStyles.text, { fontSize: 20, fontWeight: '800', color: currentColors.text }]}>
            {formatCurrency(totalMonthlyDebt)}
            <Text style={{ fontSize: 12, fontWeight: '500', color: currentColors.textSecondary }}>/month</Text>
          </Text>
        </View>
        <Icon name="trending-down-outline" size={26} style={{ color: currentColors.primary }} />
      </View>

      {/* Mini Breakdowns */}
      {(mortgageTotal > 0 || loanTotal > 0 || creditCardTotal > 0) ? (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {mortgageTotal > 0 && (
            <View style={{ flex: 1, backgroundColor: '#FF9500' + '10', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FF9500' + '35' }}>
              <Text style={{ fontSize: 9, color: '#FF9500', fontWeight: '700', textTransform: 'uppercase' }}>Mortgage</Text>
              <Text style={[themedStyles.text, { fontSize: 13, fontWeight: '700', marginTop: 2 }]}>{formatCurrency(mortgageTotal)}</Text>
            </View>
          )}
          {loanTotal > 0 && (
            <View style={{ flex: 1, backgroundColor: '#34C759' + '10', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#34C759' + '35' }}>
              <Text style={{ fontSize: 9, color: '#34C759', fontWeight: '700', textTransform: 'uppercase' }}>Loans</Text>
              <Text style={[themedStyles.text, { fontSize: 13, fontWeight: '700', marginTop: 2 }]}>{formatCurrency(loanTotal)}</Text>
            </View>
          )}
          {creditCardTotal > 0 && (
            <View style={{ flex: 1, backgroundColor: '#5856D6' + '10', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#5856D6' + '35' }}>
              <Text style={{ fontSize: 9, color: '#5856D6', fontWeight: '700', textTransform: 'uppercase' }}>Cards</Text>
              <Text style={[themedStyles.text, { fontSize: 13, fontWeight: '700', marginTop: 2 }]}>{formatCurrency(creditCardTotal)}</Text>
            </View>
          )}
        </View>
      ) : null}

      {/* List of Debt Expenses */}
      {filteredDebtExpenses.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
          <Icon name="checkmark-circle-outline" size={32} style={{ color: currentColors.success, marginBottom: 8, opacity: 0.8 }} />
          <Text style={[themedStyles.textSecondary, { textAlign: 'center', fontSize: 13 }]}>
            No debt repayments found for this selection.
          </Text>
        </View>
      ) : (
        filteredDebtExpenses.map((expense, idx) => {
          const monthlyAmount = calculateMonthlyAmount(expense.amount, expense.frequency);
          const debtColor = getDebtColor(expense.debtRepayment || '');
          return (
            <View
              key={expense.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: idx === filteredDebtExpenses.length - 1 ? 0 : 1,
                borderBottomColor: currentColors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: debtColor + '15',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10
                }}>
                  <Icon name={getDebtIcon(expense.debtRepayment || '')} size={16} style={{ color: debtColor }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 13 }]} numberOfLines={1}>
                    {expense.description}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Text style={{ fontSize: 10, color: debtColor, fontWeight: '700', textTransform: 'uppercase' }}>
                      {getDebtLabel(expense.debtRepayment || '')}
                    </Text>
                    <Text style={{ fontSize: 10, color: currentColors.textSecondary }}>•</Text>
                    <Text style={[themedStyles.textSecondary, { fontSize: 10 }]} numberOfLines={1}>
                      {expense.categoryTag || 'Misc'}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[themedStyles.text, { fontWeight: '700', fontSize: 13 }]}>
                {formatCurrency(monthlyAmount)}
                <Text style={{ fontSize: 10, color: currentColors.textSecondary, fontWeight: 'normal' }}>/mo</Text>
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}
