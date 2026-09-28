import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { calculateMonthlyAmount } from '../utils/calculations';
import Icon from './Icon';
import { AmountText, Card, ChoicePills, EmptyState, SegmentedControl } from './ui';
import { type, space, radius, tabularNums } from '../styles/tokens';
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
  const { tokens } = useTheme();
  const { formatCurrency } = useCurrency();

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

      console.log(`ExpenseBreakdownSection: ${type} expenses before person filter: `, {
        count: typeExpenses.length,
        selectedPersonId
      });

      // For personal expenses, apply person filter only if a specific person is selected
      if (type === 'personal' && selectedPersonId) {
        const beforeFilterCount = typeExpenses.length;
        typeExpenses = typeExpenses.filter(expense => expense.personId === selectedPersonId);
        console.log(`ExpenseBreakdownSection: ${type} expenses after person filter: `, {
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

      console.log(`ExpenseBreakdownSection: ${type} breakdown calculated: `, {
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

  const period = viewMode === 'yearly' ? 'yr' : viewMode === 'daily' ? 'day' : 'mo';
  const periodWord = viewMode === 'yearly' ? 'year' : viewMode === 'daily' ? 'day' : 'month';

  const personSwitcher = shouldShowPersonSwitcher ? (
    peopleWithPersonalExpenses.length <= 3 ? (
      <SegmentedControl<string>
        label="Whose personal spending"
        value={selectedPersonId ?? 'all'}
        onChange={(v) => setSelectedPersonId(v === 'all' ? null : v)}
        options={[{ value: 'all', label: 'Everyone' }, ...peopleWithPersonalExpenses.map((p) => ({ value: p.id, label: p.name }))]}
        style={{ marginHorizontal: space.s4, marginBottom: space.s3 }}
      />
    ) : (
      <ChoicePills
        label="Whose personal spending"
        showLabel={false}
        value={selectedPersonId ?? 'all'}
        onChange={(v) => setSelectedPersonId(v === 'all' ? null : v)}
        options={[{ value: 'all', label: 'Everyone' }, ...peopleWithPersonalExpenses.map((p) => ({ value: p.id, label: p.name }))]}
        style={{ marginHorizontal: space.s4, marginBottom: space.s3 }}
      />
    )
  ) : null;

  if (!breakdownData.household && !breakdownData.personal) {
    return (
      <Card>
        <EmptyState icon="pie-chart-outline" title="Nothing to break down yet" caption="Add expenses to see where the money goes." />
      </Card>
    );
  }

  const TypeCard = ({ breakdown }: { breakdown: TypeBreakdown }) => {
    const isHousehold = breakdown.type === 'household';
    const color = isHousehold ? tokens.colors.household : tokens.colors.personal;
    const subtle = isHousehold ? tokens.colors.householdSubtle : tokens.colors.personalSubtle;
    const isExpanded = isHousehold ? householdExpanded : personalExpanded;
    const setExpanded = isHousehold ? setHouseholdExpanded : setPersonalExpanded;
    const personName = selectedPersonId ? people.find((p) => p.id === selectedPersonId)?.name : null;
    const title = isHousehold ? 'Household' : personName ? `${personName}’s personal` : 'Personal';

    return (
      <Card padded={false} style={{ marginBottom: space.s3, overflow: 'hidden' }}>
        <Pressable
          onPress={() => setExpanded(!isExpanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel={`${title}, ${formatCurrency(breakdown.amount)} per ${periodWord}, ${breakdown.count} expenses. ${isExpanded ? 'Collapse' : 'Show categories'}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            padding: space.s4,
            backgroundColor: pressed ? tokens.colors.surfaceSunken : 'transparent',
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.md,
              backgroundColor: subtle,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: space.s3,
            }}
          >
            <Icon name={isHousehold ? 'home' : 'person'} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.h3, { color: tokens.colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted }]}>
              {breakdown.count} {breakdown.count === 1 ? 'expense' : 'expenses'} · {breakdown.percentage.toFixed(0)}% of spending
            </Text>
          </View>
          <AmountText value={breakdown.amount} role="h3" suffix={`/${period}`} style={{ marginRight: space.s2 }} />
          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={tokens.colors.textFaint} />
        </Pressable>

        {isExpanded ? (
          <View
            style={{
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: tokens.colors.borderStrong,
              paddingTop: space.s3,
            }}
          >
            {!isHousehold ? personSwitcher : null}
            {breakdown.categories.map((category, i) => (
              <Pressable
                key={`${breakdown.type}-${category.category}`}
                onPress={() => handleCategoryPress(breakdown.type, category.category)}
                accessibilityRole="button"
                accessibilityLabel={`${category.category}, ${formatCurrency(category.amount)}, ${category.percentage.toFixed(0)}% of ${title.toLowerCase()}. Show these expenses`}
                style={({ pressed }) => ({
                  paddingHorizontal: space.s4,
                  paddingVertical: space.s3,
                  backgroundColor: pressed ? tokens.colors.surfaceSunken : 'transparent',
                  borderBottomWidth: i < breakdown.categories.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: tokens.colors.border,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[type.bodyMed, { color: tokens.colors.text, flex: 1 }]} numberOfLines={1}>
                    {category.category}
                  </Text>
                  <AmountText value={category.amount} role="bodyMed" />
                  <Icon name="chevron-forward" size={16} color={tokens.colors.textFaint} style={{ marginLeft: space.s2 }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.s2, gap: space.s3 }}>
                  <View style={{ flex: 1, height: 4, borderRadius: radius.full, backgroundColor: tokens.colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${category.percentage}%`, height: '100%', backgroundColor: color }} />
                  </View>
                  <Text style={[type.caption, tabularNums, { color: tokens.colors.textMuted, minWidth: 120, textAlign: 'right' }]}>
                    {category.count} {category.count === 1 ? 'expense' : 'expenses'} · {category.percentage.toFixed(0)}%
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View>
      {breakdownData.household ? <TypeCard breakdown={breakdownData.household} /> : null}
      {breakdownData.personal ? <TypeCard breakdown={breakdownData.personal} /> : null}
    </View>
  );
}
