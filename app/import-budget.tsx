
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useThemedStyles } from '../hooks/useThemedStyles';
import StandardHeader from '../components/StandardHeader';

export default function ImportBudgetScreen() {
  const { themedStyles } = useThemedStyles();

  // Redirect back to budgets since import functionality has been removed
  useEffect(() => {
    router.replace('/budgets');
  }, []);

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Import Budget"
        onLeftPress={() => router.back()}
        showRightIcon={false}
      />
      <View style={[themedStyles.centerContent, { flex: 1 }]}>
        <Text style={themedStyles.text}>
          Import functionality has been removed
        </Text>
      </View>
    </View>
  );
}
