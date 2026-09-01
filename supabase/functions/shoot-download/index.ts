// shoot-download. Validates a phone-gate claim token then serves the file.
//
// Single-file mode — proxies the file directly so the browser gets it from
// this function (same CORS origin as callDownload). No second fetch to R2
// from the browser, no presigning needed, no CORS issues.
//
// POST { claim, imageId }        → file stream (Content-Disposition: attachment)
// POST { claim, imageId, mode:'stream' } → { url, fileName } (video playback)
// POST { claim, all: true }      → { files: [{ url, fileName }] } (client zip)
//
// Deploy: supabase functions deploy shoot-download --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  let body: { claim?: string; imageId?: string; all?: boolean; mode?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, 400)
  }

  const { claim, imageId, all, mode } = body
  const stream = mode === 'stream'
  if (!claim || (!imageId && !all)) return json({ error: 'claim and imageId (or all) required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Validate claim
  const { data: claimRow, error: claimErr } = await supabase
    .from('shoot_download_claims')
    .select('id, shoot_id, expires_at')
    .eq('id', claim)
    .maybeSingle()

  if (claimErr) return json({ error: 'claim lookup failed' }, 500)
  if (!claimRow) return json({ error: 'invalid claim' }, 403)
  if (new Date(claimRow.expires_at) <= new Date()) return json({ error: 'claim expired' }, 403)

  // 2. Resolve image(s)
  let imgQuery = supabase
    .from('one_off_shoot_images')
    .select('id, original_path, file_name')
    .eq('shoot_id', claimRow.shoot_id)
    .is('deleted_at', null)
  if (!all) imgQuery = imgQuery.eq('id', imageId!)

  const { data: images, error: imgErr } = await imgQuery
  if (imgErr) return json({ error: 'image lookup failed' }, 500)
  if (!images?.length) return json({ error: 'image not found' }, 404)

  // 3. Single-file download: proxy the bytes through this function.
  //    The browser calls us (CORS-enabled endpoint) instead of fetching R2 directly,
  //    which would be blocked. Stream mode skips this and returns a URL so the
  //    video element can seek/range-request freely.
  if (!all && !stream) {
    const img = images[0]
    const name = img.file_name ?? 'download'
    let upstream: Response

    if (/^https?:\/\//.test(img.original_path)) {
      // R2 public file — fetch server-to-server (no CORS restriction here)
      upstream = await fetch(img.original_path)
    } else {
      // Supabase Storage — sign, then fetch
      const { data: signed, error: signErr } = await supabase.storage
        .from('shoot-originals')
        .createSignedUrl(img.original_path, 60)
      if (signErr || !signed?.signedUrl) return json({ error: 'signing failed' }, 500)
      upstream = await fetch(signed.signedUrl)
    }

    if (!upstream.ok) return json({ error: 'file unavailable' }, 502)

    const safeName = name.replace(/"/g, '\\"')
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'X-Filename': name,
    }
    const cl = upstream.headers.get('content-length')
    if (cl) headers['Content-Length'] = cl

    return new Response(upstream.body, { status: 200, headers })
  }

  // 4. Stream mode or bulk: return signed/public URLs for the client to use directly.
  const signed: { url: string; fileName: string }[] = []
  for (const img of images) {
    const name = img.file_name ?? 'download'
    if (/^https?:\/\//.test(img.original_path)) {
      // R2 public URL — works fine for <video src> and bulk zip fetch
      signed.push({ url: img.original_path, fileName: name })
      continue
    }
    const { data, error } = await supabase.storage
      .from('shoot-originals')
      .createSignedUrl(img.original_path, 600, stream ? undefined : { download: name })
    if (error || !data?.signedUrl) continue
    signed.push({ url: data.signedUrl, fileName: name })
  }
  if (!signed.length) return json({ error: 'signing failed' }, 500)

  return all ? json({ files: signed }) : json({ url: signed[0].url, fileName: signed[0].fileName })
})
