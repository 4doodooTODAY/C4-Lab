// ── Project status engine ─────────────────────────────────────────────────────
// Single source of truth for the at-a-glance color system on Projects views.
// Maps real project state + due date to the design-token status set:
//
//   overdue   → red (subtle pulse)   due date passed, not done
//   due-soon  → orange               due within 7 days, not done
//   review    → violet               submitted / with client / in review
//   approved  → green                ONLY when finalized AND approved
//   idle      → muted gray           everything else
//
// "Overdue" respects the user's local timezone: date-only strings are parsed
// as local dates (parseISO), compared against local start-of-day.

import { parseISO, startOfDay, addDays, isBefore } from 'date-fns'

const FINAL_STAGES = ['delivered', 'ready_to_post']

export function latestRevisionFor(projectId, revisions = []) {
  return [...revisions]
    .filter((r) => r.project_id === projectId)
    .sort((a, b) => (b.revision_number || 0) - (a.revision_number || 0))[0] || null
}

/**
 * computeProjectStatus(project, latestRev) → 'overdue' | 'due-soon' | 'review' | 'approved' | 'idle'
 */
export function computeProjectStatus(project, latestRev = null) {
  const stage = project.stage

  // Green strictly requires BOTH: a final stage AND client approval.
  const isFinal    = FINAL_STAGES.includes(stage)
  const isApproved = latestRev?.status === 'approved' || stage === 'ready_to_post'
  if (isFinal && isApproved) return 'approved'

  // Done-but-not-approved never shows date urgency — it's parked, not late.
  if (!isFinal) {
    const today = startOfDay(new Date())
    const due = project.due_date ? startOfDay(parseISO(project.due_date)) : null
    if (due && isBefore(due, today)) return 'overdue'
    if (due && isBefore(due, addDays(today, 8))) return 'due-soon'
  }

  // Submitted / in review — with the client or awaiting internal review.
  if (stage === 'review' || stage === 'revisions') return 'review'
  if (latestRev && ['pending_client_review', 'pending_creative_review'].includes(latestRev.status)) return 'review'

  return 'idle'
}

export const STATUS_LABEL = {
  'overdue':  'Overdue',
  'due-soon': 'Due soon',
  'review':   'In review',
  'approved': 'Approved · Final',
  'idle':     'On track',
}
