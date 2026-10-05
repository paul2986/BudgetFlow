import { describe, expect, it } from 'vitest';
import { isExistingAccountSignUp } from '../../utils/signUpResult';

describe('isExistingAccountSignUp', () => {
  it('recognises the error confirmation-off servers give', () => {
    expect(isExistingAccountSignUp(null, { code: 'user_already_exists', message: 'User already registered' })).toBe(true);
    expect(isExistingAccountSignUp(null, { message: 'User already registered' })).toBe(true);
  });

  it('recognises the look-alike success confirmation-on servers give: a user with no identities', () => {
    expect(isExistingAccountSignUp({ user: { identities: [] } }, null)).toBe(true);
  });

  it('is false for a real new account, confirmed or not', () => {
    expect(isExistingAccountSignUp({ user: { identities: [{ id: 'x' }] } }, null)).toBe(false);
  });

  it('is false for other errors, and when the server says nothing about identities', () => {
    expect(isExistingAccountSignUp(null, { code: 'weak_password', message: 'Password is too short' })).toBe(false);
    expect(isExistingAccountSignUp({ user: {} }, null)).toBe(false);
    expect(isExistingAccountSignUp({ user: { identities: null } }, null)).toBe(false);
    expect(isExistingAccountSignUp({ user: null }, null)).toBe(false);
    expect(isExistingAccountSignUp(undefined, undefined)).toBe(false);
  });
});
