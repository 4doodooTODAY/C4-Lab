import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Camera, Scissors, CalendarDays, MapPin, ArrowRight, Upload, MessageSquare, Check } from 'lucide-react'
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
function ShootCard({ shoot, onOpen, onMarkDone }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 hover:shadow-md hover:border-border-strong transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 cursor-pointer flex-1" onClick={() => onOpen(shoot)}>
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

      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onOpen(shoot)}
          className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
        >
          <Upload size={13} /> Details & Upload
        </button>
        {shoot.status !== 'completed' && (
          <button
            onClick={() => onMarkDone(shoot.id)}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors flex items-center gap-1 shrink-0"
          >
            <Check size={12} /> Mark Done
          </button>
        )}
      </div>
    </div>
  )
}

// ── Edit Card ─────────────────────────────────────────────────────────────────
function EditCard({ project, revisions, myId, onClick, onMarkDone }) {
  const latest = revisions
    .filter((r) => r.project_id === project.id)
    .sort((a, b) => b.revision_number - a.revision_number)[0]

  const hasPendingUpload = latest?.status === 'pending_editor'
  const stage = project.stage
  const isDone = stage === 'delivered'

  return (
    <div className="bg-white rounded-2xl border border-border p-5 hover:shadow-md hover:border-border-strong transition-all">
      <div className="flex items-start justify-between gap-2 mb-3 cursor-pointer" onClick={onClick}>
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
        <p className="text-xs text-text-muted mb-3 cursor-pointer" onClick={onClick}>
          {latest.revision_number === 1 ? 'Initial Cut' : `Revision ${latest.revision_number - 1}`}
          {' · '}
          <span className={hasPendingUpload ? 'text-amber-600 font-medium' : ''}>
            {hasPendingUpload ? 'Upload requested' : latest.status.replace(/_/g, ' ')}
          </span>
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onClick}
          className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
        >
          {hasPendingUpload ? 'Upload Revision' : 'Open Project'} <ArrowRight size={13} />
        </button>
        {stage === 'ready_to_post' && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 flex items-center gap-1 shrink-0">
            ✅ Awaiting post
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CreativeProjectList() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const myId        = profile?.id
  const isEditor    = profile?.role === 'editor'

  const [shoots,       setShoots]       = useState([])
  const [edits,        setEdits]        = useState([])
  const [revisions,    setRevisions]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [detailShoot, setDetailShoot] = useState(null)  // shoot detail modal

  useEffect(() => {
    if (!myId) return
    setLoading(true)

    Promise.all([
      // My Shoots — creatives only, editors skip this
      isEditor
        ? Promise.resolve([])
        : supabase
            .from('client_creatives')
            .select('client_id')
            .eq('profile_id', myId)
            .then(async ({ data: assignments }) => {
              if (!assignments?.length) return []
              const clientIds = assignments.map((a) => a.client_id)
              const { data } = await supabase
                .from('shoots')
                .select('id, title, creative_notes, shoot_date, shoot_time, location, status, inspiration_links, client_id, clients(name, contact_name)')
                .in('client_id', clientIds)
                .neq('status', 'cancelled')
                .order('shoot_date', { ascending: true })
              return data || []
            }),

      // My Edits — projects where I'm the editor or creative, scoped to my assigned clients
      supabase
        .from('client_creatives')
        .select('client_id')
        .eq('profile_id', myId)
        .then(async ({ data: ccRows }) => {
          const clientIds = (ccRows || []).map((r) => r.client_id).filter(Boolean)
          if (!clientIds.length) return { data: [] }
          return supabase
            .from('projects')
            .select('id, name, stage, editor_id, client_id, clients(name, contact_name)')
            .in('client_id', clientIds)
            .order('created_at', { ascending: false })
        }),

      // Revisions for edit status badges
      supabase
        .from('project_revisions')
        .select('id, project_id, revision_number, status'),
    ]).then(([shootData, editRes, revRes]) => {
      setShoots(shootData)
      setEdits(editRes?.data || editRes || [])
      setRevisions(revRes.data || [])
      setLoading(false)
    })
  }, [myId])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  const activeShots    = shoots.filter((s) => s.status !== 'completed')
  const completedShots = shoots.filter((s) => s.status === 'completed')
  const activeEdits    = edits.filter((e) => e.stage !== 'delivered')
  const completedEdits = edits.filter((e) => e.stage === 'delivered')

  const onMarkShootDone = async (id) => {
    await supabase.from('shoots').update({ status: 'completed' }).eq('id', id)
    setShoots((prev) => prev.map((sh) => sh.id === id ? { ...sh, status: 'completed' } : sh))
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">My Work</h1>
        <p className="text-sm text-text-muted mt-1">
          {isEditor ? 'Your editing projects' : 'Your shoots and editing assignments'}
        </p>
      </div>

      {/* My Shoots — creatives only */}
      {!isEditor && (
        <>
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Camera size={16} className="text-text-muted" />
              <h2 className="text-base font-semibold text-text-primary">My Shoots</h2>
              <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{activeShots.length}</span>
            </div>
            {activeShots.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-8 text-center">
                <Camera size={32} className="mx-auto text-text-muted/30 mb-3" />
                <p className="text-sm text-text-muted">No shoots scheduled for your clients yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeShots.map((s) => (
                  <ShootCard key={s.id} shoot={s} onOpen={setDetailShoot} onMarkDone={onMarkShootDone} />
                ))}
              </div>
            )}
          </section>

          {detailShoot && (
            <ShootDetailModal
              shoot={detailShoot}
              clientId={detailShoot.client_id}
              clientName={detailShoot.clients?.name || detailShoot.clients?.contact_name || ''}
              onClose={() => setDetailShoot(null)}
            />
          )}
        </>
      )}

      {/* My Edits — active */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Scissors size={16} className="text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">My Edits</h2>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{activeEdits.length}</span>
        </div>
        {activeEdits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-8 text-center">
            <Scissors size={32} className="mx-auto text-text-muted/30 mb-3" />
            <p className="text-sm text-text-muted">No active editing projects assigned to you.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeEdits.map((p) => (
              <EditCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
                onMarkDone={async () => {
                  await supabase.from('projects').update({ stage: 'delivered' }).eq('id', p.id)
                  setEdits((prev) => prev.map((e) => e.id === p.id ? { ...e, stage: 'delivered' } : e))
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Completed section */}
      {(completedShots.length > 0 || completedEdits.length > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Check size={16} className="text-green-500" />
            <h2 className="text-base font-semibold text-text-primary">Completed</h2>
            <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{completedShots.length + completedEdits.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedShots.map((s) => (
              <ShootCard key={s.id} shoot={s} onOpen={setDetailShoot} onMarkDone={onMarkShootDone} />
            ))}
            {completedEdits.map((p) => (
              <EditCard
                key={p.id}
                project={p}
                revisions={revisions}
                myId={myId}
                onClick={() => navigate(`/projects/${p.id}/creative`)}
                onMarkDone={async () => {}}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
