import { AlertCircle, Clock, Eye, CheckCircle2, Minus, Pin } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Badge from '../ui/primitives/Badge'
import { STATUS_LABEL } from '../../lib/projectStatus'

// ── At-a-glance status badge, driven by computeProjectStatus ──────────────────
const STATUS_ICON = {
  'overdue':  AlertCircle,
  'due-soon': Clock,
  'review':   Eye,
  'approved': CheckCircle2,
  'idle':     Minus,
}

export default function StatusBadge({ status, className = '' }) {
  const Icon = STATUS_ICON[status] || Minus
  return (
    <Badge
      status={status}
      className={`${status === 'overdue' ? 'animate-pulse-subtle' : ''} ${className}`}
    >
      <Icon size={11} strokeWidth={2} />
      {STATUS_LABEL[status] || status}
    </Badge>
  )
}

// ── Per-user pinning ───────────────────────────────────────────────────────────
// usePins(userId) → { pinned: Set<projectId>, toggle(projectId), sortPinned(list, idKey) }
export function usePins(userId) {
  const [pinned, setPinned] = useState(new Set())

  useEffect(() => {
    if (!userId) return
    supabase.from('project_pins').select('project_id').eq('profile_id', userId)
      .then(({ data }) => setPinned(new Set((data || []).map((r) => r.project_id))))
  }, [userId])

  const toggle = useCallback(async (projectId) => {
    if (!userId) return
    const isPinned = pinned.has(projectId)
    // Optimistic
    setPinned((prev) => {
      const next = new Set(prev)
      isPinned ? next.delete(projectId) : next.add(projectId)
      return next
    })
    const { error } = isPinned
      ? await supabase.from('project_pins').delete()
          .eq('profile_id', userId).eq('project_id', projectId)
      : await supabase.from('project_pins').insert({ profile_id: userId, project_id: projectId })
    if (error) {
      // Roll back
      setPinned((prev) => {
        const next = new Set(prev)
        isPinned ? next.add(projectId) : next.delete(projectId)
        return next
      })
    }
  }, [userId, pinned])

  // Stable partition: pinned first, original order preserved within groups
  const sortPinned = useCallback((list, idKey = 'id') => [
    ...list.filter((x) => pinned.has(x[idKey])),
    ...list.filter((x) => !pinned.has(x[idKey])),
  ], [pinned])

  return { pinned, toggle, sortPinned }
}

// ── Pin toggle control ─────────────────────────────────────────────────────────
export function PinButton({ pinned, onToggle, className = '' }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={pinned ? 'Unpin' : 'Pin to top'}
      className={`p-1.5 rounded-lg transition-colors shrink-0 ${
        pinned
          ? 'text-accent bg-accent/10 hover:bg-accent/20'
          : 'text-text-muted/50 hover:text-text-primary hover:bg-surface-2'
      } ${className}`}
    >
      <Pin size={13} strokeWidth={2} fill={pinned ? 'currentColor' : 'none'} />
    </button>
  )
}
