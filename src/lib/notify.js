/**
 * Notification helpers
 *
 * Thin wrappers around `supabase.from('notifications').insert()`.
 * Import supabase inline so this module has no circular deps.
 */
import { supabase } from './supabase'

/** Send a notification to a single profile. */
export async function notify({ profileId, actorId, type, title, body, link }) {
  if (!profileId) return
  return supabase.from('notifications').insert({
    profile_id: profileId,
    actor_id:   actorId  ?? null,
    type,
    title,
    body:  body  ?? null,
    link:  link  ?? null,
  })
}

/** Send the same notification to multiple profiles (deduped against actorId). */
export async function notifyMany({ profileIds, actorId, type, title, body, link }) {
  const ids = [...new Set((profileIds || []).filter(Boolean).filter((id) => id !== actorId))]
  if (!ids.length) return
  return supabase.from('notifications').insert(
    ids.map((profile_id) => ({
      profile_id,
      actor_id: actorId ?? null,
      type,
      title,
      body:  body  ?? null,
      link:  link  ?? null,
    }))
  )
}

/** Notify all admin users (excluding the actor). */
export async function notifyAdmins({ actorId, type, title, body, link }) {
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
  return notifyMany({
    profileIds: (admins || []).map((a) => a.id),
    actorId, type, title, body, link,
  })
}
