
import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, ScrollView } from 'react-native';
import { Alert, confirmDiscard } from '../utils/alert';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { Income } from '../types/budget';
import Button from '../components/Button';
import CurrencyInput from '../components/CurrencyInput';
import StandardHeader from '../components/StandardHeader';
import { EmptyState, FormScreen, Input, SegmentedControl, Skeleton } from '../components/ui';
import { type, space } from '../styles/tokens';
import { useScrollBottomPadding } from '../hooks/useBreakpoint';

export default function EditIncomeScreen() {
  const [income, setIncome] = useState<Income | null>(null);
  const [editedIncome, setEditedIncome] = useState({
    amount: '',
    label: '',
    frequency: 'monthly' as any,
  });
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const { formatCurrency } = useCurrency();
  const { tokens } = useTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { themedStyles, themedButtonStyles, isPad } = useThemedStyles();
  const params = useLocalSearchParams<{ personId: string; incomeId: string }>();
  const { personId, incomeId } = params;

  const { data, updateIncome, removeIncome, saving, loading } = useBudgetData();

  // Use ref to track if we've already refreshed on this focus
  const hasRefreshedOnFocus = useRef(false);

  // Only log when screen comes into focus, don't trigger refreshes
  useFocusEffect(
    useCallback(() => {
      console.log('EditIncomeScreen: Screen focused, current data:', {
        peopleCount: data.people.length,
        expensesCount: data.expenses.length,
        expenseIds: data.expenses.map(e => e.id)
      });

      // Reset the flag when the screen loses focus
      return () => {
        hasRefreshedOnFocus.current = false;
      };
    }, [data.expenses, data.people.length])
  );

  // Find the income and person when data changes
  useEffect(() => {
    console.log('EditIncomeScreen: Data effect triggered', {
      personId,
      incomeId,
      peopleCount: data.people.length,
      expensesCount: data.expenses.length,
      loading,
      isDataLoaded
    });

    if (loading) {
      console.log('EditIncomeScreen: Data is still loading, waiting...');
      setIsDataLoaded(false);
      return;
    }

    if (personId && incomeId && data.people.length > 0) {
      console.log('EditIncomeScreen: Looking for income in data:', {
        personId,
        incomeId,
        peopleCount: data.people.length,
        expensesCount: data.expenses.length
      });

      const person = data.people.find(p => p.id === personId);
      if (person) {
        console.log('EditIncomeScreen: Found person:', person.name, 'with', person.income.length, 'income sources');

        const foundIncome = person.income.find(i => i.id === incomeId);
        console.log('EditIncomeScreen: Found income:', foundIncome);

        if (foundIncome) {
          setIncome(foundIncome);
          setEditedIncome({
            amount: foundIncome.amount.toString(),
            label: foundIncome.label,
            frequency: foundIncome.frequency,
          });
          setIsDataLoaded(true);
          console.log('EditIncomeScreen: Updated income state with fresh data');
        } else {
          console.log('EditIncomeScreen: Income not found in data');
          setIncome(null);
          setIsDataLoaded(true);
        }
      } else {
        console.log('EditIncomeScreen: Person not found in data');
        setIncome(null);
        setIsDataLoaded(true);
      }
    } else if (!loading && data.people.length === 0) {
      console.log('EditIncomeScreen: No people in data and not loading, marking as loaded');
      setIsDataLoaded(true);
    }
  }, [personId, incomeId, data.people, data.expenses, loading, isDataLoaded]);

  const handleSaveIncome = useCallback(async () => {
    if (!income || !personId) return;

    if (!editedIncome.amount || !editedIncome.label.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const amount = parseFloat(editedIncome.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      console.log('EditIncomeScreen: Saving income:', editedIncome);
      console.log('EditIncomeScreen: Current data state before save:', {
        peopleCount: data.people.length,
        expensesCount: data.expenses.length,
        expenseIds: data.expenses.map(e => e.id)
      });

      const updates = {
        amount: amount,
        label: editedIncome.label.trim(),
        frequency: editedIncome.frequency,
      };

      const result = await updateIncome(personId, income.id, updates);
      console.log('EditIncomeScreen: Income save result:', result);

      if (result && result.success) {
        console.log('EditIncomeScreen: Income saved successfully, navigating to people page');
        // Navigate specifically to the people page to show the updated data
        router.replace('/people');
      } else {
        console.error('EditIncomeScreen: Income save failed:', result?.error);
        Alert.alert('Error', result?.error?.message || 'Failed to update income. Please try again.');
      }
    } catch (error) {
      console.error('EditIncomeScreen: Error updating income:', error);
      Alert.alert('Error', 'Failed to update income. Please try again.');
    }
  }, [income, personId, editedIncome, updateIncome, data.people, data.expenses]);

  const handleDeleteIncome = useCallback(() => {
    if (!income || !personId) return;

    Alert.alert(
      'Delete Income',
      `Are you sure you want to delete "${income.label}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('EditIncomeScreen: Deleting income:', income.id);
              console.log('EditIncomeScreen: Current data state before delete:', {
                peopleCount: data.people.length,
                expensesCount: data.expenses.length,
                expenseIds: data.expenses.map(e => e.id)
              });

              const result = await removeIncome(personId, income.id);
              console.log('EditIncomeScreen: Income delete result:', result);

              if (result && result.success) {
                console.log('EditIncomeScreen: Income deleted successfully, navigating to people page');
                // Navigate specifically to the people page to show the updated data
                router.replace('/people');
              } else {
                console.error('EditIncomeScreen: Income delete failed:', result?.error);
                Alert.alert('Error', result?.error?.message || 'Failed to delete income. Please try again.');
              }
            } catch (error) {
              console.error('EditIncomeScreen: Error deleting income:', error);
              Alert.alert('Error', 'Failed to delete income. Please try again.');
            }
          }
        },
      ]
    );
  }, [income, personId, removeIncome, data.people, data.expenses]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, []);

  const person = data.people.find(p => p.id === personId);

  const amountValid = !!editedIncome.amount && parseFloat(editedIncome.amount) > 0;
  const changed =
    !!income &&
    (editedIncome.label.trim() !== income.label ||
      parseFloat(editedIncome.amount) !== income.amount ||
      editedIncome.frequency !== income.frequency);
  const canSave = changed && !!editedIncome.label.trim() && amountValid;

  const renderBody = () => {
    if (!isDataLoaded || loading) {
      return (
        <View style={{ padding: space.s5, gap: space.s4 }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={40} />
        </View>
      );
    }
    if (!income) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title="Income not found"
          caption="It may have been deleted on another device."
          actionLabel="Back to people"
          onAction={() => router.replace('/people')}
        />
      );
    }

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.s5, paddingBottom: scrollBottomPadding, gap: space.s5 }}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Source"
          value={editedIncome.label}
          onChangeText={(text) => setEditedIncome({ ...editedIncome, label: text })}
          placeholder="e.g. Salary"
          editable={!saving}
          helperText={person ? `Income for ${person.name}` : undefined}
        />

        <CurrencyInput
          label="Amount"
          value={editedIncome.amount}
          onChangeText={(text) => setEditedIncome({ ...editedIncome, amount: text })}
          editable={!saving}
        />

        <View>
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>How often</Text>
          <SegmentedControl<'daily' | 'weekly' | 'monthly' | 'yearly'>
            label="How often"
            value={editedIncome.frequency as any}
            onChange={(freq) => setEditedIncome({ ...editedIncome, frequency: freq as any })}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
        </View>

        <Button
          text="Delete income"
          variant="ghost"
          onPress={handleDeleteIncome}
          disabled={saving}
          textStyle={{ color: tokens.colors.danger }}
          style={{ marginTop: space.s2 }}
        />
      </ScrollView>
    );
  };

  return (
    <View style={themedStyles.container}>
      <FormScreen>
        <StandardHeader
          title="Edit income"
          onLeftPress={() => confirmDiscard(changed, handleGoBack)}
          confirm={{
            onPress: handleSaveIncome,
            disabled: !canSave,
            loading: saving,
            accessibilityLabel: 'Save changes',
          }}
        />
        {renderBody()}
      </FormScreen>
    </View>
  );
}
