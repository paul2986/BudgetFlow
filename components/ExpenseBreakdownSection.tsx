
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { calculateMonthlyAmount } from '../utils/calculations';
import Icon from './Icon';
import { Expense, DEFAULT_CATEGORIES, Person } from '../types/budget';
import { router } from 'expo-router';

interface ExpenseBreakdownSectionProps {
  expenses: Expense[];
  people?: Person[];
  viewMode?: 'daily' | 'monthly' | 'yearly';
}

interface CategoryBreakdown {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

interface TypeBreakdown {
  type: 'household' | 'personal';
  amount: number;
  count: number;
  percentage: number;
  categories: CategoryBreakdown[];
}

export default function ExpenseBreakdownSection({ 
  expenses, 
  people = [], 
  viewMode = 'monthly' 
}: ExpenseBreakdownSectionProps) {
  const { currentColors } = useTheme();
  const { formatCurrency } = useCurrency();
  const { themedStyles } = useThemedStyles();
  
  // State for personal expenses person filter
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  
  // State for collapsible sections - default to closed
  const [householdExpanded, setHouseholdExpanded] = useState(false);
  const [personalExpanded, setPersonalExpanded] = useState(false);

  // Reset selectedPersonId when expenses change (e.g., budget switch)
  useEffect(() => {
    console.log('ExpenseBreakdownSection: Expenses changed, resetting selectedPersonId');
    setSelectedPersonId(null);
  }, [expenses]);

  console.log('ExpenseBreakdownSection: Component rendered with expenses:', {
    expensesLength: expenses?.length || 0,
    peopleLength: people?.length || 0,
    selectedPersonId,
    viewMode
  });

  // Helper function to convert amounts based on view mode
  const convertAmount = (amount: number): number => {
    if (viewMode === 'daily') {
      return calculateMonthlyAmount(amount, 'yearly') / 30.44; // Average days per month
    } else if (viewMode === 'monthly') {
      return calculateMonthlyAmount(amount, 'yearly');
    }
    return amount; // yearly
  };

  // Calculate breakdown data
  const breakdownData = useMemo(() => {
    console.log('ExpenseBreakdownSection: Processing expenses for breakdown:', {
      expensesLength: expenses?.length || 0,
      selectedPersonId,
      viewMode
    });

    if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
      console.log('ExpenseBreakdownSection: No expenses found');
      return { household: null, personal: null, totalAmount: 0 };
    }

    const activeExpenses = expenses.filter(expense => {
      if (!expense) return false;
      return true;
    });

    console.log('ExpenseBreakdownSection: Active expenses count:', activeExpenses.length);

    const totalAmount = activeExpenses.reduce((sum, expense) => {
      return sum + convertAmount(calculateMonthlyAmount(expense.amount, expense.frequency) * 12); // Convert to annual first, then to view mode
    }, 0);

    console.log('ExpenseBreakdownSection: Total amount calculated:', totalAmount);

    if (totalAmount === 0) {
      console.log('ExpenseBreakdownSection: Total amount is 0');
      return { household: null, personal: null, totalAmount: 0 };
    }

    const groupByType = (type: 'household' | 'personal'): TypeBreakdown | null => {
      let typeExpenses = activeExpenses.filter(expense => expense && expense.category === type);
      
      console.log(`ExpenseBreakdownSection: ${type} expenses before person filter:`, {
        count: typeExpenses.length,
        selectedPersonId
      });
      
      // For personal expenses, apply person filter only if a specific person is selected
      if (type === 'personal' && selectedPersonId) {
        const beforeFilterCount = typeExpenses.length;
        typeExpenses = typeExpenses.filter(expense => expense.personId === selectedPersonId);
        console.log(`ExpenseBreakdownSection: ${type} expenses after person filter:`, {
          beforeFilterCount,
          afterFilterCount: typeExpenses.length,
          selectedPersonId
        });
      }

      if (typeExpenses.length === 0) {
        console.log(`ExpenseBreakdownSection: No ${type} expenses found after filtering, returning null`);
        return null;
      }

      const typeAmount = typeExpenses.reduce((sum, expense) => {
        return sum + convertAmount(calculateMonthlyAmount(expense.amount, expense.frequency) * 12); // Convert to annual first, then to view mode
      }, 0);

      // Group by category tag
      const categoryMap = new Map<string, { amount: number; count: number }>();
      
      typeExpenses.forEach(expense => {
        const category = expense.categoryTag || 'Misc';
        const convertedAmount = convertAmount(calculateMonthlyAmount(expense.amount, expense.frequency) * 12); // Convert to annual first, then to view mode
        
        if (categoryMap.has(category)) {
          const existing = categoryMap.get(category)!;
          categoryMap.set(category, {
            amount: existing.amount + convertedAmount,
            count: existing.count + 1,
          });
        } else {
          categoryMap.set(category, {
            amount: convertedAmount,
            count: 1,
          });
        }
      });

      const categories: CategoryBreakdown[] = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          amount: data.amount,
          count: data.count,
          percentage: typeAmount > 0 ? (data.amount / typeAmount) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      console.log(`ExpenseBreakdownSection: ${type} breakdown calculated:`, {
        typeAmount,
        categoriesCount: categories.length
      });

      return {
        type,
        amount: typeAmount,
        count: typeExpenses.length,
        percentage: totalAmount > 0 ? (typeAmount / totalAmount) * 100 : 0,
        categories,
      };
    };

    const household = groupByType('household');
    const personal = groupByType('personal');

    console.log('ExpenseBreakdownSection: Final breakdown data:', {
      totalAmount,
      hasHousehold: !!household,
      hasPersonal: !!personal,
      selectedPersonId,
      viewMode
    });

    return {
      household,
      personal,
      totalAmount,
    };
  }, [expenses, selectedPersonId, viewMode, convertAmount]);

