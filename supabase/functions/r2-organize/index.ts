/**
 * r2-organize — admin-only edge function
 *
 * POST { action: 'audit' }
 *   → lists every R2 object, cross-references shoot_uploads + project_revisions,
 *     returns { orphaned: [...], tracked: [...] }
 *
 * POST { action: 'delete-orphans' }
 *   → deletes every R2 object that has no DB record
 *
 * POST { action: 'reorganize' }
 *   → copies every object to a cleaner key structure, updates DB URLs, deletes old keys
 *     New structure:
 *       {Client Name}/{Project Name}/Footage/{filename}
 *       {Client Name}/{Project Name}/Cuts/v{n} - {filename}
 *       orphaned/{old-key-basename}
 */
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from 'npm:@aws-sdk/client-s3'
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

function publicUrlFor(key: string) {
  return R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`
}

/** List every key in the bucket */
async function listAllKeys(): Promise<{ key: string; size: number }[]> {
  const results: { key: string; size: number }[] = []
  let token: string | undefined
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      ContinuationToken: token,
      MaxKeys: 1000,
    }))
    for (const obj of res.Contents ?? []) {
      if (obj.Key) results.push({ key: obj.Key, size: obj.Size ?? 0 })
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return results
}

/** Extract the raw filename from any key (last path segment, strip timestamp prefix) */
function cleanFilename(key: string): string {
  const base = key.split('/').pop() ?? key
  // Remove leading timestamp like "1748012345678-"
  return base.replace(/^\d{10,}-/, '')
}

/** Sanitize a name for use as an R2 "folder" — keep spaces, strip only dangerous chars */
function sanitize(s: string): string {
  return (s || 'Unknown').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'Unknown'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    // Verify admin
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    const { data: profile } = await anonClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') throw new Error('Admin only')

    // Service client for DB writes
    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action } = await req.json()

    // ── 1. Collect all R2 keys ─────────────────────────────────────────────
    const allObjects = await listAllKeys()
    const allKeys    = new Set(allObjects.map(o => o.key))

    // ── 2. Collect all DB-referenced URLs ─────────────────────────────────
    const [uploadsRes, revisionsRes] = await Promise.all([
      db.from('shoot_uploads').select('id, file_url, file_name, file_size, project_id, shoot_id, client_id'),
      db.from('project_revisions').select('id, video_url, photo_urls, project_id, revision_number, projects(name, client_id, clients(name))'),
    ])

    const uploads   = uploadsRes.data   ?? []
    const revisions = revisionsRes.data ?? []

    // Build set of all keys that the DB knows about
    const trackedKeys = new Set<string>()
    const urlToKey = (url: string) => {
      if (!url) return null
      if (R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL + '/')) return url.slice(R2_PUBLIC_URL.length + 1)
      const m = url.match(/\.r2\.cloudflarestorage\.com\/[^/]+\/(.+)$/)
      return m ? m[1] : null
    }

    for (const u of uploads) {
      const k = urlToKey(u.file_url)
      if (k) trackedKeys.add(k)
    }
    for (const r of revisions) {
      if (r.video_url) {
        const k = urlToKey(r.video_url)
        if (k) trackedKeys.add(k)
      }
      for (const url of (r.photo_urls ?? [])) {
        const k = urlToKey(url)
        if (k) trackedKeys.add(k)
      }
    }

    const orphanedObjects = allObjects.filter(o => !trackedKeys.has(o.key))
    const trackedObjects  = allObjects.filter(o => trackedKeys.has(o.key))

    // ── AUDIT ──────────────────────────────────────────────────────────────
    if (action === 'audit') {
      return new Response(JSON.stringify({
        totalObjects:    allObjects.length,
        totalSize:       allObjects.reduce((s, o) => s + o.size, 0),
        trackedCount:    trackedObjects.length,
        orphanedCount:   orphanedObjects.length,
        orphanedSize:    orphanedObjects.reduce((s, o) => s + o.size, 0),
        orphaned:        orphanedObjects,
        sampleTracked:   trackedObjects.slice(0, 5).map(o => o.key),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── DELETE ORPHANS ─────────────────────────────────────────────────────
    if (action === 'delete-orphans') {
      if (orphanedObjects.length === 0) {
        return new Response(JSON.stringify({ deleted: 0, freedBytes: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Delete in batches of 1000 (S3 API limit)
      let deleted = 0
      let freedBytes = 0
      for (let i = 0; i < orphanedObjects.length; i += 1000) {
        const batch = orphanedObjects.slice(i, i + 1000)
        await s3.send(new DeleteObjectsCommand({
          Bucket:  R2_BUCKET,
          Delete: { Objects: batch.map(o => ({ Key: o.key })) },
        }))
        deleted    += batch.length
        freedBytes += batch.reduce((s, o) => s + o.size, 0)
      }

      return new Response(JSON.stringify({ deleted, freedBytes }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── REORGANIZE ─────────────────────────────────────────────────────────
    if (action === 'reorganize') {
      // Build mapping: old key → new key for each tracked file
      // New structure:
      //   {Client}/{Project}/Footage/{filename}
      //   {Client}/{Project}/Cuts/v{n} - {filename}
      //   {Client}/{Project}/Photos/{filename}

      // We need client/project names — fetch them
      const projectIds = [...new Set([
        ...uploads.map(u => u.project_id).filter(Boolean),
        ...revisions.map(r => r.project_id).filter(Boolean),
      ])]

      const { data: projects } = await db
        .from('projects')
        .select('id, name, client_id, clients(name)')
        .in('id', projectIds)

      const projectMap: Record<string, { projectName: string; clientName: string }> = {}
      for (const p of projects ?? []) {
        projectMap[p.id] = {
          projectName: sanitize((p as any).name ?? 'Unknown Project'),
          clientName:  sanitize((p as any).clients?.name ?? 'Unknown Client'),
        }
      }

      const moves: { oldKey: string; newKey: string; dbTable: string; dbId: string; field: string; newUrl: string }[] = []

      // Footage uploads
      for (const u of uploads) {
        const oldKey = urlToKey(u.file_url)
        if (!oldKey || !allKeys.has(oldKey)) continue
        const info = u.project_id ? projectMap[u.project_id] : null
        const client  = sanitize(info?.clientName  ?? 'Unknown Client')
        const project = sanitize(info?.projectName ?? 'Unknown Project')
        const fname   = cleanFilename(oldKey)
        const newKey  = `${client}/${project}/Footage/${fname}`
        if (newKey === oldKey) continue
        moves.push({ oldKey, newKey, dbTable: 'shoot_uploads', dbId: u.id, field: 'file_url', newUrl: publicUrlFor(newKey) })
      }

      // Revision videos
      for (const r of revisions) {
        const info = r.project_id ? projectMap[r.project_id] : null
        const client  = sanitize((info?.clientName)  ?? 'Unknown Client')
        const project = sanitize((info?.projectName) ?? 'Unknown Project')
        const vn      = r.revision_number ?? 1

        if (r.video_url) {
          const oldKey = urlToKey(r.video_url)
          if (oldKey && allKeys.has(oldKey)) {
            const fname  = cleanFilename(oldKey)
            const newKey = `${client}/${project}/Cuts/v${vn} - ${fname}`
            if (newKey !== oldKey) {
              moves.push({ oldKey, newKey, dbTable: 'project_revisions', dbId: r.id, field: 'video_url', newUrl: publicUrlFor(newKey) })
            }
          }
        }

        for (let i = 0; i < (r.photo_urls ?? []).length; i++) {
          const oldKey = urlToKey(r.photo_urls[i])
          if (oldKey && allKeys.has(oldKey)) {
            const fname  = cleanFilename(oldKey)
            const newKey = `${client}/${project}/Photos/v${vn}/${fname}`
            if (newKey !== oldKey) {
              moves.push({ oldKey, newKey, dbTable: 'project_revisions', dbId: r.id, field: 'photo_urls', newUrl: publicUrlFor(newKey) })
            }
          }
        }
      }

      // Execute moves: copy → update DB → delete old
      let moved = 0
      for (const m of moves) {
        try {
          // Copy object to new key
          await s3.send(new CopyObjectCommand({
            Bucket:     R2_BUCKET,
            CopySource: `${R2_BUCKET}/${m.oldKey}`,
            Key:        m.newKey,
          }))

          // Update DB
          if (m.field === 'photo_urls') {
            // photo_urls is an array — update the specific entry
            const { data: rev } = await db.from('project_revisions').select('photo_urls').eq('id', m.dbId).single()
            const urls = (rev?.photo_urls ?? []).map((u: string) => u === publicUrlFor(m.oldKey) ? m.newUrl : u)
            await db.from('project_revisions').update({ photo_urls: urls }).eq('id', m.dbId)
          } else {
            await db.from(m.dbTable).update({ [m.field]: m.newUrl }).eq('id', m.dbId)
          }

          // Delete old key
          await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: m.oldKey }))
          moved++
        } catch (e) {
          console.error(`Move failed: ${m.oldKey} → ${m.newKey}`, e)
        }
      }

      // Also delete orphaned files during reorganize
      let deletedOrphans = 0
      if (orphanedObjects.length > 0) {
        for (let i = 0; i < orphanedObjects.length; i += 1000) {
          const batch = orphanedObjects.slice(i, i + 1000)
          await s3.send(new DeleteObjectsCommand({
            Bucket: R2_BUCKET,
            Delete: { Objects: batch.map(o => ({ Key: o.key })) },
          }))
          deletedOrphans += batch.length
        }
      }

      return new Response(JSON.stringify({ moved, deletedOrphans, totalMoves: moves.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
