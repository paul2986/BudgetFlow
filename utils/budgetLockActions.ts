import { supabase, verifyAccountPassword } from './supabase';
import { getLockAttempts, loadAppData, saveLockAttempts, setBudgetLock } from './storage';
import {
  AUTO_LOCK_IMMEDIATELY,
  AUTO_LOCK_NEVER,
  afterWrongCode,
  createPinVerifier,
  FREE_ATTEMPTS,
  isValidPin,
  NO_ATTEMPTS,
  unlockSession,
  verifyPin,
  waitSeconds,
} from './budgetLock';

// What the lock screens do: change the account's lock on the server, then this
// device's copy of it, then what is unlocked here. Locking, unlocking and the
// code all go through here so the screens stay about the screen.

type Result = { success: boolean; error?: Error };

const fail = (message: string): Result => ({ success: false, error: new Error(message) });

const friendly = (error: { code?: string; message?: string } | null | undefined): string => {
  if (error?.code === 'P0002' || error?.code === '23503') return 'This budget hasn’t finished syncing yet. Try again in a moment.';
  if (/fetch|network|offline|timed out/i.test(error?.message || '')) return 'You need to be online to change the lock.';
  return 'Couldn’t update the lock. Please try again.';
};

const activeLock = async (budgetId: string) => (await loadAppData()).budgets.find((b) => b.id === budgetId)?.lock;

// Opened here, "never lock again" is remembered on the device; the others only in memory.
const rememberUnlock = async (budgetId: string, verifier: string, autoLockMinutes: number) => {
  unlockSession.unlock(budgetId, verifier);
  if (autoLockMinutes === AUTO_LOCK_NEVER) await setBudgetLock(budgetId, { lastUnlockAt: new Date().toISOString() });
};

/** Lock a budget with a new code (or give a locked one a new code), leaving it open on this device. */
export const setCode = async (budgetId: string, pin: string): Promise<Result> => {
  if (!isValidPin(pin)) return fail('The code must be 4 digits.');
  const autoLockMinutes = (await activeLock(budgetId))?.autoLockMinutes ?? AUTO_LOCK_IMMEDIATELY;
  const verifier = createPinVerifier(pin);
  const { error } = await supabase.rpc('set_budget_lock', {
    p_budget_id: budgetId,
    p_pin_verifier: verifier,
    p_auto_lock_minutes: autoLockMinutes,
  });
  if (error) return fail(friendly(error));
  const saved = await setBudgetLock(budgetId, { locked: true, autoLockMinutes, pinVerifier: verifier, lastUnlockAt: undefined });
  if (!saved.success) return saved;
  await saveLockAttempts(budgetId, NO_ATTEMPTS);
  await rememberUnlock(budgetId, verifier, autoLockMinutes);
  return { success: true };
};

/** Take the lock off, on every device. */
export const removeLock = async (budgetId: string): Promise<Result> => {
  const { error } = await supabase.from('budget_locks').delete().eq('budget_id', budgetId);
  if (error) return fail(friendly(error));
  unlockSession.lock(budgetId);
  await saveLockAttempts(budgetId, NO_ATTEMPTS);
  return setBudgetLock(budgetId, { locked: false, autoLockMinutes: AUTO_LOCK_IMMEDIATELY, pinVerifier: undefined, biometrics: undefined, lastUnlockAt: undefined });
};

export const setAutoLock = async (budgetId: string, autoLockMinutes: number): Promise<Result> => {
  const { data, error } = await supabase
    .from('budget_locks')
    .update({ auto_lock_minutes: autoLockMinutes })
    .eq('budget_id', budgetId)
    .select('budget_id');
  if (error) return fail(friendly(error));
  if (!data || data.length === 0) return fail('This budget isn’t locked.');
  // Only an unlocked budget gets here (its settings ask for the code first), and it
  // stays open: "never" is remembered on the device rather than in memory, so a budget
  // opened under "never" must not lock itself the moment it moves to another time.
  const verifier = (await activeLock(budgetId))?.pinVerifier;
  if (verifier) unlockSession.unlock(budgetId, verifier);
  return setBudgetLock(budgetId, {
    autoLockMinutes,
    // Open now, and (only for "never") remembered as open.
    lastUnlockAt: autoLockMinutes === AUTO_LOCK_NEVER ? new Date().toISOString() : undefined,
  });
};

/** Lock it again now, on this device. */
export const lockNow = async (budgetId: string): Promise<Result> => {
  unlockSession.lock(budgetId);
  return setBudgetLock(budgetId, { lastUnlockAt: undefined });
};

export const setBiometrics = (budgetId: string, enabled: boolean): Promise<Result> =>
  setBudgetLock(budgetId, { biometrics: enabled ? true : undefined });

export type CodeCheck = { ok: true } | { ok: false; reason: 'wrong'; triesLeft: number | null } | { ok: false; reason: 'wait'; seconds: number };

/**
 * Check a code typed for a budget on this device. Too many wrong ones in a row earn a wait that
 * grows, kept on the device so quitting the app doesn't skip it. `unlock: false` only checks the
 * code (to confirm a change) and leaves the budget as it is.
 */
export const checkCode = async (budgetId: string, pin: string, { unlock = true } = {}): Promise<CodeCheck> => {
  const lock = await activeLock(budgetId);
  if (!lock?.locked || !lock.pinVerifier) return { ok: true };
  const now = Date.now();
  const attempts = await getLockAttempts(budgetId);
  const wait = waitSeconds(attempts, now);
  if (wait > 0) return { ok: false, reason: 'wait', seconds: wait };

  if (verifyPin(pin, lock.pinVerifier)) {
    await saveLockAttempts(budgetId, NO_ATTEMPTS);
    if (unlock) await rememberUnlock(budgetId, lock.pinVerifier, lock.autoLockMinutes);
    return { ok: true };
  }
  const next = afterWrongCode(attempts, now);
  await saveLockAttempts(budgetId, next);
  const seconds = waitSeconds(next, now);
  return seconds > 0 ? { ok: false, reason: 'wait', seconds } : { ok: false, reason: 'wrong', triesLeft: Math.max(0, FREE_ATTEMPTS - next.failures) };
};

/** Open a budget after Face ID / Touch ID has recognised the person. */
export const unlockAfterBiometrics = async (budgetId: string): Promise<void> => {
  const lock = await activeLock(budgetId);
  if (!lock?.pinVerifier) return;
  await saveLockAttempts(budgetId, NO_ATTEMPTS);
  await rememberUnlock(budgetId, lock.pinVerifier, lock.autoLockMinutes);
};

export type ForgotResult = { ok: true } | { ok: false; reason: 'wrong' | 'failed'; message: string };

/**
 * A forgotten code: the account's password proves it's still them, and the lock comes off
 * (everywhere), to be turned on again with a new code.
 */
export const resetLockWithPassword = async (budgetId: string, email: string, password: string): Promise<ForgotResult> => {
  let valid: boolean;
  try {
    valid = await verifyAccountPassword(email, password);
  } catch {
    return { ok: false, reason: 'failed', message: 'Couldn’t check your password. Check your connection and try again.' };
  }
  if (!valid) return { ok: false, reason: 'wrong', message: 'That isn’t the password for this account.' };
  const removed = await removeLock(budgetId);
  return removed.success ? { ok: true } : { ok: false, reason: 'failed', message: removed.error?.message || 'Couldn’t turn the lock off.' };
};
