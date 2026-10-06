import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { Budget, BudgetLockSettings } from '../types/budget';

// Budget lock rules, with nothing from React or the device in them so the
// same code runs (and is tested) everywhere. What is on the server, what a
// device keeps to itself, and when a budget counts as locked:
//
//   synced (budget_locks, per account)   locked, autoLockMinutes, pinVerifier
//   this device only                     biometrics, lastUnlockAt, and which
//                                        budgets are unlocked right now
//
// This is a screen lock for whoever picks up the device. The code is four digits and
// the budget itself is not encrypted, so it is not protection for the data.

export const PIN_LENGTH = 4;

/** Auto-lock times. 0 locks as soon as the app is left; -1 never locks again by itself. */
export const AUTO_LOCK_IMMEDIATELY = 0;
export const AUTO_LOCK_NEVER = -1;

export const isValidPin = (pin: unknown): pin is string => typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

// A slow hash makes guessing no faster for someone holding the verifier than for
// someone trying codes at the keypad, within reason; four digits are four digits
// (10,000 tries) whatever is done to them. Pure JavaScript, so kept modest: it
// runs on every attempt, on a phone's interpreter. The count is stored with the
// hash, so it can be raised later without locking anyone out.
const ITERATIONS = 5000;
const VERIFIER_PREFIX = 'v1';

const asciiBytes = (text: string): Uint8Array => Uint8Array.from(text, (ch) => ch.charCodeAt(0));

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (webCrypto?.getRandomValues) return webCrypto.getRandomValues(bytes);
  // Native without a Web Crypto: a salt only has to differ from other salts.
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
};

const derive = (pin: string, salt: Uint8Array, iterations: number): string =>
  bytesToHex(pbkdf2(sha256, asciiBytes(pin), salt, { c: iterations, dkLen: 32 }));

/** What is stored in place of the code: "v1$<iterations>$<salt>$<hash>". */
export const createPinVerifier = (pin: string): string => {
  if (!isValidPin(pin)) throw new Error(`The code must be ${PIN_LENGTH} digits`);
  const salt = randomBytes(16);
  return [VERIFIER_PREFIX, ITERATIONS, bytesToHex(salt), derive(pin, salt, ITERATIONS)].join('$');
};

export const verifyPin = (pin: string, verifier: string | undefined): boolean => {
  if (!isValidPin(pin) || !verifier) return false;
  const [version, count, saltHex, hash] = verifier.split('$');
  const iterations = Number(count);
  if (version !== VERIFIER_PREFIX || !Number.isInteger(iterations) || iterations < 1 || !saltHex || !hash) return false;
  let salt: Uint8Array;
  try {
    salt = hexToBytes(saltHex);
  } catch {
    return false;
  }
  const attempt = derive(pin, salt, iterations);
  if (attempt.length !== hash.length) return false;
  // Same time whichever digit differs.
  let diff = 0;
  for (let i = 0; i < attempt.length; i++) diff |= attempt.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
};

// ---------------------------------------------------------------------------
// Wrong codes
// ---------------------------------------------------------------------------

export interface AttemptState {
  /** Wrong codes in a row since the last right one. */
  failures: number;
  /** Epoch millis before which no code is accepted. */
  blockedUntil: number;
}

/** Wrong codes in a row before the waits begin. */
export const FREE_ATTEMPTS = 5;
const WAITS_SECONDS = [30, 60, 5 * 60, 15 * 60, 60 * 60];

export const NO_ATTEMPTS: AttemptState = { failures: 0, blockedUntil: 0 };

/** The state after a wrong code: from the fifth in a row, a wait that grows. */
export const afterWrongCode = (state: AttemptState, now: number): AttemptState => {
  const failures = state.failures + 1;
  const step = failures - FREE_ATTEMPTS;
  return {
    failures,
    blockedUntil: step < 0 ? 0 : now + WAITS_SECONDS[Math.min(step, WAITS_SECONDS.length - 1)] * 1000,
  };
};

/** Whole seconds until a code is accepted again; 0 when it is now. */
export const waitSeconds = (state: AttemptState, now: number): number => Math.max(0, Math.ceil((state.blockedUntil - now) / 1000));

