import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Camera, Scissors, CalendarDays, MapPin, ArrowRight, Upload, MessageSquare } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO } from 'date-fns'
import ShootDetailModal from '../../components/shoots/ShootDetailModal'
import { fmtTime } from '../../lib/time'

const STAGE_COLORS = {
  post_production: 'bg-purple-50 text-purple-600',
  review:          'bg-orange-50 text-orange-600',
  revisions:       'bg-red-50 text-red-600',
  delivered:       'bg-green-50 text-green-600',
}
const STAGE_LABELS = {
  post_production: 'Editing',
  review:          'In Review',
  revisions:       'In Review',
  delivered:       'Delivered',
}

// ── Shoot Card ────────────────────────────────────────────────────────────────
function ShootCard({ shoot, onOpen }) {
  return (
    <div
      onClick={() => onOpen(shoot)}
      className="bg-white rounded-2xl border border-border p-5 hover:shadow-md hover:border-border-strong transition-all flex flex-col gap-3 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{shoot.title}</p>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {shoot.clients?.contact_name || shoot.clients?.name || '—'}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          shoot.status === 'completed' ? 'bg-green-50 text-green-700' :
          shoot.status === 'cancelled' ? 'bg-red-50 text-red-600' :
          'bg-blue-50 text-blue-700'
        }`}>
          {shoot.status}
        </span>
      </div>

      <div className="space-y-1">
        {shoot.shoot_date && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <CalendarDays size={11} />
            {format(parseISO(shoot.shoot_date), 'EEE, MMM d yyyy')}
            {shoot.shoot_time && ` · ${fmtTime(shoot.shoot_time)}`}
          </div>
        )}
        {shoot.location && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <MapPin size={11} /> {shoot.location}
          </div>
        )}
        {shoot.creative_notes && (
          <p className="text-xs text-text-secondary line-clamp-2">{shoot.creative_notes}</p>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onOpen(shoot) }}
        className="mt-auto btn-primary flex items-center justify-center gap-2 text-sm w-full"
      >
        <Upload size={13} /> View Details & Upload
      </button>
    </div>
  )
}

// ── Edit Card ─────────────────────────────────────────────────────────────────
function EditCard({ project, revisions, myId, onClick }) {
  const latest = revisions
    .filter((r) => r.project_id === project.id)
    .sort((a, b) => b.revision_number - a.revision_number)[0]

  const hasPendingUpload = latest?.status === 'pending_editor'
  const stage = project.stage

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-border p-5 hover:shadow-md hover:border-border-strong transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{project.name}</p>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {project.clients?.contact_name || project.clients?.name || '—'}
          </p>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[stage] || 'bg-surface-2 text-text-muted'}`}>
          {STAGE_LABELS[stage] || stage}
        </span>
      </div>

      {latest && (
        <p className="text-xs text-text-muted mb-3">
          {latest.revision_number === 1 ? 'Initial Cut' : `Revision ${latest.revision_number - 1}`}
          {' · '}
          <span className={hasPendingUpload ? 'text-amber-600 font-medium' : ''}>
            {hasPendingUpload ? 'Upload requested' : latest.status.replace(/_/g, ' ')}
          </span>
        </p>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className="w-full btn-primary flex items-center justify-center gap-2 text-sm"
      >
        {hasPendingUpload ? 'Upload Revision' : 'Open Project'} <ArrowRight size={13} />
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CreativeProjectList() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const myId        = profile?.id

  const [shoots,       setShoots]       = useState([])
  const [edits,        setEdits]        = useState([])
  const [revisions,    setRevisions]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [detailShoot, setDetailShoot] = useState(null)  // shoot detail modal

  useEffect(() => {
    if (!myId) return
    setLoading(true)

    Promise.all([
      // My Shoots — actual shoot records for clients I'm assigned to
      supabase
        .from('client_creatives')
        .select('client_id')
        .eq('profile_id', myId)
        .then(async ({ data: assignments }) => {
          if (!assignments?.length) return []
          const clientIds = assignments.map((a) => a.client_id)
          const { data } = await supabase
            .from('shoots')
            .select('id, title, description, shoot_date, shoot_time, location, status, clients(name, contact_name)')
            .in('client_id', clientIds)
            .neq('status', 'cancelled')
            .order('shoot_date', { ascending: true })
          return data || []
        }),

      // My Edits — projects where I'm the editor
      supabase
        .from('projects')
        .select('id, name, stage, editor_id, clients(name, contact_name)')
        .eq('editor_id', myId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),

      // Revisions for edit status badges
      supabase
        .from('project_revisions')
        .select('id, project_id, revision_number, status'),
    ]).then(([shootData, editRes, revRes]) => {
      setShoots(shootData)
      setEdits(editRes.data || [])
      setRevisions(revRes.data || [])
      setLoading(false)
    })
  }, [myId])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">My Work</h1>
        <p className="text-sm text-text-muted mt-1">Your shoots and editing assignments</p>
      </div>

      {/* My Shoots */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Camera size={16} className="text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">My Shoots</h2>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{shoots.length}</span>
        </div>
        {shoots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <Camera size={32} className="mx-auto text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">No shoots scheduled for your clients yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shoots.map((s) => (
              <ShootCard key={s.id} shoot={s} onOpen={setDetailShoot} />
            ))}
          </div>
        )}
      </section>

      {/* Shoot detail modal */}
      {detailShoot && (
        <ShootDetailModal
          shoot={detailShoot}
          clientId={detailShoot.client_id}
          clientName={detailShoot.clients?.name || detailShoot.clients?.contact_name || ''}
          onClose={() => setDetailShoot(null)}
        />
      )}

      {/* My Edits */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Scissors size={16} className="text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">My Edits</h2>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{edits.length}</span>
        </div>
        {edits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <Scissors size={32} className="mx-auto text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">No editing projects assigned to you yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {edits.map((p) => (
              <EditCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
