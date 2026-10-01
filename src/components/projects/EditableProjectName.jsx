import { useState, useEffect, useRef } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── Click-to-rename project name (team only) ─────────────────────────────────
// Saves through the rename_project RPC, which allows any admin, creative, or
// editor on the project and refuses clients.
//
// variant="title"  the big page heading; the whole title is the edit target
// variant="inline" a list or card row; only the pencil starts editing, so a
//                  click on the name still opens the card. Clicks inside never
//                  reach the card.
export default function EditableProjectName({
  projectId, name, canEdit = true, onRenamed, variant = 'title', className,
}) {
  const inline = variant === 'inline'
  const textClass = className || (inline ? 'text-sm font-semibold text-text-primary' : 'display')

  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(name || '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const inputRef = useRef(null)

  useEffect(() => { if (!editing) setValue(name || '') }, [name, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  if (!canEdit) {
    return inline
      ? <p className={`${textClass} truncate`}>{name}</p>
      : <h1 className={textClass}>{name}</h1>
  }

  const stop = (e) => e.stopPropagation()
  const start = (e) => { e.stopPropagation(); setEditing(true) }
  const cancel = (e) => { e?.stopPropagation(); setEditing(false); setError(''); setValue(name || '') }

  const save = async (e) => {
    e?.stopPropagation()
    const next = value.trim()
    if (!next) { setError('Name cannot be empty.'); return }
    if (next === name) { cancel(); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.rpc('rename_project', { p_project_id: projectId, p_name: next })
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditing(false)
    onRenamed?.(data || next)
  }

  if (editing) {
    const icon = inline ? 12 : 14
    return (
      <div onClick={stop} className="min-w-0">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            className={`input flex-1 min-w-0 ${inline ? 'text-sm py-1 px-2' : 'text-lg font-semibold'}`}
            value={value}
            maxLength={200}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') cancel()
            }}
            disabled={saving}
            aria-label="Project name"
          />
          <button onClick={save} disabled={saving} className={`btn-primary shrink-0 ${inline ? 'p-1.5' : 'p-2'}`} title="Save name">
            {saving ? <Loader2 size={icon} className="animate-spin" /> : <Check size={icon} />}
          </button>
          <button onClick={cancel} disabled={saving} className={`btn-ghost shrink-0 ${inline ? 'p-1.5' : 'p-2'}`} title="Cancel">
            <X size={icon} />
          </button>
        </div>
        {error && <p className="text-xs text-status-overdue-text mt-1">{error}</p>}
      </div>
    )
  }

  if (inline) {
    return (
      <div className="group/rename flex items-center gap-1 min-w-0">
        <p className={`${textClass} truncate`}>{name}</p>
        <button
          type="button"
          onClick={start}
          className="shrink-0 p-1 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 opacity-60 sm:opacity-0 group-hover/rename:opacity-100 focus-visible:opacity-100 transition-opacity"
          title="Rename project"
          aria-label={`Rename ${name}`}
        >
          <Pencil size={11} />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      className="group flex items-start gap-2 text-left max-w-full"
      title="Rename project"
    >
      <h1 className={`${textClass} break-words min-w-0`}>{name}</h1>
      <Pencil size={15} className="shrink-0 mt-2 text-text-muted opacity-60 sm:opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
    </button>
  )
}