export const describeWait = (seconds: number): string =>
  seconds >= 60 ? `${Math.ceil(seconds / 60)} ${Math.ceil(seconds / 60) === 1 ? 'minute' : 'minutes'}` : `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;

// ---------------------------------------------------------------------------
// The server's lock and the device's
// ---------------------------------------------------------------------------

export interface ServerLock {
  pin_verifier: string;
  auto_lock_minutes: number;
}

/** A budget is locked when it has a code; a lock without one (from before codes) is no lock. */
export const hasLock = (budget: Pick<Budget, 'lock'> | undefined | null): boolean => !!budget?.lock?.locked && !!budget.lock.pinVerifier;

/** The synced part of two locks is the same (what this device does with it is not compared). */
export const sameLockConfig = (a: BudgetLockSettings | undefined, b: BudgetLockSettings | undefined): boolean =>
  !!a?.locked === !!b?.locked &&
  (a?.autoLockMinutes ?? 0) === (b?.autoLockMinutes ?? 0) &&
  (a?.pinVerifier ?? '') === (b?.pinVerifier ?? '');

/**
 * This device's lock for a budget once the server has said what the account's lock is
 * (`row` undefined: there is none). What belongs to the device is kept as long as it
 * still applies: Face ID stays while the budget stays locked, and "unlocked, never lock
 * again" stays only for the code it was unlocked with.
 */
export const lockFromServer = (local: BudgetLockSettings | undefined, row: ServerLock | undefined): BudgetLockSettings => {
  if (!row) return { locked: false, autoLockMinutes: AUTO_LOCK_IMMEDIATELY };
  const sameCode = local?.pinVerifier === row.pin_verifier;
  return {
    locked: true,
    autoLockMinutes: row.auto_lock_minutes,
    pinVerifier: row.pin_verifier,
    ...(sameCode && local?.lastUnlockAt ? { lastUnlockAt: local.lastUnlockAt } : {}),
    ...(local?.biometrics ? { biometrics: true } : {}),
  };
};

// ---------------------------------------------------------------------------
// Which budgets are unlocked on this device right now
// ---------------------------------------------------------------------------

/**
 * Held in memory, so quitting the app or reloading the page locks everything again
 * (except budgets set to never lock; those are remembered on the device, see
 * `isBudgetLocked`). Leaving the app starts a clock: "immediately" locks at once,
 * and a number of minutes locks if the app stays away that long. The clock is checked
 * whenever it is asked, so a budget is never shown for a moment on the way back.
 */
export class UnlockSession {
  private unlockedWith = new Map<string, string>();
  private leftAt: number | null = null;
  private version = 0;
  private listeners = new Set<() => void>();

  constructor(private now: () => number = Date.now) {}

  private changed() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  /** Unlocked with the code whose verifier this is; a different code later means locked again. */
  unlock(budgetId: string, verifier: string) {
    this.unlockedWith.set(budgetId, verifier);
    this.changed();
  }

  lock(budgetId: string) {
    if (this.unlockedWith.delete(budgetId)) this.changed();
  }

  lockAll() {
    if (this.unlockedWith.size === 0) return;
    this.unlockedWith.clear();
    this.changed();
  }

  isUnlocked(budgetId: string, autoLockMinutes: number, verifier: string | undefined): boolean {
    if (!verifier || this.unlockedWith.get(budgetId) !== verifier) return false;
    if (this.leftAt === null || autoLockMinutes < 0) return true;
    return autoLockMinutes > 0 && this.now() - this.leftAt < autoLockMinutes * 60_000;
  }

  /** The app went to the background (or the page was hidden). */
  left() {
    if (this.leftAt === null) this.leftAt = this.now();
    this.changed();
  }

  /**
   * The app is back. `settings` are the budgets' locks; any that ran out while it was away
   * lock for good (it isn't enough that the clock is checked on the way: if it were
   * to leave and return quickly, the earlier absence would otherwise be forgotten).
   */
  returned(settings: Map<string, BudgetLockSettings | undefined>) {
    if (this.leftAt === null) return;
    for (const [budgetId, verifier] of Array.from(this.unlockedWith)) {
      const lock = settings.get(budgetId);
      if (!this.isUnlocked(budgetId, lock?.autoLockMinutes ?? AUTO_LOCK_IMMEDIATELY, verifier)) this.unlockedWith.delete(budgetId);
    }
    this.leftAt = null;
    this.changed();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;
}

export const unlockSession = new UnlockSession();

/** Whether a budget is behind its lock on this device now. */
export const isBudgetLocked = (budget: Budget | undefined | null, session: UnlockSession = unlockSession): boolean => {
  if (!budget || !hasLock(budget)) return false;
  const lock = budget.lock!;
  // "Never lock again" is the one setting that survives quitting the app.
  if (lock.autoLockMinutes === AUTO_LOCK_NEVER && lock.lastUnlockAt) return false;
  return !session.isUnlocked(budget.id, lock.autoLockMinutes, lock.pinVerifier);
};
