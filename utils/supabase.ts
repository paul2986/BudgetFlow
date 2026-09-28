import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
        'Missing Supabase environment variables. Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your .env file.'
    );
}

const isWeb = Platform.OS === 'web';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        // Web keeps supabase-js's default (localStorage). Native has no
        // localStorage, so without this the session lives in memory only and
        // the user is signed out every time the app is relaunched.
        ...(isWeb ? {} : { storage: AsyncStorage }),
        persistSession: true,
        autoRefreshToken: true,
        // Only a browser has a URL to read a session from.
        detectSessionInUrl: isWeb,
    },
});

// Native: pause token refresh while backgrounded and resume on foreground,
// since timers don't run reliably when the app is suspended.
if (!isWeb) {
    AppState.addEventListener('change', (state) => {
        if (state === 'active') {
            supabase.auth.startAutoRefresh();
        } else {
            supabase.auth.stopAutoRefresh();
        }
    });
}

export const AUTH_REDIRECT = process.env.EXPO_PUBLIC_AUTH_REDIRECT || 'budgetflow://auth/callback';
export const AUTH_REDIRECT_HTTPS = process.env.EXPO_PUBLIC_AUTH_REDIRECT_HTTPS || 'https://budget-flow-blue.vercel.app/auth/callback';
