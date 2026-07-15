import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_URL        = Deno.env.get('APP_URL') ?? 'https://c4clab.com'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
// Sends from the verified c4clab.com domain; replies land in the real inbox.
const FROM           = 'C4C Lab <hello@c4clab.com>'
const REPLY_TO       = 'yourmove@connectfourcreative.com'

// ── Branded auth email via Resend ─────────────────────────────────────────────
// Invite links carry token_hash to OUR page; nothing is redeemed until the
// person clicks there — so email security scanners can't burn the link.
async function sendAuthEmail(to: string, name: string, link: string, kind: 'invite' | 'recovery') {
  if (!RESEND_API_KEY) throw new Error('email not configured')
  const isInvite = kind === 'invite'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: isInvite ? 'Welcome to C4 Lab — set up your account' : 'Reset your C4 Lab password',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;border-radius:10px;background:#6C63FF;color:#fff;font-weight:700;font-size:15px;line-height:36px;text-align:center">C4</div>
            <div style="font-weight:600;color:#111827">C4 Lab</div>
          </div>
          <h2 style="margin:0 0 8px;color:#111827;font-size:20px">${isInvite ? `Hi ${name || 'there'}, your account is ready` : 'Reset your password'}</h2>
          <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px">
            ${isInvite
              ? 'Your team at Connect Four Creative set you up on C4 Lab — where you can review your content, leave feedback, and download your files. Click below to create your password.'
              : 'Click below to choose a new password for your C4 Lab account.'}
          </p>
          <a href="${link}" style="display:inline-block;background:#6C63FF;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px">
            ${isInvite ? 'Set Up My Account' : 'Reset Password'}
          </a>
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:24px 0 0">
            This link is for you only and expires after use. If you weren't expecting this email, you can ignore it.
          </p>
        </div>`,
    }),
  })
  if (!res.ok) throw new Error(`email send failed: ${await res.text()}`)
}

// ── Generate a scanner-proof setup link ────────────────────────────────────────
// New users → invite token; existing users → recovery token. Either way the
// link points at our /change-password page with token_hash — the token is only
// redeemed when the person clicks "Set up my account" there.
// deno-lint-ignore no-explicit-any
async function makeSetupLink(admin: any, email: string, meta: Record<string, unknown>) {
  let { data, error } = await admin.auth.admin.generateLink({
    type: 'invite', email, options: { data: meta },
  })
  let kind: 'invite' | 'recovery' = 'invite'
  if (error && /already|registered|exists/i.test(error.message)) {
    ;({ data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email }))
    kind = 'recovery'
  }
  if (error) throw new Error('link error: ' + error.message)
  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) throw new Error('no token in generated link')
  return {
    userId: data.user.id as string,
    kind,
    link: `${APP_URL}/change-password?token_hash=${encodeURIComponent(tokenHash)}&type=${kind}`,
  }
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

    // ── Admin gate ─────────────────────────────────────────────────────────
    // Every action except the public forgot-password requires an admin JWT
    // (or the service-role key for backend calls). This function can delete
    // users — it must never be callable by ordinary logged-in users.
    if (action !== 'forgot_password') {
      const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      let allowed = false
      try {
        const payload = JSON.parse(atob(jwt.split('.')[1] || ''))
        if (payload.role === 'service_role') allowed = true
      } catch { /* not a service key */ }
      if (!allowed) {
        const { data: { user } } = await supabaseAdmin.auth.getUser(jwt)
        if (user) {
          const { data: prof } = await supabaseAdmin
            .from('profiles').select('role').eq('id', user.id).maybeSingle()
          allowed = prof?.role === 'admin'
        }
      }
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'admin only' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
        })
      }
    }

    // --- INVITE USER (team members + standalone client accounts) ---
    if (!action || action === 'invite' || action === 'resend_invite') {
      const { email, full_name, role } = body
      const { userId, kind, link } = await makeSetupLink(supabaseAdmin, email, {
        full_name, role, must_change_password: true,
      })
      if (action !== 'resend_invite') {
        await supabaseAdmin.from('profiles').upsert({
          id: userId, full_name, role, must_change_password: true,
        })
      }
      // Email is best-effort: if the sender domain isn't verified yet, the
      // invite still succeeds and the admin gets the link to share directly.
      let emailed = true
      try { await sendAuthEmail(email, full_name, link, kind) }
      catch (e) { emailed = false; console.error('invite email failed:', e) }
      return new Response(JSON.stringify({ user: { id: userId, email }, invite_link: link, emailed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- ADMIN-TRIGGERED PASSWORD RESET ---
    if (action === 'reset_password') {
      const { email } = body
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })
      if (error) throw error
      const link = `${APP_URL}/change-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`
      await sendAuthEmail(email, '', link, 'recovery')
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- PUBLIC FORGOT PASSWORD (called from the login page) ---
    if (action === 'forgot_password') {
      const { email } = body
      try {
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })
        if (!error && data?.properties?.hashed_token) {
          const link = `${APP_URL}/change-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`
          await sendAuthEmail(email, '', link, 'recovery')
        }
      } catch { /* swallow — never reveal whether an email exists */ }
      // Always succeed so the form can't be used to probe for accounts
      return new Response(JSON.stringify({ success: true }), {
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

    // --- UPDATE USER PROFILE FIELDS ---
    if (action === 'update_user') {
      const { user_id, full_name, role, tags, email } = body
      if (email) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { email, email_confirm: true })
        if (error) throw error
      }
      const updates: Record<string, unknown> = {}
      if (full_name !== undefined) updates.full_name = full_name
      if (role      !== undefined) updates.role      = role
      if (tags      !== undefined) updates.tags      = tags
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from('profiles').update(updates).eq('id', user_id)
      }
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

    // --- INVITE CLIENT (creates client record + login) ---
    if (action === 'invite_client') {
      const { contact_name, business, email, phone, created_by } = body

      const { userId: profileId, kind, link } = await makeSetupLink(supabaseAdmin, email, {
        full_name: contact_name, role: 'client', must_change_password: true,
      })

      // Upsert profile, then force-update role in case a DB trigger set a default
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id: profileId,
        full_name: contact_name,
        role: 'client',
        must_change_password: true,
        phone,
      }, { onConflict: 'id' })
      if (profileError) throw new Error('Profile error: ' + profileError.message)
      await supabaseAdmin.from('profiles').update({ role: 'client' }).eq('id', profileId)

      // Upsert client record
      const { data: clientData, error: clientError } = await supabaseAdmin
        .from('clients')
        .upsert([{
          name: business,
          contact_name,
          email,
          phone,
          profile_id: profileId,
          created_by: created_by || null,
        }], { onConflict: 'profile_id' })
        .select()
        .single()
      if (clientError) throw new Error('Client error: ' + clientError.message)

      // Keep client_members in sync (multi-account support)
      await supabaseAdmin.from('client_members')
        .upsert({ client_id: clientData.id, profile_id: profileId }, { onConflict: 'client_id,profile_id' })

      let emailed = true
      try { await sendAuthEmail(email, contact_name, link, kind) }
      catch (e) { emailed = false; console.error('invite email failed:', e) }

      return new Response(JSON.stringify({ user: { id: profileId, email }, client: clientData, invite_link: link, emailed }), {
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
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})
