
// This file has been removed as part of the offline-first refactor
// Authentication is no longer used in this app

export const useAuth = () => {
  console.warn('useAuth is deprecated. This app no longer uses authentication.');
  return {
    user: null,
    loading: false,
    signIn: async () => ({ error: new Error('Authentication disabled') }),
    signOut: async () => ({ error: new Error('Authentication disabled') }),
    signUp: async () => ({ error: new Error('Authentication disabled') }),
  };
};
