import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await req.json()
    const { action } = body

    // --- INVITE USER ---
    if (!action || action === 'invite') {
      const { email, full_name, role } = body

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, role, must_change_password: true },
        redirectTo: 'https://c4-lab.vercel.app/change-password',
      })
      if (error) throw error

      await supabaseAdmin.from('profiles').upsert({
        id: data.user.id,
        full_name,
        role,
        must_change_password: true,
      })

      return new Response(JSON.stringify({ user: data.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // --- RESEND INVITE ---
    if (action === 'resend_invite') {
      const { email, full_name, role } = body

      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name, role, must_change_password: true },
        redirectTo: 'https://c4-lab.vercel.app/change-password',
      })
      if (error) throw error

      return new Response(JSON.stringify({ user: data.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // --- DELETE USER ---
    if (action === 'delete_user') {
      const { user_id } = body

      // Delete from auth (cascades to profiles via RLS/trigger)
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (authError) throw authError

      // Also delete profile manually to be safe
      await supabaseAdmin.from('profiles').delete().eq('id', user_id)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    throw new Error('Unknown action')

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
