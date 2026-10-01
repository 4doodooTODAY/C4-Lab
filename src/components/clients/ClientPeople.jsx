import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { UserPlus, Loader2, Mail, Check, X, Star, Trash2, Copy } from 'lucide-react'
import Avatar from '../ui/Avatar'
import {
  listClientPeople, addClientPerson, removeClientPerson, setClientPrimary, resendClientInvite,
} from '../../lib/clientPeople'

// ── People on a client account ───────────────────────────────────────────────
// Everyone listed here signs in with their own email and password and sees
// the same client portal: projects, concepts, calendar, uploads.
export default function ClientPeople({ client, onChanged }) {
  const [people, setPeople]   = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [adding, setAdding]   = useState(false)
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [notice, setNotice]   = useState(null)   // { text, link? }
  const [busy, setBusy]       = useState(null)   // profile_id with an action in flight
  const [resent, setResent]   = useState(null)

  const load = useCallback(async () => {
    try {
      setPeople(await listClientPeople(client.id))
      setLoadErr('')
    } catch (err) {
      setLoadErr(err.message)
      setPeople([])
    }
  }, [client.id])

  useEffect(() => { load() }, [load])

  const reset = () => { setAdding(false); setName(''); setEmail(''); setError('') }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await addClientPerson(client.id, { full_name: name.trim(), email: email.trim() })
      const who = name.trim()
      if (!res.invited) {
        setNotice({ text: `${who} already had a C4C Lab login and can now see this client.` })
      } else if (res.emailed) {
        setNotice({ text: `Invite sent to ${email.trim()}. They will set a password, then land in this client's portal.` })
      } else {
        setNotice({ text: `${who} was added, but the email could not send. Share this setup link with them directly.`, link: res.invite_link })
      }
      reset()
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (p) => {
    const others = people.length - 1
    const msg = p.is_primary && others > 0
      ? `Remove ${p.full_name || p.email}? They are the primary contact, so primary moves to the next person. Their login is locked until they are added back.`
      : `Remove ${p.full_name || p.email} from this client? Their login is locked until they are added back.`
    if (!window.confirm(msg)) return
    setBusy(p.profile_id)
    try {
      await removeClientPerson(client.id, p.profile_id)
      await load()
      onChanged?.()
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(null)
    }
  }

  const handlePrimary = async (p) => {
    setBusy(p.profile_id)
    try {
      await setClientPrimary(client.id, p.profile_id)
      await load()
      onChanged?.()
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(null)
    }
  }

  const handleResend = async (p) => {
    setBusy(p.profile_id)
    try {
      await resendClientInvite({ email: p.email, full_name: p.full_name })
      setResent(p.profile_id)
      setTimeout(() => setResent(null), 4000)
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            People{people?.length ? <span className="text-text-muted font-normal"> · {people.length}</span> : null}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">Everyone here signs in with their own login and sees this client's portal.</p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setNotice(null) }} className="btn-primary text-xs flex items-center gap-1.5 shrink-0">
            <UserPlus size={13} /> Add person
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="mt-4 p-3 rounded-xl bg-surface-2 border border-border space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            <input type="email" className="input" placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p className="text-xs text-status-overdue-text">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-text-muted">They get an email to set a password.</p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={reset} className="btn-ghost text-xs" disabled={saving}>Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                Send invite
              </button>
            </div>
          </div>
        </form>
      )}

      {notice && (
        <div className="mt-4 p-3 rounded-xl bg-status-approved-bg text-status-approved-text text-xs flex items-start gap-2">
          <Check size={13} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <p>{notice.text}</p>
            {notice.link && (
              <button
                onClick={() => navigator.clipboard.writeText(notice.link).catch(() => {})}
                className="flex items-center gap-1 font-semibold hover:underline"
              >
                <Copy size={11} /> Copy setup link
              </button>
            )}
          </div>
          <button onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      <div className="mt-4">
        {people === null ? (
          <div className="py-4 flex justify-center"><Loader2 size={16} className="animate-spin text-text-muted" /></div>
        ) : loadErr ? (
          <p className="text-xs text-status-overdue-text">{loadErr}</p>
        ) : people.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">Nobody can sign in to this client yet. Add the first person above.</p>
        ) : (
          <div className="space-y-2">
            {people.map((p) => (
              <div key={p.profile_id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border">
                <Avatar name={p.full_name || p.email} url={p.avatar_url} size={8} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-text-primary truncate">{p.full_name || 'Not set'}</p>
                    {p.is_primary && (
                      <span className="text-[10px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">Primary</span>
                    )}
                    {p.pending && (
                      <span className="text-[10px] font-semibold text-status-due-soon-text bg-status-due-soon-bg px-1.5 py-0.5 rounded-full">Invite pending</span>
                    )}
                    {p.locked && (
                      <span className="text-[10px] font-semibold text-status-overdue-text bg-status-overdue-bg px-1.5 py-0.5 rounded-full">Locked</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate">
                    {p.email}
                    {p.last_sign_in_at && !p.pending && (
                      <> · active {formatDistanceToNow(new Date(p.last_sign_in_at), { addSuffix: true })}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {busy === p.profile_id ? (
                    <Loader2 size={13} className="animate-spin text-text-muted m-1.5" />
                  ) : (
                    <>
                      {p.pending && p.email && (
                        <button
                          onClick={() => handleResend(p)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                          title={resent === p.profile_id ? 'Invite re-sent' : 'Resend invite'}
                        >
                          {resent === p.profile_id ? <Check size={13} className="text-status-approved-text" /> : <Mail size={13} />}
                        </button>
                      )}
                      {!p.is_primary && (
                        <button
                          onClick={() => handlePrimary(p)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                          title="Make primary contact"
                        >
                          <Star size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(p)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-status-overdue-text hover:bg-status-overdue-bg transition-colors"
                        title="Remove from this client"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
