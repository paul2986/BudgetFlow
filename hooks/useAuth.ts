import { useMemo } from 'react';

export const useAuth = () => {
  const user = useMemo(() => ({
    id: 'user_1',
    email: 'test@example.com',
  } as any), []);

  const session = useMemo(() => ({
    user,
    access_token: 'mock-token',
  } as any), [user]);

  return useMemo(() => ({
    session,
    user,
    loading: false,
    signOut: async () => {
      console.log('mock useAuth: signOut');
    },
  }), [session, user]);
};
