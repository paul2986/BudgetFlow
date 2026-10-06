import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../utils/supabase';
import { clearLocalAppData, clearUnownedDeviceData, forgetRememberedBudget } from '../utils/storage';
import { setAuthNotice } from '../utils/authNotice';
import { Session, User } from '@supabase/supabase-js';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Permanently deletes the account and its synced data, then signs out. Throws on failure. */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * The one place the signed-in session lives (app/_layout.tsx). Every screen reads
 * it through useAuth, so there is one session read and one auth listener, and a
 * sign-out is seen everywhere at once.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const user = session?.user ?? null;

  useEffect(() => {
    // Signed out (including a session ended from another device): data on this
    // device with no recorded owner is a leftover and is cleared before anyone
    // signs in (see claimDeviceData).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) await clearUnownedDeviceData();
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearUnownedDeviceData();
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Shared by sign-out and account deletion.
  const endSession = useCallback(async (scope: 'global' | 'local') => {
    // 1. Clear local state immediately to update UI
    setSession(null);
    // 2. Wipe locally persisted/cached budget data so the next account on this
    //    device can't see (or sync up) the previous user's data.
    try {
      await clearLocalAppData();
    } catch (e) {
      console.error('useAuth: Failed to clear local app data on sign out', e);
    }
    // 3. Perform actual sign out
    await supabase.auth.signOut({ scope });
    // 4. Reload page on web to ensure clean state. (Native also defines
    //    `window`, but has no `location`; AuthGuard shows sign-in there.)
    if (Platform.OS === 'web') {
      window.location.href = '/';
    }
  }, []);

  const signOut = useCallback(() => endSession('global'), [endSession]);

  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) throw error;
    if (user) await forgetRememberedBudget(user.id).catch(() => undefined);
    // Shown by AuthGuard on the signed-out screen.
    setAuthNotice('account-deleted');
    // The server session no longer exists, so only clear this device's copy.
    await endSession('local');
  }, [user, endSession]);

  const value = useMemo(
    () => ({ session, user, loading, signOut, deleteAccount }),
    [session, user, loading, signOut, deleteAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
