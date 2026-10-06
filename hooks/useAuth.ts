import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../utils/supabase';
import { clearLocalAppData, clearUnownedDeviceData, forgetRememberedBudget } from '../utils/storage';
import { setAuthNotice } from '../utils/authNotice';
import { Session, User } from '@supabase/supabase-js';

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    // Signed out (including a session ended from another device): data on this
    // device with no recorded owner is a leftover and is cleared before anyone
    // signs in (see claimDeviceData).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) await clearUnownedDeviceData();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearUnownedDeviceData();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Shared by sign-out and account deletion.
  const endSession = async (scope: 'global' | 'local') => {
    // 1. Clear local state immediately to update UI
    setSession(null);
    setUser(null);
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
  };

  return {
    session,
    user,
    loading,
    signOut: async () => {
      await endSession('global');
    },
    /** Permanently deletes the account and its synced data, then signs out. Throws on failure. */
    deleteAccount: async () => {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw error;
      if (user) await forgetRememberedBudget(user.id).catch(() => undefined);
      // Shown by AuthGuard on the signed-out screen.
      setAuthNotice('account-deleted');
      // The server session no longer exists, so only clear this device's copy.
      await endSession('local');
    },
  };
};
