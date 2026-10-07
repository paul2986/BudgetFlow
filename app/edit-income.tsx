
import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, ScrollView, TextInput } from 'react-native';
import { Alert, confirmDiscard } from '../utils/alert';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { Income } from '../types/budget';
import Button from '../components/Button';
import CurrencyInput from '../components/CurrencyInput';
import StandardHeader from '../components/StandardHeader';
import { EmptyState, FormScreen, Input, SegmentedControl, Skeleton, useFormInsets } from '../components/ui';
import { type, space } from '../styles/tokens';
import { newId } from '../utils/ids';
import { BOUNCE_MIN_HEIGHT } from '../hooks/useBreakpoint';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { useFormSessionKey } from '../hooks/useFormSessionKey';

// Edits an income, or adds one when there's no incomeId (the "Add income"
// rows on People and Edit person push here, so it slides in like the other
// editors). Fresh form per income and per visit: the screen stays mounted
// after it blurs, so without a new key a reopened income shows discarded edits.
export default function EditIncomeScreen() {
  const { personId, incomeId } = useLocalSearchParams<{ personId: string; incomeId: string }>();
  const session = useFormSessionKey();
  return <EditIncomeForm key={`${personId}:${incomeId}:${session}`} />;
}

function EditIncomeForm() {
  const [income, setIncome] = useState<Income | null>(null);
  const [editedIncome, setEditedIncome] = useState({
    amount: '',
    label: '',
    frequency: 'monthly' as any,
  });
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const { tokens } = useTheme();
  const formInsets = useFormInsets();
  const { themedStyles } = useThemedStyles();
  const params = useLocalSearchParams<{ personId: string; incomeId: string }>();
  const { personId, incomeId } = params;
  const isNew = !incomeId;

  const { data, addIncome, updateIncome, removeIncome, saving, loading } = useBudgetData();

  const amountValid = !!editedIncome.amount && parseFloat(editedIncome.amount) > 0;
  const changed = isNew
    ? !!editedIncome.label.trim() || !!editedIncome.amount
    : !!income &&
      (editedIncome.label.trim() !== income.label ||
        parseFloat(editedIncome.amount) !== income.amount ||
        editedIncome.frequency !== income.frequency);
  const canSave = changed && !!editedIncome.label.trim() && amountValid;

  // New income: focus the source when the screen appears, not on mount; see
  // ExpenseForm for why (hidden mount, and scrolling would cancel the slide).
  const labelRef = useRef<TextInput>(null);
  useFocusEffect(
    useCallback(() => {
      if (isNew) (labelRef.current as unknown as { focus: (o?: FocusOptions) => void } | null)?.focus({ preventScroll: true });
    }, [isNew])
  );
  const leave = useDiscardGuard(changed);

  // Back to wherever this was opened from (Edit person or People); a direct
  // link has nowhere to go back to, so it lands on People.
  const handleGoBack = useCallback(() => {
    leave(() => (router.canGoBack() ? router.back() : router.replace('/people')));
  }, [leave]);


  const fieldsLoaded = useRef(false);

  // Find the income and person when data changes
  useEffect(() => {
    if (loading) {
      setIsDataLoaded(false);
      return;
    }

    if (personId && incomeId && data.people.length > 0) {
      const person = data.people.find(p => p.id === personId);
      if (person) {
        const foundIncome = person.income.find(i => i.id === incomeId);

        if (foundIncome) {
          setIncome(foundIncome);
          // Fill the fields once per form; a later data refresh (focus, sync)
          // must not overwrite what the user is typing.
          if (!fieldsLoaded.current) {
            fieldsLoaded.current = true;
            setEditedIncome({
              amount: foundIncome.amount.toString(),
              label: foundIncome.label,
              frequency: foundIncome.frequency,
            });
          }
          setIsDataLoaded(true);
        } else {
          setIncome(null);
          setIsDataLoaded(true);
        }
      } else {
        setIncome(null);
        setIsDataLoaded(true);
      }
    } else if (!loading && data.people.length === 0) {
      setIsDataLoaded(true);
    }
  }, [personId, incomeId, data.people, data.expenses, loading, isDataLoaded]);

  const handleSaveIncome = useCallback(async () => {
    if (!personId || (!isNew && !income)) return;

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
      const updates = {
        amount: amount,
        label: editedIncome.label.trim(),
        frequency: editedIncome.frequency,
      };

      const result = income
        ? await updateIncome(personId, income.id, updates)
        : await addIncome(personId, {
            id: newId('income'),
            personId,
            ...updates,
          });

      if (result && result.success) {
        // Navigate specifically to the people page to show the updated data
        handleGoBack();
      } else {
        console.error('EditIncomeScreen: Income save failed:', result?.error);
        Alert.alert('Error', result?.error?.message || `Failed to ${isNew ? 'add' : 'update'} income. Please try again.`);
      }
    } catch (error) {
      console.error('EditIncomeScreen: Error saving income:', error);
      Alert.alert('Error', `Failed to ${isNew ? 'add' : 'update'} income. Please try again.`);
    }
  }, [isNew, income, personId, editedIncome, addIncome, updateIncome, handleGoBack]);

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
              const result = await removeIncome(personId, income.id);

              if (result && result.success) {
                // Navigate specifically to the people page to show the updated data
                handleGoBack();
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
  }, [income, personId, removeIncome, handleGoBack]);

  const person = data.people.find(p => p.id === personId);


  const renderBody = () => {
    // A new income only needs its person, so it shows at once rather than
    // after the load effect (which also lets the focus effect find the input).
    if (isNew ? loading && !person : !isDataLoaded || loading) {
      return (
        <View style={{ ...formInsets, gap: space.s4 }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={40} />
        </View>
      );
    }
    if (isNew && !person) {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title="Person not found"
          caption="They may have been deleted on another device."
          actionLabel="Back to people"
          onAction={() => router.replace('/people')}
        />
      );
    }
    if (!isNew && !income) {
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
        contentContainerStyle={{ ...formInsets, gap: space.s5, minHeight: BOUNCE_MIN_HEIGHT }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Input
          ref={labelRef}
          label="Source"
          value={editedIncome.label}
          onChangeText={(text) => setEditedIncome({ ...editedIncome, label: text })}
          placeholder={isNew ? 'e.g. Salary, freelance, benefits' : 'e.g. Salary'}
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

        {isNew ? null : (
          <Button
            text="Delete income"
            variant="ghost"
            onPress={handleDeleteIncome}
            disabled={saving}
            textStyle={{ color: tokens.colors.danger }}
            style={{ marginTop: space.s2 }}
          />
        )}
      </ScrollView>
    );
  };

  return (
    <View style={themedStyles.formContainer}>
      <FormScreen>
        <StandardHeader
          title={isNew ? 'Add income' : 'Edit income'}
          onLeftPress={() => confirmDiscard(changed, handleGoBack)}
          confirm={{
            onPress: handleSaveIncome,
            dirty: changed,
            disabled: !canSave,
            loading: saving,
            accessibilityLabel: isNew ? 'Add income' : 'Save changes',
          }}
        />
        {renderBody()}
      </FormScreen>
    </View>
  );
}
