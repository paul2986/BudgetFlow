
import React from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import ExpenseForm from '../components/forms/ExpenseForm';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { FormScreen } from '../components/ui';
import { useFormSessionKey } from '../hooks/useFormSessionKey';

export default function AddExpenseScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { themedStyles } = useThemedStyles();
  const session = useFormSessionKey();

  // Return to wherever the form was opened from; a direct link has nowhere
  // to go back to, so it lands on the list.
  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/expenses');
  };

  return (
    <View style={themedStyles.container}>
      <FormScreen>
        {/* Fresh form per expense and per visit (the screen stays mounted). */}
        <ExpenseForm key={`${params.id ?? 'new'}:${session}`} id={params.id} onClose={handleClose} />
      </FormScreen>
    </View>
  );
}
