// shoot-download — validates a phone-gate claim token and returns a signed
// URL to the ORIGINAL file in the private shoot-originals bucket.
// Anon never sees original paths; this function is the only download door.
//
// POST { claim: uuid, imageId: uuid }        → { url, fileName }
// POST { claim: uuid, all: true }            → { files: [{ url, fileName }] }
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

  let body: { claim?: string; imageId?: string; all?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, 400)
  }

  const { claim, imageId, all } = body
  if (!claim || (!imageId && !all)) return json({ error: 'claim and imageId (or all) required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Validate the claim token: exists, not expired.
  const { data: claimRow, error: claimErr } = await supabase
    .from('shoot_download_claims')
    .select('id, shoot_id, expires_at')
    .eq('id', claim)
    .maybeSingle()

  if (claimErr) return json({ error: 'claim lookup failed' }, 500)
  if (!claimRow) return json({ error: 'invalid claim' }, 403)
  if (new Date(claimRow.expires_at) <= new Date()) return json({ error: 'claim expired' }, 403)

  // 2. Resolve image(s) — must belong to the claimed shoot.
  let imgQuery = supabase
    .from('one_off_shoot_images')
    .select('id, original_path, file_name')
    .eq('shoot_id', claimRow.shoot_id)
    .is('deleted_at', null)
  if (!all) imgQuery = imgQuery.eq('id', imageId!)

  const { data: images, error: imgErr } = await imgQuery
  if (imgErr) return json({ error: 'image lookup failed' }, 500)
  if (!images?.length) return json({ error: 'image not found' }, 404)

  // 3. Sign URLs to the untouched originals (10 min, download disposition).
  const signed: { url: string; fileName: string }[] = []
  for (const img of images) {
    const { data, error } = await supabase.storage
      .from('shoot-originals')
      .createSignedUrl(img.original_path, 600, { download: img.file_name })
    if (error || !data?.signedUrl) continue
    signed.push({ url: data.signedUrl, fileName: img.file_name })
  }
  if (!signed.length) return json({ error: 'signing failed' }, 500)

  return all ? json({ files: signed }) : json({ url: signed[0].url, fileName: signed[0].fileName })
})
