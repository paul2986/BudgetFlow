
import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { useCurrency } from '../hooks/useCurrency';
import { Income } from '../types/budget';
import Button from '../components/Button';
import CurrencyInput from '../components/CurrencyInput';
import Icon from '../components/Icon';
import StandardHeader from '../components/StandardHeader';

export default function EditIncomeScreen() {
  const [income, setIncome] = useState<Income | null>(null);
  const [editedIncome, setEditedIncome] = useState({
    amount: '',
    label: '',
    frequency: 'monthly' as any,
  });
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const { formatCurrency } = useCurrency();
  const { currentColors } = useTheme();
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

  const FrequencyPicker = ({ value, onChange }: { value: string, onChange: (value: string) => void }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
      {['daily', 'weekly', 'monthly', 'yearly'].map((freq) => (
        <TouchableOpacity
          key={freq}
          style={[
            themedStyles.badge,
            {
              backgroundColor: value === freq ? currentColors.primary : currentColors.border,
              marginRight: 8,
              marginBottom: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }
          ]}
          onPress={() => onChange(freq)}
          disabled={saving}
        >
          <Text style={[
            themedStyles.badgeText,
            { color: value === freq ? currentColors.backgroundAlt : currentColors.text }
          ]}>
            {freq.charAt(0).toUpperCase() + freq.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Show loading state while data is being loaded
  if (!isDataLoaded || loading) {
    return (
      <View style={themedStyles.container}>
        <StandardHeader
          title="Edit Income"
          onLeftPress={handleGoBack}
          showRightIcon={false}
        />
        <View style={[themedStyles.centerContent, { flex: 1 }]}>
          <ActivityIndicator size="large" color={currentColors.primary} />
          <Text style={[themedStyles.text, { marginTop: 16 }]}>
            Loading income data...
          </Text>
        </View>
      </View>
    );
  }

  // Show error state if income not found
  if (!income) {
    return (
      <View style={themedStyles.container}>
        <StandardHeader
          title="Edit Income"
          onLeftPress={handleGoBack}
          showRightIcon={false}
        />
        <View style={[themedStyles.centerContent, { flex: 1 }]}>
          <Icon name="warning-outline" size={48} style={{ color: currentColors.textSecondary, marginBottom: 16 }} />
          <Text style={[themedStyles.text, { textAlign: 'center' }]}>
            Income source not found
          </Text>
          <Text style={[themedStyles.text, { textAlign: 'center', marginTop: 8 }]}>
            It may have been deleted or there was an error loading the data.
          </Text>
          <Button
            text="Go Back"
            onPress={() => router.back()}
            variant="outline"
            style={{ marginTop: 24 }}
          />
        </View>
      </View>
    );
  }

  const person = data.people.find(p => p.id === personId);

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Edit Income"
        onLeftPress={handleGoBack}
        rightIcon="checkmark"
        onRightPress={handleSaveIncome}
        loading={saving}
      />

      <ScrollView style={themedStyles.content} contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: 16, paddingTop: 16 }]}>
        {/* Income Details */}
        <View style={themedStyles.section}>
          <Text style={[themedStyles.subtitle, { marginBottom: 12 }]}>
            Edit Income for {person?.name}
          </Text>

          <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>
            Income Source:
          </Text>
          <TextInput
            style={themedStyles.input}
            value={editedIncome.label}
            onChangeText={(text) => setEditedIncome({ ...editedIncome, label: text })}
            placeholder="e.g., Salary, Freelance, Side Job"
            placeholderTextColor={currentColors.textSecondary}
            editable={!saving}
          />

          <CurrencyInput
            label="Amount"
            value={editedIncome.amount}
            onChangeText={(text) => setEditedIncome({ ...editedIncome, amount: text })}
            editable={!saving}
          />

          <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600' }]}>
            Frequency:
          </Text>
          <FrequencyPicker
            value={editedIncome.frequency}
            onChange={(freq) => setEditedIncome({ ...editedIncome, frequency: freq as any })}
          />
        </View>

        {/* Current Income Preview */}
        <View style={[themedStyles.card, { backgroundColor: currentColors.backgroundAlt }]}>
          <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 8 }]}>
            Current Income Details:
          </Text>
          <Text style={[themedStyles.textSecondary, { marginBottom: 4 }]}>
            Source: {income.label}
          </Text>
          <Text style={[themedStyles.textSecondary, { marginBottom: 4 }]}>
            Amount: {formatCurrency(income.amount)}
          </Text>
          <Text style={themedStyles.textSecondary}>
            Frequency: {income.frequency}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
          <View style={{ flex: 1 }}>
            <Button
              text="Cancel"
              onPress={() => router.back()}
              variant="outline"
              style={{ marginTop: 0 }}
              disabled={saving}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              text={saving ? 'Saving...' : 'Save Changes'}
              onPress={handleSaveIncome}
              variant="primary"
              style={{ marginTop: 0 }}
              disabled={saving}
            />
          </View>
        </View>

        {/* Delete Button */}
        <View style={{ marginTop: 24, paddingBottom: 40 }}>
          <Button
            text={saving ? 'Deleting...' : 'Delete Income Source'}
            onPress={handleDeleteIncome}
            variant="danger"
            style={{ marginTop: 0, opacity: 0.8 }}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </View>
  );
}
