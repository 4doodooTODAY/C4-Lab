// Vercel Serverless Function — Supabase keep-alive.
//
// Free-tier Supabase projects PAUSE after ~7 days with no activity, and the
// first request after a pause is very slow ("everything feels slow all of a
// sudden"). A Vercel Cron Job (see vercel.json -> "crons") calls this endpoint
// on a schedule so the database is touched regularly and never idles long
// enough to pause.
//
// This does NOT lift the free-tier compute throttle — that requires upgrading
// to Supabase Pro in the dashboard. It only prevents the inactivity pause.
//
// Uses the env vars the app already has on Vercel (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY), so no extra configuration is needed.

export default async function handler(req, res) {
  const base = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!base || !key) {
    return res.status(500).json({ ok: false, error: 'Missing Supabase env vars' })
  }

  const url = `${base}/rest/v1/projects?select=id&limit=1`
  try {
    const r = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    // Any HTTP response means the database + API answered and is awake.
    return res.status(200).json({ ok: true, supabaseStatus: r.status, at: new Date().toISOString() })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) })
  }
}
