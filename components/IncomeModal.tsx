
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { useCurrency } from '../hooks/useCurrency';
import Icon from './Icon';
import Button from './Button';
import CurrencyInput from './CurrencyInput';
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
  const { currentColors } = useTheme();
  const { themedStyles, themedButtonStyles } = useThemedStyles();
  const { formatCurrency } = useCurrency();

  const [tempPersonId, setTempPersonId] = useState<string | null>(null);
  const [tempIncome, setTempIncome] = useState({
    amount: '',
    label: '',
    frequency: 'monthly' as const,
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

  const selectedPerson = people.find(p => p.id === tempPersonId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[themedStyles.container, { backgroundColor: currentColors.background }]}>
          {/* Header */}
          <View style={[themedStyles.header, { height: 64, boxShadow: '0px 1px 2px rgba(0,0,0,0.10)' }]}>
            <View style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' }}>
              <TouchableOpacity
                onPress={handleCancel}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: currentColors.backgroundAlt,
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: '0px 2px 4px rgba(0,0,0,0.15)',
                  borderWidth: 1,
                  borderColor: currentColors.border,
                }}
                disabled={saving}
              >
                <Icon name="arrow-back" size={24} style={{ color: currentColors.text }} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={[themedStyles.headerTitle, { textAlign: 'center', lineHeight: 22 }]}>
                Add Income Source
              </Text>
            </View>

            <View style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
              <TouchableOpacity
                onPress={handleAddIncome}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isFormValid() 
                    ? currentColors.primary 
                    : currentColors.textSecondary + '40',
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: '0px 2px 4px rgba(0,0,0,0.15)',
                  borderWidth: 1,
                  borderColor: 'transparent',
                }}
                disabled={!isFormValid()}
              >
                <Icon 
                  name="add" 
                  size={24} 
                  style={{ 
                    color: isFormValid() 
                      ? '#FFFFFF' 
                      : currentColors.textSecondary
                  }} 
                />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={themedStyles.content} contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: 16 }]}>
            {/* Person Selection */}
            {people.length > 1 && (
              <View style={[themedStyles.section, { paddingBottom: 0 }]}>
                <Text style={[themedStyles.text, { marginBottom: 12, fontWeight: '600', fontSize: 16 }]}>
                  Select Person
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ paddingHorizontal: 4, flexDirection: 'row' }}>
                    {people.map((person) => (
                      <TouchableOpacity
                        key={person.id}
                        style={[
                          themedStyles.badge,
                          {
                            backgroundColor: tempPersonId === person.id ? currentColors.income : currentColors.border,
                            marginRight: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 20,
                          },
                        ]}
                        onPress={() => setTempPersonId(person.id)}
                        disabled={saving}
                      >
                        <Text
                          style={[
                            themedStyles.badgeText,
                            { 
                              color: tempPersonId === person.id ? '#FFFFFF' : currentColors.text, 
                              fontWeight: '600', 
                              fontSize: 14 
                            },
                          ]}
                        >
                          {person.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Selected Person Info */}
            {selectedPerson && (
              <View style={[themedStyles.card, { backgroundColor: currentColors.income + '10', marginBottom: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Icon name="person-outline" size={20} style={{ color: currentColors.income, marginRight: 8 }} />
                  <Text style={[themedStyles.text, { fontWeight: '600', color: currentColors.income }]}>
                    Adding income for {selectedPerson.name}
                  </Text>
                </View>
                <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
                  Current income sources: {selectedPerson.income.length}
                </Text>
              </View>
            )}

            {/* Income Source Input */}
            <View style={[themedStyles.section, { paddingBottom: 0 }]}>
              <Text style={[themedStyles.text, { marginBottom: 8, fontWeight: '600', fontSize: 16 }]}>
                Income Source
              </Text>
              <TextInput
                style={[themedStyles.input, { marginBottom: 0 }]}
                placeholder="e.g., Salary, Freelance, Side Job"
                placeholderTextColor={currentColors.textSecondary}
                value={tempIncome.label}
                onChangeText={(text) => setTempIncome({ ...tempIncome, label: text })}
                editable={!saving}
                accessibilityLabel="Income source name"
              />
            </View>

            {/* Amount Input */}
            <CurrencyInput
              label="Amount"
              value={tempIncome.amount}
              onChangeText={(text) => setTempIncome({ ...tempIncome, amount: text })}
              editable={!saving}
              containerStyle={[themedStyles.section, { paddingBottom: 0 }]}
              accessibilityLabel="Income amount"
            />

            {/* Frequency Selection */}
            <View style={[themedStyles.section, { paddingBottom: 0 }]}>
              <Text style={[themedStyles.text, { marginBottom: 12, fontWeight: '600', fontSize: 16 }]}>
                Frequency
              </Text>
              <FrequencyPicker
                value={tempIncome.frequency}
                onChange={(freq) => setTempIncome({ ...tempIncome, frequency: freq as any })}
              />
            </View>
          </ScrollView>

          {/* Bottom action buttons */}
          <View style={[themedStyles.section, { paddingTop: 16, paddingBottom: 32, paddingHorizontal: 16 }]}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button
                  text="Cancel"
                  onPress={handleCancel}
                  variant="outline"
                  disabled={saving}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  text={saving ? 'Adding...' : 'Add Income'}
                  onPress={handleAddIncome}
                  variant="secondary"
                  disabled={!isFormValid()}
                />
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
