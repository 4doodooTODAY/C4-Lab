import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Users2, Plus, Send, Loader2, MessageSquare, X, Pin, PinOff,
  Bell, Pencil, Check, Image, Smile, ArrowLeft, Search, Phone, Video, Info,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { uploadToR2 } from '../lib/r2'
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns'
import Avatar from '../components/ui/Avatar'

// ── Emoji data ────────────────────────────────────────────────────────────────
const EMOJI_CATS = [
  { label: 'Smileys', icon: '😊', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👻','💀','☠️','👽','🤖','🎃'] },
  { label: 'Hands', icon: '👋', emojis: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦵','🦶','👂','👃','💄','💋','👁️','👅','🧠','🫀','🫁','🦷','🦴'] },
  { label: 'Hearts', icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','✡️','🔯','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆒','🆓','🆕','🆙','🆗','🅰️','🅱️','🅾️','🆘','✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤'] },
  { label: 'People', icon: '🧑', emojis: ['🧑','👱','👴','👵','🧓','👶','🧒','👦','👧','👨','👩','🧔','🧑‍🦱','🧑‍🦰','🧑‍🦳','🧑‍🦲','🧑‍⚕️','🧑‍🎓','🧑‍🏫','🧑‍⚖️','🧑‍🌾','🧑‍🍳','🧑‍🔧','🧑‍🏭','🧑‍💼','🧑‍🔬','🧑‍🎨','🧑‍✈️','🧑‍🚀','🧑‍🚒','👮','💂','🕵️','👷','🫅','🤴','👸','🧙','🧚','🧜','🧝','🧞','🧟','🧌','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🧖','🧗','🏇','🏋️','🤼','🤸','🤾','🏌️','🏄','🚣','🧘','🛀','🛌','👫','👬','👭','💑','💏','👨‍👩‍👦','👨‍👩‍👧','👨‍👩‍👧‍👦','👩‍👦','👩‍👧','🗣️','👤','👥'] },
  { label: 'Nature', icon: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦋','🐝','🐠','🐙','🦑','🐸','🦎','🐊','🐢','🦕','🦖','🐍','🦕','🐾','🌸','🌺','🌻','🌹','🌷','🌿','🍀','🍁','🌲','🌴','🌵','🍄','🌾','🌱','🌿','☘️','🪴','🌳','🌵','🎋','🎍','🐚','🌊','🌬️','🌀','🌈','🌂','⛱️','⚡','❄️','☃️','⛄','☄️','🔥','💧','🌊'] },
  { label: 'Food', icon: '🍕', emojis: ['🍕','🍔','🍟','🌭','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🍵','🧃','🥤','🧋','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🫗','🧊','🥢','🍽️','🥄','🔪','🫙'] },
  { label: 'Travel', icon: '✈️', emojis: ['✈️','🚀','🛸','🛩️','💺','🚁','🚟','🚠','🚡','🛰️','🚂','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🏎️','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏗️','🦯','🦽','🦼','🛺','🛵','🏍️','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🪝','🗺️','🧭','🌍','🌎','🌏','🗼','🗽','⛩️','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛺','🏕️','🌋','🗻','🏔️','🏝️','🏜️','🏞️'] },
  { label: 'Objects', icon: '💡', emojis: ['💡','🔦','🕯️','🪔','🧱','🔮','🪄','💎','🔑','🗝️','🔐','🔏','🔒','🔓','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🛡️','🪚','🔧','🪛','🔩','⚙️','🗜️','⚖️','🦯','🔗','⛓️','🧰','🪤','🧲','🪜','🧪','🧫','🧬','🔭','🔬','🩺','🩹','💊','💉','🩸','🩼','🩻','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎟️','🎫','🎪','🤹','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🎷','🎺','🎸','🪕','🎻','🥁','🪘','🎮','🎲','🎯','🎳','🎰','🧩','🪅','🪆','🪡','🧸','🪣','🛍️','🎁','🎀','🎊','🎉','🎈','🎏','🎐','🧧','🎑'] },
  { label: 'Symbols', icon: '💯', emojis: ['💯','🔔','🔕','📢','📣','💬','💭','🗯️','💤','💢','💥','💫','💦','💨','🕳️','💬','🗨️','💭','🗯️','🔱','⚜️','🔰','♾️','✅','❎','🌐','📶','📳','📴','📵','📛','🚫','⛔','🚳','🚭','🚯','🚱','🚷','📵','❓','❔','❕','❗','‼️','⁉️','🔅','🔆','📲','📳','🆚','🈵','🈴','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🔞','🔃','🔄','🔙','🔚','🔛','🔜','🔝','🛐','⚛️','🕉️','✡️','☸️','☯️','✝️','☦️','🛐','☮️','🕎','🔯'] },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function dateSep(ts) {
  const d = new Date(ts)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMMM d, yyyy')
}
function getConvName(conv, myId) {
  if (!conv) return ''
  if (conv.is_group) return conv.name || 'Team'
  const other = conv.conversation_members?.find((m) => m.profile_id !== myId)
  return other?.profiles?.full_name || 'Unknown'
}
function getConvAvatar(conv, myId) {
  if (conv.is_group) return null
  return conv.conversation_members?.find((m) => m.profile_id !== myId)?.profiles?.avatar_url || null
}
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const diffMin = (Date.now() - d) / 60000
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${Math.floor(diffMin)}m`
  if (diffMin < 1440) return format(d, 'h:mm a')
  if (diffMin < 10080) return format(d, 'EEE')
  return format(d, 'MMM d')
}
function computeGroups(msgs) {
  return msgs.map((msg, i) => {
    const prev = msgs[i - 1]
    const next = msgs[i + 1]
    const sameDay = (a, b) => format(new Date(a.created_at), 'yyyy-MM-dd') === format(new Date(b.created_at), 'yyyy-MM-dd')
    const within3 = (a, b) => Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 3 * 60 * 1000
    return {
      ...msg,
      topGrouped:    !!(prev && prev.sender_id === msg.sender_id && sameDay(prev, msg) && within3(prev, msg)),
      bottomGrouped: !!(next && next.sender_id === msg.sender_id && sameDay(msg, next) && within3(msg, next)),
      showDate:      !prev || format(new Date(prev.created_at), 'yyyy-MM-dd') !== format(new Date(msg.created_at), 'yyyy-MM-dd'),
    }
  })
}

// ── EmojiPicker ───────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }) {
  const [cat, setCat] = useState(0)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = q
    ? EMOJI_CATS.flatMap(c => c.emojis).filter(e => {
        // simple inclusion — emojis don't have search metadata, just show all when searching
        return true
      }).slice(0, 80)
    : EMOJI_CATS[cat].emojis

  return (
    <div ref={ref} className="absolute bottom-14 left-0 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden select-none">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search emojis…"
          className="w-full text-xs bg-surface-2 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
          autoFocus
        />
      </div>
      {/* Category tabs */}
      {!q && (
        <div className="flex border-b border-border px-2 gap-0.5 overflow-x-auto">
          {EMOJI_CATS.map((c, i) => (
            <button key={c.label} onClick={() => setCat(i)}
              className={`text-lg px-2 py-1.5 rounded-t-lg transition-colors shrink-0 ${cat === i ? 'bg-accent/10' : 'hover:bg-surface-2'}`}
              title={c.label}>
              {c.icon}
            </button>
          ))}
        </div>
      )}
      {/* Grid */}
      <div className="grid grid-cols-8 gap-0 p-2 max-h-52 overflow-y-auto">
        {filtered.map((e, i) => (
          <button key={`${e}-${i}`} onClick={() => { onSelect(e); onClose() }}
            className="text-xl p-1.5 rounded-lg hover:bg-surface-2 transition-colors leading-none">
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Image Lightbox ────────────────────────────────────────────────────────────
function ImageLightbox({ url, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/60 hover:text-white p-2" onClick={onClose}>
        <X size={20} />
      </button>
      <img src={url} alt="" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
    </div>
  )
}

// ── Pinned Panel ──────────────────────────────────────────────────────────────
function PinnedPanel({ pinned, isAdmin, onUnpin, onClose }) {
  return (
    <div className="border-b border-amber-100 bg-amber-50/60 shrink-0">
      <div className="px-5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pin size={12} className="text-amber-600" />
          <span className="text-xs font-semibold text-amber-700">{pinned.length} pinned</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={13} /></button>
      </div>
      <div className="px-5 pb-3 space-y-1.5 max-h-40 overflow-y-auto">
        {pinned.map((pm) => (
          <div key={pm.id} className="bg-white rounded-xl px-3 py-2 flex items-start gap-2 border border-amber-100">
            <Pin size={10} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-text-muted mb-0.5">
                {pm.messages?.profiles?.full_name || 'Unknown'}
                {pm.messages?.created_at ? ` · ${format(new Date(pm.messages.created_at), 'MMM d')}` : ''}
              </p>
              {pm.messages?.image_url
                ? <p className="text-xs text-text-muted">📷 Photo</p>
                : <p className="text-xs text-text-primary leading-relaxed line-clamp-2">{pm.messages?.content}</p>
              }
            </div>
            {isAdmin && (
              <button onClick={() => onUnpin(pm.message_id)} className="text-text-muted hover:text-red-500 shrink-0">
                <PinOff size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Pin Request Banner ────────────────────────────────────────────────────────
function PinRequestBanner({ requests, messages, onApprove, onDecline }) {
  if (!requests.length) return null
  return (
    <div className="border-b border-blue-100 bg-blue-50/60 px-5 py-2 shrink-0">
      <p className="text-[11px] font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
        <Bell size={10} /> {requests.length} pin request{requests.length !== 1 ? 's' : ''} pending
      </p>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {requests.map((req) => {
          const msg = messages.find((m) => m.id === req.message_id)
          return (
            <div key={req.id} className="bg-white rounded-lg px-3 py-1.5 flex items-center gap-2 border border-blue-100">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text-muted">
                  <span className="font-medium">{req.profiles?.full_name || 'Someone'}</span> wants to pin:
                </p>
                <p className="text-xs text-text-primary truncate">
                  {msg?.image_url ? '📷 Photo' : msg?.content || '…'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onApprove(req)} className="text-[11px] font-semibold text-green-700 hover:underline">Approve</button>
                <button onClick={() => onDecline(req.id)} className="text-[11px] font-semibold text-red-600 hover:underline">Decline</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Messages() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId]       = useState(null)
  const [messages, setMessages]           = useState([])
  const [pinned, setPinned]               = useState([])
  const [pinRequests, setPinRequests]     = useState([])
  const [pinnedIds, setPinnedIds]         = useState(new Set())
  const [requestedIds, setRequestedIds]   = useState(new Set())
  const [hoveredId, setHoveredId]         = useState(null)
  const [showPinned, setShowPinned]       = useState(false)
  const [editingName, setEditingName]     = useState(false)
  const [convName, setConvName]           = useState('')
  const [text, setText]                   = useState('')
  const [allProfiles, setAllProfiles]     = useState([])
  const [showNewDM, setShowNewDM]         = useState(false)
  const [loading, setLoading]             = useState(true)
  const [msgsLoading, setMsgsLoading]     = useState(false)
  const [showEmoji, setShowEmoji]         = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl]     = useState(null)
  const [search, setSearch]               = useState('')
  const [dmError, setDmError]             = useState('')
  const [dmLoading, setDmLoading]         = useState(null)

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const nameInputRef = useRef(null)
  const imageInputRef = useRef(null)

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async (keepSelected = false) => {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        id, name, is_group, created_at, last_message_at, last_message_preview,
        conversation_members(profile_id, profiles(id, full_name, avatar_url))
      `)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (error) { console.error('Conversations error:', error); return [] }
    const sorted = (data || []).sort((a, b) => {
      if (a.is_group && !b.is_group) return -1
      if (!a.is_group && b.is_group) return 1
      const aT = a.last_message_at ? new Date(a.last_message_at) : 0
      const bT = b.last_message_at ? new Date(b.last_message_at) : 0
      return bT - aT
    })
    setConversations(sorted)
    if (!keepSelected && sorted.length > 0) setSelectedId(sorted[0].id)
    setLoading(false)
    return sorted
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    if (!user?.id) return

    if (isAdmin) {
      // Admin sees everyone
      supabase.from('profiles')
        .select('id, full_name, role, avatar_url')
        .neq('id', user.id)
        .order('full_name')
        .then(({ data }) => setAllProfiles(data || []))
    } else {
      // Creatives see: admins + teammates on their projects + assigned clients
      const load = async () => {
        const [{ data: myProjects }, { data: admins }] = await Promise.all([
          supabase.from('projects')
            .select('creative_id, editor_id, client_id, clients(profile_id, name, contact_name)')
            .or(`creative_id.eq.${user.id},editor_id.eq.${user.id}`)
            .neq('stage', 'archived'),
          supabase.from('profiles')
            .select('id, full_name, role, avatar_url')
            .eq('role', 'admin'),
        ])

        // Team members on same projects
        const projectPeopleIds = new Set(
          (myProjects || []).flatMap((p) => [p.creative_id, p.editor_id].filter(Boolean))
        )
        projectPeopleIds.delete(user.id)

        // Client profile_ids from assigned projects
        const clientProfileIds = [
          ...new Set(
            (myProjects || [])
              .map((p) => p.clients?.profile_id)
              .filter(Boolean)
          )
        ]

        const [projectPeopleRes, clientProfilesRes] = await Promise.all([
          projectPeopleIds.size > 0
            ? supabase.from('profiles').select('id, full_name, role, avatar_url').in('id', [...projectPeopleIds])
            : { data: [] },
          clientProfileIds.length > 0
            ? supabase.from('profiles').select('id, full_name, role, avatar_url').in('id', clientProfileIds)
            : { data: [] },
        ])

        const all = [
          ...(admins || []),
          ...(projectPeopleRes.data || []),
          ...(clientProfilesRes.data || []),
        ]
        const seen = new Set()
        const deduped = all.filter((p) => {
          if (p.id === user.id || seen.has(p.id)) return false
          seen.add(p.id); return true
        }).sort((a, b) => a.full_name.localeCompare(b.full_name))
        setAllProfiles(deduped)
      }
      load()
    }
  }, [user?.id, isAdmin])

  // ── Load messages + pinned + requests when conversation changes ─────────────
  useEffect(() => {
    if (!selectedId || !user?.id) return
    setMsgsLoading(true)
    setMessages([])
    setPinned([])
    setPinRequests([])
    setShowPinned(false)
    const conv = conversations.find((c) => c.id === selectedId)
    setConvName(conv?.name || '')

    const loadAll = async () => {
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('joined_at')
        .eq('conversation_id', selectedId)
        .eq('profile_id', user.id)
        .single()
      const myJoinedAt = memberData?.joined_at || new Date(0).toISOString()

      const { data: msgsData } = await supabase
        .from('messages')
        .select('id, content, image_url, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
        .eq('conversation_id', selectedId)
        .gte('created_at', myJoinedAt)
        .order('created_at', { ascending: true })
        .limit(200)
      setMessages(msgsData || [])

      const { data: pinnedData } = await supabase
        .from('pinned_messages')
        .select('id, message_id, pinned_at, messages!message_id(id, content, image_url, created_at, profiles!sender_id(full_name))')
        .eq('conversation_id', selectedId)
        .order('pinned_at', { ascending: false })
      const pl = pinnedData || []
      setPinned(pl)
      setPinnedIds(new Set(pl.map((p) => p.message_id)))

      if (isAdmin) {
        const { data: reqData } = await supabase
          .from('pin_requests')
          .select('id, message_id, conversation_id, created_at, profiles!requested_by(full_name)')
          .eq('conversation_id', selectedId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
        const rl = reqData || []
        setPinRequests(rl)
        setRequestedIds(new Set(rl.map((r) => r.message_id)))
      }
      setMsgsLoading(false)
    }
    loadAll()
  }, [selectedId, user?.id, isAdmin])

  // ── Realtime: new messages ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !user?.id) return
    const ch = supabase.channel(`msgs-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, async (payload) => {
        if (payload.new.sender_id === user.id) return
        const { data } = await supabase
          .from('messages')
          .select('id, content, image_url, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
          .eq('id', payload.new.id).single()
        if (data) {
          setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data])
          // Update conversation preview
          setConversations((prev) => prev.map((c) =>
            c.id === selectedId
              ? { ...c, last_message_at: data.created_at, last_message_preview: data.image_url ? '📷 Photo' : data.content?.slice(0, 80) }
              : c
          ).sort((a, b) => {
            if (a.is_group && !b.is_group) return -1
            if (!a.is_group && b.is_group) return 1
            const aT = a.last_message_at ? new Date(a.last_message_at) : 0
            const bT = b.last_message_at ? new Date(b.last_message_at) : 0
            return bT - aT
          }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedId, user?.id])

  // ── Realtime: pinned / pin requests ────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    const ch = supabase.channel(`pinned-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages', filter: `conversation_id=eq.${selectedId}` },
        () => supabase.from('pinned_messages')
          .select('id, message_id, pinned_at, messages!message_id(id, content, image_url, created_at, profiles!sender_id(full_name))')
          .eq('conversation_id', selectedId)
          .order('pinned_at', { ascending: false })
          .then(({ data }) => {
            const pl = data || []
            setPinned(pl)
            setPinnedIds(new Set(pl.map((p) => p.message_id)))
          })
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || !isAdmin) return
    const ch = supabase.channel(`pinreq-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pin_requests', filter: `conversation_id=eq.${selectedId}` },
        () => supabase.from('pin_requests')
          .select('id, message_id, conversation_id, created_at, profiles!requested_by(full_name)')
          .eq('conversation_id', selectedId).eq('status', 'pending')
          .then(({ data }) => {
            const rl = data || []
            setPinRequests(rl)
            setRequestedIds(new Set(rl.map((r) => r.message_id)))
          })
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedId, isAdmin])

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    el.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'instant' })
  }, [messages])

  useEffect(() => { if (editingName) nameInputRef.current?.select() }, [editingName])

  // ── Auto-resize textarea ────────────────────────────────────────────────────
  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.style.height = 'auto'
    inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
  }, [text])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault()
    const content = text.trim()
    if (!content || !selectedId) return
    setText('')
    if (inputRef.current) { inputRef.current.style.height = 'auto' }
    const tempId = `opt-${Date.now()}`
    const now = new Date().toISOString()
    setMessages((prev) => [...prev, {
      id: tempId, content, image_url: null, created_at: now, sender_id: user.id,
      profiles: { id: user.id, full_name: profile?.full_name, avatar_url: profile?.avatar_url },
    }])
    setConversations((prev) => prev.map((c) =>
      c.id === selectedId ? { ...c, last_message_at: now, last_message_preview: content.slice(0, 80) } : c
    ).sort((a, b) => {
      if (a.is_group && !b.is_group) return -1
      if (!a.is_group && b.is_group) return 1
      const aT = a.last_message_at ? new Date(a.last_message_at) : 0
      const bT = b.last_message_at ? new Date(b.last_message_at) : 0
      return bT - aT
    }))
    const { data } = await supabase
      .from('messages')
      .insert({ conversation_id: selectedId, sender_id: user.id, content })
      .select('id, content, image_url, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
      .single()
    if (data) setMessages((prev) => prev.map((m) => m.id === tempId ? data : m))
  }

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !selectedId) return
    e.target.value = ''
    setImageUploading(true)
    for (const file of files) {
      const tempId = `img-opt-${Date.now()}-${Math.random()}`
      const fakeUrl = URL.createObjectURL(file)
      setMessages((prev) => [...prev, {
        id: tempId, content: '', image_url: fakeUrl, imageLoading: true,
        created_at: new Date().toISOString(), sender_id: user.id,
        profiles: { id: user.id, full_name: profile?.full_name, avatar_url: profile?.avatar_url },
      }])
      try {
        const { publicUrl } = await uploadToR2({
          file,
          category:   'messages',
          folderType: 'tools',
        })
        const { data: msgData } = await supabase
          .from('messages')
          .insert({ conversation_id: selectedId, sender_id: user.id, content: '', image_url: publicUrl })
          .select('id, content, image_url, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
          .single()
        if (msgData) setMessages((prev) => prev.map((m) => m.id === tempId ? msgData : m))
      } catch (err) {
        console.error('Image upload failed:', err)
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
      }
    }
    setImageUploading(false)
  }

  const handleRename = async () => {
    const name = convName.trim()
    if (!name) { setEditingName(false); return }
    await supabase.from('conversations').update({ name }).eq('id', selectedId)
    setConversations((prev) => prev.map((c) => c.id === selectedId ? { ...c, name } : c))
    setEditingName(false)
  }

  const handlePin = async (msgId) => {
    await supabase.from('pinned_messages').insert({ conversation_id: selectedId, message_id: msgId, pinned_by: user.id })
  }
  const handleUnpin = async (msgId) => {
    await supabase.from('pinned_messages').delete().eq('message_id', msgId)
  }
  const handleRequestPin = async (msgId) => {
    await supabase.from('pin_requests').insert({ conversation_id: selectedId, message_id: msgId, requested_by: user.id })
    setRequestedIds((prev) => new Set([...prev, msgId]))
  }
  const handleApprove = async (req) => {
    await supabase.from('pinned_messages').insert({ conversation_id: req.conversation_id, message_id: req.message_id, pinned_by: user.id })
    await supabase.from('pin_requests').update({ status: 'approved' }).eq('id', req.id)
    setPinRequests((prev) => prev.filter((r) => r.id !== req.id))
  }
  const handleDecline = async (reqId) => {
    await supabase.from('pin_requests').update({ status: 'declined' }).eq('id', reqId)
    setPinRequests((prev) => prev.filter((r) => r.id !== reqId))
  }

  const startDM = async (otherProfileId) => {
    setDmError('')
    setDmLoading(otherProfileId)
    try {
      // Check if a DM already exists with this person
      const { data: myMems } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('profile_id', user.id)

      const myIds = (myMems || []).map((m) => m.conversation_id)

      if (myIds.length > 0) {
        const { data: shared } = await supabase
          .from('conversation_members')
          .select('conversation_id, conversations!inner(id, is_group)')
          .eq('profile_id', otherProfileId)
          .in('conversation_id', myIds)
          .limit(10)

        const existing = shared?.find((s) => s.conversations?.is_group === false)
        if (existing) {
          setShowNewDM(false)
          await loadConversations(true)
          setSelectedId(existing.conversation_id)
          return
        }
      }

      // Create new conversation
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert([{ is_group: false }])
        .select('id')
        .single()
      if (convErr) throw new Error(convErr.message)

      // Add both members
      const { error: memErr } = await supabase
        .from('conversation_members')
        .insert([
          { conversation_id: newConv.id, profile_id: user.id },
          { conversation_id: newConv.id, profile_id: otherProfileId },
        ])
      if (memErr) throw new Error(memErr.message)

      setShowNewDM(false)
      await loadConversations(true)
      setSelectedId(newConv.id)
    } catch (err) {
      setDmError(err.message)
    } finally {
      setDmLoading(null)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const selectedConv = conversations.find((c) => c.id === selectedId) || null
  const grouped = computeGroups(messages)
  const filteredConvs = search
    ? conversations.filter((c) => getConvName(c, user?.id).toLowerCase().includes(search.toLowerCase()))
    : conversations

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-white">

      {/* ── LEFT: conversation list ──────────────────────────────────────────── */}
      <div className="w-[280px] shrink-0 border-r border-border flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-text-primary">{profile?.full_name?.split(' ')[0] || 'Messages'}</h2>
            <button onClick={() => setShowNewDM(true)}
              className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title="New message">
              <Plus size={16} />
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-surface-2 rounded-xl pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder-text-muted" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
          ) : filteredConvs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">No conversations yet</div>
          ) : filteredConvs.map((conv) => {
            const name = getConvName(conv, user?.id)
            const avatarUrl = getConvAvatar(conv, user?.id)
            const isSelected = conv.id === selectedId
            return (
              <button key={conv.id} onClick={() => setSelectedId(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-accent/8' : 'hover:bg-surface-2'}`}>
                {/* Avatar */}
                <div className="shrink-0 relative">
                  {conv.is_group ? (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-accent to-purple-400 flex items-center justify-center">
                      <Users2 size={18} className="text-white" />
                    </div>
                  ) : (
                    <Avatar name={name} url={avatarUrl} size={11} />
                  )}
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{name}</p>
                    {conv.last_message_at && (
                      <span className="text-[11px] text-text-muted shrink-0">{fmtTime(conv.last_message_at)}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {conv.last_message_preview || (conv.is_group ? `${conv.conversation_members?.length} members` : 'Start chatting')}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── RIGHT: chat ──────────────────────────────────────────────────────── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Chat header */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-white">
            <div className="shrink-0">
              {selectedConv.is_group
                ? <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-purple-400 flex items-center justify-center"><Users2 size={16} className="text-white" /></div>
                : <Avatar name={getConvName(selectedConv, user?.id)} url={getConvAvatar(selectedConv, user?.id)} size={9} />
              }
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <input ref={nameInputRef} value={convName} onChange={e => setConvName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false) }}
                  className="text-sm font-semibold bg-surface-2 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent w-full max-w-[240px]"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-text-primary truncate">{getConvName(selectedConv, user?.id)}</p>
                  {isAdmin && selectedConv.is_group && (
                    <button onClick={() => setEditingName(true)} className="text-text-muted hover:text-accent transition-colors" title="Rename">
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-text-muted">
                {selectedConv.is_group
                  ? `${selectedConv.conversation_members?.length} members`
                  : 'Active'}
              </p>
            </div>
            {/* Header actions */}
            <div className="flex items-center gap-1">
              <button onClick={() => setShowPinned(v => !v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${showPinned ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-border text-text-muted hover:border-amber-200 hover:text-amber-600'}`}>
                <Pin size={11} />
                {pinned.length > 0 ? pinned.length : 'Pins'}
              </button>
              {isAdmin && pinRequests.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700">
                  <Bell size={11} /> {pinRequests.length}
                </div>
              )}
            </div>
          </div>

          {/* Pinned panel */}
          {showPinned && <PinnedPanel pinned={pinned} isAdmin={isAdmin} onUnpin={handleUnpin} onClose={() => setShowPinned(false)} />}

          {/* Pin request banner */}
          {isAdmin && <PinRequestBanner requests={pinRequests} messages={messages} onApprove={handleApprove} onDecline={handleDecline} />}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {msgsLoading ? (
              <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center select-none">
                {selectedConv.is_group
                  ? <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-purple-400 flex items-center justify-center mb-4"><Users2 size={28} className="text-white" /></div>
                  : <Avatar name={getConvName(selectedConv, user?.id)} url={getConvAvatar(selectedConv, user?.id)} size={16} />
                }
                <p className="text-base font-bold text-text-primary mt-4 mb-1">{getConvName(selectedConv, user?.id)}</p>
                <p className="text-sm text-text-muted max-w-[240px]">
                  {selectedConv.is_group ? 'This is the beginning of your team chat.' : `Start a conversation with ${getConvName(selectedConv, user?.id)}.`}
                </p>
              </div>
            ) : (
              <div>
                {grouped.map((msg) => {
                  const isMine = msg.sender_id === user?.id
                  const senderName = msg.profiles?.full_name || 'Unknown'
                  const isPinned = pinnedIds.has(msg.id)
                  const isRequested = requestedIds.has(msg.id)
                  const showName = !isMine && selectedConv.is_group && !msg.topGrouped
                  const showAvatar = !isMine && !msg.bottomGrouped
                  const hasText = msg.content?.trim()
                  const hasImg = !!msg.image_url

                  // Bubble border-radius — grouped = square on connecting corner
                  const r = isMine
                    ? `18px ${msg.topGrouped ? '4px' : '18px'} ${msg.bottomGrouped ? '4px' : '18px'} 18px`
                    : `${msg.topGrouped ? '4px' : '18px'} 18px 18px ${msg.bottomGrouped ? '4px' : '18px'}`

                  return (
                    <div key={msg.id}>
                      {msg.showDate && (
                        <div className="flex items-center gap-3 my-5">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-text-muted shrink-0 font-medium">{dateSep(msg.created_at)}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      <div
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${msg.topGrouped ? 'mt-0.5' : 'mt-3'} group items-end gap-1.5`}
                        onMouseEnter={() => setHoveredId(msg.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        {/* Other user avatar */}
                        {!isMine && (
                          <div className="w-7 shrink-0">
                            {showAvatar && <Avatar name={senderName} url={msg.profiles?.avatar_url} size={7} />}
                          </div>
                        )}

                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[65%]`}>
                          {showName && <p className="text-xs text-text-muted mb-1 px-1">{senderName}</p>}

                          <div className={`flex items-end gap-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Hover actions */}
                            {hoveredId === msg.id && (
                              <div className={`flex items-center shrink-0 mb-0.5`}>
                                {isAdmin ? (
                                  isPinned ? (
                                    <button onClick={() => handleUnpin(msg.id)}
                                      className="p-1.5 rounded-full text-amber-500 hover:bg-amber-50 transition-colors" title="Unpin">
                                      <PinOff size={12} />
                                    </button>
                                  ) : (
                                    <button onClick={() => handlePin(msg.id)}
                                      className="p-1.5 rounded-full text-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Pin">
                                      <Pin size={12} />
                                    </button>
                                  )
                                ) : (
                                  !isPinned && !isRequested && (
                                    <button onClick={() => handleRequestPin(msg.id)}
                                      className="text-[10px] font-medium text-text-muted hover:text-accent px-2 py-1 rounded-full hover:bg-accent/10 whitespace-nowrap transition-colors">
                                      📌
                                    </button>
                                  )
                                )}
                              </div>
                            )}

                            {/* Bubble */}
                            <div className="relative">
                              {isPinned && <Pin size={9} className="absolute -top-2 right-0 text-amber-400 rotate-45 z-10" />}

                              <div className={`relative overflow-hidden ${isMine ? 'bg-accent text-white' : 'bg-[#efefef] text-gray-900'}`}
                                style={{ borderRadius: hasImg && !hasText ? (isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px') : r }}>

                                {/* Image */}
                                {hasImg && (
                                  <button onClick={() => setLightboxUrl(msg.image_url)} className="block">
                                    <img src={msg.image_url} alt=""
                                      className={`block max-w-[240px] max-h-[320px] w-auto h-auto object-cover ${msg.imageLoading ? 'opacity-60' : ''}`}
                                      onError={(e) => { e.target.style.display = 'none' }}
                                    />
                                  </button>
                                )}

                                {/* Text */}
                                {hasText && (
                                  <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words px-3.5 py-2.5 ${hasImg ? 'border-t border-black/10' : ''}`}>
                                    {msg.content}
                                  </p>
                                )}

                                {/* Loading shimmer for image */}
                                {msg.imageLoading && !hasText && (
                                  <div className="px-3 py-2 text-xs opacity-70">Uploading…</div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Timestamp + status */}
                          {(!msg.bottomGrouped || hoveredId === msg.id) && (
                            <p className="text-[10px] text-text-muted mt-1 px-1">
                              {format(new Date(msg.created_at), 'h:mm a')}
                              {isRequested && !isPinned && ' · Pin requested'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} className="h-2" />
              </div>
            )}
          </div>

          {/* ── Input bar ─────────────────────────────────────────────────── */}
          <div className="px-4 py-3 border-t border-border bg-white shrink-0">
            <div className="flex items-end gap-2">
              {/* Left buttons */}
              <div className="flex items-center gap-1 pb-1.5">
                {/* Emoji */}
                <div className="relative">
                  <button type="button" onClick={() => setShowEmoji(v => !v)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${showEmoji ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-accent hover:bg-accent/10'}`}>
                    <Smile size={20} />
                  </button>
                  {showEmoji && (
                    <EmojiPicker
                      onSelect={(e) => { setText(t => t + e); inputRef.current?.focus() }}
                      onClose={() => setShowEmoji(false)}
                    />
                  )}
                </div>
                {/* Photo */}
                <button type="button" onClick={() => imageInputRef.current?.click()} disabled={imageUploading}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50">
                  {imageUploading ? <Loader2 size={18} className="animate-spin" /> : <Image size={18} />}
                </button>
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
              </div>

              {/* Text input */}
              <div className="flex-1 bg-[#efefef] rounded-[22px] px-4 py-2.5 flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                    if (e.key === 'Escape') setShowEmoji(false)
                  }}
                  placeholder={`Message ${getConvName(selectedConv, user?.id)}…`}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none resize-none leading-5 max-h-[120px] overflow-y-auto"
                  style={{ height: 'auto' }}
                />
              </div>

              {/* Send / heart */}
              <div className="pb-1.5">
                {text.trim() ? (
                  <button onClick={handleSend}
                    className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white hover:bg-accent/90 transition-colors shadow-sm">
                    <Send size={16} className="translate-x-px" />
                  </button>
                ) : (
                  <button onClick={() => { setText('❤️'); setTimeout(handleSend, 0) }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-accent hover:bg-accent/10 transition-colors text-xl">
                    ❤️
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-surface-2 text-center p-8 select-none">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent to-purple-400 flex items-center justify-center mb-4 shadow-lg">
            <MessageSquare size={32} className="text-white" />
          </div>
          <h3 className="text-base font-bold text-text-primary mb-1">Your messages</h3>
          <p className="text-sm text-text-muted mb-4 max-w-[220px]">Send photos, messages and more to your team.</p>
          <button onClick={() => setShowNewDM(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Send a message
          </button>
        </div>
      )}

      {/* ── New DM modal ─────────────────────────────────────────────────────── */}
      {showNewDM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowNewDM(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden z-10">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <button onClick={() => setShowNewDM(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
              <h2 className="text-base font-bold text-text-primary flex-1 text-center">New message</h2>
              <div className="w-5" />
            </div>
            {/* Search */}
            <div className="px-4 py-2 border-b border-border">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input placeholder="Search people…"
                  className="w-full pl-8 pr-3 py-2 bg-surface-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  autoFocus />
              </div>
            </div>
            {/* People */}
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {allProfiles.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">No other users yet.</p>
              ) : allProfiles.map((p) => (
                <button key={p.id} onClick={() => startDM(p.id)} disabled={!!dmLoading}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors text-left disabled:opacity-60">
                  <Avatar name={p.full_name} url={p.avatar_url} size={10} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-primary">{p.full_name}</p>
                    <p className="text-xs text-text-muted capitalize">{p.role}</p>
                  </div>
                  {dmLoading === p.id && <Loader2 size={16} className="animate-spin text-accent shrink-0" />}
                </button>
              ))}
            </div>
            {dmError && <p className="text-xs text-red-500 px-5 py-2 border-t border-border">{dmError}</p>}
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  )
}
