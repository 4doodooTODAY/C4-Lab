import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')    ?? ''
const FROM_EMAIL        = 'yourmove@connectfourcreative.com'
const APP_URL           = 'https://c4-lab.vercel.app'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(`mailto:${FROM_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Supabase webhook sends { type, table, record, old_record, schema }
    const body = await req.json()
    const notification = body.record ?? body.notification

    if (!notification?.profile_id) {
      throw new Error('No notification data')
    }

    // Get recipient's auth email
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(notification.profile_id)
    const recipientEmail = user?.email

    // Get push subscriptions
    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('profile_id', notification.profile_id)

    // ── Send push notifications ────────────────────────────────────────────────
    if (VAPID_PUBLIC_KEY && subs?.length) {
      await Promise.all(subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            JSON.stringify({
              title: notification.title,
              body:  notification.body  || '',
              url:   `${APP_URL}${notification.link || '/'}`,
              icon:  `${APP_URL}/favicon.ico`,
            })
          )
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }))
    }

    // ── Send email via Resend ──────────────────────────────────────────────────
    if (RESEND_API_KEY && recipientEmail) {
      const actionUrl = `${APP_URL}${notification.link || '/'}`
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `C4 Lab <${FROM_EMAIL}>`,
          to: [recipientEmail],
          subject: notification.title,
          html: `
            <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                <div style="width:36px;height:36px;background:#6C63FF;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                  <span style="color:white;font-weight:700;font-size:14px;">C4</span>
                </div>
                <div>
                  <div style="font-weight:600;font-size:14px;color:#111;">C4 Lab</div>
                  <div style="font-size:12px;color:#888;">Connect Four Creative</div>
                </div>
              </div>
              <h2 style="font-size:18px;font-weight:700;color:#111;margin:0 0 8px;">${notification.title}</h2>
              ${notification.body ? `<p style="font-size:14px;color:#555;margin:0 0 24px;">${notification.body}</p>` : ''}
              <a href="${actionUrl}" style="display:inline-block;background:#6C63FF;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">
                Open C4 Lab →
              </a>
              <p style="font-size:11px;color:#aaa;margin-top:32px;">
                You're receiving this because you're part of the C4 Lab workspace.
              </p>
            </div>
          `,
        }),
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
