
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { Person } from '../types/budget';
import { calculatePersonIncome, calculatePersonalExpenses, calculateHouseholdShare, calculateMonthlyAmount } from '../utils/calculations';

interface PersonBreakdownChartProps {
  income: number;
  personalExpenses: number;
  householdShare: number;
  remaining: number;
  people?: Person[];
  expenses?: any[];
  householdSettings?: { distributionMethod: 'even' | 'income-based' };
  showMonthlyBreakdown?: boolean;
  showIndividualBreakdowns?: boolean;
}

export default function PersonBreakdownChart({ 
  income, 
  personalExpenses, 
  householdShare, 
  remaining,
  people = [],
  expenses = [],
  householdSettings = { distributionMethod: 'even' },
  showMonthlyBreakdown = false,
  showIndividualBreakdowns = false
}: PersonBreakdownChartProps) {
  const { currentColors } = useTheme();
  const { formatCurrency } = useCurrency();

  // Handle edge case where income is 0
  if (income <= 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.chartContainer, { backgroundColor: currentColors.border }]}>
          <View style={[styles.chartSegment, { backgroundColor: currentColors.error, width: '100%' }]} />
        </View>
        <View style={styles.labelsContainer}>
          <Text style={[styles.percentageLabel, { color: currentColors.error }]}>
            No Income
          </Text>
        </View>
        <View style={[styles.overBudgetIndicator, { backgroundColor: currentColors.error + '20', borderColor: currentColors.error }]}>
          <Text style={[styles.overBudgetText, { color: currentColors.error }]}>
            ⚠️ No income sources defined
          </Text>
        </View>
      </View>
    );
  }

  // Calculate percentages for the visual representation
  const totalExpenses = personalExpenses + householdShare;
  const personalPercentage = (personalExpenses / income) * 100;
  const householdPercentage = (householdShare / income) * 100;
  const remainingPercentage = Math.max(0, (remaining / income) * 100);
  const overBudgetPercentage = remaining < 0 ? Math.abs((remaining / income) * 100) : 0;

  // Ensure percentages don't exceed 100% for display purposes
  const displayPersonalPercentage = Math.min(personalPercentage, 100);
  const displayHouseholdPercentage = Math.min(householdPercentage, 100 - displayPersonalPercentage);
  const displayRemainingPercentage = Math.max(0, 100 - displayPersonalPercentage - displayHouseholdPercentage);

  console.log('PersonBreakdownChart:', {
    income,
    personalExpenses,
    householdShare,
    remaining,
    personalPercentage,
    householdPercentage,
    remainingPercentage,
    overBudgetPercentage
  });

  // Calculate monthly amounts for breakdown
  const monthlyIncome = calculateMonthlyAmount(income, 'yearly');
  const monthlyPersonalExpenses = calculateMonthlyAmount(personalExpenses, 'yearly');
  const monthlyHouseholdShare = calculateMonthlyAmount(householdShare, 'yearly');
  const monthlyRemaining = calculateMonthlyAmount(remaining, 'yearly');

  return (
    <View style={styles.container}>
      {/* Horizontal Bar Chart */}
      <View 
        style={[styles.chartContainer, { backgroundColor: currentColors.border }]}
        accessibilityLabel={`Budget breakdown: ${personalPercentage.toFixed(0)}% personal expenses, ${householdPercentage.toFixed(0)}% household share, ${Math.abs(remainingPercentage).toFixed(0)}% ${remaining >= 0 ? 'remaining' : 'over budget'}`}
        accessibilityRole="progressbar"
      >
        {/* Personal Expenses Bar */}
        {displayPersonalPercentage > 0 && (
          <View 
            style={[
              styles.chartSegment,
              {
                backgroundColor: currentColors.personal,
                width: `${displayPersonalPercentage}%`,
              }
            ]}
            accessibilityLabel={`Personal expenses: ${personalPercentage.toFixed(0)}%`}
          />
        )}
        
        {/* Household Share Bar */}
        {displayHouseholdPercentage > 0 && (
          <View 
            style={[
              styles.chartSegment,
              {
                backgroundColor: currentColors.household,
                width: `${displayHouseholdPercentage}%`,
              }
            ]}
            accessibilityLabel={`Household share: ${householdPercentage.toFixed(0)}%`}
          />
        )}
        
        {/* Remaining Income Bar */}
        {displayRemainingPercentage > 0 && (
          <View 
            style={[
              styles.chartSegment,
              {
                backgroundColor: remaining >= 0 ? currentColors.success : currentColors.error,
                width: `${displayRemainingPercentage}%`,
              }
            ]}
            accessibilityLabel={`${remaining >= 0 ? 'Remaining income' : 'Over budget'}: ${Math.abs(remainingPercentage).toFixed(0)}%`}
          />
        )}
      </View>

      {/* Percentage Labels */}
      <View style={styles.labelsContainer}>
        {personalPercentage > 3 && (
          <Text style={[styles.percentageLabel, { color: currentColors.personal }]}>
            Personal {personalPercentage.toFixed(0)}%
          </Text>
        )}
        {householdPercentage > 3 && (
          <Text style={[styles.percentageLabel, { color: currentColors.household }]}>
            Household {householdPercentage.toFixed(0)}%
          </Text>
        )}
        {remainingPercentage > 3 && (
          <Text style={[styles.percentageLabel, { color: remaining >= 0 ? currentColors.success : currentColors.error }]}>
            {remaining >= 0 ? 'Remaining' : 'Over'} {Math.abs(remainingPercentage).toFixed(0)}%
          </Text>
        )}
      </View>

      {/* Monthly Breakdown */}
      {showMonthlyBreakdown && (
        <View style={[styles.monthlyBreakdown, { backgroundColor: currentColors.backgroundAlt, borderColor: currentColors.border }]}>
          <Text style={[styles.breakdownTitle, { color: currentColors.text }]}>Monthly Breakdown</Text>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: currentColors.textSecondary }]}>Income:</Text>
            <Text style={[styles.breakdownValue, { color: currentColors.success }]}>
              {formatCurrency(monthlyIncome)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: currentColors.textSecondary }]}>Personal Expenses:</Text>
            <Text style={[styles.breakdownValue, { color: currentColors.personal }]}>
              {formatCurrency(monthlyPersonalExpenses)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, { color: currentColors.textSecondary }]}>Household Share:</Text>
            <Text style={[styles.breakdownValue, { color: currentColors.household }]}>
              {formatCurrency(monthlyHouseholdShare)}
            </Text>
          </View>
          <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: currentColors.border, paddingTop: 8, marginTop: 8 }]}>
            <Text style={[styles.breakdownLabel, { color: currentColors.text, fontWeight: '600' }]}>Remaining:</Text>
            <Text style={[styles.breakdownValue, { 
              color: monthlyRemaining >= 0 ? currentColors.success : currentColors.error,
              fontWeight: '600'
            }]}>
              {formatCurrency(monthlyRemaining)}
            </Text>
          </View>
        </View>
      )}

      {/* Individual Breakdowns */}
      {showIndividualBreakdowns && people.length > 0 && (
        <View style={[styles.individualBreakdowns, { backgroundColor: currentColors.backgroundAlt, borderColor: currentColors.border }]}>
          <Text style={[styles.breakdownTitle, { color: currentColors.text }]}>Individual Breakdowns</Text>
          {people.map((person) => {
            const personIncome = calculatePersonIncome(person);
            const personPersonalExpenses = calculatePersonalExpenses(expenses, person.id);
            const personHouseholdShare = calculateHouseholdShare(
              householdShare,
              people,
              householdSettings.distributionMethod,
              person.id
            );
            const personRemaining = personIncome - personPersonalExpenses - personHouseholdShare;
            
            const monthlyPersonIncome = calculateMonthlyAmount(personIncome, 'yearly');
            const monthlyPersonPersonalExpenses = calculateMonthlyAmount(personPersonalExpenses, 'yearly');
            const monthlyPersonHouseholdShare = calculateMonthlyAmount(personHouseholdShare, 'yearly');
            const monthlyPersonRemaining = calculateMonthlyAmount(personRemaining, 'yearly');

            return (
              <View key={person.id} style={[styles.personBreakdown, { borderColor: currentColors.border }]}>
                <Text style={[styles.personName, { color: currentColors.text }]}>{person.name}</Text>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: currentColors.textSecondary }]}>Monthly Income:</Text>
                  <Text style={[styles.breakdownValue, { color: currentColors.success }]}>
                    {formatCurrency(monthlyPersonIncome)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: currentColors.textSecondary }]}>Personal Expenses:</Text>
                  <Text style={[styles.breakdownValue, { color: currentColors.personal }]}>
                    {formatCurrency(monthlyPersonPersonalExpenses)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: currentColors.textSecondary }]}>Household Share:</Text>
                  <Text style={[styles.breakdownValue, { color: currentColors.household }]}>
                    {formatCurrency(monthlyPersonHouseholdShare)}
                  </Text>
                </View>
                <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: currentColors.border, paddingTop: 4, marginTop: 4 }]}>
                  <Text style={[styles.breakdownLabel, { color: currentColors.text, fontWeight: '600', fontSize: 12 }]}>Remaining:</Text>
                  <Text style={[styles.breakdownValue, { 
                    color: monthlyPersonRemaining >= 0 ? currentColors.success : currentColors.error,
                    fontWeight: '600',
                    fontSize: 12
                  }]}>
                    {formatCurrency(monthlyPersonRemaining)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Over Budget Indicator */}
      {remaining < 0 && (
        <View style={[styles.overBudgetIndicator, { backgroundColor: currentColors.error + '20', borderColor: currentColors.error }]}>
          <Text style={[styles.overBudgetText, { color: currentColors.error }]}>
            ⚠️ Over budget by {formatCurrency(Math.abs(remaining))}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  chartContainer: {
    height: 28,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  chartSegment: {
    height: '100%',
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 4,
  },
  percentageLabel: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  overBudgetIndicator: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    alignItems: 'center',
  },
  overBudgetText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  monthlyBreakdown: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  individualBreakdowns: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  breakdownLabel: {
    fontSize: 14,
    flex: 1,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  personBreakdown: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  personName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
});
