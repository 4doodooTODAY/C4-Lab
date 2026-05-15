import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3'
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

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { filename, contentType, category, clientName, projectName, folderType, shootDate } = await req.json()

    const clientSlug  = slugify(clientName || '')
    const projectSlug = slugify(projectName || 'untitled')
    const timestamp   = Date.now()
    const safeName    = filename.replace(/[^a-zA-Z0-9._-]/g, '-')

    // Date for shoot folder name — use provided shootDate or today
    const dateStr = shootDate
      ? shootDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    let key: string
    if (folderType === 'tools' || !clientSlug) {
      // Non-project files: tools/messages, logos, etc.
      key = `tools/${category}/${timestamp}-${safeName}`
    } else {
      // Project shoot files: clients/{client}/shoots/{project} {date}/{category}/
      const shootFolder = `${projectSlug} ${dateStr}`
      key = `clients/${clientSlug}/shoots/${shootFolder}/${category}/${timestamp}-${safeName}`
    }

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })
    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`

    return new Response(JSON.stringify({ uploadUrl, publicUrl, key }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
