import { S3Client, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const R2_ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID') ?? ''
const R2_SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? ''
const R2_BUCKET     = Deno.env.get('R2_BUCKET_NAME') ?? 'c4-lab-files'
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') ?? ''

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify admin role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') throw new Error('Only admins can delete files')

    // Get the file key from request
    const { uploadId, key, fileUrl } = await req.json()

    // Derive key from URL if not provided directly
    let objectKey = key
    if (!objectKey && fileUrl && R2_PUBLIC_URL) {
      objectKey = fileUrl.replace(R2_PUBLIC_URL + '/', '')
    }

    if (!objectKey) throw new Error('No file key provided')

    // Delete from R2
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }))

    // Delete DB record if uploadId provided
    if (uploadId) {
      const serviceSupabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      await serviceSupabase.from('shoot_uploads').delete().eq('id', uploadId)
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
