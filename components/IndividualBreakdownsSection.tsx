
import React from 'react';
import { View, Text, Dimensions, Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { useThemedStyles } from '../hooks/useThemedStyles';

// Helper function to detect iPad
const isIPad = () => {
  const { width, height } = Dimensions.get('window');
  const aspectRatio = height / width;

  // iPad detection: larger screen + typical iPad aspect ratios
  return Platform.OS === 'ios' && Math.min(width, height) >= 768 && (
    (aspectRatio > 1.2 && aspectRatio < 1.4) || // Portrait iPad
    (aspectRatio > 0.7 && aspectRatio < 0.85)   // Landscape iPad
  );
};
import {
  calculatePersonIncome,
  calculatePersonalExpenses,
  calculateHouseholdShare,
  calculateMonthlyAmount,
  calculateAnnualAmount
} from '../utils/calculations';
import Icon from './Icon';
import { Person, Expense, HouseholdSettings } from '../types/budget';

interface IndividualBreakdownsSectionProps {
  people: Person[];
  expenses: Expense[];
  householdSettings?: HouseholdSettings;
  totalHouseholdExpenses: number;
  viewMode?: 'daily' | 'monthly' | 'yearly';
}

export default function IndividualBreakdownsSection({
  people,
  expenses,
  householdSettings,
  totalHouseholdExpenses,
  viewMode = 'monthly'
}: IndividualBreakdownsSectionProps) {
  const { currentColors, isDarkMode } = useTheme();
  const { formatCurrency } = useCurrency();
  const { themedStyles } = useThemedStyles();
  const isPad = isIPad();

  // Helper function to convert amounts based on view mode
  const convertAmount = (amount: number): number => {
    if (viewMode === 'daily') {
      return calculateMonthlyAmount(amount, 'yearly') / 30.44; // Average days per month
    } else if (viewMode === 'monthly') {
      return calculateMonthlyAmount(amount, 'yearly');
    }
    return amount; // yearly
  };

  if (!people || people.length === 0) {
    return (
      <View style={[
        themedStyles.card,
        {
          marginBottom: 0,
        }
      ]}>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Icon name="person-add-outline" size={48} style={{ color: currentColors.textSecondary, marginBottom: 12 }} />
          <Text style={[themedStyles.textSecondary, { textAlign: 'center' }]}>
            No people added yet. Add people to see individual breakdowns.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={isPad ? { flexDirection: 'row', flexWrap: 'wrap', gap: 20 } : { gap: 16 }}>
      {people.map((person) => {
        const personIncome = calculatePersonIncome(person);
        const personPersonalExpenses = calculatePersonalExpenses(expenses, person.id);
        const personHouseholdShare = calculateHouseholdShare(
          totalHouseholdExpenses,
          people,
          householdSettings?.distributionMethod || 'even',
          person.id
        );
        const personRemaining = personIncome - personPersonalExpenses - personHouseholdShare;

        // Convert amounts based on view mode
        const displayPersonIncome = convertAmount(personIncome);
        const displayPersonPersonalExpenses = convertAmount(personPersonalExpenses);
        const displayPersonHouseholdShare = convertAmount(personHouseholdShare);
        const displayPersonRemaining = convertAmount(personRemaining);

        // Calculate percentages for the progress bar
        const personalPercentage = displayPersonIncome > 0 ? (displayPersonPersonalExpenses / displayPersonIncome) * 100 : 0;
        const householdPercentage = displayPersonIncome > 0 ? (displayPersonHouseholdShare / displayPersonIncome) * 100 : 0;
        const remainingPercentage = displayPersonIncome > 0 ? Math.max(0, (displayPersonRemaining / displayPersonIncome) * 100) : 0;

        // Ensure percentages don't exceed 100% for display
        const displayPersonalPercentage = Math.min(personalPercentage, 100);
        const displayHouseholdPercentage = Math.min(householdPercentage, 100 - displayPersonalPercentage);
        const displayRemainingPercentage = Math.max(0, 100 - displayPersonalPercentage - displayHouseholdPercentage);

        return (
          <View
            key={person.id}
            style={[
              themedStyles.card,
              {
                backgroundColor: isDarkMode ? currentColors.backgroundAlt : '#FFFFFF',
                borderColor: isDarkMode ? currentColors.border : currentColors.border,
                borderWidth: 1,
                marginBottom: 0,
                width: isPad ? 'calc(50% - 10px)' as any : '100%',
                overflow: 'hidden',
                padding: 20,
              }
            ]}
          >
            {isDarkMode && (
              <LinearGradient
                colors={[currentColors.primary + '10', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={{ position: 'relative', zIndex: 1 }}>
              {/* Person Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <View style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: isDarkMode ? currentColors.primary + '20' : currentColors.primary + '10',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                  borderWidth: 1,
                  borderColor: currentColors.primary + '30',
                }}>
                  <Icon name="person" size={22} style={{ color: currentColors.primary }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[themedStyles.text, { fontSize: 18, fontWeight: '800', color: currentColors.text }]}>
                    {person.name}
                  </Text>
                  <Text style={[themedStyles.textSecondary, { fontSize: 13, fontWeight: '500' }]}>
                    {viewMode === 'yearly' ? 'Yearly' : viewMode === 'daily' ? 'Daily' : 'Monthly'} breakdown
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[
                    themedStyles.text,
                    {
                      fontSize: 18,
                      fontWeight: '800',
                      color: displayPersonRemaining >= 0 ? currentColors.success : currentColors.error
                    }
                  ]}>
                    {formatCurrency(displayPersonRemaining)}
                  </Text>
                  <Text style={[themedStyles.textSecondary, { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                    remaining
                  </Text>
                </View>
              </View>

              {/* Income */}
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="trending-up" size={14} style={{ color: currentColors.success, marginRight: 8 }} />
                    <Text style={[themedStyles.text, { fontSize: 15, fontWeight: '600' }]}>Income</Text>
                  </View>
                  <Text style={[
                    themedStyles.text,
                    {
                      fontSize: 15,
                      fontWeight: '700',
                      color: currentColors.success
                    }
                  ]}>
                    {formatCurrency(displayPersonIncome)}
                  </Text>
                </View>

                {/* Individual Income Sources */}
                {person.income && person.income.length > 0 && (
                  <View style={{ marginLeft: 22, marginTop: 6, gap: 4 }}>
                    {person.income.map((income) => {
                      const annualAmount = calculateAnnualAmount(income.amount, income.frequency);
                      const displayAmount = convertAmount(annualAmount);

                      return (
                        <View key={income.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={[themedStyles.textSecondary, { fontSize: 13, fontWeight: '500' }]}>{income.label}</Text>
                          <Text style={[themedStyles.textSecondary, { fontSize: 13, fontWeight: '600' }]}>
                            {formatCurrency(displayAmount)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Personal Expenses */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="person" size={14} style={{ color: currentColors.personal, marginRight: 8 }} />
                  <Text style={[themedStyles.text, { fontSize: 15, fontWeight: '600' }]}>Personal Expenses</Text>
                </View>
                <Text style={[
                  themedStyles.text,
                  {
                    fontSize: 15,
                    fontWeight: '700',
                    color: currentColors.personal
                  }
                ]}>
                  {formatCurrency(displayPersonPersonalExpenses)}
                </Text>
              </View>

              {/* Household Share */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="home" size={14} style={{ color: currentColors.household, marginRight: 8 }} />
                  <Text style={[themedStyles.text, { fontSize: 15, fontWeight: '600' }]}>Household Share</Text>
                </View>
                <Text style={[
                  themedStyles.text,
                  {
                    fontSize: 15,
                    fontWeight: '700',
                    color: currentColors.household
                  }
                ]}>
                  {formatCurrency(displayPersonHouseholdShare)}
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={{ marginBottom: 12 }}>
                <View style={{
                  height: 10,
                  backgroundColor: isDarkMode ? currentColors.background : currentColors.border + '50',
                  borderRadius: 5,
                  overflow: 'hidden',
                  flexDirection: 'row',
                  borderWidth: 1,
                  borderColor: isDarkMode ? currentColors.border : 'transparent',
                }}>
                  {displayPersonIncome > 0 && (
                    <>
                      {/* Personal Expenses Bar */}
                      {displayPersonalPercentage > 0 && (
                        <View style={{
                          backgroundColor: currentColors.personal,
                          width: `${displayPersonalPercentage}%`,
                        }} />
                      )}
                      {/* Household Share Bar */}
                      {displayHouseholdPercentage > 0 && (
                        <View style={{
                          backgroundColor: currentColors.household,
                          width: `${displayHouseholdPercentage}%`,
                        }} />
                      )}
                      {/* Remaining Income Bar - Green */}
                      {displayRemainingPercentage > 0 && displayPersonRemaining >= 0 && (
                        <View style={{
                          backgroundColor: currentColors.success,
                          width: `${displayRemainingPercentage}%`,
                        }} />
                      )}
                      {/* Over Budget Bar - Red */}
                      {displayPersonRemaining < 0 && (
                        <View style={{
                          backgroundColor: currentColors.error,
                          width: `${Math.min(Math.abs((displayPersonRemaining / displayPersonIncome) * 100), 100 - displayPersonalPercentage - displayHouseholdPercentage)}%`,
                        }} />
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* Percentage Labels */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: currentColors.personal, marginRight: 6 }} />
                  <Text style={[themedStyles.textSecondary, { fontSize: 12, fontWeight: '600' }]}>
                    {displayPersonIncome > 0
                      ? `${personalPercentage.toFixed(0)}% personal`
                      : '0% personal'
                    }
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: currentColors.household, marginRight: 6 }} />
                  <Text style={[themedStyles.textSecondary, { fontSize: 12, fontWeight: '600' }]}>
                    {displayPersonIncome > 0
                      ? `${householdPercentage.toFixed(0)}% household`
                      : '0% household'
                    }
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: displayPersonRemaining >= 0 ? currentColors.success : currentColors.error, marginRight: 6 }} />
                  <Text style={[themedStyles.textSecondary, { fontSize: 12, fontWeight: '700', color: displayPersonRemaining >= 0 ? currentColors.success : currentColors.error }]}>
                    {displayPersonIncome > 0
                      ? `${remainingPercentage.toFixed(0)}% ${displayPersonRemaining >= 0 ? 'left' : 'over'}`
                      : '0% left'
                    }
                  </Text>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
