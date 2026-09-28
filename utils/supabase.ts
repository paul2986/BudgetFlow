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

// Read the auth link result from the URL hash now, synchronously at load:
// supabase-js consumes and clears the hash once it has created the session.
const linkParams = new URLSearchParams(isWeb ? window.location.hash.slice(1) : '');

/** True when this page was opened from a password-reset email link. */
export const openedFromRecoveryLink = linkParams.get('type') === 'recovery';

/** Set when an email link failed, e.g. an expired or already-used reset link. */
export const authLinkError = linkParams.get('error_code')
    ? linkParams.get('error_code') === 'otp_expired'
        ? 'That link has expired or was already used. Request a new one.'
        : linkParams.get('error_description') || 'That link didn’t work. Please try again.'
    : null;

// Drop a failed link's hash before the client is created: otherwise
// supabase-js treats it as a failed sign-in and clears any existing session,
// and a reload would show the error again.
if (isWeb && authLinkError) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

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
export const AUTH_REDIRECT_HTTPS = process.env.EXPO_PUBLIC_AUTH_REDIRECT_HTTPS || 'https://budget-flow-eta.vercel.app/';

/**
 * Where email links (sign-up confirmation, password reset) return to. On web,
 * the root of the site the request came from (production, a preview or
 * localhost), so no URL needs configuring per environment; it must be in
 * Supabase's redirect allow list.
 * The root rather than /auth/callback, whose redirect could drop the URL hash
 * before supabase-js reads the session from it. Native opens the web app.
 */
export const emailLinkRedirect = () => (isWeb ? `${window.location.origin}/` : AUTH_REDIRECT_HTTPS);
