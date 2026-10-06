import { describe, expect, it } from 'vitest';
import { isNewAccount } from '../../utils/newAccount';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

describe('isNewAccount', () => {
  it('is true for an account confirmed in the last day', () => {
    expect(isNewAccount({ email_confirmed_at: ago(0.1), created_at: ago(0.1) }, NOW)).toBe(true);
    expect(isNewAccount({ email_confirmed_at: ago(23), created_at: ago(23) }, NOW)).toBe(true);
  });

  it('is false once it is more than a day old', () => {
    expect(isNewAccount({ email_confirmed_at: ago(25), created_at: ago(25) }, NOW)).toBe(false);
    expect(isNewAccount({ email_confirmed_at: ago(24 * 30), created_at: ago(24 * 30) }, NOW)).toBe(false);
  });

  it('goes by when it was confirmed, not when it was created', () => {
    // Signed up last week, confirmed today: new to the app.
    expect(isNewAccount({ email_confirmed_at: ago(2), created_at: ago(24 * 7) }, NOW)).toBe(true);
    // Created and confirmed long ago.
    expect(isNewAccount({ email_confirmed_at: ago(24 * 7), created_at: ago(24 * 7) }, NOW)).toBe(false);
  });

  it('falls back to creation time when there is no confirmation time', () => {
    expect(isNewAccount({ created_at: ago(1) }, NOW)).toBe(true);
    expect(isNewAccount({ email_confirmed_at: null, created_at: ago(48) }, NOW)).toBe(false);
  });

  it('treats a time in the future (a device clock running behind) as new', () => {
    expect(isNewAccount({ email_confirmed_at: ago(-2), created_at: ago(-2) }, NOW)).toBe(true);
  });

  it('is false when it cannot tell', () => {
    expect(isNewAccount(null, NOW)).toBe(false);
    expect(isNewAccount({}, NOW)).toBe(false);
    expect(isNewAccount({ created_at: 'not a date' }, NOW)).toBe(false);
  });
});
