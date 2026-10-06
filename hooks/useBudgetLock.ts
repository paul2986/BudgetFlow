import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Budget } from '../types/budget';
import { isBudgetLocked, unlockSession } from '../utils/budgetLock';
import { authenticateWithBiometrics, getBiometricKind, type BiometricKind } from '../utils/biometrics';
import {
  checkCode as checkCodeAction,
  lockNow as lockNowAction,
  removeLock as removeLockAction,
  resetLockWithPassword as resetAction,
  setAutoLock as setAutoLockAction,
  setBiometrics as setBiometricsAction,
  setCode as setCodeAction,
  unlockAfterBiometrics,
} from '../utils/budgetLockActions';
import { useBudgetData } from './useBudgetData';

type Result = { success: boolean; error?: Error };

// Face ID can be asked for once at a time: a second request while its prompt is up would fail
// the first (the lock showing on two screens at once, or a tap on the button during the automatic ask).
let biometricPromptOpen = false;

/**
 * Budget lock, for the screens: whether a budget is locked on this device now, and
 * the things to do about it (see utils/budgetLockActions.ts for what they do).
 * A change is written to the device and then shown, so every screen using the
 * budget sees it at once.
 */
export function useBudgetLock() {
  const { refreshData } = useBudgetData();
  // Re-render, and hand out a new `isLocked`, whenever something is locked or unlocked here,
  // so a `useMemo` that depends on it re-runs.
  const unlockVersion = useSyncExternalStore(unlockSession.subscribe, unlockSession.getVersion, unlockSession.getVersion);

  const [biometric, setBiometric] = useState<BiometricKind | null>(null);
  // False until the device has said what it can do, so "no Face ID" isn't mistaken for "not asked yet".
  const [biometricChecked, setBiometricChecked] = useState(false);
  const checkBiometrics = useCallback(async () => {
    const kind = await getBiometricKind();
    setBiometric(kind);
    setBiometricChecked(true);
    return kind;
  }, []);
  useEffect(() => {
    checkBiometrics();
  }, [checkBiometrics]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isLocked = useCallback((budget: Budget | undefined | null): boolean => isBudgetLocked(budget), [unlockVersion]);

  // The action has changed what this device holds; have the screens read it again.
  const shown = useCallback(
    async <T extends Result>(change: Promise<T>): Promise<T> => {
      const result = await change;
      if (result.success) await refreshData(true);
      return result;
    },
    [refreshData]
  );

  const setCode = useCallback((budgetId: string, pin: string) => shown(setCodeAction(budgetId, pin)), [shown]);
  const removeLock = useCallback((budgetId: string) => shown(removeLockAction(budgetId)), [shown]);
  const setAutoLock = useCallback((budgetId: string, minutes: number) => shown(setAutoLockAction(budgetId, minutes)), [shown]);
  const lockNow = useCallback((budgetId: string) => shown(lockNowAction(budgetId)), [shown]);
  const setBiometrics = useCallback((budgetId: string, enabled: boolean) => shown(setBiometricsAction(budgetId, enabled)), [shown]);

  const checkCode = useCallback(
    async (budgetId: string, pin: string, options?: { unlock?: boolean }) => {
      const check = await checkCodeAction(budgetId, pin, options);
      // A "never lock again" budget remembers it in storage; the screens read that from the app data.
      if (check.ok && options?.unlock !== false) await refreshData(true);
      return check;
    },
    [refreshData]
  );

  /**
   * Ask Face ID / Touch ID. 'unlocked' when it opened the budget, 'declined' when the person cancelled
   * or it didn't match, 'busy' when another ask is already on screen (which says nothing either way).
   */
  const unlockWithBiometrics = useCallback(
    async (budget: Budget): Promise<'unlocked' | 'declined' | 'busy'> => {
      if (biometricPromptOpen) return 'busy';
      biometricPromptOpen = true;
      try {
        if (!(await authenticateWithBiometrics(`Unlock ${budget.name}`))) return 'declined';
      } finally {
        biometricPromptOpen = false;
      }
      await unlockAfterBiometrics(budget.id);
      await refreshData(true);
      return 'unlocked';
    },
    [refreshData]
  );

  /**
   * Turn on Face ID / Touch ID for a budget on this device, after it has recognised the
   * person once, so what is saved is known to work.
   */
  const enableBiometrics = useCallback(
    async (budget: Budget): Promise<boolean> => {
      if (!(await authenticateWithBiometrics(`Use ${biometric ?? 'biometrics'} to unlock ${budget.name}`))) return false;
      return (await setBiometrics(budget.id, true)).success;
    },
    [biometric, setBiometrics]
  );

  const resetLockWithPassword = useCallback(
    async (budgetId: string, email: string, password: string) => {
      const result = await resetAction(budgetId, email, password);
      if (result.ok) await refreshData(true);
      return result;
    },
    [refreshData]
  );

  return {
    /** Face ID, Touch ID or generic biometrics when this device has it set up; null otherwise. */
    biometric,
    biometricChecked,
    checkBiometrics,
    isLocked,
    setCode,
    removeLock,
    setAutoLock,
    lockNow,
    setBiometrics,
    checkCode,
    unlockWithBiometrics,
    enableBiometrics,
    resetLockWithPassword,
  };
}
