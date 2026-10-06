import { describe, expect, it, vi } from 'vitest';
import {
  AUTO_LOCK_IMMEDIATELY,
  AUTO_LOCK_NEVER,
  UnlockSession,
  afterWrongCode,
  createPinVerifier,
  describeWait,
  hasLock,
  isBudgetLocked,
  isValidPin,
  lockFromServer,
  NO_ATTEMPTS,
  sameLockConfig,
  verifyPin,
  waitSeconds,
} from '../../utils/budgetLock';
import { makeBudget } from '../helpers/fixtures';
import type { BudgetLockSettings } from '../../types/budget';

// The budget lock rules (utils/budgetLock.ts): the code, wrong guesses, what the
// account's lock does to a device's, and when a budget is open on a device.

describe('the code', () => {
  it('is exactly four digits', () => {
    expect(['0000', '1234', '9999'].every(isValidPin)).toBe(true);
    expect(['', '123', '12345', 'abcd', '12 4', '١٢٣٤', 1234, null].some(isValidPin)).toBe(false);
  });

  it('is stored as a salted hash, never as the digits', () => {
    const verifier = createPinVerifier('4821');
    expect(verifier).toMatch(/^v1\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(verifier).not.toContain('4821');
  });

  it('opens with the right code only', () => {
    const verifier = createPinVerifier('4821');
    expect(verifyPin('4821', verifier)).toBe(true);
    expect(verifyPin('4822', verifier)).toBe(false);
    expect(verifyPin('1284', verifier)).toBe(false);
    expect(verifyPin('', verifier)).toBe(false);
  });

  it('gives the same code a different hash each time, each still opening it', () => {
    const [a, b] = [createPinVerifier('0000'), createPinVerifier('0000')];
    expect(a).not.toBe(b);
    expect(verifyPin('0000', a) && verifyPin('0000', b)).toBe(true);
  });

  it('refuses to make a code of anything else', () => {
    expect(() => createPinVerifier('12')).toThrow();
  });

  it('says no, without throwing, to a verifier it can’t read', () => {
    for (const junk of [undefined, '', 'nonsense', 'v2$5000$aa$bb', 'v1$0$aa$bb', 'v1$5000$zz$bb', 'v1$5000$$']) {
      expect(verifyPin('1234', junk)).toBe(false);
    }
  });

  it('is checked with the iteration count stored in it', () => {
    // The count is part of the verifier, so it can be raised later without locking anyone out.
    const verifier = createPinVerifier('4821');
    const [version, , salt, hash] = verifier.split('$');
    expect(verifyPin('4821', [version, 7, salt, hash].join('$'))).toBe(false);
  });
});

describe('wrong codes', () => {
  const now = 1_000_000;

  it('are free for the first four', () => {
    let state = NO_ATTEMPTS;
    for (let i = 0; i < 4; i++) state = afterWrongCode(state, now);
    expect(state.failures).toBe(4);
    expect(waitSeconds(state, now)).toBe(0);
  });

  it('earn a wait from the fifth, and a longer one each time after', () => {
    let state = NO_ATTEMPTS;
    for (let i = 0; i < 5; i++) state = afterWrongCode(state, now);
    expect(waitSeconds(state, now)).toBe(30);
    const waits = [30];
    for (let i = 0; i < 6; i++) {
      state = afterWrongCode(state, now);
      waits.push(waitSeconds(state, now));
    }
    expect(waits).toEqual([30, 60, 300, 900, 3600, 3600, 3600]);
  });

  it('count down as time passes', () => {
    let state = NO_ATTEMPTS;
    for (let i = 0; i < 5; i++) state = afterWrongCode(state, now);
    expect(waitSeconds(state, now + 10_000)).toBe(20);
    expect(waitSeconds(state, now + 30_000)).toBe(0);
    expect(waitSeconds(state, now + 99_000)).toBe(0);
  });

  it('are described in plain units', () => {
    expect([1, 30, 60, 61, 300, 3600].map(describeWait)).toEqual(['1 second', '30 seconds', '1 minute', '2 minutes', '5 minutes', '60 minutes']);
  });
});

describe('the account’s lock on a device', () => {
  const row = { pin_verifier: 'v1$5000$aa$bb', auto_lock_minutes: 5 };

  it('is no lock when the account has none, whatever the device thought', () => {
    const local: BudgetLockSettings = { locked: true, autoLockMinutes: 15, pinVerifier: row.pin_verifier, biometrics: true, lastUnlockAt: 'x' };
    expect(lockFromServer(local, undefined)).toEqual({ locked: false, autoLockMinutes: AUTO_LOCK_IMMEDIATELY });
  });

  it('takes the code and the time from the server', () => {
    expect(lockFromServer({ locked: false, autoLockMinutes: 0 }, row)).toEqual({ locked: true, autoLockMinutes: 5, pinVerifier: row.pin_verifier });
  });

  it('keeps what belongs to the device while the lock stays what it was', () => {
    const local: BudgetLockSettings = { locked: true, autoLockMinutes: 0, pinVerifier: row.pin_verifier, biometrics: true, lastUnlockAt: '2026-10-06T09:00:00Z' };
    expect(lockFromServer(local, row)).toEqual({
      locked: true,
      autoLockMinutes: 5,
      pinVerifier: row.pin_verifier,
      biometrics: true,
      lastUnlockAt: '2026-10-06T09:00:00Z',
    });
  });

  it('forgets “unlocked for good” when the code was changed, but keeps Face ID', () => {
    const local: BudgetLockSettings = { locked: true, autoLockMinutes: -1, pinVerifier: 'v1$5000$old$old', biometrics: true, lastUnlockAt: '2026-10-06T09:00:00Z' };
    const next = lockFromServer(local, row);
    expect(next.lastUnlockAt).toBeUndefined();
    expect(next.biometrics).toBe(true);
  });

  it('compares only what the account decides', () => {
    const a: BudgetLockSettings = { locked: true, autoLockMinutes: 5, pinVerifier: 'p', biometrics: true, lastUnlockAt: 'x' };
    expect(sameLockConfig(a, { locked: true, autoLockMinutes: 5, pinVerifier: 'p' })).toBe(true);
    expect(sameLockConfig(a, { ...a, autoLockMinutes: 0 })).toBe(false);
    expect(sameLockConfig(a, { ...a, pinVerifier: 'q' })).toBe(false);
    expect(sameLockConfig(a, { locked: false, autoLockMinutes: 5 })).toBe(false);
    expect(sameLockConfig(undefined, { locked: false, autoLockMinutes: 0 })).toBe(true);
  });

  it('counts as a lock only with a code (one from before codes is not one)', () => {
    expect(hasLock(makeBudget({ lock: { locked: true, autoLockMinutes: 5 } }))).toBe(false);
    expect(hasLock(makeBudget({ lock: { locked: true, autoLockMinutes: 5, pinVerifier: 'p' } }))).toBe(true);
    expect(hasLock(makeBudget({ lock: { locked: false, autoLockMinutes: 5, pinVerifier: 'p' } }))).toBe(false);
    expect(hasLock(undefined)).toBe(false);
  });
});

describe('what is open on a device', () => {
  const START = 1_000_000;
  const setup = () => {
    let now = START;
    const session = new UnlockSession(() => now);
    return { session, advance: (ms: number) => (now += ms) };
  };
  const locked = (autoLockMinutes: number, extra: Partial<BudgetLockSettings> = {}) =>
    makeBudget({ id: 'b1', lock: { locked: true, autoLockMinutes, pinVerifier: 'p1', ...extra } });

  it('is locked until it is unlocked, and again once locked', () => {
    const { session } = setup();
    const budget = locked(5);
    expect(isBudgetLocked(budget, session)).toBe(true);
    session.unlock('b1', 'p1');
    expect(isBudgetLocked(budget, session)).toBe(false);
    session.lock('b1');
    expect(isBudgetLocked(budget, session)).toBe(true);
  });

  it('is never locked when it has no lock', () => {
    const { session } = setup();
    expect(isBudgetLocked(makeBudget(), session)).toBe(false);
    expect(isBudgetLocked(undefined, session)).toBe(false);
  });

  it('is locked again when the code is changed, and stays that way', () => {
    const { session } = setup();
    session.unlock('b1', 'p1');
    const changed = makeBudget({ id: 'b1', lock: { locked: true, autoLockMinutes: 5, pinVerifier: 'p2' } });
    expect(isBudgetLocked(changed, session)).toBe(true);
    // Even if the old code's lock came back, the session no longer vouches for it.
    session.unlock('b1', 'p2');
    expect(isBudgetLocked(changed, session)).toBe(false);
  });

  it('locks as soon as the app is left, when set to immediately', () => {
    const { session } = setup();
    const budget = locked(AUTO_LOCK_IMMEDIATELY);
    session.unlock('b1', 'p1');
    expect(isBudgetLocked(budget, session)).toBe(false);
    session.left();
    expect(isBudgetLocked(budget, session)).toBe(true);
  });

  it('stays open for the time given, and not a moment longer', () => {
    const { session, advance } = setup();
    const budget = locked(5);
    session.unlock('b1', 'p1');
    session.left();
    advance(4 * 60_000 + 59_000);
    expect(isBudgetLocked(budget, session)).toBe(false);
    advance(1_000);
    // Locked on the way back, before anything has had a chance to run.
    expect(isBudgetLocked(budget, session)).toBe(true);
  });

  it('forgets an absence that ran out even if the app leaves again at once', () => {
    const { session, advance } = setup();
    const budget = locked(5, {});
    const settings = new Map([['b1', budget.lock]]);
    session.unlock('b1', 'p1');
    session.left();
    advance(10 * 60_000);
    session.returned(settings);
    session.left();
    advance(1_000);
    session.returned(settings);
    expect(isBudgetLocked(budget, session)).toBe(true);
  });

  it('keeps the budgets whose time has not run out when the app returns', () => {
    const { session, advance } = setup();
    const quick = makeBudget({ id: 'quick', lock: { locked: true, autoLockMinutes: 1, pinVerifier: 'q' } });
    const slow = makeBudget({ id: 'slow', lock: { locked: true, autoLockMinutes: 60, pinVerifier: 's' } });
    session.unlock('quick', 'q');
    session.unlock('slow', 's');
    session.left();
    advance(5 * 60_000);
    session.returned(new Map([['quick', quick.lock], ['slow', slow.lock]]));
    expect(isBudgetLocked(quick, session)).toBe(true);
    expect(isBudgetLocked(slow, session)).toBe(false);
    // And a fresh absence starts its own clock.
    session.left();
    advance(61 * 60_000);
    expect(isBudgetLocked(slow, session)).toBe(true);
  });

  it('never locks by itself when set to never, and that survives quitting the app', () => {
    const { session, advance } = setup();
    const open = locked(AUTO_LOCK_NEVER, { lastUnlockAt: '2026-10-06T09:00:00Z' });
    // A fresh session (the app was quit and reopened) knows nothing, but the device remembers.
    expect(isBudgetLocked(open, session)).toBe(false);
    session.left();
    advance(7 * 24 * 60 * 60_000);
    expect(isBudgetLocked(open, session)).toBe(false);
    // Never unlocked on this device: it asks once.
    expect(isBudgetLocked(locked(AUTO_LOCK_NEVER), session)).toBe(true);
    session.unlock('b1', 'p1');
    session.left();
    advance(7 * 24 * 60 * 60_000);
    expect(isBudgetLocked(locked(AUTO_LOCK_NEVER), session)).toBe(false);
  });

  it('can lock everything at once (signing out)', () => {
    const { session } = setup();
    session.unlock('a', 'p');
    session.unlock('b', 'p');
    session.lockAll();
    expect(session.isUnlocked('a', 5, 'p') || session.isUnlocked('b', 5, 'p')).toBe(false);
  });

  it('tells whoever is watching, but only when something changed', () => {
    const { session } = setup();
    const listener = vi.fn();
    const stop = session.subscribe(listener);
    const before = session.getVersion();
    session.lock('b1'); // nothing to lock
    session.lockAll(); // nothing to lock
    expect(listener).not.toHaveBeenCalled();
    session.unlock('b1', 'p1');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getVersion()).toBe(before + 1);
    stop();
    session.lock('b1');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
