import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { clearLocalAppData } from '../utils/storage';
import { Session, User } from '@supabase/supabase-js';

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    session,
    user,
    loading,
    signOut: async () => {
      console.log('useAuth: signOut called');
      // 1. Clear local state immediately to update UI
      setSession(null);
      setUser(null);
      console.log('useAuth: Local state cleared');
      // 2. Wipe locally persisted/cached budget data so the next account on this
      //    device can't see (or sync up) the previous user's data.
      try {
        await clearLocalAppData();
        console.log('useAuth: Local app data cleared');
      } catch (e) {
        console.error('useAuth: Failed to clear local app data on sign out', e);
      }
      // 3. Perform actual sign out
      await supabase.auth.signOut();
      console.log('useAuth: Supabase signOut complete');
      // 4. Reload page on web to ensure clean state
      if (typeof window !== 'undefined') {
        console.log('useAuth: Reloading page...');
        window.location.href = '/';
      }
    },
  };
};
