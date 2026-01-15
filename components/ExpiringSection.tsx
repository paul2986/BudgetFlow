
import { useBudgetData } from '../hooks/useBudgetData';
import { useTheme } from '../hooks/useTheme';
import { Expense } from '../types/budget';
import React, { useState, useMemo, useCallback } from 'react';
import { useCurrency } from '../hooks/useCurrency';
import DateTimePicker from '@react-native-community/datetimepicker';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useToast } from '../hooks/useToast';
import { calculateMonthlyAmount, getEndingSoon } from '../utils/calculations';
import { useThemedStyles } from '../hooks/useThemedStyles';
import Icon from './Icon';
import PropTypes from 'prop-types';

interface ExpiringSectionProps {
  expenses: Expense[];
}

type TabKey = 'expiring' | 'ended';

export default function ExpiringSection({ expenses }: ExpiringSectionProps) {
  const { currentColors } = useTheme();
  const { formatCurrency } = useCurrency();
  const { themedStyles } = useThemedStyles();
  const { showToast } = useToast();
  const { updateExpense } = useBudgetData();
  
  const [activeTab, setActiveTab] = useState<TabKey>('expiring');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const { expiringSoon, ended } = useMemo(() => {
    return getEndingSoon(expenses);
  }, [expenses]);

  const handleExtendExpense = useCallback((expense: Expense) => {
    setSelectedExpense(expense);
    setShowDatePicker(true);
  }, []);

  const handleDateChange = useCallback(async (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    
    if (selectedDate && selectedExpense) {
      try {
        const updatedExpense = {
          ...selectedExpense,
          endDate: selectedDate.toISOString().split('T')[0],
        };
        
        await updateExpense(updatedExpense);
        showToast('Expense end date updated', 'success');
      } catch (error) {
        console.error('Error updating expense:', error);
        showToast('Failed to update expense', 'error');
      }
    }
    
    setSelectedExpense(null);
  }, [selectedExpense, updateExpense, showToast]);

  const TabButton = ({ tab, label, count }: { tab: TabKey; label: string; count: number }) => (
    <TouchableOpacity
      onPress={() => setActiveTab(tab)}
      style={[
        {
          flex: 1,
          paddingHorizontal: 16,
          paddingVertical: 6, // Reduced from 10 to 6 to match OverviewSection toggle height
          borderRadius: 8,
          backgroundColor: activeTab === tab ? currentColors.border : 'transparent',
          alignItems: 'center',
        },
      ]}
    >
      <Text
        style={[
          themedStyles.text,
          {
            color: activeTab === tab ? currentColors.text : currentColors.textSecondary,
            fontWeight: activeTab === tab ? '600' : '500',
            fontSize: 14,
          },
        ]}
      >
        {label} ({count})
      </Text>
    </TouchableOpacity>
  );

  const ItemRow = ({ expense }: { expense: Expense }) => {
    const monthlyAmount = calculateMonthlyAmount(expense.amount, expense.frequency);
    const isEnded = activeTab === 'ended';
    
    return (
      <View style={[
        themedStyles.card,
        {
          backgroundColor: isEnded 
            ? currentColors.textSecondary + '10' 
            : currentColors.warning + '10',
          borderColor: isEnded 
            ? currentColors.textSecondary + '30' 
            : currentColors.warning + '30',
          borderWidth: 1,
          marginBottom: 12,
        }
      ]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={[themedStyles.text, { fontWeight: '600', marginBottom: 4 }]}>
              {expense.description}
            </Text>
            <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
              {formatCurrency(monthlyAmount)}/month • {expense.category}
            </Text>
          </View>
          
          {!isEnded && (
            <TouchableOpacity
              onPress={() => handleExtendExpense(expense)}
              style={{
                backgroundColor: currentColors.primary + '20',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                marginLeft: 12,
              }}
            >
              <Text style={[themedStyles.text, { color: currentColors.primary, fontSize: 12, fontWeight: '600' }]}>
                Extend
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon 
            name={isEnded ? "checkmark-circle" : "time"} 
            size={14} 
            style={{ 
              color: isEnded ? currentColors.textSecondary : currentColors.warning, 
              marginRight: 6 
            }} 
          />
          <Text style={[themedStyles.textSecondary, { fontSize: 12 }]}>
            {isEnded ? 'Ended' : 'Ends'} {expense.endDate}
          </Text>
        </View>
      </View>
    );
  };

  const currentExpenses = activeTab === 'expiring' ? expiringSoon : ended;

  return (
    <View>
      {/* Tabs - Full Width with subtle styling */}
      <View style={{ 
        flexDirection: 'row', 
        backgroundColor: currentColors.background,
        borderRadius: 10,
        padding: 4,
        marginBottom: 20 
      }}>
        <TabButton tab="expiring" label="Expiring Soon" count={expiringSoon.length} />
        <TabButton tab="ended" label="Ended" count={ended.length} />
      </View>

      {/* Content */}
      {currentExpenses.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Icon 
            name={activeTab === 'expiring' ? "time-outline" : "checkmark-circle-outline"} 
            size={48} 
            style={{ color: currentColors.textSecondary, marginBottom: 12 }} 
          />
          <Text style={[themedStyles.textSecondary, { textAlign: 'center' }]}>
            {activeTab === 'expiring' 
              ? 'No expenses expiring soon' 
              : 'No ended expenses'
            }
          </Text>
        </View>
      ) : (
        <View>
          {currentExpenses.map((expense) => (
            <ItemRow key={expense.id} expense={expense} />
          ))}
        </View>
      )}

      {/* Date Picker Modal */}
      {showDatePicker && selectedExpense && (
        <DateTimePicker
          value={selectedExpense.endDate ? new Date(selectedExpense.endDate) : new Date()}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}
    </View>
  );
}

// Add PropTypes for the expense.id validation
ExpiringSection.propTypes = {
  expenses: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired,
      amount: PropTypes.number.isRequired,
      category: PropTypes.string.isRequired,
      frequency: PropTypes.string.isRequired,
      endDate: PropTypes.string,
    })
  ).isRequired,
};
