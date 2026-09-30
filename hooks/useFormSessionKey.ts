import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from 'expo-router';
import { EDITOR_EXIT_MS } from './useEditorTransitions';

/**
 * Tab screens stay mounted after they blur, so a form screen keeps whatever
 * it last held: back out of an expense, tap New expense, and the old values
 * are still there. This returns a key that changes once the screen has been
 * left for good (closed or backed out of, so it has dropped out of the tab
 * history), but not when a child screen merely covers it (Edit income over
 * Edit person keeps the unsaved name). Key the form with it to start fresh
 * on the next visit.
 *
 * The reset waits until the screen has slid out (useEditorTransitions), so
 * the form doesn't blank mid-animation; coming back sooner resets at once.
 */
export function useFormSessionKey(): number {
  const navigation = useNavigation();
  const route = useRoute();
  const [session, setSession] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (pending.current) {
        clearTimeout(pending.current);
        pending.current = null;
        setSession((s) => s + 1);
      }
      return () => {
        const history = (navigation.getState() as { history?: { key?: string }[] } | undefined)?.history;
        if (history && !history.some((entry) => entry.key === route.key)) {
          pending.current = setTimeout(() => {
            pending.current = null;
            setSession((s) => s + 1);
          }, EDITOR_EXIT_MS);
        }
      };
    }, [navigation, route.key])
  );

  return session;
}
