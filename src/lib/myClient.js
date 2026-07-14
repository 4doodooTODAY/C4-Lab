import { supabase } from './supabase'

// ── Multi-account client resolution ──────────────────────────────────────────
// A client can have up to 2 login accounts (client_members). Primary accounts
// are also members (backfilled), so membership is the single source of truth —
// with a profile_id fallback for anything not yet backfilled.

/**
 * getMyClient(userId, select) → the client row for this login, or null.
 * `select` is the columns you need from clients (default 'id, name').
 */
export async function getMyClient(userId, select = 'id, name') {
  if (!userId) return null
  const { data: m } = await supabase
    .from('client_members')
    .select(`client_id, clients(${select})`)
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle()
  if (m?.clients) return m.clients
  const { data } = await supabase
    .from('clients')
    .select(select)
    .eq('profile_id', userId)
    .maybeSingle()
  return data
}

/**
 * clientProfileIds(clientId) → every login account's profile id for a client
 * (primary + members, deduped). Use for notifications so BOTH accounts hear
 * about reviews, uploads, etc.
 */
export async function clientProfileIds(clientId) {
  if (!clientId) return []
  const [{ data: c }, { data: members }] = await Promise.all([
    supabase.from('clients').select('profile_id').eq('id', clientId).maybeSingle(),
    supabase.from('client_members').select('profile_id').eq('client_id', clientId),
  ])
  const ids = new Set()
  if (c?.profile_id) ids.add(c.profile_id)
  ;(members || []).forEach((m) => ids.add(m.profile_id))
  return [...ids]
}
