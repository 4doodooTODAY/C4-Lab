import { useState, useEffect, useRef } from 'react'
import { Loader2, Check, Type, Sparkles, Instagram, Youtube, Facebook, Linkedin, Music2, Copy, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Build a caption starter from the project name. No external service; it cleans
// the name (drops draft / revision / version noise and dates), title-cases it,
// picks an opener, and derives a few hashtags. Re-running gives a fresh opener.
function smartCaptionFromName(name) {
  if (!name) return ''
  let title = name
    .replace(/\b(draft|revision|rev|version|v|cut|final|edit|shoot|project)\s*#?\d*\b/gi, ' ')
    .replace(/\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?/g, ' ')
    .replace(/[-_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!title) title = name.trim()
  const titled = title.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'on', 'at', 'by', 'content'])
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stop.has(w))
  const camel = words.length >= 2
    ? '#' + words.slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
    : ''
  const singles = words.slice(0, 3).map((w) => '#' + w.replace(/[^a-z0-9]/gi, ''))
  const hashtags = [...new Set([camel, ...singles, '#connectfourcreative'].filter(Boolean))].join(' ')

  const openers = [
    `Bringing ${titled} to life.`,
    `A closer look at ${titled}.`,
    `${titled}, straight from the shoot.`,
    `This is ${titled}.`,
  ]
  const lead = openers[Math.floor(Math.random() * openers.length)]
  return `${titled} ✨\n\n${lead}\n\n${hashtags}`
}

// Optional per-platform captions. Limits are each platform's own maximum, so
// the counter warns before a caption gets cut off at post time.
export const PLATFORMS = [
  { key: 'instagram', label: 'Instagram',           icon: Instagram, limit: 2200 },
  { key: 'tiktok',    label: 'TikTok',              icon: Music2,    limit: 4000 },
  { key: 'linkedin',  label: 'LinkedIn',            icon: Linkedin,  limit: 3000 },
  { key: 'youtube',   label: 'YouTube description', icon: Youtube,   limit: 5000 },
  { key: 'facebook',  label: 'Facebook',            icon: Facebook,  limit: 63206 },
]

// Every caption save goes through set_project_caption, which lets anyone on
// the project's team edit (not just the lead creative/editor) and writes one
// field at a time so parallel edits to different platforms never collide.
async function saveCaption(projectId, platform, text) {
  const { error } = await supabase.rpc('set_project_caption', {
    p_project_id: projectId, p_platform: platform, p_text: text,
  })
  return error
}

