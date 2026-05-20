import { useState, useEffect, useRef } from 'react'
import {
  X, CalendarDays, MapPin, Camera, Upload, Send,
  Loader2, MessageSquare, StickyNote, ChevronDown,
  ExternalLink, Film, Image, File, HardDrive,
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

    // Realtime subscription
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
    setText('')
    await supabase.from('shoot_notes').insert({
      shoot_id:   shootId,
      profile_id: user?.id,
      content:    trimmed,
    })
    setSending(false)
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
      {/* Message list */}
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
            const roleLabel = role === 'admin' ? 'Admin' : 'Creative'
            return (
              <div key={n.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
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

      {/* Composer */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <textarea
          className="flex-1 text-sm px-3 py-2 rounded-xl border border-border bg-surface-2/50 resize-none focus:outline-none focus:border-accent/50 transition-colors placeholder:text-text-muted"
          rows={2}
          placeholder="Ask a question or add a note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
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
  const [files, setFiles]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shootId) return
    supabase
      .from('shoot_uploads')
      .select('id, file_name, file_url, file_size, created_at, profiles(full_name)')
      .eq('shoot_id', shootId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setFiles(data || []); setLoading(false) })
  }, [shootId])

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
          </div>
        )
      })}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ShootDetailModal({ shoot, clientId, clientName, onClose }) {
  const { profile } = useAuth()
  const [showUpload,   setShowUpload]   = useState(false)
  const [activeSection, setSection]    = useState('files') // 'files' | 'notes'

  if (!shoot) return null

  // Determine if user is client
  const isClient = profile?.role === 'client'
  // Determine if user is creative or admin
  const canSeeCreativeNotes = profile?.role === 'admin' || profile?.role === 'creative'

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
                <h2 className="text-base font-bold text-text-primary truncate">{shoot.title}</h2>
                <p className="text-xs text-text-muted mt-0.5">{clientName || '—'}</p>
              </div>
            </div>
            <button onClick={onClose} className="btn-ghost p-1.5 -mt-1 -mr-1 shrink-0">
              <X size={16} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
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
                  target="_blank"
                  rel="noreferrer"
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
                ...(isClient ? [] : [{ id: 'notes', label: 'Notes & Messages', icon: MessageSquare }]),
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
            {!isClient && activeSection === 'notes' && <NotesThread shootId={shoot.id} />}
          </div>
        </div>
      </div>

      {/* Upload modal stacked on top */}
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
