
import React from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import ExpenseForm from '../components/forms/ExpenseForm';
import StandardHeader from '../components/StandardHeader';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { FormScreen } from '../components/ui';

export default function AddExpenseScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { themedStyles } = useThemedStyles();

  const handleClose = () => {
    router.replace('/expenses');
  };

  return (
    <View style={themedStyles.container}>
      <FormScreen>
        <StandardHeader
          title={params.id ? 'Edit expense' : 'New expense'}
          onLeftPress={handleClose}
        />
        <ExpenseForm id={params.id} onClose={handleClose} />
      </FormScreen>
    </View>
  );
}