function useSaveState() {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const run = async (fn) => {
    setSaving(true); setSaved(false); setError('')
    const err = await fn()
    setSaving(false)
    if (err) { setError(err.message || 'Could not save.'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  return { saving, saved, error, run }
}

function CopyButton({ text, dark }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})}
      className={`flex items-center gap-1 text-[11px] font-semibold rounded-md px-1.5 py-0.5 transition-colors ${
        dark ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-text-muted hover:text-accent hover:bg-accent/10'}`}
      title="Copy caption"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Platform captions (optional) ──────────────────────────────────────────────
function PlatformCaptions({ projectId, mainCaption, canEdit, dark, values, setValues }) {
  const [open, setOpen]     = useState(() => PLATFORMS.some((p) => values[p.key]))
  const [active, setActive] = useState(() => (PLATFORMS.find((p) => values[p.key]) || PLATFORMS[0]).key)
  const { saving, saved, error, run } = useSaveState()
  const timers = useRef({})

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  const filled = PLATFORMS.filter((p) => values[p.key])

  // Clients only see the platforms that were actually written
  if (!canEdit) {
    if (!filled.length) return null
    return (
      <div className="mt-4 space-y-3">
        {filled.map(({ key, label, icon: Icon }) => (
          <div key={key}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} className={dark ? 'text-white/50' : 'text-text-muted'} />
              <span className={`text-xs font-semibold ${dark ? 'text-white/70' : 'text-text-secondary'}`}>{label}</span>
              <span className="ml-auto"><CopyButton text={values[key]} dark={dark} /></span>
            </div>
            <p className={`text-sm whitespace-pre-wrap ${dark ? 'text-white/80' : 'text-text-secondary'}`}>{values[key]}</p>
          </div>
        ))}
      </div>
    )
  }

  const setPlatform = (key, text) => {
    setValues((v) => ({ ...v, [key]: text }))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => run(() => saveCaption(projectId, key, text)), 900)
  }

  const current = PLATFORMS.find((p) => p.key === active)
  const text = values[active] || ''
  const over = text.length > current.limit

  return (
    <div className={`mt-4 pt-3 border-t ${dark ? 'border-white/10' : 'border-border'}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 text-left text-xs font-semibold ${dark ? 'text-white/70 hover:text-white' : 'text-text-secondary hover:text-text-primary'}`}
      >
        Platform captions
        <span className={`font-normal ${dark ? 'text-white/40' : 'text-text-muted'}`}>
          {filled.length ? `${filled.length} of ${PLATFORMS.length} written` : 'optional'}
        </span>
        {saving && <Loader2 size={11} className="animate-spin opacity-60" />}
        {saved && <Check size={11} className="text-green-500" />}
        <ChevronDown size={13} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3">
          <p className={`text-[11px] mb-2 ${dark ? 'text-white/40' : 'text-text-muted'}`}>
            Write a version for any platform that needs its own copy. Leave one blank to use the main caption.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2" role="tablist">
            {PLATFORMS.map(({ key, label, icon: Icon }) => {
              const on = key === active
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(key)}
                  className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                    on
                      ? 'bg-accent text-white border-accent'
                      : dark
                        ? 'border-white/15 text-white/60 hover:text-white hover:border-white/30'
                        : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
                  }`}
                >
                  <Icon size={11} />
                  {label}
                  {values[key] && !on && <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-label="written" />}
                </button>
              )
            })}
          </div>
          <textarea
            className={dark
              ? 'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent resize-y'
              : 'input resize-y'}
            rows={4}
            placeholder={`${current.label} caption (optional)`}
            value={text}
            onChange={(e) => setPlatform(active, e.target.value)}
            aria-label={`${current.label} caption`}
          />
          <div className="flex items-center gap-2 mt-1">
            {mainCaption && !text && (
              <button
                type="button"
                onClick={() => setPlatform(active, mainCaption)}
                className={`text-[11px] font-semibold ${dark ? 'text-accent-hover hover:underline' : 'text-accent hover:underline'}`}
              >
                Start from main caption
              </button>
            )}
            <CopyButton text={text} dark={dark} />
            <span className={`ml-auto text-[11px] tabular-nums ${over ? 'text-status-overdue-text font-semibold' : dark ? 'text-white/40' : 'text-text-muted'}`}>
              {text.length.toLocaleString()} / {current.limit.toLocaleString()}
            </span>
          </div>
          {error && <p className="text-[11px] text-status-overdue-text mt-1">{error}</p>}
        </div>
      )}
    </div>
  )
}

// ── Caption Concept ───────────────────────────────────────────────────────────
// A per-project caption draft, shown directly beneath the revision download
// controls. Team members edit it (debounced autosave); clients see it
// read-only so they know the intended copy while reviewing. Platform-specific
// versions sit underneath as an optional, collapsible section.
export default function CaptionConcept({ projectId, projectName, initialValue, canEdit = true, dark = false, plain = false }) {
  const [value, setValue] = useState(initialValue || '')
  const [platforms, setPlatforms] = useState(null)   // { instagram: '...', ... }
  const { saving, saved, error, run } = useSaveState()

  useEffect(() => {
    let live = true
    setPlatforms(null)
    supabase.from('projects').select('caption_platforms').eq('id', projectId).maybeSingle()
      .then(({ data }) => { if (live) setPlatforms(data?.caption_platforms || {}) })
    return () => { live = false }
  }, [projectId])
  const timer = useRef(null)

  const save = (text) => run(() => saveCaption(projectId, null, text))

  const suggest = () => {
    const text = smartCaptionFromName(projectName)
    if (!text) return
    setValue(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(text), 400)
  }

  useEffect(() => { setValue(initialValue || '') }, [projectId])
  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = (e) => {
    const text = e.target.value
    setValue(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(text), 900)
  }

  // Nothing drafted anywhere yet. Nothing to show clients
  const anyPlatform = platforms && PLATFORMS.some((p) => platforms[p.key])
  if (!canEdit && !value && !anyPlatform) return null

  return (
    <div className={plain
      ? 'mt-4 pt-4 border-t border-border'
      : dark
        ? 'bg-white/5 border border-white/10 rounded-xl p-4'
        : 'card border border-border p-5'}>
      <div className="flex items-center gap-2 mb-1">
        <Type size={13} className={dark ? 'text-white/50' : 'text-text-muted'} />
        <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-text-primary'}`}>Caption Concept</h3>
        {saving && <Loader2 size={11} className={`animate-spin ${dark ? 'text-white/40' : 'text-text-muted'}`} />}
        {saved && <Check size={11} className="text-green-500" />}
        {canEdit && projectName && (
          <button
            type="button"
            onClick={suggest}
            title="Suggest a caption from the project name"
            className={`ml-auto flex items-center gap-1.5 text-xs font-semibold rounded-md px-2 py-1 transition-colors ${
              dark
                ? 'text-accent-hover hover:bg-white/10'
                : 'text-accent hover:bg-accent/10'}`}
          >
            <Sparkles size={12} />
            Suggest
          </button>
        )}
        {!canEdit && <span className="ml-auto"><CopyButton text={value} dark={dark} /></span>}
      </div>
      <p className={`text-xs mb-3 ${dark ? 'text-white/40' : 'text-text-muted'}`}>
        {canEdit ? 'Draft the caption to post with this content. Saves automatically.' : 'The caption planned for this content.'}
      </p>
      {canEdit ? (
        <textarea
          className={dark
            ? 'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent resize-none'
            : 'input resize-none'}
          rows={3}
          placeholder="e.g. Behind every great space is a great story… #interiordesign"
          value={value}
          onChange={onChange}
        />
      ) : value ? (
        <p className={`text-sm whitespace-pre-wrap ${dark ? 'text-white/80' : 'text-text-secondary'}`}>{value}</p>
      ) : (
        <p className={`text-xs italic ${dark ? 'text-white/40' : 'text-text-muted'}`}>No main caption yet.</p>
      )}
      {error && <p className="text-[11px] text-status-overdue-text mt-1">{error}</p>}

      {platforms && (
        <PlatformCaptions key={projectId} projectId={projectId} mainCaption={value} canEdit={canEdit} dark={dark}
          values={platforms} setValues={setPlatforms} />
      )}
    </div>
  )
}
