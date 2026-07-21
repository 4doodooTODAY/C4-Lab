// join-waitlist. Public endpoint for the sign-in-page waitlist form.
// Stores { name, email, notes } and emails yourmove@connectfourcreative.com
// once per signup via Resend. Deduplicates by email (returns 'already').
//
// Deploy: supabase functions deploy join-waitlist --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const NOTIFY_EMAIL   = 'yourmove@connectfourcreative.com'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: { name?: string; email?: string; notes?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid body' }, 400) }

  const name  = (body.name || '').trim().slice(0, 120)
  const email = (body.email || '').trim().toLowerCase().slice(0, 200)
  const notes = (body.notes || '').trim().slice(0, 1000)

  if (!name) return json({ error: 'name required' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'valid email required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error } = await supabase.from('waitlist').insert({ email, name, notes: notes || null })
  if (error) {
    if (error.code === '23505') return json({ status: 'already' })
    return json({ error: 'could not save' }, 500)
  }

  // One email per signup. Email failure never breaks the signup itself.
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'C4C Lab <hello@c4clab.com>',
          to: [NOTIFY_EMAIL],
          reply_to: email,
          subject: `Waitlist signup: ${name}`,
          html: `
            <div style="font-family:-apple-system,sans-serif;max-width:520px">
              <h2 style="margin:0 0 12px">New waitlist signup</h2>
              <table style="font-size:14px;line-height:1.7">
                <tr><td style="color:#6b7280;padding-right:16px">Name</td><td><strong>${esc(name)}</strong></td></tr>
                <tr><td style="color:#6b7280;padding-right:16px">Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
                <tr><td style="color:#6b7280;padding-right:16px;vertical-align:top">Notes</td><td>${notes ? esc(notes) : '<em style="color:#9ca3af">none</em>'}</td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin-top:16px">Reply to this email to reach them directly.</p>
            </div>`,
        }),
      })
    } catch (e) {
      console.error('waitlist email failed:', e)
    }
  }

  return json({ status: 'success' })
})
