/**
 * Whether an account is new to the app: confirmed (or, with no confirmation
 * step, created) in the last day. Used to leave "Welcome back!" off a first
 * sign-in; the screen a new person lands on already greets them.
 *
 * The server's last-sign-in time can't say this: confirming an email counts as
 * a sign-in, so by the time someone returns to type their password it is set.
 * When the account was confirmed is the signal that survives that detour.
 */
const NEW_FOR_MS = 24 * 60 * 60 * 1000;

export const isNewAccount = (
  user: { email_confirmed_at?: string | null; created_at?: string | null } | null | undefined,
  now: number = Date.now()
): boolean => {
  const since = Date.parse(user?.email_confirmed_at ?? user?.created_at ?? '');
  if (Number.isNaN(since)) return false;
  // A device clock running behind the server puts "since" in the future; that is still new.
  return now - since < NEW_FOR_MS;
};
