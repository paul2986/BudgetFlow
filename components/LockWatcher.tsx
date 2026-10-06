import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useBudgetData } from '../hooks/useBudgetData';
import { unlockSession } from '../utils/budgetLock';

/**
 * Starts and stops the budget lock's clock as the app is left and returned to
 * (on the web, as the tab is hidden and shown). Renders nothing. Only
 * "background" counts as leaving: Face ID's own prompt, the notification
 * shade and the app switcher on its way up all pass through "inactive".
 */
export default function LockWatcher() {
  const { appData } = useBudgetData();
  const budgetsRef = useRef(appData.budgets);
  budgetsRef.current = appData.budgets;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') unlockSession.left();
      else if (state === 'active') unlockSession.returned(new Map(budgetsRef.current.map((b) => [b.id, b.lock])));
    });
    return () => subscription.remove();
  }, []);

  return null;
}
