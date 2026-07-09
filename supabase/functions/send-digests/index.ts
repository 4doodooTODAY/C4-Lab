// send-digests — cadence-aware digest push notifications for all roles.
//
// Called hourly by pg_cron ({ cron: true }). Idempotent: digest_log's PK
// (user_id, period_key) guarantees at most one digest per user per period,
// so extra invocations (or an outsider poking the endpoint) can never
// double-notify anyone.
//
// Also handles { test: true } with the caller's JWT — sends an immediate
// "notifications are working" push to that user only (used by Settings).
//
// Windows (UTC): daily → every day 15:00; weekly → Monday 15:00;
// biweekly → Monday of even ISO weeks 15:00; off → never.
//
// Deploy: supabase functions deploy send-digests --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const APP_URL = Deno.env.get('APP_URL') ?? 'https://c4-lab.vercel.app'
const SEND_HOUR_UTC = 15 // ~morning US

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:yourmove@connectfourcreative.com',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
)

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: t.getUTCFullYear(), week }
}

// Returns the period key if this user's cadence is due right now, else null.
function duePeriodKey(cadence: string, now: Date): string | null {
  if (cadence === 'off') return null
  if (now.getUTCHours() !== SEND_HOUR_UTC) return null
  const dateKey = now.toISOString().slice(0, 10)
  const { year, week } = isoWeek(now)
  const isMonday = now.getUTCDay() === 1
  if (cadence === 'daily') return `daily-${dateKey}`
  if (cadence === 'weekly' && isMonday) return `weekly-${year}-${week}`
  if (cadence === 'biweekly' && isMonday && week % 2 === 0) return `biweekly-${year}-${week}`
  return null
}

// deno-lint-ignore no-explicit-any
async function pushToUser(supabase: any, userId: string, payload: object): Promise<number> {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('profile_id', userId)
    .eq('platform', 'web')
  let sent = 0
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify(payload),
      )
      sent++
    } catch (err) {
      // 404/410 = gone; 403 = VAPID mismatch (stale key) — prune either way
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410 || code === 403) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }
  }
  return sent
}

// ── Digest builders ───────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function buildTeamDigest(supabase: any, userId: string, role: string) {
  // Projects assigned to this user (admins: all active projects)
  let q = supabase.from('projects')
    .select('id, name, stage, due_date')
    .neq('stage', 'archived').neq('stage', 'delivered')
  if (role !== 'admin') q = q.or(`creative_id.eq.${userId},editor_id.eq.${userId}`)
  const { data: projects } = await q
  if (!projects?.length) return null

  const overdue = projects.filter((p: { due_date?: string }) =>
    p.due_date && p.due_date < new Date().toISOString().slice(0, 10)).length
  const inReview = projects.filter((p: { stage: string }) =>
    ['review', 'revisions'].includes(p.stage)).length

  const bits = [`${projects.length} active project${projects.length !== 1 ? 's' : ''}`]
  if (overdue) bits.push(`${overdue} overdue`)
  if (inReview) bits.push(`${inReview} in review`)
  return {
    title: role === 'admin' ? 'C4 Lab — studio digest' : 'C4 Lab — your projects',
    body: bits.join(' · '),
    url: `${APP_URL}/projects`,
  }
}

// deno-lint-ignore no-explicit-any
async function buildClientDigest(supabase: any, userId: string) {
  const { data: clientRow } = await supabase
    .from('clients').select('id').eq('profile_id', userId).maybeSingle()
  if (!clientRow) return null

  const { data: projects } = await supabase
    .from('projects').select('id, name, stage')
    .eq('client_id', clientRow.id).neq('status', 'archived')
  if (!projects?.length) return null
  const ids = projects.map((p: { id: string }) => p.id)

  const { data: revs } = await supabase
    .from('project_revisions')
    .select('project_id, status')
    .in('project_id', ids)

  const awaiting = new Set(
    (revs || []).filter((r: { status: string }) => r.status === 'pending_client_review')
      .map((r: { project_id: string }) => r.project_id),
  ).size
  const reviewed = new Set(
    (revs || []).filter((r: { status: string }) => ['approved', 'pending_editor'].includes(r.status))
      .map((r: { project_id: string }) => r.project_id),
  ).size
  if (!awaiting && !reviewed) return null

  const bits = []
  if (awaiting) bits.push(`${awaiting} project${awaiting !== 1 ? 's' : ''} awaiting your review`)
  if (reviewed) bits.push(`${reviewed} you've reviewed`)
  return {
    title: 'C4 Lab — your review digest',
    body: bits.join(' · '),
    url: `${APP_URL}/my-projects`,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  let body: { cron?: boolean; test?: boolean } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  // ── Test push: authenticated user pings themselves ────────────────────────
  if (body.test) {
    const jwt = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'auth required' }, 401)
    const { data: { user }, error } = await supabase.auth.getUser(jwt)
    if (error || !user) return json({ error: 'invalid token' }, 401)
    const sent = await pushToUser(supabase, user.id, {
      title: 'C4 Lab notifications are on',
      body: 'This is how your digests will arrive.',
      url: APP_URL,
    })
    return json({ sent })
  }

  // ── Digest run (cron) ──────────────────────────────────────────────────────
  const now = new Date()
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('user_id, cadence, profiles!inner(role)')
  let sentCount = 0

  for (const pref of prefs || []) {
    const periodKey = duePeriodKey(pref.cadence, now)
    if (!periodKey) continue

    // Idempotency claim FIRST — a PK conflict means already sent this period.
    const { error: logErr } = await supabase
      .from('digest_log')
      .insert({ user_id: pref.user_id, period_key: periodKey })
    if (logErr) continue // duplicate → someone already sent it

    // deno-lint-ignore no-explicit-any
    const role = (pref.profiles as any)?.role || 'client'
    const digest = role === 'client'
      ? await buildClientDigest(supabase, pref.user_id)
      : await buildTeamDigest(supabase, pref.user_id, role)

    if (!digest) continue // nothing to report — stay silent, no spam
    sentCount += await pushToUser(supabase, pref.user_id, digest)
  }

  return json({ ok: true, pushes: sentCount })
})
