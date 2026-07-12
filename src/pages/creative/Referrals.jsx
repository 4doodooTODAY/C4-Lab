import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, Loader2, Check, CalendarDays, Clock, MapPin,
  DollarSign, Megaphone, Trash2, Undo2, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { fmtTime } from '../../lib/time'
import Avatar from '../../components/ui/Avatar'

// ── Post modal ────────────────────────────────────────────────────────────────
function PostReferralModal({ onClose, onPosted }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ title: '', shoot_date: '', shoot_time: '', location: '', pay: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Give the shoot a title.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('shoot_referrals').insert({
      title:      form.title.trim(),
      shoot_date: form.shoot_date || null,
      shoot_time: form.shoot_time || null,
      location:   form.location.trim() || null,
      pay:        form.pay.trim() || null,
      notes:      form.notes.trim() || null,
      posted_by:  user.id,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onPosted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Post a Referral</h2>
            <p className="text-xs text-text-muted mt-0.5">A shoot you can't take — first teammate to claim it gets it.</p>
          </div>
          {!saving && <button onClick={onClose} className="btn-ghost p-1.5 -mr-1"><X size={16} /></button>}
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-3">
          <div>
            <label className="label">Shoot title *</label>
            <input className="input" placeholder="e.g. Real estate shoot — 3BR listing" value={form.title} onChange={set('title')} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.shoot_date} onChange={set('shoot_date')} />
            </div>
            <div>
              <label className="label">Time</label>
              <input type="time" className="input" value={form.shoot_time} onChange={set('shoot_time')} />
            </div>
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" placeholder="Address or area" value={form.location} onChange={set('location')} />
          </div>
          <div>
            <label className="label">Pay</label>
            <input className="input" placeholder="e.g. $250 flat, $150/hr" value={form.pay} onChange={set('pay')} />
          </div>
          <div>
            <label className="label">Notes <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea className="input resize-none text-xs" rows={2} placeholder="Gear needed, client vibe, anything useful…" value={form.notes} onChange={set('notes')} />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
              Post to Pool
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Referral card ─────────────────────────────────────────────────────────────
function ReferralCard({ item: r, myId, isAdmin, onClaim, onRelease, onDelete, claiming }) {
  const isMine     = r.posted_by === myId
  const isClaimed  = !!r.claimed_by
  const claimedByMe = r.claimed_by === myId

  return (
    <div className={`bg-white rounded-2xl border p-5 flex flex-col gap-3 transition-all ${
      claimedByMe ? 'border-accent/50 shadow-elevation-1' :
      isClaimed ? 'border-border opacity-75' : 'border-border hover:shadow-md'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{r.title}</p>
          <p className="text-xs text-text-muted mt-0.5">
            Posted by {isMine ? 'you' : (r.poster?.full_name || 'a teammate')}
          </p>
        </div>
        {r.pay && (
          <span className="shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-status-approved-bg text-status-approved-text">
            <DollarSign size={11} strokeWidth={2.5} />{r.pay.replace(/^\$/, '')}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {r.shoot_date && (
          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
            <CalendarDays size={11} className="text-text-muted" />
            {format(parseISO(r.shoot_date), 'EEE, MMM d, yyyy')}
            {r.shoot_time && <> · <Clock size={11} className="text-text-muted" /> {fmtTime(r.shoot_time)}</>}
          </p>
        )}
        {r.location && (
          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin size={11} className="text-text-muted" /> {r.location}
          </p>
        )}
        {r.notes && <p className="text-xs text-text-muted line-clamp-2">{r.notes}</p>}
      </div>

      <div className="mt-auto pt-1">
        {!isClaimed ? (
          <div className="flex gap-2">
            {!isMine && (
              <button
                onClick={() => onClaim(r)}
                disabled={claiming === r.id}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {claiming === r.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Claim this shoot
              </button>
            )}
            {isMine && (
              <span className="flex-1 text-center text-xs text-text-muted py-2">Waiting for a teammate to claim…</span>
            )}
            {(isMine || isAdmin) && (
              <button onClick={() => onDelete(r)} title="Remove listing"
                className="px-3 py-2 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 transition-colors">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className={`flex items-center gap-2 text-xs font-semibold ${claimedByMe ? 'text-accent' : 'text-text-secondary'}`}>
              <Avatar name={r.claimer?.full_name} url={r.claimer?.avatar_url} size={6} />
              {claimedByMe ? 'You claimed this' : `Claimed by ${r.claimer?.full_name || 'a teammate'}`}
              {r.claimed_at && <span className="text-text-muted font-normal">· {format(new Date(r.claimed_at), 'MMM d')}</span>}
            </span>
            {claimedByMe && (
              <button onClick={() => onRelease(r)} title="Release it back to the pool"
                className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors">
                <Undo2 size={11} /> Release
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Referrals() {
  const { profile } = useAuth()
  const myId    = profile?.id
  const isAdmin = profile?.role === 'admin'
  const [refs, setRefs]       = useState(null)
  const [showPost, setShowPost] = useState(false)
  const [claiming, setClaiming] = useState(null)
  const [toast, setToast]     = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shoot_referrals')
      .select('*, poster:profiles!shoot_referrals_posted_by_fkey(id, full_name, avatar_url), claimer:profiles!shoot_referrals_claimed_by_fkey(id, full_name, avatar_url)')
      .order('created_at', { ascending: false })
    setRefs(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // First-come-first-served: the WHERE claimed_by IS NULL makes the claim
  // atomic — if someone beat you to it, zero rows update and you find out.
  const handleClaim = async (r) => {
    setClaiming(r.id)
    const { data, error } = await supabase
      .from('shoot_referrals')
      .update({ claimed_by: myId, claimed_at: new Date().toISOString() })
      .eq('id', r.id)
      .is('claimed_by', null)
      .select('id')
    setClaiming(null)
    if (error) { showToast(error.message); return }
    if (!data?.length) { showToast('Someone claimed it first — refreshing the pool.') }
    else { showToast(`"${r.title}" is yours — reach out to ${r.poster?.full_name || 'the poster'} for details.`) }
    load()
  }

  const handleRelease = async (r) => {
    if (!window.confirm('Release this shoot back to the pool?')) return
    await supabase.from('shoot_referrals')
      .update({ claimed_by: null, claimed_at: null })
      .eq('id', r.id).eq('claimed_by', myId)
    load()
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`Remove "${r.title}" from the pool?`)) return
    const { error } = await supabase.from('shoot_referrals').delete().eq('id', r.id)
    if (error) showToast(error.message)
    load()
  }

  const open    = (refs || []).filter((r) => !r.claimed_by)
  const claimed = (refs || []).filter((r) => r.claimed_by)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Referrals</h1>
          <p className="text-sm text-text-muted mt-1">
            Shoots up for grabs — post one you can't take, claim one you want. First come, first served.
          </p>
        </div>
        <button onClick={() => setShowPost(true)} className="btn-primary flex items-center gap-2 shrink-0">
          <Plus size={14} /> Post a Shoot
        </button>
      </div>

      {refs === null ? (
        <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-8 mt-6">
          {/* Open pool */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Megaphone size={15} className="text-accent" />
              <h2 className="text-base font-semibold text-text-primary">Up for Grabs</h2>
              <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{open.length}</span>
            </div>
            {open.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border p-10 text-center">
                <Megaphone size={30} className="mx-auto text-text-muted/30 mb-3" />
                <p className="text-sm font-semibold text-text-primary mb-1">Nothing in the pool right now</p>
                <p className="text-xs text-text-muted">Got a shoot you can't take? Post it and a teammate can pick it up.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {open.map((r) => (
                  <ReferralCard key={r.id} item={r} myId={myId} isAdmin={isAdmin}
                    onClaim={handleClaim} onRelease={handleRelease} onDelete={handleDelete} claiming={claiming} />
                ))}
              </div>
            )}
          </section>

          {/* Claimed */}
          {claimed.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Check size={15} className="text-green-500" />
                <h2 className="text-base font-semibold text-text-primary">Claimed</h2>
                <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{claimed.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {claimed.map((r) => (
                  <ReferralCard key={r.id} item={r} myId={myId} isAdmin={isAdmin}
                    onClaim={handleClaim} onRelease={handleRelease} onDelete={handleDelete} claiming={claiming} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showPost && (
        <PostReferralModal onClose={() => setShowPost(false)} onPosted={() => { setShowPost(false); load() }} />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-text-primary text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
