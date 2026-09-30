import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from 'expo-router';

/**
 * Tab screens stay mounted after they blur, so a form screen keeps whatever
 * it last held: back out of an expense, tap New expense, and the old values
 * are still there. This returns a key that changes once the screen has been
 * left for good (closed or backed out of, so it has dropped out of the tab
 * history), but not when a child screen merely covers it (Edit income over
 * Edit person keeps the unsaved name). Key the form with it to start fresh
 * on the next visit.
 */
export function useFormSessionKey(): number {
  const navigation = useNavigation();
  const route = useRoute();
  const [session, setSession] = useState(0);

  useFocusEffect(
    useCallback(
      () => () => {
        const history = (navigation.getState() as { history?: { key?: string }[] } | undefined)?.history;
        if (history && !history.some((entry) => entry.key === route.key)) {
          setSession((s) => s + 1);
        }
      },
      [navigation, route.key]
    )
  );

  return session;
}
