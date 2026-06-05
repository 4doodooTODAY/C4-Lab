import { useState, useEffect, useRef } from 'react'
import {
  X, CalendarDays, MapPin, Camera, Upload, Send,
  Loader2, MessageSquare, ExternalLink, Film, Image,
  File, HardDrive, Link2, Plus, Pencil, Check, Users,
  AlertCircle, FolderKanban,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { fmtTime } from '../../lib/time'
import { forceDownload } from '../../lib/r2'
import ShootUploadModal from './ShootUploadModal'

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cls =
    status === 'completed' ? 'bg-green-50 text-green-700' :
    status === 'cancelled' ? 'bg-red-50 text-red-600' :
    'bg-blue-50 text-blue-700'
  return (
    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      {status}
    </span>
  )
}

// ── Notes thread ──────────────────────────────────────────────────────────────
function NotesThread({ shootId }) {
  const { user, profile } = useAuth()
  const [notes,   setNotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [text,    setText]    = useState('')
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const bottomRef = useRef(null)

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('shoot_notes')
      .select('id, content, created_at, profile_id, profiles(full_name, role, avatar_url)')
      .eq('shoot_id', shootId)
      .order('created_at', { ascending: true })
    setNotes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!shootId) return
    fetchNotes()

    const channel = supabase
      .channel(`shoot-notes-${shootId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'shoot_notes',
        filter: `shoot_id=eq.${shootId}`,
      }, () => fetchNotes())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [shootId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notes])

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setSendErr('')
    const { error } = await supabase.from('shoot_notes').insert({
      shoot_id:   shootId,
      profile_id: user?.id,
      content:    trimmed,
    })
    setSending(false)
    if (error) {
      console.error('shoot_notes insert:', error)
      setSendErr('Could not send. Check your permissions.')
      return
    }
    setText('')
    fetchNotes()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 size={16} className="animate-spin text-text-muted" />
    </div>
  )

  const myId = user?.id

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
        {notes.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare size={24} className="mx-auto text-text-muted/30 mb-2" />
            <p className="text-xs text-text-muted">No notes yet — start the conversation.</p>
          </div>
        ) : (
          notes.map((n) => {
            const isMe = n.profile_id === myId
            const name = n.profiles?.full_name || 'Unknown'
            const role = n.profiles?.role
            const roleLabel = role === 'admin' ? 'Admin' : role === 'editor' ? 'Editor' : 'Creative'
            return (
              <div key={n.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  isMe ? 'bg-accent text-white' : 'bg-surface-3 text-text-muted'
                }`}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  {!isMe && (
                    <p className="text-[10px] text-text-muted font-medium">
                      {name} · {roleLabel}
                    </p>
                  )}
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-accent text-white rounded-tr-sm'
                      : 'bg-surface-2 text-text-primary rounded-tl-sm'
                  }`}>
                    {n.content}
                  </div>
                  <p className="text-[9px] text-text-muted px-1">
                    {format(new Date(n.created_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {sendErr && (
        <p className="text-xs text-red-500 flex items-center gap-1.5 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle size={12} /> {sendErr}
        </p>
      )}

      <div className="flex gap-2 pt-2 border-t border-border">
        <textarea
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-border bg-surface-2/50 resize-none focus:outline-none focus:border-accent/50 transition-colors placeholder:text-text-muted"
          rows={2}
          placeholder="Ask a question or add a note…"
          value={text}
          onChange={(e) => { setText(e.target.value); setSendErr('') }}
          onKeyDown={handleKey}
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="self-end p-2.5 rounded-xl bg-accent text-white disabled:opacity-40 hover:bg-accent/90 transition-colors"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
      <p className="text-[10px] text-text-muted -mt-1">Press Enter to send · Shift+Enter for new line</p>
    </div>
  )
}

// ── Shoot files list ──────────────────────────────────────────────────────────
function ShootFiles({ shootId }) {
  const { profile }           = useAuth()
  const [files, setFiles]     = useState([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState(null)

  const canRemove = ['admin', 'creative', 'editor', 'team_lead'].includes(profile?.role)

  useEffect(() => {
    if (!shootId) return
    supabase
      .from('shoot_uploads')
      .select('id, file_name, file_url, file_size, created_at, profiles(full_name)')
      .eq('shoot_id', shootId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setFiles(data || []); setLoading(false) })
  }, [shootId])

  const removeFile = async (f) => {
    if (!window.confirm(`Remove "${f.file_name}" from this shoot?`)) return
    setRemovingId(f.id)
    const { data, error } = await supabase
      .from('shoot_uploads')
      .delete()
      .eq('id', f.id)
      .select('id')
    setRemovingId(null)
    if (error || !data?.length) {
      window.alert(error?.message || "You don't have permission to remove this file.")
      return
    }
    setFiles((prev) => prev.filter((x) => x.id !== f.id))
  }

  if (loading) return <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-text-muted" /></div>
  if (!files.length) return (
    <div className="text-center py-4 text-xs text-text-muted bg-surface-2/40 rounded-xl">
      No files uploaded yet for this shoot.
    </div>
  )

  return (
    <div className="space-y-1.5">
      {files.map((f) => {
        const ext = f.file_name?.split('.').pop()?.toLowerCase()
        const isVideo = ['mp4','mov','avi','mkv','webm','m4v'].includes(ext)
        const isImage = ['jpg','jpeg','png','gif','webp','heic','raw','cr2','arw'].includes(ext)
        return (
          <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-2/40 rounded-xl hover:bg-surface-2 transition-colors">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isVideo ? 'bg-blue-50' : isImage ? 'bg-purple-50' : 'bg-surface-3'}`}>
              {isVideo ? <Film size={12} className="text-blue-500" /> : isImage ? <Image size={12} className="text-purple-500" /> : <File size={12} className="text-text-muted" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">{f.file_name}</p>
              <p className="text-[10px] text-text-muted">
                {f.file_size ? (f.file_size >= 1_048_576 ? (f.file_size/1_048_576).toFixed(1)+' MB' : (f.file_size/1024).toFixed(1)+' KB') : ''}
                {f.profiles?.full_name ? ` · by ${f.profiles.full_name}` : ''}
              </p>
            </div>
            {f.file_url && (
              <button
                onClick={(e) => { e.stopPropagation(); forceDownload(f.file_url, f.file_name) }}
                className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-lg hover:bg-accent/5"
                title="Download file">
                <ExternalLink size={12} />
              </button>
            )}
            {canRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(f) }}
                disabled={removingId === f.id}
                className="p-1.5 text-text-muted hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-40"
                title="Remove file">
                {removingId === f.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Inspiration links ─────────────────────────────────────────────────────────
function InspirationLinks({ shoot, canEdit }) {
  const [links,   setLinks]   = useState(shoot.inspiration_links || [])
  const [input,   setInput]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const addLink = async () => {
    let url = input.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    setSaving(true)
    const newLinks = [...links, url]
    const { data } = await supabase
      .from('shoots')
      .update({ inspiration_links: newLinks })
      .eq('id', shoot.id)
      .select('inspiration_links')
      .maybeSingle()
    setLinks(data?.inspiration_links ?? newLinks)
    setInput('')
    setSaving(false)
  }

  const removeLink = async (idx) => {
    const newLinks = links.filter((_, i) => i !== idx)
    setSaving(true)
    const { data } = await supabase
      .from('shoots')
      .update({ inspiration_links: newLinks })
      .eq('id', shoot.id)
      .select('inspiration_links')
      .maybeSingle()
    setLinks(data?.inspiration_links ?? newLinks)
    setSaving(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addLink() }
  }

  return (
    <div className="space-y-3">
      {links.length === 0 ? (
        <div className="text-center py-5 text-xs text-text-muted bg-surface-2/40 rounded-xl">
          <Link2 size={20} className="mx-auto mb-2 text-text-muted/40" />
          No inspiration links yet.{canEdit ? ' Add one below.' : ''}
        </div>
      ) : (
        <div className="space-y-1.5">
          {links.map((url, i) => {
            let display = url
            try { display = new URL(url).hostname.replace('www.', '') + (new URL(url).pathname !== '/' ? new URL(url).pathname : '') } catch {}
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5 bg-surface-2/40 rounded-xl group hover:bg-surface-2 transition-colors">
                <Link2 size={12} className="text-accent shrink-0" />
                <a href={url} target="_blank" rel="noreferrer"
                  className="flex-1 text-xs text-accent hover:underline truncate">
                  {display}
                </a>
                {canEdit && (
                  <button onClick={() => removeLink(i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-red-500 transition-all"
                    title="Remove link">
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <input
            type="url"
            className="flex-1 text-sm px-3 py-2 rounded-xl border border-border bg-surface-2/50 focus:outline-none focus:border-accent/50 transition-colors placeholder:text-text-muted"
            placeholder="https://pinterest.com/…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={saving}
          />
          <button
            onClick={addLink}
            disabled={!input.trim() || saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-semibold disabled:opacity-40 hover:bg-accent/90 transition-colors shrink-0"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <><Plus size={13} /> Add</>}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ShootDetailModal({ shoot: initialShoot, clientId, clientName, onClose, onUpdated }) {
  const { profile } = useAuth()
  const [showUpload,    setShowUpload]    = useState(false)
  const [activeSection, setSection]      = useState('files')
  const [editMode,      setEditMode]     = useState(false)
  const [localShoot,    setLocalShoot]   = useState(initialShoot)
  const [editForm,      setEditForm]     = useState({
    title:          initialShoot?.title || '',
    shoot_date:     initialShoot?.shoot_date || '',
    shoot_time:     initialShoot?.shoot_time || '',
    location:       initialShoot?.location || '',
    creative_notes: initialShoot?.creative_notes || '',
    status:         initialShoot?.status || 'scheduled',
    project_id:     initialShoot?.project_id || '',
  })
  const [projects,       setProjects]       = useState([])
  const [linkedProject,  setLinkedProject]  = useState(null)
  const [teamMembers,    setTeamMembers]    = useState([])
  const [assignedMember, setAssignedMember] = useState(initialShoot?.photographer_id || '')
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState('')

  const shoot = localShoot || initialShoot
  if (!shoot) return null

  const isClient           = profile?.role === 'client'
  const canSeeCreativeNotes = profile?.role === 'admin' || profile?.role === 'creative' || profile?.role === 'editor'
  const canEdit            = profile?.role === 'admin'

  // Load team members for the assignment dropdown when edit opens
  useEffect(() => {
    if (!editMode || !clientId) return
    supabase
      .from('client_creatives')
      .select('profile_id, profiles(id, full_name, role)')
      .eq('client_id', clientId)
      .then(({ data }) => setTeamMembers((data || []).map((m) => m.profiles).filter(Boolean)))

    supabase
      .from('projects')
      .select('id, name, stage')
      .eq('client_id', clientId)
      .neq('stage', 'archived')
      .order('created_at', { ascending: false })
      .then(({ data }) => setProjects(data || []))
  }, [editMode, clientId])

  // Resolve the linked project's name for the view-mode display
  useEffect(() => {
    const pid = shoot?.project_id
    if (!pid) { setLinkedProject(null); return }
    supabase
      .from('projects')
      .select('id, name')
      .eq('id', pid)
      .maybeSingle()
      .then(({ data }) => setLinkedProject(data || null))
  }, [shoot?.project_id])

  const set = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!editForm.title.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        title:           editForm.title.trim(),
        shoot_date:      editForm.shoot_date || null,
        shoot_time:      editForm.shoot_time || null,
        location:        editForm.location || null,
        creative_notes:  editForm.creative_notes || null,
        status:          editForm.status,
        photographer_id: assignedMember || null,
        project_id:      editForm.project_id || null,
      }
      const { error } = await supabase.from('shoots').update(payload).eq('id', shoot.id)
      if (error) throw error

      // Sync the linked calendar event title, time, location, and assignee (best-effort)
      if (shoot.calendar_event_id) {
        const timeStr = editForm.shoot_time || '09:00'
        const startAt = editForm.shoot_date
          ? new Date(`${editForm.shoot_date}T${timeStr}:00`)
          : null
        const evtUpdate = {
          title:    `${editForm.title.trim()} — Shoot`,
          location: editForm.location || null,
          all_day:  !editForm.shoot_time,
          ...(startAt ? {
            start_at: startAt.toISOString(),
            end_at:   new Date(startAt.getTime() + 4 * 60 * 60 * 1000).toISOString(),
          } : {}),
        }
        await supabase.from('calendar_events').update(evtUpdate).eq('id', shoot.calendar_event_id)

        // Replace assigned member
        await supabase.from('calendar_event_members').delete().eq('event_id', shoot.calendar_event_id)
        if (assignedMember) {
          await supabase.from('calendar_event_members').insert({
            event_id:   shoot.calendar_event_id,
            profile_id: assignedMember,
          })
        }
      }

      const updated = { ...shoot, ...payload }
      setLocalShoot(updated)
      setEditMode(false)
      if (onUpdated) onUpdated(updated)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    setEditForm({
      title:          shoot.title || '',
      shoot_date:     shoot.shoot_date || '',
      shoot_time:     shoot.shoot_time || '',
      location:       shoot.location || '',
      creative_notes: shoot.creative_notes || '',
      status:         shoot.status || 'scheduled',
      project_id:     shoot.project_id || '',
    })
    setSaveError('')
    setEditMode(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Camera size={16} className="text-accent" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-text-primary truncate">
                  {editMode ? 'Edit Shoot' : shoot.title}
                </h2>
                <p className="text-xs text-text-muted mt-0.5">{clientName || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canEdit && !editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="btn-ghost p-1.5 -mt-1 text-text-muted hover:text-accent"
                  title="Edit shoot"
                >
                  <Pencil size={14} />
                </button>
              )}
              <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-5">

            {/* ── EDIT MODE ── */}
            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="label">Shoot Name *</label>
                  <input className="input" value={editForm.title} onChange={set('title')} placeholder="Shoot name" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Date</label>
                    <input type="date" className="input" value={editForm.shoot_date} onChange={set('shoot_date')} />
                  </div>
                  <div>
                    <label className="label">Time</label>
                    <input type="time" className="input" value={editForm.shoot_time} onChange={set('shoot_time')} />
                  </div>
                </div>

                <div>
                  <label className="label">Location</label>
                  <input className="input" value={editForm.location} onChange={set('location')} placeholder="Address or venue" />
                </div>

                <div>
                  <label className="label">Status</label>
                  <select className="input" value={editForm.status} onChange={set('status')}>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Linked project — optional */}
                <div>
                  <label className="label flex items-center gap-1.5"><FolderKanban size={11} /> Linked Project <span className="text-text-muted font-normal">(optional)</span></label>
                  {projects.length === 0 ? (
                    <p className="text-xs text-text-muted mt-1">No projects for this client yet.</p>
                  ) : (
                    <select className="input" value={editForm.project_id} onChange={set('project_id')}>
                      <option value="">— Not linked to a project —</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Assigned shooter */}
                <div>
                  <label className="label flex items-center gap-1.5"><Users size={11} /> Assigned Photographer / Videographer</label>
                  {teamMembers.length === 0 ? (
                    <p className="text-xs text-text-muted mt-1">No team members assigned to this client yet.</p>
                  ) : (
                    <select className="input" value={assignedMember} onChange={(e) => setAssignedMember(e.target.value)}>
                      <option value="">— Unassigned —</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="label">Creative Notes</label>
                  <p className="text-[10px] text-text-muted mb-1">Only visible to your creative team</p>
                  <textarea className="input resize-none" rows={3} value={editForm.creative_notes} onChange={set('creative_notes')} placeholder="Shot list, style direction, mood..." />
                </div>

                {saveError && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <AlertCircle size={12} /> {saveError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={cancelEdit} disabled={saving} className="flex-1 btn-secondary">Cancel</button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !editForm.title.trim()}
                    className="flex-1 btn-primary flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              /* ── VIEW MODE ── */
              <div className="space-y-5">
                {/* Status + meta */}
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={shoot.status} />
                  {shoot.shoot_date && (
                    <span className="flex items-center gap-1.5 text-xs text-text-muted">
                      <CalendarDays size={11} />
                      {format(parseISO(shoot.shoot_date), 'EEEE, MMMM d yyyy')}
                      {shoot.shoot_time && (
                        <span className="font-medium text-text-primary">
                          · {fmtTime(shoot.shoot_time)}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {shoot.location && (
                  <div className="flex items-start gap-2 text-sm text-text-secondary">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-text-muted" />
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(shoot.location)}`}
                      target="_blank" rel="noreferrer"
                      className="text-accent hover:underline transition-colors"
                    >
                      {shoot.location}
                    </a>
                  </div>
                )}

                {shoot.creative_notes && canSeeCreativeNotes && (
                  <div className="bg-surface-2/60 rounded-xl p-4">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Creative Notes</p>
                    <p className="text-sm text-text-primary leading-relaxed">{shoot.creative_notes}</p>
                  </div>
                )}

                {canSeeCreativeNotes && linkedProject && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <FolderKanban size={11} className="shrink-0" />
                    <span>Linked to project <span className="font-medium text-text-primary">{linkedProject.name}</span></span>
                  </div>
                )}

                {canSeeCreativeNotes && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Users size={11} className="shrink-0" />
                    {shoot.profiles?.full_name
                      ? <span><span className="font-medium text-text-primary">{shoot.profiles.full_name}</span> assigned</span>
                      : <span>No photographer assigned</span>
                    }
                  </div>
                )}

                {/* Upload button */}
                <button
                  onClick={() => setShowUpload(true)}
                  className="w-full btn-primary flex items-center justify-center gap-2 text-sm"
                >
                  <Upload size={14} /> Upload Clips
                </button>

                {/* Section tabs */}
                <div className="flex gap-1 border-b border-border -mx-6 px-6">
                  {[
                    { id: 'files', label: 'Files', icon: HardDrive },
                    ...(isClient ? [] : [
                      { id: 'inspiration', label: 'Inspiration', icon: Link2 },
                      { id: 'notes', label: 'Notes', icon: MessageSquare },
                    ]),
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setSection(id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                        activeSection === id
                          ? 'border-accent text-accent'
                          : 'border-transparent text-text-muted hover:text-text-primary'
                      }`}
                    >
                      <Icon size={11} /> {label}
                    </button>
                  ))}
                </div>

                {activeSection === 'files' && <ShootFiles shootId={shoot.id} />}
                {!isClient && activeSection === 'inspiration' && (
                  <InspirationLinks shoot={shoot} canEdit={canSeeCreativeNotes} />
                )}
                {!isClient && activeSection === 'notes' && <NotesThread shootId={shoot.id} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {showUpload && (
        <ShootUploadModal
          shoot={shoot}
          clientId={clientId}
          clientName={clientName}
          onClose={() => setShowUpload(false)}
          onUploaded={() => setShowUpload(false)}
        />
      )}
    </>
  )
}
