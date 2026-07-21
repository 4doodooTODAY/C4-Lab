import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, Loader2, Check, CalendarDays, Clock, MapPin,
  DollarSign, Megaphone, Trash2, Undo2, Zap, CheckCircle, XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import { fmtTime } from '../../lib/time'
import Avatar from '../../components/ui/Avatar'

function calculateYourEarn(rateAmount) {
  if (!rateAmount) return null
  return rateAmount * 0.7
}

// ── Post modal ────────────────────────────────────────────────────────────────
function PostReferralModal({ onClose, onPosted }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ title: '', shoot_date: '', shoot_time: '', location: '', pay: '', shoot_type: '', rate_amount: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Give the shoot a title.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('shoot_referrals').insert({
      title:       form.title.trim(),
      shoot_date:  form.shoot_date || null,
      shoot_time:  form.shoot_time || null,
      location:    form.location.trim() || null,
      pay:         form.pay.trim() || null,
      shoot_type:  form.shoot_type.trim() || null,
      rate_amount: form.rate_amount ? parseFloat(form.rate_amount) : null,
      notes:       form.notes.trim() || null,
      posted_by:   user.id,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onPosted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative card w-full max-w-md z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            <h2 className="font-display text-lg text-text-primary">Post a referral</h2>
            <p className="text-xs text-text-muted mt-0.5">A shoot you can't take. The teammate you approve gets it.</p>
          </div>
          {!saving && <button onClick={onClose} className="btn-ghost p-1.5 -mr-1"><X size={16} /></button>}
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-3">
          <div>
            <label className="label">Shoot title *</label>
            <input className="input" placeholder="e.g. Real estate shoot, 3BR listing" value={form.title} onChange={set('title')} autoFocus />
          </div>
          <div>
            <label className="label">Type of Shoot *</label>
            <input className="input" placeholder="e.g. Restaurant Photography, Wedding Photos & Video" value={form.shoot_type} onChange={set('shoot_type')} />
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Rate Amount</label>
              <input type="number" step="0.01" className="input" placeholder="e.g. 800" value={form.rate_amount} onChange={set('rate_amount')} />
            </div>
            <div>
              <label className="label">Pay Details</label>
              <input className="input" placeholder="e.g. flat, /hr" value={form.pay} onChange={set('pay')} />
            </div>
          </div>
          <div>
            <label className="label">Notes <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea className="input resize-none text-xs" rows={2} placeholder="Gear needed, client vibe, anything useful…" value={form.notes} onChange={set('notes')} />
          </div>
          {error && <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-sm px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
              Post to pool
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Referral card ─────────────────────────────────────────────────────────────
function ReferralCard({ item: r, myId, isAdmin, onClaim, onRelease, onDelete, claiming, onStatusUpdate }) {
  const isMine     = r.posted_by === myId
  const isClaimed  = !!r.claimed_by
  const claimedByMe = r.claimed_by === myId
  const youEarn = calculateYourEarn(r.rate_amount)

  return (
    <div className={`card p-5 flex flex-col gap-3 transition-all ${
      claimedByMe ? '!border-accent/50' :
      isClaimed ? 'opacity-75' : 'hover:shadow-elevation-3'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">{r.title}</p>
          <p className="text-xs text-text-muted mt-0.5">
            Posted by <span className="font-medium">{isMine ? 'you' : (r.poster?.full_name || 'a teammate')}</span> {r.poster?.role && <span className="text-text-muted">({r.poster.role})</span>}
          </p>
        </div>
      </div>

      {r.shoot_type && (
        <div className="text-xs">
          <p className="text-text-muted">Type</p>
          <p className="text-text-primary font-medium">{r.shoot_type}</p>
        </div>
      )}

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
        {youEarn && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-status-approved-text">
            <DollarSign size={11} />
            You earn ${youEarn.toFixed(0)}
            <span className="text-text-muted font-normal">(after the 30% cut)</span>
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
                Apply
              </button>
            )}
            {isMine && (
              <span className="flex-1 text-center text-xs text-text-muted py-2">Waiting for a teammate to apply…</span>
            )}
            {(isMine || isAdmin) && (
              <button onClick={() => onDelete(r)} title="Remove listing"
                className="px-3 py-2 rounded-md text-status-overdue-text border border-status-overdue/30 hover:bg-status-overdue-bg transition-colors">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className={`flex items-center gap-2 text-xs font-semibold ${claimedByMe ? 'text-accent' : 'text-text-secondary'}`}>
                <Avatar name={r.claimer?.full_name} url={r.claimer?.avatar_url} size={6} />
                {claimedByMe ? 'You applied' : `Applied by ${r.claimer?.full_name || 'a teammate'}`}
                {r.claimed_at && <span className="text-text-muted font-normal">· {format(new Date(r.claimed_at), 'MMM d')}</span>}
              </span>
              {claimedByMe && (
                <button onClick={() => onRelease(r)} title="Withdraw your application"
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors">
                  <Undo2 size={11} /> Withdraw
                </button>
              )}
            </div>
            {isMine && r.referral_status === 'pending' && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onStatusUpdate(r, 'approved')}
                  className="flex-1 btn-primary text-xs flex items-center justify-center gap-1.5">
                  <CheckCircle size={12} /> Approve
                </button>
                <button
                  onClick={() => onStatusUpdate(r, 'declined')}
                  className="flex-1 px-3 py-2 text-xs rounded-md bg-status-overdue-bg text-status-overdue-text border border-status-overdue/30 hover:border-status-overdue/60 transition-colors flex items-center justify-center gap-1.5">
                  <XCircle size={12} /> Decline
                </button>
              </div>
            )}
            {r.referral_status && r.referral_status !== 'pending' && (
              <div className="text-xs text-text-muted">
                Status: <span className="font-medium capitalize">{r.referral_status}</span>
              </div>
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
      .select('*, poster:profiles!shoot_referrals_posted_by_fkey(id, full_name, avatar_url, role), claimer:profiles!shoot_referrals_claimed_by_fkey(id, full_name, avatar_url)')
      .order('created_at', { ascending: false })
    setRefs(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // First-come-first-served: the WHERE claimed_by IS NULL makes the claim
  // atomic. If someone beat you to it, zero rows update and you find out.
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
    if (!data?.length) { showToast('Someone beat you to it. Refreshing the pool.') }
    else { showToast(`You applied for "${r.title}". ${r.poster?.full_name || 'The poster'} will approve or decline.`) }
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

  const handleStatusUpdate = async (r, status) => {
    const { error } = await supabase.from('shoot_referrals')
      .update({
        referral_status: status,
        status_updated_by: myId,
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', r.id)
    if (error) showToast(error.message)
    else showToast(`Referral ${status} for "${r.title}"`)
    load()
  }

  const open    = (refs || []).filter((r) => !r.claimed_by)
  const claimed = (refs || []).filter((r) => r.claimed_by)

  return (
    <div className="p-8 max-w-5xl">
      <div className="anim-rise flex items-end justify-between mb-2 gap-6">
        <div>
          <h1 className="display">Referrals</h1>
          <p className="text-sm text-text-secondary mt-2 max-w-md">
            Shoots up for grabs. Post one you can't take, or apply for one you want.
          </p>
        </div>
        <button onClick={() => setShowPost(true)} className="btn-primary flex items-center gap-2 shrink-0">
          <Plus size={14} /> Post a shoot
        </button>
      </div>

      {refs === null ? (
        <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin text-text-muted" /></div>
      ) : (
        <div className="space-y-8 mt-6">
          {/* Open pool */}
          <section className="anim-rise d2">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone size={15} className="text-accent" />
              <h2 className="text-base font-semibold text-text-primary">Up for Grabs</h2>
              <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{open.length}</span>
            </div>
            {open.length === 0 ? (
              <div className="card p-10 text-center">
                <Megaphone size={30} className="mx-auto text-text-muted/30 mb-3" />
                <p className="text-sm font-semibold text-text-primary mb-1">Nothing in the pool right now</p>
                <p className="text-xs text-text-muted">Got a shoot you can't take? Post it and a teammate can pick it up.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {open.map((r) => (
                  <ReferralCard key={r.id} item={r} myId={myId} isAdmin={isAdmin}
                    onClaim={handleClaim} onRelease={handleRelease} onDelete={handleDelete} claiming={claiming}
                    onStatusUpdate={handleStatusUpdate} />
                ))}
              </div>
            )}
          </section>

          {/* Claimed */}
          {claimed.length > 0 && (
            <section className="anim-rise d3">
              <div className="flex items-center gap-2 mb-3">
                <Check size={15} className="text-status-approved" />
                <h2 className="text-base font-semibold text-text-primary">Applications & Approvals</h2>
                <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">{claimed.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {claimed.map((r) => (
                  <ReferralCard key={r.id} item={r} myId={myId} isAdmin={isAdmin}
                    onClaim={handleClaim} onRelease={handleRelease} onDelete={handleDelete} claiming={claiming}
                    onStatusUpdate={handleStatusUpdate} />
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
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-surface-3 border border-border text-text-primary text-sm font-medium px-4 py-2.5 rounded-md shadow-elevation-3 z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
