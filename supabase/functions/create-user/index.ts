import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
      await supabaseAdmin.from('profiles').upsert({ id: data.user.id, full_name, role, must_change_password: true })
      return new Response(JSON.stringify({ user: data.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- GET ALL USERS (with auth details) ---
    if (action === 'get_users') {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers()
      if (error) throw error
      return new Response(JSON.stringify({ users: data.users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- GET SINGLE USER ---
    if (action === 'get_user') {
      const { user_id } = body
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(user_id)
      if (error) throw error
      return new Response(JSON.stringify({ user: data.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- UPDATE USER ---
    if (action === 'update_user') {
      const { user_id, email, full_name, role } = body
      // Update auth email if changed
      if (email) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { email })
        if (error) throw error
      }
      // Update profile
      const updates = {}
      if (full_name) updates.full_name = full_name
      if (role) updates.role = role
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from('profiles').update(updates).eq('id', user_id)
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- RESET PASSWORD (send email) ---
    if (action === 'reset_password') {
      const { email } = body
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://c4-lab.vercel.app/change-password',
      })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- SET PASSWORD DIRECTLY ---
    if (action === 'set_password') {
      const { user_id, password } = body
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- LOCK ACCOUNT ---
    if (action === 'lock_user') {
      const { user_id } = body
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: '876600h' })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- UNLOCK ACCOUNT ---
    if (action === 'unlock_user') {
      const { user_id } = body
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- DELETE USER ---
    if (action === 'delete_user') {
      const { user_id } = body
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (error) throw error
      await supabaseAdmin.from('profiles').delete().eq('id', user_id)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- INVITE CLIENT ---
    if (action === 'invite_client') {
      const { contact_name, business, email, phone, created_by } = body

      // 1. Create auth user via invite email
      const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: contact_name, role: 'client', must_change_password: true },
        redirectTo: 'https://c4-lab.vercel.app/change-password',
      })
      if (inviteError) throw inviteError

      const profileId = data.user.id

      // 2. Upsert profile record
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: profileId,
        full_name: contact_name,
        role: 'client',
        must_change_password: true,
        phone,
      })
      if (profileError) throw profileError

      // 3. Insert clients record
      const { data: clientData, error: clientError } = await supabaseAdmin
        .from('clients')
        .insert([{
          name: business,
          contact_name,
          email,
          phone,
          profile_id: profileId,
          created_by: created_by || null,
        }])
        .select()
        .single()
      if (clientError) throw clientError

      return new Response(JSON.stringify({ user: data.user, client: clientData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- UPDATE CLIENT ---
    if (action === 'update_client') {
      const { client_id, contact_name, business, email, phone, notes } = body
      const updates: Record<string, string> = {}
      if (contact_name !== undefined) updates.contact_name = contact_name
      if (business     !== undefined) updates.name          = business
      if (email        !== undefined) updates.email         = email
      if (phone        !== undefined) updates.phone         = phone
      if (notes        !== undefined) updates.notes         = notes
      const { error } = await supabaseAdmin.from('clients').update(updates).eq('id', client_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    throw new Error('Unknown action')
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})
