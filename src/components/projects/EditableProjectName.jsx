import { useState, useEffect, useRef } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── Click-to-rename project title (team only) ────────────────────────────────
// Saves through the rename_project RPC, which allows any admin, creative, or
// editor on the project and refuses clients.
export default function EditableProjectName({ projectId, name, canEdit = true, onRenamed, className = 'display' }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(name || '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const inputRef = useRef(null)

  useEffect(() => { if (!editing) setValue(name || '') }, [name, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  if (!canEdit) return <h1 className={className}>{name}</h1>

  const cancel = () => { setEditing(false); setError(''); setValue(name || '') }

  const save = async () => {
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
    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            className="input text-lg font-semibold flex-1 min-w-0"
            value={value}
            maxLength={200}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save() }
              if (e.key === 'Escape') cancel()
            }}
            disabled={saving}
            aria-label="Project name"
          />
          <button onClick={save} disabled={saving} className="btn-primary p-2 shrink-0" title="Save name">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button onClick={cancel} disabled={saving} className="btn-ghost p-2 shrink-0" title="Cancel">
            <X size={14} />
          </button>
        </div>
        {error && <p className="text-xs text-status-overdue-text mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-start gap-2 text-left max-w-full"
      title="Rename project"
    >
      <h1 className={`${className} break-words min-w-0`}>{name}</h1>
      <Pencil size={15} className="shrink-0 mt-2 text-text-muted opacity-60 sm:opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
    </button>
  )
}
