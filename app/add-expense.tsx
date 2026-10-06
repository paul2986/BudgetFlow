
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import ExpenseForm from '../components/forms/ExpenseForm';
import NoBudgetState from '../components/NoBudgetState';
import StandardHeader from '../components/StandardHeader';
import { useBudgetData } from '../hooks/useBudgetData';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { FormScreen } from '../components/ui';
import { useFormSessionKey } from '../hooks/useFormSessionKey';

export default function AddExpenseScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { themedStyles } = useThemedStyles();
  const session = useFormSessionKey();
  const { activeBudget, loading } = useBudgetData();

  // Return to wherever the form was opened from; a direct link has nowhere
  // to go back to, so it lands on the list.
  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/expenses');
  };

  // Reached without a budget (a stale link): there is nothing to save into.
  if (!loading && !activeBudget) {
    return (
      <View style={themedStyles.container}>
        <FormScreen>
          <StandardHeader title="New expense" onLeftPress={handleClose} />
          <NoBudgetState />
        </FormScreen>
      </View>
    );
  }

  return (
    <View style={themedStyles.container}>
      <FormScreen>
        {/* Fresh form per expense and per visit (the screen stays mounted). */}
        <ExpenseForm key={`${params.id ?? 'new'}:${session}`} id={params.id} onClose={handleClose} />
      </FormScreen>
    </View>
  );
}
