import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, FolderKanban, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Status text + step mapping ────────────────────────────────────────────────
function getStatusText(project, pendingRevision) {
  if (project.stage === 'delivered') return { text: 'Your project is complete!', emoji: '🎉' }
  if (pendingRevision?.status === 'pending_client_review') {
    const n = pendingRevision.revision_number
    if (n === 1) return { text: 'Your first cut is ready to review!', emoji: '🎬' }
    return { text: `Revision ${n} is ready!`, emoji: '🎬' }
  }
  if (project.stage === 'production') return { text: 'Shoot day! Your footage is being captured.', emoji: '' }
  if (project.stage === 'post_production') return { text: 'Your footage is being edited.', emoji: '' }
  if (project.stage === 'review' || project.stage === 'revisions') {
    if (pendingRevision?.status === 'pending_creative_review') return { text: 'The editor is prepping your video for review.', emoji: '' }
    if (pendingRevision?.status === 'pending_editor') return { text: 'Your feedback is being addressed.', emoji: '' }
    return { text: 'Your video is in review.', emoji: '' }
  }
  return { text: "We're getting everything planned for your shoot.", emoji: '' }
}

function getStep(project, pendingRevision) {
  const stage = project.stage
  if (stage === 'delivered') return 4
  if (stage === 'review' || stage === 'revisions') {
    if (pendingRevision?.status === 'pending_client_review') return 3
    return 2
  }
  if (stage === 'post_production') return 2
  if (stage === 'production') return 1
  return 0
}

const STEPS = ['Shoot', 'Edit', 'Review', 'Revisions', 'Done']

function StepDots({ activeStep }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <div className={`w-2.5 h-2.5 rounded-full transition-all ${
            i < activeStep ? 'bg-green-400' : i === activeStep ? 'bg-accent' : 'bg-gray-200'
          }`} />
          <span className={`text-[9px] font-medium ${
            i === activeStep ? 'text-accent' : i < activeStep ? 'text-green-500' : 'text-gray-300'
          }`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, revisions }) {
  const navigate = useNavigate()

  const pendingRevision = revisions
    .filter((r) => r.project_id === project.id)
    .sort((a, b) => b.revision_number - a.revision_number)[0]

  const { text, emoji } = getStatusText(project, pendingRevision)
  const step = getStep(project, pendingRevision)

  const canReview = pendingRevision?.status === 'pending_client_review'
  const isDelivered = project.stage === 'delivered'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-all">
      {/* Project name */}
      <h2 className="text-xl font-bold text-gray-900 mb-1">{project.name}</h2>

      {/* Status line */}
      <p className="text-base text-gray-500 mb-5">
        {text} {emoji && <span>{emoji}</span>}
      </p>

      {/* Step dots */}
      <div className="mb-6">
        <StepDots activeStep={step} />
      </div>

      {/* CTA */}
      {canReview && pendingRevision && (
        <button
          onClick={() => navigate(`/projects/${project.id}/revision/${pendingRevision.id}`)}
          className="w-full py-3 px-5 rounded-xl font-semibold text-sm text-white bg-accent hover:bg-accent/90 transition-all flex items-center justify-center gap-2"
        >
          Review Video <ArrowRight size={16} />
        </button>
      )}

      {isDelivered && (
        <div className="w-full py-3 px-5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold text-center flex items-center justify-center gap-2">
          <CheckCircle2 size={16} /> Project Delivered
        </div>
      )}

      {!canReview && !isDelivered && (
        <div className="w-full py-3 px-5 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 text-sm text-center">
          No action needed right now
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MyProjects() {
  const { user } = useAuth()

  const [projects,   setProjects]   = useState([])
  const [revisions,  setRevisions]  = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    // Find client record for this user
    supabase
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(async ({ data: client }) => {
        if (!client) {
          setLoading(false)
          return
        }
        const [projRes, revRes] = await Promise.all([
          supabase
            .from('projects')
            .select('id, name, stage, revision_count')
            .eq('client_id', client.id)
            .neq('status', 'archived')
            .order('created_at', { ascending: false }),
          supabase
            .from('project_revisions')
            .select('id, project_id, revision_number, status'),
        ])
        setProjects(projRes.data || [])
        setRevisions(revRes.data || [])
        setLoading(false)
      })
  }, [user])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-text-muted" />
    </div>
  )

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[600px] mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Your Projects</h1>
          <p className="text-gray-400 mt-2 text-base">Track the progress of your creative projects.</p>
        </div>

        {/* Projects */}
        {projects.length === 0 ? (
          <div className="text-center py-20">
            <FolderKanban size={40} className="mx-auto text-gray-200 mb-4" />
            <h2 className="text-lg font-semibold text-gray-400 mb-1">No projects yet</h2>
            <p className="text-sm text-gray-300">Your projects will appear here once they're created.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                revisions={revisions.filter((r) => r.project_id === p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
