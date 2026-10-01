import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clientIp, withinLimits } from '../_shared/rateLimit.ts'
import { requireRole, forbidden } from '../_shared/auth.ts'

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
// person clicks there. So email security scanners can't burn the link.
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
      subject: isInvite ? 'Welcome to C4C Lab. Set up your account' : 'Reset your C4C Lab password',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
            <div style="width:36px;height:36px;border-radius:10px;background:#6C63FF;color:#fff;font-weight:700;font-size:15px;line-height:36px;text-align:center">C4</div>
            <div style="font-weight:600;color:#111827">C4C Lab</div>
          </div>
          <h2 style="margin:0 0 8px;color:#111827;font-size:20px">${isInvite ? `Hi ${name || 'there'}, your account is ready` : 'Reset your password'}</h2>
          <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px">
            ${isInvite
              ? 'Your team at Connect Four Creative set you up on C4C Lab. Where you can review your content, leave feedback, and download your files. Click below to create your password.'
              : 'Click below to choose a new password for your C4C Lab account.'}
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
// link points at our /change-password page with token_hash. The token is only
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
    // Every action except the public forgot-password requires an admin, or the
    // service role key for backend calls. This function can set any user's
    // password and delete any account, so the gate here is the whole ballgame.
    //
    // It used to read the role claim out of the JWT with atob() and trust it.
    // A JWT payload is base64, not a signature: anyone could send
    // Bearer <anything>.<base64 of {"role":"service_role"}>.<anything> and be
    // treated as the backend, then call set_password on any account. Both
    // checks now verify: the service role path compares the real key, and the
    // admin path validates the token against the auth server.
    if (action !== 'forgot_password') {
      const caller = await requireRole(supabaseAdmin, req, ['admin'])
      if (!caller) return forbidden(corsHeaders, 'admin only')
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

      // The only action here with no admin gate, so it is the only one a bot
      // can reach. Unlimited, it is a free mail bomb aimed at any address the
      // attacker chooses, billed to our Resend account.
      //   per IP    5/hour   nobody forgets their password five times an hour
      //   per email 3/hour   caps what one victim can be sent
      //   global  100/hour   ceiling on a distributed run
      const ip = clientIp(req)
      const allowed = await withinLimits(supabaseAdmin, [
        { bucket: 'forgot:ip',     identifier: ip,               max: 5,   windowSeconds: 3600 },
        { bucket: 'forgot:email',  identifier: String(email || ''), max: 3, windowSeconds: 3600 },
        { bucket: 'forgot:global', identifier: 'all',            max: 100, windowSeconds: 3600 },
      ])
      // Still a 200 with the same shape as success. Telling a bot it hit a
      // limit is a signal; the whole point of this endpoint is to reveal
      // nothing about which addresses exist or what state they are in.
      if (!allowed) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
        })
      }

      try {
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email })
        if (!error && data?.properties?.hashed_token) {
          const link = `${APP_URL}/change-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`
          await sendAuthEmail(email, '', link, 'recovery')
        }
      } catch { /* swallow. Never reveal whether an email exists */ }
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
      if (kind !== 'invite') {
        const { data: prior } = await supabaseAdmin
          .from('profiles').select('role').eq('id', profileId).maybeSingle()
        if (prior?.role && prior.role !== 'client') {
          throw new Error('That email belongs to a team account. Use a different email for the client login.')
        }
      }

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

    // ── CLIENT PEOPLE (multiple logins on one client account) ───────────────
    // Done here rather than with createUser + a client_members insert from the
    // browser, because the plain invite action upserts the profile's role. Adding
    // a teammate's email to a client that way would quietly demote them to a
    // client. These actions refuse any email that belongs to a team account.

    // --- LIST CLIENT PEOPLE (with emails + sign-in state from auth) ---
    if (action === 'list_client_members') {
      const { client_id } = body
      const [{ data: client }, { data: rows, error }] = await Promise.all([
        supabaseAdmin.from('clients').select('profile_id').eq('id', client_id).single(),
        supabaseAdmin.from('client_members')
          .select('profile_id, created_at, profiles(full_name, avatar_url, must_change_password)')
          .eq('client_id', client_id)
          .order('created_at'),
      ])
      if (error) throw error
      const members = await Promise.all((rows || []).map(async (r: any) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(r.profile_id)
        const u = data?.user
        return {
          profile_id:      r.profile_id,
          full_name:       r.profiles?.full_name ?? '',
          avatar_url:      r.profiles?.avatar_url ?? null,
          email:           u?.email ?? '',
          pending:         !!r.profiles?.must_change_password || !u?.last_sign_in_at,
          locked:          !!u?.banned_until && new Date(u.banned_until) > new Date(),
          last_sign_in_at: u?.last_sign_in_at ?? null,
          is_primary:      r.profile_id === client?.profile_id,
          added_at:        r.created_at,
        }
      }))
      return new Response(JSON.stringify({ members }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- ADD A PERSON TO AN EXISTING CLIENT ---
    if (action === 'add_client_member') {
      const { client_id } = body
      const email = String(body.email || '').trim().toLowerCase()
      const full_name = String(body.full_name || '').trim()
      if (!client_id || !email || !full_name) throw new Error('Name and email are required.')

      const { data: client, error: clientErr } = await supabaseAdmin
        .from('clients').select('id, name, profile_id').eq('id', client_id).single()
      if (clientErr || !client) throw new Error('Client not found.')

      // Resolves to the existing account when the email is already registered
      const { userId, kind, link } = await makeSetupLink(supabaseAdmin, email, {
        full_name, role: 'client', must_change_password: true,
      })

      // kind === 'invite' means the auth user was just created. Don't read the
      // profile role in that case: a DB trigger may have stamped a default.
      const isNew = kind === 'invite'
      const { data: existing } = isNew ? { data: null } : await supabaseAdmin
        .from('profiles').select('role, must_change_password').eq('id', userId).maybeSingle()
      if (existing?.role && existing.role !== 'client') {
        throw new Error('That email belongs to a team account. Use a different email for the client login.')
      }

      // One person, one client: the portal resolves a single client per login
      const { data: other } = await supabaseAdmin
        .from('client_members').select('client_id, clients(name)')
        .eq('profile_id', userId).neq('client_id', client_id).limit(1).maybeSingle()
      if (other) {
        throw new Error(`${email} already signs in to ${other.clients?.name || 'another client'}. Remove them there first.`)
      }

      const needsSetup = isNew || !existing || !!existing.must_change_password
      if (isNew || !existing) {
        const { error: pErr } = await supabaseAdmin.from('profiles').upsert({
          id: userId, full_name, role: 'client', must_change_password: true,
        }, { onConflict: 'id' })
        if (pErr) throw new Error('Profile error: ' + pErr.message)
      }
      // A DB trigger can create the profile with a default role first
      await supabaseAdmin.from('profiles').update({ role: 'client' }).eq('id', userId)

      const { error: mErr } = await supabaseAdmin.from('client_members')
        .upsert({ client_id, profile_id: userId }, { onConflict: 'client_id,profile_id' })
      if (mErr) throw new Error('Membership error: ' + mErr.message)

      // A client with no primary login (contact-only record) adopts this person
      if (!client.profile_id) {
        await supabaseAdmin.from('clients').update({ profile_id: userId }).eq('id', client_id)
      }

      // Re-adding someone who was removed earlier lifts the lock from that removal
      await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: 'none' })

      // People who already have a password just gain access; no email needed
      let emailed = false
      if (needsSetup) {
        emailed = true
        try { await sendAuthEmail(email, full_name, link, kind) }
        catch (e) { emailed = false; console.error('member invite email failed:', e) }
      }

      return new Response(JSON.stringify({
        user: { id: userId, email },
        invited: needsSetup,
        emailed,
        invite_link: needsSetup ? link : null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // --- REMOVE A PERSON FROM A CLIENT ---
    // Their account is locked, not deleted, so comments and approvals they left
    // keep their author. Adding them back unlocks it.
    if (action === 'remove_client_member') {
      const { client_id, profile_id } = body
      const { data: client } = await supabaseAdmin
        .from('clients').select('profile_id').eq('id', client_id).single()

      const { error } = await supabaseAdmin.from('client_members')
        .delete().eq('client_id', client_id).eq('profile_id', profile_id)
      if (error) throw error

      // Removing the primary login hands primary to whoever was added next
      if (client?.profile_id === profile_id) {
        const { data: next } = await supabaseAdmin.from('client_members')
          .select('profile_id').eq('client_id', client_id)
          .order('created_at').limit(1).maybeSingle()
        await supabaseAdmin.from('clients')
          .update({ profile_id: next?.profile_id ?? null }).eq('id', client_id)
      }

      const [{ count }, { data: prof }] = await Promise.all([
        supabaseAdmin.from('client_members')
          .select('client_id', { count: 'exact', head: true }).eq('profile_id', profile_id),
        supabaseAdmin.from('profiles').select('role').eq('id', profile_id).maybeSingle(),
      ])
      if (!count && prof?.role === 'client') {
        await supabaseAdmin.auth.admin.updateUserById(profile_id, { ban_duration: '876600h' })
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }

    // --- MAKE A PERSON THE CLIENT'S PRIMARY CONTACT ---
    if (action === 'set_client_primary') {
      const { client_id, profile_id } = body
      const { data: m } = await supabaseAdmin.from('client_members')
        .select('profile_id').eq('client_id', client_id).eq('profile_id', profile_id).maybeSingle()
      if (!m) throw new Error('That person is not on this client.')
      const [{ data: prof }, { data: authData }] = await Promise.all([
        supabaseAdmin.from('profiles').select('full_name').eq('id', profile_id).maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(profile_id),
      ])
      const updates: Record<string, unknown> = { profile_id }
      if (prof?.full_name) updates.contact_name = prof.full_name
      if (authData?.user?.email) updates.email = authData.user.email
      const { error } = await supabaseAdmin.from('clients').update(updates).eq('id', client_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), {
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
