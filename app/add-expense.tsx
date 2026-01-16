
import React from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import ExpenseForm from '../components/forms/ExpenseForm';
import StandardHeader from '../components/StandardHeader';
import { useThemedStyles } from '../hooks/useThemedStyles';

export default function AddExpenseScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { themedStyles } = useThemedStyles();

  const handleClose = () => {
    router.replace('/expenses');
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title={params.id ? 'Edit Expense' : 'Add Expense'}
        onLeftPress={handleClose}
      />
      <ExpenseForm id={params.id} onClose={handleClose} />
    </View>
  );
}
