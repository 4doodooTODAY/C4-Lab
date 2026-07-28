import { useState, useEffect, useRef } from 'react'
import { Loader2, Check, Type, Sparkles } from 'lucide-react'
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

// ── Caption Concept ───────────────────────────────────────────────────────────
// A per-project caption draft, shown directly beneath the revision download
// controls. Team members edit it (debounced autosave); clients see it
// read-only so they know the intended copy while reviewing.
export default function CaptionConcept({ projectId, projectName, initialValue, canEdit = true, dark = false, plain = false }) {
  const [value, setValue]   = useState(initialValue || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const timer = useRef(null)

  const suggest = () => {
    const text = smartCaptionFromName(projectName)
    if (!text) return
    setValue(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(text), 400)
  }

  useEffect(() => { setValue(initialValue || '') }, [projectId])

  const save = async (text) => {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase
      .from('projects')
      .update({ caption_concept: text.trim() || null })
      .eq('id', projectId)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const onChange = (e) => {
    const text = e.target.value
    setValue(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(text), 900)
  }

  if (!canEdit && !value) return null // nothing drafted yet. Nothing to show clients

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
          placeholder="e.g. Behind every great space is a great story… ✂️ #interiordesign"
          value={value}
          onChange={onChange}
        />
      ) : (
        <p className={`text-sm whitespace-pre-wrap ${dark ? 'text-white/80' : 'text-text-secondary'}`}>{value}</p>
      )}
    </div>
  )
}
