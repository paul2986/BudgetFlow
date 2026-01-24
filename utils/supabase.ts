import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
        'Missing Supabase environment variables. Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your .env file.'
    );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

export const AUTH_REDIRECT = process.env.EXPO_PUBLIC_AUTH_REDIRECT || 'budgetflow://auth/callback';
export const AUTH_REDIRECT_HTTPS = process.env.EXPO_PUBLIC_AUTH_REDIRECT_HTTPS || 'https://budget-flow-blue.vercel.app/auth/callback';
