import { Platform } from 'react-native';
import { supabase, AUTH_REDIRECT_HTTPS } from './supabase';

// Server calls for sharing a budget: members, invite links, joining. Budget
// contents still sync through useBudgetData; refresh it after these change
// membership so the device catches up.

export interface BudgetMember {
  userId: string;
  email: string;
  role: 'owner' | 'editor';
}

export interface BudgetInvite {
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface InvitePreview {
  budgetId: string;
  budgetName: string;
  status: 'valid' | 'used' | 'expired';
}

// Invite links open the web app, which works on any device; on native the
// app's own web address is used.
const appOrigin = () => (Platform.OS === 'web' ? `${window.location.origin}/` : AUTH_REDIRECT_HTTPS);

export const inviteLink = (token: string) => `${appOrigin()}invite/${token}`;

export const getBudgetMembers = async (budgetId: string): Promise<BudgetMember[]> => {
  const { data, error } = await supabase.rpc('get_budget_members', { p_budget_id: budgetId });
  if (error) throw error;
  return (data || []).map((m: { user_id: string; email: string; role: BudgetMember['role'] }) => ({
    userId: m.user_id,
    email: m.email,
    role: m.role,
  }));
};

// Open invites only; used and expired ones aren't worth showing.
export const getOpenInvites = async (budgetId: string): Promise<BudgetInvite[]> => {
  const { data, error } = await supabase
    .from('budget_invites')
    .select('token, created_at, expires_at')
    .eq('budget_id', budgetId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at');
  if (error) throw error;
  return (data || []).map((i) => ({ token: i.token, createdAt: i.created_at, expiresAt: i.expires_at }));
};

export const createInvite = async (budgetId: string, userId: string): Promise<BudgetInvite> => {
  const { data, error } = await supabase
    .from('budget_invites')
    .insert({ budget_id: budgetId, created_by: userId })
    .select('token, created_at, expires_at')
    .single();
  if (error) throw error;
  return { token: data.token, createdAt: data.created_at, expiresAt: data.expires_at };
};

export const revokeInvite = async (token: string): Promise<void> => {
  const { error } = await supabase.from('budget_invites').delete().eq('token', token);
  if (error) throw error;
};

export const removeMember = async (budgetId: string, userId: string): Promise<void> => {
  const { error } = await supabase.from('budget_members').delete().eq('budget_id', budgetId).eq('user_id', userId);
  if (error) throw error;
};

export const previewInvite = async (token: string): Promise<InvitePreview | null> => {
  const { data, error } = await supabase.rpc('get_budget_invite', { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  return row ? { budgetId: row.budget_id, budgetName: row.budget_name, status: row.status } : null;
};

// Join the budget an invite is for. Returns its id.
export const acceptInvite = async (token: string): Promise<string> => {
  const { data, error } = await supabase.rpc('accept_budget_invite', { p_token: token });
  if (error) {
    if (error.message.includes('already used')) throw new Error('This invite has already been used. Ask for a new one.');
    if (error.message.includes('expired')) throw new Error('This invite has expired. Ask for a new one.');
    throw new Error('This invite link doesn’t work. Ask for a new one.');
  }
  return data as string;
};

// An invite link opened while signed out survives sign-in, including the
// detour through an email confirmation link (which lands on the home page).
//
// Two copies are kept. The browser's own storage covers the same-browser case.
// A new account also carries the token in its metadata: the confirmation email
// often opens somewhere else (the phone's browser rather than the installed
// home-screen app, which keep separate storage), and the account is the one
// thing both places share.
const PENDING_INVITE_KEY = 'pending_budget_invite';
const INVITE_METADATA_KEY = 'pending_invite';
const INVITE_PATH = /^\/invite\/([0-9a-f-]{36})\/?$/i;
const INVITE_TOKEN = /^[0-9a-f-]{36}$/i;

export const rememberInviteFromUrl = () => {
  if (Platform.OS !== 'web') return;
  const match = window.location.pathname.match(INVITE_PATH);
  if (!match) return;
  try {
    window.localStorage.setItem(PENDING_INVITE_KEY, match[1]);
  } catch {
    // Private browsing: the link still works if they sign in from this page.
  }
};

/** The invite remembered in this browser, if any; leaves it in place. */
export const peekPendingInvite = (): string | null => {
  if (Platform.OS !== 'web') return null;
  try {
    const token = window.localStorage.getItem(PENDING_INVITE_KEY);
    return token && INVITE_TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
};

/** Account metadata that records the invite a new account is being created for. */
export const inviteSignUpData = (token: string | null) => (token ? { [INVITE_METADATA_KEY]: token } : undefined);

type AccountWithMetadata = { user_metadata?: Record<string, unknown> } | null | undefined;

/** The invite waiting for this account: the one stored on it, else the one this browser remembers. */
export const pendingInviteFor = (user: AccountWithMetadata): string | null => {
  const stored = user?.user_metadata?.[INVITE_METADATA_KEY];
  if (typeof stored === 'string' && INVITE_TOKEN.test(stored)) return stored;
  return peekPendingInvite();
};

/** The invite is being handled now: forget it everywhere so it doesn't reopen after the next sign-in. */
export const clearPendingInvite = async (user: AccountWithMetadata): Promise<void> => {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.removeItem(PENDING_INVITE_KEY);
    } catch {
      // Nothing stored to clear.
    }
  }
  if (user?.user_metadata?.[INVITE_METADATA_KEY] === undefined) return;
  try {
    // A null removes the key.
    await supabase.auth.updateUser({ data: { [INVITE_METADATA_KEY]: null } });
  } catch {
    // Worst case the invite offers itself once more, and says "already in".
  }
};
