/**
 * Whether a sign-up attempt was for an email that already has an account.
 *
 * With email confirmation off the server says so: a `user_already_exists`
 * error. With it on, the server answers as if the sign-up worked, so as not to
 * reveal which emails are registered, but the user it hands back has no
 * identities (a real new account has one). Without telling these apart, the
 * second case would send someone who already has an account to a "Check your
 * email" screen for an email that is never sent.
 */
export const isExistingAccountSignUp = (
  data: { user: { identities?: unknown[] | null } | null } | null | undefined,
  error: { code?: string; message?: string } | null | undefined
): boolean => {
  if (error) return error.code === 'user_already_exists' || /already registered/i.test(error.message ?? '');
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
};
