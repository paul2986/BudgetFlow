import { beforeEach, describe, expect, it, vi } from 'vitest';

// An invite link opened before signing in has to survive sign-up, including a
// confirmation email opened somewhere that doesn't share the browser's storage.
const TOKEN = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const OTHER = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

const supabase = vi.hoisted(() => ({ auth: { updateUser: vi.fn(async () => ({ error: null })) } }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('../../utils/supabase', () => ({ supabase, AUTH_REDIRECT_HTTPS: 'https://example.test/' }));

const storage = new Map<string, string>();
const browser = { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) }, location: { pathname: '/' } };
vi.stubGlobal('window', browser);

const sharing = await import('../../utils/sharing');

beforeEach(() => {
  storage.clear();
  browser.location.pathname = '/';
  supabase.auth.updateUser.mockClear();
});

describe('remembering an invite link', () => {
  it('keeps the token of an /invite/ page, and only that', () => {
    browser.location.pathname = '/people';
    sharing.rememberInviteFromUrl();
    expect(sharing.peekPendingInvite()).toBeNull();

    browser.location.pathname = `/invite/${TOKEN}`;
    sharing.rememberInviteFromUrl();
    expect(sharing.peekPendingInvite()).toBe(TOKEN);
  });

  it('can be remembered on request, e.g. across the sign-out that switches accounts', () => {
    sharing.rememberInvite(TOKEN);
    expect(sharing.peekPendingInvite()).toBe(TOKEN);
  });

  it('will not remember something that is not a token', () => {
    sharing.rememberInvite('not a token');
    expect(storage.has('pending_budget_invite')).toBe(false);
  });

  it('peeking leaves it in place', () => {
    storage.set('pending_budget_invite', TOKEN);
    sharing.peekPendingInvite();
    expect(sharing.peekPendingInvite()).toBe(TOKEN);
  });

  it('ignores a stored value that is not a token', () => {
    storage.set('pending_budget_invite', 'not a token');
    expect(sharing.peekPendingInvite()).toBeNull();
  });
});

describe('the invite waiting for an account', () => {
  it('is the one stored on the account, even when this browser remembers nothing', () => {
    expect(sharing.pendingInviteFor({ user_metadata: { pending_invite: TOKEN } })).toBe(TOKEN);
  });

  it('prefers the account’s over the browser’s', () => {
    storage.set('pending_budget_invite', OTHER);
    expect(sharing.pendingInviteFor({ user_metadata: { pending_invite: TOKEN } })).toBe(TOKEN);
  });

  it('falls back to the browser’s, and to nothing', () => {
    expect(sharing.pendingInviteFor({ user_metadata: {} })).toBeNull();
    storage.set('pending_budget_invite', OTHER);
    expect(sharing.pendingInviteFor({ user_metadata: {} })).toBe(OTHER);
    expect(sharing.pendingInviteFor(null)).toBe(OTHER);
  });

  it('ignores metadata that is not a token', () => {
    expect(sharing.pendingInviteFor({ user_metadata: { pending_invite: 'x' } })).toBeNull();
    expect(sharing.pendingInviteFor({ user_metadata: { pending_invite: 42 } })).toBeNull();
  });
});

describe('sign-up data and clearing', () => {
  it('records the invite on a new account only when there is one', () => {
    expect(sharing.inviteSignUpData(TOKEN)).toEqual({ pending_invite: TOKEN });
    expect(sharing.inviteSignUpData(null)).toBeUndefined();
  });

  it('clears the browser’s copy and the account’s', async () => {
    storage.set('pending_budget_invite', TOKEN);
    await sharing.clearPendingInvite({ user_metadata: { pending_invite: TOKEN } });
    expect(storage.has('pending_budget_invite')).toBe(false);
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { pending_invite: null } });
  });

  it('does not touch the account when nothing is stored on it', async () => {
    storage.set('pending_budget_invite', TOKEN);
    await sharing.clearPendingInvite({ user_metadata: {} });
    expect(storage.has('pending_budget_invite')).toBe(false);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('survives the account update failing', async () => {
    supabase.auth.updateUser.mockRejectedValueOnce(new Error('offline'));
    await expect(sharing.clearPendingInvite({ user_metadata: { pending_invite: TOKEN } })).resolves.toBeUndefined();
  });
});
