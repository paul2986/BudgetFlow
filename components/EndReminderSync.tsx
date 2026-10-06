import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useBudgetData } from '../hooks/useBudgetData';
import { refreshEndReminders, useEndReminders } from '../hooks/useEndReminders';
import { clearEndReminders, initReminders, syncEndReminders } from '../utils/endReminderScheduler';

/**
 * Keeps the phone's end-of-expense reminders in step with the budgets: after a
 * change to an expense, and each time the app comes back to the front (a day
 * has passed, so some reminders have fired and others are now close enough to
 * schedule). Renders nothing. With the setting off, or no one signed in (signing
 * out erases the budgets), it removes every pending reminder instead.
 */

initReminders();

export default function EndReminderSync() {
  const { appData, loading } = useBudgetData();
  const { user, loading: authLoading } = useAuth();
  const { supported, loaded, enabled, permission } = useEndReminders();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!supported) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshEndReminders().then(() => setTick((t) => t + 1));
    });
    return () => subscription.remove();
  }, [supported]);

  const userId = user?.id;
  const budgets = appData.budgets;
  const on = enabled && permission === 'granted';

  useEffect(() => {
    // Until the session is known, "no one signed in" would cancel everything at every launch.
    if (!supported || !loaded || authLoading) return;
    if (!userId || !on) {
      clearEndReminders();
      return;
    }
    // Until the budgets have loaded, "none" would cancel every reminder only to schedule them again.
    if (loading) return;
    // Syncing brings in several changes at once; wait for them to settle.
    const timer = setTimeout(() => syncEndReminders(budgets), 800);
    return () => clearTimeout(timer);
  }, [supported, loaded, authLoading, userId, on, loading, budgets, tick]);

  return null;
}
