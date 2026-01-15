
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

export default function ImportLinkScreen() {
  const params = useLocalSearchParams<{ q?: string; link?: string }>();
  
  // Redirect to budgets screen since import functionality has been removed
  useEffect(() => {
    console.log('ImportLinkScreen: Import functionality removed, redirecting to budgets');
    router.replace('/budgets');
  }, []);

  return null;
}
