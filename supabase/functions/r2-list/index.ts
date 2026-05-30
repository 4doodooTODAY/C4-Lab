import { S3Client, ListObjectsV2Command } from 'npm:@aws-sdk/client-s3'
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

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify caller is authenticated (admin or creative/editor)
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

    const allowed = ['admin', 'creative', 'editor']
    if (!allowed.includes(profile?.role)) throw new Error('Not authorized')

    // List ALL objects in the bucket, paginating through
    let totalSize = 0
    let totalCount = 0
    let continuationToken: string | undefined = undefined

    do {
      const cmd = new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
      const res = await s3.send(cmd)
      for (const obj of res.Contents ?? []) {
        totalSize  += obj.Size ?? 0
        totalCount += 1
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (continuationToken)

    return new Response(
      JSON.stringify({ totalSize, totalCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