  // FIXED: Navigation handler for category taps with proper URL parameter handling
  const handleCategoryPress = (expenseType: 'household' | 'personal', categoryName: string) => {
    console.log('ExpenseBreakdownSection: Navigating to expenses with filters:', {
      expenseType,
      categoryName,
      selectedPersonId
    });
    
    // FIXED: Create a unique timestamp to ensure fresh navigation each time
    const timestamp = Date.now();
    
    // Navigate to expenses page with pre-applied filters
    const params: Record<string, string> = {
      filter: expenseType,
      category: categoryName,
      fromDashboard: 'true',
      _t: timestamp.toString() // Add timestamp to force fresh navigation
    };
    
    // If personal expenses and a specific person is selected, add person filter
    if (expenseType === 'personal' && selectedPersonId) {
      params.personId = selectedPersonId;
    }
    
    console.log('ExpenseBreakdownSection: Navigation params:', params);
    
    // FIXED: Use replace instead of push to avoid navigation stack issues
    router.replace({
      pathname: '/expenses',
      params
    });
  };

  // Get people who have personal expenses
  const peopleWithPersonalExpenses = useMemo(() => {
    if (!people || !expenses) {
      console.log('ExpenseBreakdownSection: No people or expenses for peopleWithPersonalExpenses calculation');
      return [];
    }
    
    const personalExpenses = expenses.filter(e => e && e.category === 'personal' && e.personId);
    const peopleIds = new Set(personalExpenses.map(e => e.personId));
    
    const result = people.filter(person => peopleIds.has(person.id));
    
    console.log('ExpenseBreakdownSection: peopleWithPersonalExpenses calculation:', {
      totalPeople: people.length,
      personalExpenses: personalExpenses.length,
      peopleWithExpensesCount: result.length
    });
    
    return result;
  }, [people, expenses]);

  // Check if switcher should be shown (2 or more people with personal expenses)
  const shouldShowPersonSwitcher = useMemo(() => {
    const shouldShow = peopleWithPersonalExpenses.length >= 2;
    console.log('ExpenseBreakdownSection: shouldShowPersonSwitcher:', {
      peopleWithPersonalExpensesCount: peopleWithPersonalExpenses.length,
      shouldShow
    });
    return shouldShow;
  }, [peopleWithPersonalExpenses]);

