// One-time backfill: generate real thumbnails for gallery RAW items that have
// placeholder tiles (width IS NULL). Downloads the first 16MB of each original
// (embedded JPEG preview lives near the start; falls back to full file),
// extracts the largest embedded JPEG, resizes with sharp, uploads webp
// derivatives, updates the row.
import sharp from 'sharp'

const URL_BASE = process.env.SUPA_URL
const SK = process.env.SUPA_KEY
const H = { apikey: SK, Authorization: `Bearer ${SK}` }

function findJpeg(buf) {
  let best = null
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD8 && buf[i + 2] === 0xFF) {
      for (let j = i + 2; j < buf.length - 1; j++) {
        if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
          const len = j + 2 - i
          if (!best || len > best.len) best = { start: i, len }
          i = j; break
        }
      }
    }
  }
  return best && best.len > 4096 ? buf.subarray(best.start, best.start + best.len) : null
}

async function fetchOriginal(path, partial = true) {
  const headers = { ...H }
  if (partial) headers.Range = 'bytes=0-16777215'
  const res = await fetch(`${URL_BASE}/storage/v1/object/shoot-originals/${encodeURIComponent(path).replace(/%2F/g, '/')}`, { headers })
  if (!res.ok && res.status !== 206) throw new Error(`download ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function uploadPreview(path, buf) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/shoot-previews/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
    body: buf,
  })
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`)
}

const rows = await (await fetch(
  `${URL_BASE}/rest/v1/one_off_shoot_images?select=id,file_name,original_path&width=is.null&is_video=eq.false&deleted_at=is.null&limit=500`,
  { headers: H }
)).json()
console.log(`items to backfill: ${rows.length}`)

let done = 0, failed = 0
async function processRow(r) {
  try {
    let buf = await fetchOriginal(r.original_path)
    let jpeg = findJpeg(buf)
    if (!jpeg) { // preview not in first 16MB — pull the whole file
      buf = await fetchOriginal(r.original_path, false)
      jpeg = findJpeg(buf)
    }
    if (!jpeg) throw new Error('no embedded JPEG')
    const img = sharp(jpeg, { failOn: 'none' }).rotate() // respect EXIF orientation
    const meta = await img.metadata()
    const [thumb, preview] = await Promise.all([
      sharp(jpeg).rotate().resize(400, 400, { fit: 'inside' }).webp({ quality: 75 }).toBuffer(),
      sharp(jpeg).rotate().resize(1600, 1600, { fit: 'inside' }).webp({ quality: 82 }).toBuffer(),
    ])
    const base = r.original_path.replace(/\.[^.]+$/, '')
    await Promise.all([
      uploadPreview(`${base}_rthumb.webp`, thumb),
      uploadPreview(`${base}_rprev.webp`, preview),
    ])
    const patch = await fetch(`${URL_BASE}/rest/v1/one_off_shoot_images?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        thumb_path: `${base}_rthumb.webp`,
        preview_path: `${base}_rprev.webp`,
        width: meta.width, height: meta.height,
      }),
    })
    if (!patch.ok) throw new Error(`row update ${patch.status}`)
    done++
    if (done % 20 === 0) console.log(`  ${done}/${rows.length}…`)
  } catch (e) {
    failed++
    console.error(`  FAIL ${r.file_name}: ${e.message}`)
  }
}

// concurrency 4
let next = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < rows.length) await processRow(rows[next++])
}))
console.log(`done=${done} failed=${failed}`)
