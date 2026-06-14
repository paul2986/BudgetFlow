import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
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
      // 2. Perform actual sign out
      await supabase.auth.signOut();
      console.log('useAuth: Supabase signOut complete');
      // 3. Reload page on web to ensure clean state
      if (typeof window !== 'undefined') {
        console.log('useAuth: Reloading page...');
        window.location.href = '/';
      }
    },
  };
};
