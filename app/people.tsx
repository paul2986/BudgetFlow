
import { Text, View, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { Person } from '../types/budget';
import {
  calculatePersonIncome,
  calculateMonthlyAmount,
  calculatePersonalExpenses,
  calculateHouseholdShare,
  calculateHouseholdExpenses
} from '../utils/calculations';
import Icon from '../components/Icon';
import StandardHeader from '../components/StandardHeader';
import { AmountText, Avatar, EmptyState, ListGroup, ListRow, Skeleton } from '../components/ui';
import { type, space, radius } from '../styles/tokens';

export default function PeopleScreen() {
  const { data, saving, refreshData, loading } = useBudgetData();
  const { tokens } = useTheme();
  const { themedStyles, breakpoint } = useThemedStyles();
  const { formatCurrency, currency } = useCurrency();
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Track when data has been loaded to prevent flicker
  useFocusEffect(
    useCallback(() => {
      console.log('PeopleScreen: Screen focused, refreshing data...');
      refreshData();
      // Mark data as loaded after initial load completes
      if (!loading) {
        setIsDataLoaded(true);
      }
    }, [refreshData, loading])
  );

  // Update isDataLoaded when loading state changes
  useFocusEffect(
    useCallback(() => {
      if (!loading && !isDataLoaded) {
        console.log('PeopleScreen: Data loading completed, marking as loaded');
        setIsDataLoaded(true);
      }
    }, [loading, isDataLoaded])
  );

  // Route-driven on every form factor (DESIGN.md §2.5): deep-linkable, one path.
  const handleEditPerson = useCallback((person: Person) => {
    router.push({
      pathname: '/edit-person',
      params: { personId: person.id, origin: 'people' }
    });
  }, []);

  const calculateRemainingIncome = useCallback((person: Person) => {
    const totalIncome = calculatePersonIncome(person);
    const personalExpenses = calculatePersonalExpenses(data.expenses, person.id);
    const householdExpenses = calculateHouseholdExpenses(data.expenses);
    const householdShare = calculateHouseholdShare(
      householdExpenses,
      data.people,
      data.householdSettings.distributionMethod,
      person.id
    );

    return totalIncome - personalExpenses - householdShare;
  }, [data.expenses, data.people, data.householdSettings.distributionMethod]);

  // Slides in like Edit person; the same screen, without a personId.
  const handleNavigateToAddPerson = useCallback(() => {
    router.push('/edit-person');
  }, []);

  const openIncome = (personId: string) => {
    router.push({ pathname: '/edit-income', params: { personId } });
  };

  const ready = isDataLoaded || !loading;

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="People"
        showLeftIcon={false}
        loading={saving}
        rightButtons={[{ icon: 'add', onPress: handleNavigateToAddPerson, accessibilityLabel: 'Add person' }]}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
      >
        <View
          style={{
            width: '100%',
            maxWidth: breakpoint.contentMaxWidth,
            alignSelf: 'center',
            // Two columns of people from medium width; one full-width column on phones.
            ...(breakpoint.isCompact ? null : { flexDirection: 'row' as const, flexWrap: 'wrap' as const, columnGap: space.s6 }),
          }}
        >
          {!ready ? (
            <View style={{ width: '100%' }}>
              <Skeleton height={64} borderRadius={radius.lg} style={{ marginBottom: space.s3 }} />
              <Skeleton height={128} borderRadius={radius.lg} />
            </View>
          ) : data.people.length === 0 ? (
            <ListGroup style={{ width: '100%' }}>
              <EmptyState
                icon="people-outline"
                title="No people yet"
                caption="Add everyone who shares costs, then their income, to see what each person has left."
                actionLabel="Add person"
                onAction={handleNavigateToAddPerson}
              />
            </ListGroup>
          ) : (
            data.people.map((person) => {
              const monthlyIncome = calculateMonthlyAmount(calculatePersonIncome(person), 'yearly');
              const monthlyRemaining = calculateMonthlyAmount(calculateRemainingIncome(person), 'yearly');
              return (
                <ListGroup
                  key={person.id}
                  style={breakpoint.isCompact ? undefined : { width: `calc(50% - ${space.s6 / 2}px)` as any }}
                >
                  <ListRow
                    title={person.name}
                    caption={`${formatCurrency(monthlyIncome)}/mo income · ${formatCurrency(monthlyRemaining)} left`}
                    leading={<Avatar name={person.name} seed={person.id} size={44} />}
                    chevron
                    onPress={() => handleEditPerson(person)}
                    accessibilityLabel={`${person.name}, ${formatCurrency(monthlyIncome)} a month income, ${formatCurrency(monthlyRemaining)} left. Edit`}
                  >
                    {monthlyRemaining < 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.s1 }}>
                        <Icon name="alert-circle" size={14} color={tokens.colors.danger} style={{ marginRight: space.s1 }} />
                        <Text style={[type.caption, { color: tokens.colors.danger }]}>Spending more than their income</Text>
                      </View>
                    ) : null}
                  </ListRow>

                  {person.income.map((income) => (
                    <ListRow
                      key={income.id}
                      title={income.label}
                      caption={income.frequency.charAt(0).toUpperCase() + income.frequency.slice(1)}
                      icon="trending-up-outline"
                      iconColor={tokens.colors.income}
                      trailing={<AmountText value={income.amount} role="bodyMed" />}
                      chevron
                        onPress={() =>
                        router.push({ pathname: '/edit-income', params: { personId: person.id, incomeId: income.id } })
                      }
                      accessibilityLabel={`${income.label}, ${formatCurrency(income.amount)} ${income.frequency}. Edit`}
                    />
                  ))}

                  <ListRow
                    title="Add income"
                    glyphText={currency.symbol}
                    iconColor={tokens.colors.brand}
                    chevron
                    onPress={saving ? undefined : () => openIncome(person.id)}
                    accessibilityLabel={`Add income for ${person.name}`}
                    showSeparator={false}
                  />
                </ListGroup>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