  // Person switcher component
  const PersonSwitcher = () => {
    if (!shouldShowPersonSwitcher) {
      console.log('ExpenseBreakdownSection: PersonSwitcher not rendering - less than 2 people with personal expenses');
      return null;
    }

    console.log('ExpenseBreakdownSection: PersonSwitcher rendering');

    return (
      <View style={{
        flexDirection: 'row',
        backgroundColor: currentColors.backgroundAlt,
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: currentColors.border,
      }}>
        {/* All People Option */}
        <TouchableOpacity
          onPress={() => setSelectedPersonId(null)}
          style={{
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            backgroundColor: selectedPersonId === null ? currentColors.personal : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[
            themedStyles.text,
            {
              fontSize: 14,
              fontWeight: '600',
              color: selectedPersonId === null ? '#fff' : currentColors.text,
            }
          ]}>
            All People
          </Text>
        </TouchableOpacity>

        {/* Individual People Options */}
        {peopleWithPersonalExpenses.map((person) => (
          <TouchableOpacity
            key={person.id}
            onPress={() => setSelectedPersonId(person.id)}
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              backgroundColor: selectedPersonId === person.id ? currentColors.personal : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[
              themedStyles.text,
              {
                fontSize: 14,
                fontWeight: '600',
                color: selectedPersonId === person.id ? '#fff' : currentColors.text,
              }
            ]}>
              {person.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  if (!breakdownData.household && !breakdownData.personal) {
    console.log('ExpenseBreakdownSection: Rendering empty state');
    return (
      <View style={[themedStyles.card, { marginBottom: 0 }]}>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Icon name="pie-chart-outline" size={48} style={{ color: currentColors.textSecondary, marginBottom: 12 }} />
          <Text style={[themedStyles.textSecondary, { textAlign: 'center' }]}>
            No expenses to analyze yet. Add some expenses to see the breakdown.
          </Text>
        </View>
      </View>
    );
  }

  console.log('ExpenseBreakdownSection: Rendering breakdown with data');

  // Type breakdown component with collapsible functionality
  const TypeBreakdownComponent = ({ breakdown }: { breakdown: TypeBreakdown }) => {
    const isHousehold = breakdown.type === 'household';
    const typeColor = isHousehold ? currentColors.household : currentColors.personal;
    const typeIcon = isHousehold ? 'home' : 'person';
    const isExpanded = isHousehold ? householdExpanded : personalExpanded;
    const setExpanded = isHousehold ? setHouseholdExpanded : setPersonalExpanded;

    // Get selected person name for personal expenses header
    const selectedPersonName = selectedPersonId && people 
      ? people.find(p => p.id === selectedPersonId)?.name 
      : null;

    return (
      <View
        key={breakdown.type}
        style={[
          themedStyles.card,
          {
            backgroundColor: typeColor + '10',
            borderColor: typeColor + '30',
            borderWidth: 2,
            marginBottom: 16,
          },
        ]}
      >
        {/* Collapsible Type Header */}
        <TouchableOpacity
          onPress={() => setExpanded(!isExpanded)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isExpanded ? 20 : 0 }}
        >
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: typeColor + '20',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
          }}>
            <Icon name={typeIcon} size={24} style={{ color: typeColor }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[themedStyles.subtitle, { fontSize: 17, fontWeight: '700', marginBottom: 4 }]}>
              {isHousehold 
                ? 'Household Expenses' 
                : selectedPersonName 
                  ? `${selectedPersonName}'s Personal Expenses`
                  : 'Personal Expenses'
              }
            </Text>
            <Text style={[themedStyles.textSecondary, { fontSize: 14 }]}>
              {breakdown.count} {breakdown.count === 1 ? 'expense' : 'expenses'} • {breakdown.percentage.toFixed(1)}% of total
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
            <Text style={[
              themedStyles.text,
              { fontSize: 18, fontWeight: '700', color: typeColor }
            ]}>
              {formatCurrency(breakdown.amount)}
            </Text>
            <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
              per {viewMode === 'yearly' ? 'year' : viewMode === 'daily' ? 'day' : 'month'}
            </Text>
          </View>
          <Icon 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            style={{ color: currentColors.textSecondary }} 
          />
        </TouchableOpacity>

        {/* Expandable Content */}
        {isExpanded && (
          <View>
            {/* Person Switcher for Personal Expenses - Only show if 2+ people with personal expenses */}
            {!isHousehold && <PersonSwitcher />}

            {/* Categories - Interactive */}
            <View style={{ gap: 12 }}>
              {breakdown.categories.map((category, categoryIndex) => (
                <TouchableOpacity
                  key={`${breakdown.type}-${category.category}-${categoryIndex}`}
                  onPress={() => handleCategoryPress(breakdown.type, category.category)}
                  activeOpacity={0.7}
                  style={{
                    backgroundColor: currentColors.backgroundAlt,
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: currentColors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Text style={[themedStyles.text, { fontSize: 16, fontWeight: '600', flex: 1 }]}>
                        {category.category}
                      </Text>
                      <Icon 
                        name="chevron-forward" 
                        size={16} 
                        style={{ color: currentColors.textSecondary, marginLeft: 8 }} 
                      />
                    </View>
                    <Text style={[themedStyles.text, { fontSize: 14, fontWeight: '700', color: typeColor, marginLeft: 12 }]}>
                      {formatCurrency(category.amount)}
                    </Text>
                  </View>
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
                      {category.count} {category.count === 1 ? 'expense' : 'expenses'}
                    </Text>
                    <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
                      {category.percentage.toFixed(1)}% of {breakdown.type}
                    </Text>
                  </View>

                  {/* Progress Bar */}
                  <View style={{
                    height: 6,
                    backgroundColor: currentColors.border,
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}>
                    <View
                      style={{
                        height: '100%',
                        backgroundColor: typeColor,
                        borderRadius: 3,
                        width: `${category.percentage}%`,
                      }}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  console.log('ExpenseBreakdownSection: Final render decision:', {
    hasHousehold: !!breakdownData.household,
    hasPersonal: !!breakdownData.personal,
    selectedPersonId,
    totalExpenses: expenses?.length || 0,
    personalExpensesInData: expenses?.filter(e => e && e.category === 'personal').length || 0,
    shouldShowPersonSwitcher,
    viewMode,
    householdExpanded,
    personalExpanded
  });

  return (
    <View>
      {/* Type Breakdowns */}
      <View>
        {breakdownData.household && <TypeBreakdownComponent breakdown={breakdownData.household} />}
        {breakdownData.personal && <TypeBreakdownComponent breakdown={breakdownData.personal} />}
      </View>
    </View>
  );
}
