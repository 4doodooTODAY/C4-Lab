import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  PutBucketCorsCommand,
} from 'npm:@aws-sdk/client-s3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const R2_ACCOUNT_ID  = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const R2_ACCESS_KEY  = Deno.env.get('R2_ACCESS_KEY_ID') ?? ''
const R2_SECRET_KEY  = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? ''
const R2_BUCKET      = Deno.env.get('R2_BUCKET_NAME') ?? 'c4-lab-files'
const R2_PUBLIC_URL  = Deno.env.get('R2_PUBLIC_URL') ?? ''

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

function sanitize(str: string): string {
  // Keep the real name — just strip filesystem-unsafe chars
  return (str || 'Unknown').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Unknown'
}

function buildKey(body: any): string {
  const { filename, category, clientName, projectName, folderType } = body
  const client  = sanitize(clientName  || '')
  const project = sanitize(projectName || 'Untitled')
  const safeName = filename  // keep original name, only strip truly unsafe chars
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .trim()

  // Determine subfolder from category
  const folderMap: Record<string, string> = {
    footage:   'Footage',
    revisions: 'Cuts',
    photos:    'Photos',
    assets:    'Assets',
  }
  const subfolder = folderMap[category] ?? category ?? 'Files'

  if (folderType === 'tools' || !client) {
    return `_Tools/${subfolder}/${safeName}`
  }

  // Clean structure: {Client}/{Project}/{Footage|Cuts|Photos}/{filename}
  return `${client}/${project}/${subfolder}/${safeName}`
}

function publicUrlFor(key: string): string {
  return R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { action } = body

    // ── One-time: write the bucket CORS policy so browser PUTs are allowed ────
    // Browser uploads send a preflight (OPTIONS) before the presigned PUT;
    // without an allowing CORS rule R2 rejects it and the upload fails with a
    // generic network error. This sets a permissive-but-scoped policy.
    if (action === 'set-cors') {
      await s3.send(new PutBucketCorsCommand({
        Bucket: R2_BUCKET,
        CORSConfiguration: {
          CORSRules: [{
            AllowedOrigins: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD', 'DELETE'],
            AllowedHeaders: ['*'],
            ExposeHeaders:  ['ETag'],
            MaxAgeSeconds:  3600,
          }],
        },
      }))
      return new Response(JSON.stringify({ success: true, bucket: R2_BUCKET }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Simple presigned PUT (small files, backward-compat) ──────────────────
    if (!action || action === 'presign') {
      const key        = buildKey(body)
      const publicUrl  = publicUrlFor(key)
      const command    = new PutObjectCommand({
        Bucket:      R2_BUCKET,
        Key:         key,
        ContentType: body.contentType || 'application/octet-stream',
      })
      const uploadUrl  = await getSignedUrl(s3, command, { expiresIn: 3600 })
      return new Response(JSON.stringify({ uploadUrl, publicUrl, key }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Multipart: init — create upload + return presigned URLs for all parts ─
    if (action === 'multipart-init') {
      const { key: providedKey, contentType, partCount } = body
      const key       = providedKey || buildKey(body)
      const publicUrl = publicUrlFor(key)

      // Create multipart upload
      const { UploadId } = await s3.send(new CreateMultipartUploadCommand({
        Bucket:      R2_BUCKET,
        Key:         key,
        ContentType: contentType || 'application/octet-stream',
      }))

      // Generate a presigned URL for every part in parallel
      const partUrls = await Promise.all(
        Array.from({ length: partCount }, (_, i) =>
          getSignedUrl(s3, new UploadPartCommand({
            Bucket:     R2_BUCKET,
            Key:        key,
            UploadId:   UploadId!,
            PartNumber: i + 1,
          }), { expiresIn: 3600 })
        )
      )

      return new Response(JSON.stringify({ uploadId: UploadId, partUrls, key, publicUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Multipart: complete ──────────────────────────────────────────────────
    // ETags can't be read client-side (CORS blocks the header), so we
    // ListParts server-side to get the real ETags, then complete.
    if (action === 'multipart-complete') {
      const { key, uploadId } = body

      // Collect all parts R2 actually received, with their server ETags
      const parts: { PartNumber: number; ETag: string }[] = []
      let partMarker: number | undefined
      do {
        const listRes = await s3.send(new ListPartsCommand({
          Bucket:           R2_BUCKET,
          Key:              key,
          UploadId:         uploadId,
          PartNumberMarker: partMarker,
        }))
        for (const p of listRes.Parts ?? []) {
          parts.push({ PartNumber: p.PartNumber!, ETag: p.ETag! })
        }
        partMarker = listRes.IsTruncated ? listRes.NextPartNumberMarker : undefined
      } while (partMarker)

      if (parts.length === 0) throw new Error('No parts found — upload may have failed')

      parts.sort((a, b) => a.PartNumber - b.PartNumber)

      await s3.send(new CompleteMultipartUploadCommand({
        Bucket:          R2_BUCKET,
        Key:             key,
        UploadId:        uploadId,
        MultipartUpload: { Parts: parts },
      }))
      return new Response(JSON.stringify({ success: true, publicUrl: publicUrlFor(key) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Multipart: abort (cleanup on error) ──────────────────────────────────
    if (action === 'multipart-abort') {
      const { key, uploadId } = body
      await s3.send(new AbortMultipartUploadCommand({
        Bucket:   R2_BUCKET,
        Key:      key,
        UploadId: uploadId,
      }))
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
