import { supabase } from './supabase'

// ── Client people: every login on a client account ───────────────────────────
// All writes go through the create-user edge function, which refuses team
// emails (so nobody gets demoted to a client) and keeps one person per client.

async function callCreateUser(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const listClientPeople = (clientId) =>
  callCreateUser({ action: 'list_client_members', client_id: clientId }).then((d) => d.members || [])

/** → { user, invited, emailed, invite_link } */
export const addClientPerson = (clientId, { full_name, email }) =>
  callCreateUser({ action: 'add_client_member', client_id: clientId, full_name, email })

export const removeClientPerson = (clientId, profileId) =>
  callCreateUser({ action: 'remove_client_member', client_id: clientId, profile_id: profileId })

export const setClientPrimary = (clientId, profileId) =>
  callCreateUser({ action: 'set_client_primary', client_id: clientId, profile_id: profileId })

export const resendClientInvite = ({ email, full_name }) =>
  callCreateUser({ action: 'resend_invite', email, full_name, role: 'client' })
