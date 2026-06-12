// ── HEVC → H.264 conversion (in the browser) ────────────────────────────────
// iPhones, many cameras and some editors export video as HEVC (H.265). Browsers
// can decode the AAC *audio* of an HEVC file but cannot decode the *video* track
// on the web, so the player shows a black screen with sound. To make sure a
// client never receives an unplayable video, we detect HEVC at upload time and
// transcode it to H.264 (universally supported) before it ever reaches storage.
//
// Everything runs locally via ffmpeg.wasm — no server, no external service.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// Single-thread core — works without cross-origin isolation (no COOP/COEP
// headers needed on the host), which keeps this drop-in for the current setup.
const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'

let _ffmpegPromise = null
function getFFmpeg() {
  if (_ffmpegPromise) return _ffmpegPromise
  _ffmpegPromise = (async () => {
    const ff = new FFmpeg()
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    return ff
  })().catch((e) => { _ffmpegPromise = null; throw e })
  return _ffmpegPromise
}

function bytesInclude(bytes, ascii) {
  const needle = [...ascii].map((c) => c.charCodeAt(0))
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

async function readSlice(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

// The codec is recorded in the mp4 `stsd` box inside `moov`. With faststart the
// moov sits at the front; otherwise it's at the end — so we sniff both edges
// instead of loading the whole (possibly huge) file into memory.
async function isHEVC(file) {
  const EDGE = 8_000_000
  const head = await readSlice(file, 0, Math.min(file.size, EDGE))
  if (bytesInclude(head, 'hvc1') || bytesInclude(head, 'hev1')) return true
  if (bytesInclude(head, 'avc1')) return false // already H.264, moov at front
  if (file.size > EDGE) {
    const tail = await readSlice(file, file.size - EDGE, file.size)
    if (bytesInclude(tail, 'hvc1') || bytesInclude(tail, 'hev1')) return true
  }
  return false
}

function looksLikeVideo(file) {
  return (file.type && file.type.startsWith('video/')) ||
    /\.(mov|mp4|m4v|hevc|h265)$/i.test(file.name || '')
}

/**
 * Returns a web-playable version of `file`. If it's an HEVC video it's
 * transcoded to H.264; otherwise the original file is returned untouched.
 * `onProgress(pct)` reports transcode progress (0–100); `onStage(stage)`
 * reports 'checking' | 'loading' | 'converting' | 'done'.
 */
export async function ensureWebPlayableVideo(file, { onProgress, onStage } = {}) {
  if (!file || !looksLikeVideo(file)) return file
  onStage?.('checking')
  let hevc = false
  try { hevc = await isHEVC(file) } catch { return file } // can't sniff → leave as-is
  if (!hevc) return file

  onStage?.('loading')
  const ff = await getFFmpeg()
  const onProg = ({ progress }) => onProgress?.(Math.max(0, Math.min(100, Math.round(progress * 100))))
  ff.on('progress', onProg)
  try {
    onStage?.('converting')
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0]) || '.mp4'
    const inName = `in${ext}`
    const outName = 'out.mp4'
    await ff.writeFile(inName, await fetchFile(file))
    await ff.exec([
      '-i', inName,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outName,
    ])
    const data = await ff.readFile(outName)
    await ff.deleteFile(inName).catch(() => {})
    await ff.deleteFile(outName).catch(() => {})
    onStage?.('done')
    const baseName = (file.name || 'video').replace(/\.[^.]+$/, '')
    return new File([data.buffer], `${baseName}_h264.mp4`, { type: 'video/mp4' })
  } finally {
    ff.off('progress', onProg)
  }
}
