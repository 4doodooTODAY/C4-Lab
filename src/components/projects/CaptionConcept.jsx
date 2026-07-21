import { useState, useEffect, useRef } from 'react'
import { Loader2, Check, Type } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── Caption Concept ───────────────────────────────────────────────────────────
// A per-project caption draft, shown directly beneath the revision download
// controls. Team members edit it (debounced autosave); clients see it
// read-only so they know the intended copy while reviewing.
export default function CaptionConcept({ projectId, initialValue, canEdit = true, dark = false, plain = false }) {
  const [value, setValue]   = useState(initialValue || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const timer = useRef(null)

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
