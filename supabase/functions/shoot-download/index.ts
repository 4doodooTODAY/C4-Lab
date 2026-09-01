// shoot-download. Validates a phone-gate claim token and returns a signed
// URL to the ORIGINAL file in the private shoot-originals bucket.
// Anon never sees original paths; this function is the only download door.
//
// POST { claim: uuid, imageId: uuid }        → { url, fileName }
// POST { claim: uuid, all: true }            → { files: [{ url, fileName }] }
//
// Deploy: supabase functions deploy shoot-download --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2'
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3'

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

function makeR2Client() {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')!
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    },
  })
}

// Extract the R2 object key from a public R2 URL.
function extractR2Key(url: string): string | null {
  const base = Deno.env.get('R2_PUBLIC_URL')?.replace(/\/$/, '')
  if (base && url.startsWith(base)) {
    return url.slice(base.length).replace(/^\//, '')
  }
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return null
  }
}

async function presignR2Download(key: string, fileName: string | null): Promise<string> {
  const client = makeR2Client()
  const safeName = (fileName ?? 'download').replace(/"/g, '\\"')
  const cmd = new GetObjectCommand({
    Bucket: Deno.env.get('R2_BUCKET_NAME') || 'c4-lab-files',
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  })
  return getSignedUrl(client, cmd, { expiresIn: 600 })
}

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
  // mode 'stream' → inline playback URL (no attachment disposition), for video
  const stream = mode === 'stream'
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

  // 2. Resolve image(s). Must belong to the claimed shoot.
  let imgQuery = supabase
    .from('one_off_shoot_images')
    .select('id, original_path, file_name')
    .eq('shoot_id', claimRow.shoot_id)
    .is('deleted_at', null)
  if (!all) imgQuery = imgQuery.eq('id', imageId!)

  const { data: images, error: imgErr } = await imgQuery
  if (imgErr) return json({ error: 'image lookup failed' }, 500)
  if (!images?.length) return json({ error: 'image not found' }, 404)

  // 3. Sign URLs (10 min). Download disposition by default; stream omits it.
  // R2-hosted files (synced from project shoots) are presigned here so the
  // server sets Content-Disposition — this is what makes iOS trigger "Save to
  // Photos" when the client uses the Web Share API or a.download fallback.
  // Stream mode returns the raw public URL so the browser can play inline.
  const signed: { url: string; fileName: string }[] = []
  for (const img of images) {
    if (/^https?:\/\//.test(img.original_path)) {
      if (!stream) {
        const key = extractR2Key(img.original_path)
        if (key) {
          try {
            const url = await presignR2Download(key, img.file_name)
            signed.push({ url, fileName: img.file_name })
            continue
          } catch (e) {
            console.error('R2 presign failed, falling back to raw URL', e)
          }
        }
      }
      // Stream mode or presign failure: raw public URL
      signed.push({ url: img.original_path, fileName: img.file_name })
      continue
    }
    // Supabase storage path
    const { data, error } = await supabase.storage
      .from('shoot-originals')
      .createSignedUrl(img.original_path, 600, stream ? undefined : { download: img.file_name })
    if (error || !data?.signedUrl) continue
    signed.push({ url: data.signedUrl, fileName: img.file_name })
  }
  if (!signed.length) return json({ error: 'signing failed' }, 500)

  return all ? json({ files: signed }) : json({ url: signed[0].url, fileName: signed[0].fileName })
})
