// Deletes the calling user's account and their synced budget data. Removing the
// auth user cascades to their budget memberships; the database then deletes
// budgets nobody else shares and hands shared ones to the next member.
// Required by App Store Review Guideline 5.1.1(v): apps that allow account
// creation must let users delete their account from within the app.
//
// Deploy: supabase functions deploy delete-account --project-ref <ref>
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in' }, 401);

    const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Resolve the user from their own token, so a caller can only delete themselves.
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Not signed in' }, 401);

    const { error: dataError } = await admin.from('user_data').delete().eq('user_id', user.id);
    if (dataError) {
        console.error('delete-account: failed to delete user_data', dataError);
        return json({ error: 'Could not delete account data' }, 500);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
        console.error('delete-account: failed to delete auth user', deleteError);
        return json({ error: 'Could not delete account' }, 500);
    }

    return json({ success: true });
});
