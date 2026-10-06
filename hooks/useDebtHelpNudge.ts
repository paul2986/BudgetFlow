import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCurrency } from './useCurrency';
import type { BudgetReview } from '../utils/budgetReview';
import { debtHelpSignal, isNudgeDismissed, type DebtHelpSignal } from '../utils/debtHelpNudge';
import { isUkCurrency } from '../utils/debtHelp';

/**
 * Whether to show the Debt help prompt now, and how to dismiss it.
 *
 * Shown only to UK users (pounds), for a budget that shows a sign (see
 * utils/debtHelpNudge.ts), and not within 30 days of a "Not now". The dismissal is
 * a per-device preference, not part of any budget, and is shared by every place the
 * prompt appears: the Overview and Budget review are both tabs that stay mounted,
 * so a "Not now" in one has to reach the other without a reload.
 */

const STORAGE_KEY = 'debt_help_nudge_dismissed_at';

// -1: not read from storage yet (show nothing, so a dismissed prompt never flashes); 0: never dismissed.
let snapshot = -1;
const listeners = new Set<() => void>();
let loadStarted = false;

const publish = (value: number) => {
  snapshot = value;
  listeners.forEach((listener) => listener());
};

const load = () => {
  if (loadStarted) return;
  loadStarted = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((saved) => {
      const at = saved ? Number(saved) : 0;
      publish(Number.isFinite(at) && at > 0 ? at : 0);
    })
    // Storage unavailable: carry on as never dismissed rather than hide help for good.
    .catch(() => publish(0));
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useDebtHelpNudge(review: BudgetReview | null): { signal: DebtHelpSignal | null; dismiss: () => void } {
  const { currency, loading: currencyLoading } = useCurrency();
  const dismissedAt = useSyncExternalStore(subscribe, () => snapshot, () => -1);

  useEffect(load, []);

  const dismiss = useCallback(() => {
    const now = Date.now();
    publish(now);
    AsyncStorage.setItem(STORAGE_KEY, String(now)).catch((e) => console.warn('useDebtHelpNudge: could not save dismissal', e));
  }, []);

  const eligible = !currencyLoading && isUkCurrency(currency.code) && dismissedAt !== -1;
  const hidden = isNudgeDismissed(dismissedAt > 0 ? dismissedAt : null, Date.now());
  return { signal: eligible && !hidden ? debtHelpSignal(review) : null, dismiss };
}
