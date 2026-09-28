
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import CurrencyInput from './CurrencyInput';
import { Chip, Input, SegmentedControl, Sheet } from './ui';
import { type, space } from '../styles/tokens';
import { Person, Income } from '../types/budget';

interface IncomeModalProps {
  visible: boolean;
  onClose: () => void;
  onAddIncome: (personId: string, income: Omit<Income, 'id' | 'personId'>) => Promise<{ success: boolean; error?: any }>;
  people: Person[];
  selectedPersonId?: string | null;
  saving?: boolean;
}

export default function IncomeModal({
  visible,
  onClose,
  onAddIncome,
  people,
  selectedPersonId,
  saving = false,
}: IncomeModalProps) {
  const { tokens } = useTheme();

  const [tempPersonId, setTempPersonId] = useState<string | null>(null);
  const [tempIncome, setTempIncome] = useState<{ amount: string; label: string; frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' }>({
    amount: '',
    label: '',
    frequency: 'monthly',
  });

  // Initialize temp state when modal opens
  useEffect(() => {
    if (visible) {
      setTempPersonId(selectedPersonId || (people.length > 0 ? people[0].id : null));
      setTempIncome({ amount: '', label: '', frequency: 'monthly' });
    }
  }, [visible, selectedPersonId, people]);

  const handleCancel = () => {
    // Reset temp state and close without applying
    setTempPersonId(selectedPersonId || (people.length > 0 ? people[0].id : null));
    setTempIncome({ amount: '', label: '', frequency: 'monthly' });
    onClose();
  };

  const handleAddIncome = async () => {
    console.log('IncomeModal: Add income button pressed');
    console.log('IncomeModal: Income data:', tempIncome);
    console.log('IncomeModal: Selected person:', tempPersonId);
    
    if (!tempPersonId || !tempIncome.amount || !tempIncome.label.trim()) {
      console.log('IncomeModal: Missing required fields');
      return;
    }

    const amount = parseFloat(tempIncome.amount);
    if (isNaN(amount) || amount <= 0) {
      console.log('IncomeModal: Invalid amount');
      return;
    }

    try {
      const incomeData = {
        amount: amount,
        label: tempIncome.label.trim(),
        frequency: tempIncome.frequency,
      };

      console.log('IncomeModal: Adding income:', incomeData);
      const result = await onAddIncome(tempPersonId, incomeData);
      console.log('IncomeModal: Income added result:', result);
      
      if (result.success) {
        setTempIncome({ amount: '', label: '', frequency: 'monthly' });
        onClose();
        console.log('IncomeModal: Income added successfully');
      }
    } catch (error) {
      console.error('IncomeModal: Error adding income:', error);
    }
  };

  // Check if form is valid for enabling the add button
  const isFormValid = () => {
    if (!tempPersonId || !tempIncome.amount || !tempIncome.label.trim() || saving) {
      return false;
    }
    
    const amount = parseFloat(tempIncome.amount);
    return !isNaN(amount) && amount > 0;
  };

  const selectedPerson = people.find(p => p.id === tempPersonId);

  type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

  return (
    <Sheet
      visible={visible}
      onClose={handleCancel}
      title="Add income"
      leadingAction={{ label: 'Cancel', onPress: handleCancel, disabled: saving }}
      trailingAction={{ label: 'Add', onPress: handleAddIncome, disabled: !isFormValid() }}
      width={460}
    >
      <ScrollView
        contentContainerStyle={{ padding: space.s5, gap: space.s5 }}
        keyboardShouldPersistTaps="handled"
      >
        {people.length > 1 ? (
          <View>
            <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>Person</Text>
            {people.length <= 4 ? (
              <SegmentedControl<string>
                label="Person"
                value={tempPersonId || ''}
                onChange={setTempPersonId}
                options={people.map((p) => ({ value: p.id, label: p.name }))}
              />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
                {people.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    icon={tempPersonId === p.id ? 'checkmark' : 'person-outline'}
                    selected={tempPersonId === p.id}
                    onPress={() => setTempPersonId(p.id)}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}

        <Input
          label="Source"
          placeholder="e.g. Salary, freelance, benefits"
          value={tempIncome.label}
          onChangeText={(text) => setTempIncome({ ...tempIncome, label: text })}
          editable={!saving}
          autoFocus
          helperText={
            selectedPerson
              ? `${selectedPerson.name} has ${selectedPerson.income.length} income ${selectedPerson.income.length === 1 ? 'source' : 'sources'} so far.`
              : undefined
          }
        />

        <CurrencyInput
          label="Amount"
          value={tempIncome.amount}
          onChangeText={(text) => setTempIncome({ ...tempIncome, amount: text })}
          editable={!saving}
        />

        <View>
          <Text style={[type.caption, { color: tokens.colors.textMuted, marginBottom: space.s2 }]}>How often</Text>
          <SegmentedControl<Frequency>
            label="How often"
            value={tempIncome.frequency as Frequency}
            onChange={(freq) => setTempIncome({ ...tempIncome, frequency: freq as any })}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}
