import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const SUPABASE_URL = 'https://mjcdgsfgmafzplaqsmxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_W3CorTAoeq6Dckyfb9AjVA_CKkIn4eb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

export const AUTH_REDIRECT = 'budgetflow://auth/callback';
export const AUTH_REDIRECT_HTTPS = 'https://budget-flow-blue.vercel.app/auth/callback';
