import { useState, useEffect, useRef, useCallback } from 'react'
import { Users2, Plus, Send, Loader2, MessageSquare, X, Pin, PinOff, Bell, Pencil, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, isToday, isYesterday } from 'date-fns'
import Avatar from '../components/ui/Avatar'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}
function dateSeparatorLabel(ts) {
  const d = new Date(ts)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMMM d, yyyy')
}
function getConvName(conv, currentUserId) {
  if (conv?.is_group) return conv.name || 'Team'
  const other = conv?.conversation_members?.find((m) => m.profile_id !== currentUserId)
  return other?.profiles?.full_name || 'Unknown'
}
function computeGroups(msgs) {
  return msgs.map((msg, i) => {
    const prev = msgs[i - 1]
    const next = msgs[i + 1]
    const sameDay = (a, b) =>
      format(new Date(a.created_at), 'yyyy-MM-dd') === format(new Date(b.created_at), 'yyyy-MM-dd')
    const within5 = (a, b) =>
      Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 5 * 60 * 1000
    return {
      ...msg,
      topGrouped:  prev && prev.sender_id === msg.sender_id && sameDay(prev, msg) && within5(prev, msg),
      bottomGrouped: next && next.sender_id === msg.sender_id && sameDay(msg, next) && within5(msg, next),
      showDate: !prev || format(new Date(prev.created_at), 'yyyy-MM-dd') !== format(new Date(msg.created_at), 'yyyy-MM-dd'),
    }
  })
}

// ── Pinned messages panel ────────────────────────────────────────────────────
function PinnedPanel({ pinned, isAdmin, onUnpin, onClose }) {
  return (
    <div className="border-b border-amber-100 bg-amber-50/60">
      <div className="px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pin size={13} className="text-amber-600" />
          <span className="text-xs font-semibold text-amber-700">
            {pinned.length} Pinned Message{pinned.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="px-5 pb-3 space-y-2 max-h-52 overflow-y-auto">
        {pinned.length === 0 ? (
          <p className="text-xs text-text-muted pb-1">No pinned messages yet.</p>
        ) : pinned.map((pm) => (
          <div key={pm.id} className="bg-white rounded-xl px-3 py-2.5 flex items-start gap-2 border border-amber-100 shadow-sm">
            <Pin size={11} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-text-muted mb-0.5">
                {pm.messages?.profiles?.full_name || 'Unknown'}
                {pm.messages?.created_at ? ` · ${format(new Date(pm.messages.created_at), 'MMM d')}` : ''}
              </p>
              <p className="text-xs text-text-primary leading-relaxed line-clamp-2">{pm.messages?.content}</p>
            </div>
            {isAdmin && (
              <button onClick={() => onUnpin(pm.message_id)}
                className="text-text-muted hover:text-red-500 transition-colors shrink-0 mt-0.5" title="Unpin">
                <PinOff size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Pin request banner (admin only) ─────────────────────────────────────────
function PinRequestBanner({ requests, messages, onApprove, onDecline }) {
  if (requests.length === 0) return null
  return (
    <div className="border-b border-blue-100 bg-blue-50/60 px-5 py-2.5">
      <p className="text-[11px] font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
        <Bell size={11} />
        {requests.length} Pin Request{requests.length !== 1 ? 's' : ''} pending
      </p>
      <div className="space-y-1.5 max-h-36 overflow-y-auto">
        {requests.map((req) => {
          const msg = messages.find((m) => m.id === req.message_id)
          return (
            <div key={req.id} className="bg-white rounded-lg px-3 py-2 flex items-center gap-2 border border-blue-100">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-text-muted">
                  <span className="font-medium">{req.profiles?.full_name || 'Someone'}</span> wants to pin:
                </p>
                <p className="text-xs text-text-primary truncate">{msg?.content || '…'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onApprove(req)}
                  className="text-[11px] font-semibold text-green-700 hover:underline">Approve</button>
                <button onClick={() => onDecline(req.id)}
                  className="text-[11px] font-semibold text-red-600 hover:underline">Decline</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Messages() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [conversations, setConversations]   = useState([])
  const [selectedId, setSelectedId]         = useState(null)
  const [messages, setMessages]             = useState([])
  const [pinned, setPinned]                 = useState([])
  const [pinRequests, setPinRequests]       = useState([])
  const [joinedAt, setJoinedAt]             = useState(null)
  const [pinnedIds, setPinnedIds]           = useState(new Set())
  const [requestedIds, setRequestedIds]     = useState(new Set())
  const [hoveredId, setHoveredId]           = useState(null)
  const [showPinned, setShowPinned]         = useState(false)
  const [editingName, setEditingName]       = useState(false)
  const [convName, setConvName]             = useState('')
  const [text, setText]                     = useState('')
  const [allProfiles, setAllProfiles]       = useState([])
  const [showNewDM, setShowNewDM]           = useState(false)
  const [loading, setLoading]               = useState(true)
  const [msgsLoading, setMsgsLoading]       = useState(false)

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const nameInputRef = useRef(null)

  // ── Load conversations ──────────────────────────────────────────────────
  const loadConversations = useCallback(async (keepSelected = false) => {
    const { data } = await supabase
      .from('conversations')
      .select('id, name, is_group, created_at, conversation_members(profile_id, profiles(id, full_name, avatar_url))')
    const sorted = (data || []).sort((a, b) => {
      if (a.is_group && !b.is_group) return -1
      if (!a.is_group && b.is_group) return 1
      return getConvName(a, user?.id).localeCompare(getConvName(b, user?.id))
    })
    setConversations(sorted)
    if (!keepSelected && sorted.length > 0) setSelectedId(sorted[0].id)
    setLoading(false)
    return sorted
  }, [user?.id])

  useEffect(() => { loadConversations() }, [])

  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('id, full_name, role, avatar_url').neq('id', user.id).order('full_name')
      .then(({ data }) => setAllProfiles(data || []))
  }, [user?.id])

  // ── Load messages, pinned, requests when conversation changes ───────────
  useEffect(() => {
    if (!selectedId || !user?.id) return
    setMsgsLoading(true)
    setMessages([])
    setPinned([])
    setPinRequests([])
    setShowPinned(false)

    const conv = conversations.find(c => c.id === selectedId)
    setConvName(conv?.name || '')

    const loadAll = async () => {
      // Get joined_at for current user in this conversation
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('joined_at')
        .eq('conversation_id', selectedId)
        .eq('profile_id', user.id)
        .single()

      const myJoinedAt = memberData?.joined_at || new Date(0).toISOString()
      setJoinedAt(myJoinedAt)

      // Load messages from joined_at onwards
      const { data: msgsData } = await supabase
        .from('messages')
        .select('id, content, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
        .eq('conversation_id', selectedId)
        .gte('created_at', myJoinedAt)
        .order('created_at', { ascending: true })
        .limit(150)
      setMessages(msgsData || [])

      // Load pinned messages (all of them, regardless of joined_at)
      await loadPinned()

      // Load pending pin requests
      await loadPinRequests()

      setMsgsLoading(false)
    }
    loadAll()
  }, [selectedId, user?.id])

  const loadPinned = async () => {
    if (!selectedId) return
    const { data } = await supabase
      .from('pinned_messages')
      .select('id, message_id, pinned_at, pinned_by, messages!message_id(id, content, created_at, sender_id, profiles!sender_id(id, full_name))')
      .eq('conversation_id', selectedId)
      .order('pinned_at', { ascending: false })
    const list = data || []
    setPinned(list)
    setPinnedIds(new Set(list.map(p => p.message_id)))
  }

  const loadPinRequests = async () => {
    if (!selectedId) return
    const { data } = await supabase
      .from('pin_requests')
      .select('id, message_id, created_at, profiles!requested_by(full_name)')
      .eq('conversation_id', selectedId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    const list = data || []
    setPinRequests(list)
    setRequestedIds(new Set(list.map(r => r.message_id)))
  }

  // ── Realtime: messages ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !user?.id) return
    const channel = supabase.channel(`msgs-${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` },
        async (payload) => {
          if (payload.new.sender_id === user?.id) return
          const { data } = await supabase.from('messages')
            .select('id, content, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
            .eq('id', payload.new.id).single()
          if (data) setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data])
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId, user?.id])

  // ── Realtime: pinned messages ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase.channel(`pinned-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages', filter: `conversation_id=eq.${selectedId}` },
        () => { loadPinned() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId])

  // ── Realtime: pin requests ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !isAdmin) return
    const channel = supabase.channel(`pinreq-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pin_requests', filter: `conversation_id=eq.${selectedId}` },
        () => { loadPinRequests() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId, isAdmin])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'instant' })
  }, [messages])

  // Focus rename input
  useEffect(() => {
    if (editingName) nameInputRef.current?.select()
  }, [editingName])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault()
    const content = text.trim()
    if (!content || !selectedId) return
    setText('')
    inputRef.current?.focus()
    const tempId = `opt-${Date.now()}`
    setMessages(prev => [...prev, { id: tempId, content, created_at: new Date().toISOString(), sender_id: user.id, profiles: { id: user.id, full_name: profile?.full_name, avatar_url: profile?.avatar_url } }])
    const { data } = await supabase.from('messages')
      .insert({ conversation_id: selectedId, sender_id: user.id, content })
      .select('id, content, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)').single()
    if (data) setMessages(prev => prev.map(m => m.id === tempId ? data : m))
  }

  const handleRename = async () => {
    const name = convName.trim()
    if (!name) { setEditingName(false); return }
    await supabase.from('conversations').update({ name }).eq('id', selectedId)
    setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, name } : c))
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
    setRequestedIds(prev => new Set([...prev, msgId]))
  }

  const handleApprove = async (req) => {
    await supabase.from('pinned_messages').insert({ conversation_id: req.conversation_id, message_id: req.message_id, pinned_by: user.id })
    await supabase.from('pin_requests').update({ status: 'approved' }).eq('id', req.id)
    setPinRequests(prev => prev.filter(r => r.id !== req.id))
  }

  const handleDecline = async (reqId) => {
    await supabase.from('pin_requests').update({ status: 'declined' }).eq('id', reqId)
    setPinRequests(prev => prev.filter(r => r.id !== reqId))
  }

  const startDM = async (otherProfileId) => {
    const { data: convId, error } = await supabase.rpc('create_or_get_dm', { other_profile_id: otherProfileId })
    if (error) { console.error('DM error:', error); return }
    setShowNewDM(false)
    // Reload conversations then select the new one
    const updated = await loadConversations(true)
    const exists = updated?.some(c => c.id === convId)
    if (!exists) {
      // Not in list yet — reload without keepSelected so it fetches fresh
      await loadConversations(false)
    }
    if (convId) setSelectedId(convId)
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const selectedConv = conversations.find(c => c.id === selectedId) || null
  const grouped = computeGroups(messages)

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── LEFT: conversation list ──────────────────────────────────────── */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col bg-white">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Messages</h2>
          <button onClick={() => setShowNewDM(true)}
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title="New message">
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
            : conversations.map(conv => {
              const name = getConvName(conv, user?.id)
              const isSelected = conv.id === selectedId
              const otherMember = !conv.is_group && conv.conversation_members?.find(m => m.profile_id !== user?.id)
              return (
                <button key={conv.id} onClick={() => setSelectedId(conv.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-accent/10' : 'hover:bg-surface-2'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${conv.is_group ? 'bg-accent text-white' : 'bg-accent/20 text-accent'}`}>
                    {conv.is_group ? <Users2 size={15} /> : <Avatar name={name} url={otherMember?.profiles?.avatar_url} size={9} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{name}</p>
                    {conv.is_group && <p className="text-xs text-text-muted">{conv.conversation_members?.length} members</p>}
                  </div>
                </button>
              )
            })}
        </div>
      </div>

      {/* ── RIGHT: chat view ─────────────────────────────────────────────── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Header */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${selectedConv.is_group ? 'bg-accent text-white' : 'bg-accent/20 text-accent'}`}>
              {selectedConv.is_group ? <Users2 size={14} /> : getInitials(getConvName(selectedConv, user?.id))}
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  value={convName}
                  onChange={e => setConvName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false) }}
                  className="text-sm font-semibold text-text-primary bg-surface-2 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent w-full max-w-[200px]"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-text-primary truncate">{getConvName(selectedConv, user?.id)}</p>
                  {isAdmin && selectedConv.is_group && (
                    <button onClick={() => setEditingName(true)} className="text-text-muted hover:text-accent transition-colors shrink-0" title="Rename">
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              )}
              {selectedConv.is_group && (
                <p className="text-xs text-text-muted">{selectedConv.conversation_members?.length} members</p>
              )}
            </div>

            {/* Pin count button */}
            <button onClick={() => setShowPinned(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showPinned ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-border text-text-muted hover:border-amber-200 hover:text-amber-700'}`}>
              <Pin size={12} />
              {pinned.length > 0 ? pinned.length : ''}
              {pinned.length === 0 ? 'Pinned' : ''}
            </button>

            {/* Pin request badge (admin only) */}
            {isAdmin && pinRequests.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700">
                <Bell size={12} />
                {pinRequests.length}
              </div>
            )}
          </div>

          {/* Pinned panel */}
          {showPinned && (
            <PinnedPanel pinned={pinned} isAdmin={isAdmin} onUnpin={handleUnpin} onClose={() => setShowPinned(false)} />
          )}

          {/* Pin request banner (admin) */}
          {isAdmin && (
            <PinRequestBanner requests={pinRequests} messages={messages} onApprove={handleApprove} onDecline={handleDecline} />
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {msgsLoading ? (
              <div className="flex justify-center py-12"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center select-none">
                <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-3">
                  <MessageSquare size={24} className="text-accent" />
                </div>
                <p className="text-sm font-semibold text-text-primary mb-1">
                  {selectedConv.is_group ? `Welcome to ${getConvName(selectedConv, user?.id)}!` : `Start a conversation`}
                </p>
                <p className="text-xs text-text-muted max-w-[220px]">
                  {selectedConv.is_group ? 'This is the shared space for your team.' : `Say something to ${getConvName(selectedConv, user?.id)}.`}
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
                  const radius = isMine
                    ? `18px ${msg.topGrouped ? '4px' : '18px'} ${msg.bottomGrouped ? '4px' : '18px'} 18px`
                    : `${msg.topGrouped ? '4px' : '18px'} 18px 18px ${msg.bottomGrouped ? '4px' : '18px'}`

                  return (
                    <div key={msg.id}>
                      {msg.showDate && (
                        <div className="flex items-center gap-3 my-5">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-text-muted shrink-0">{dateSeparatorLabel(msg.created_at)}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      <div
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${msg.topGrouped ? 'mt-0.5' : 'mt-3'} group`}
                        onMouseEnter={() => setHoveredId(msg.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        {!isMine && (
                          <div className="mr-2 flex flex-col justify-end w-7 shrink-0">
                            {showAvatar ? <Avatar name={senderName} url={msg.profiles?.avatar_url} size={7} /> : null}
                          </div>
                        )}

                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[65%]`}>
                          {showName && <p className="text-xs text-text-muted mb-1 mx-1">{senderName}</p>}

                          <div className="flex items-center gap-1.5">
                            {/* Pin action (left of message for mine, right for others) */}
                            {hoveredId === msg.id && (
                              <div className={`flex items-center ${isMine ? 'order-first' : 'order-last'}`}>
                                {isAdmin ? (
                                  isPinned ? (
                                    <button onClick={() => handleUnpin(msg.id)}
                                      className="p-1 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors" title="Unpin">
                                      <PinOff size={13} />
                                    </button>
                                  ) : (
                                    <button onClick={() => handlePin(msg.id)}
                                      className="p-1 rounded-lg text-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Pin message">
                                      <Pin size={13} />
                                    </button>
                                  )
                                ) : (
                                  !isPinned && !isRequested && (
                                    <button onClick={() => handleRequestPin(msg.id)}
                                      className="p-1 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors text-[10px] font-medium whitespace-nowrap px-2" title="Request pin">
                                      Request pin
                                    </button>
                                  )
                                )}
                              </div>
                            )}

                            <div className="relative">
                              {isPinned && (
                                <Pin size={9} className="absolute -top-2 -right-1 text-amber-500 rotate-45" />
                              )}
                              <div
                                className={`px-3.5 py-2 text-sm leading-relaxed ${isMine ? 'bg-accent text-white' : 'bg-[#f0f0f0] text-text-primary'}`}
                                style={{ borderRadius: radius }}
                              >
                                {msg.content}
                              </div>
                            </div>
                          </div>

                          {isRequested && !isPinned && !isMine && (
                            <p className="text-[10px] text-text-muted mt-0.5 mx-1">Pin requested…</p>
                          )}

                          {!msg.bottomGrouped && (
                            <p className="text-xs text-text-muted mt-1 mx-1">{format(new Date(msg.created_at), 'h:mm a')}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="px-4 py-3 border-t border-border shrink-0">
            <div className="flex items-center gap-2 bg-[#f0f0f0] rounded-full px-4 py-2">
              <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={`Message ${getConvName(selectedConv, user?.id)}…`}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none" autoFocus />
              <button type="submit" disabled={!text.trim()}
                className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity">
                <Send size={13} className="text-white translate-x-px" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted bg-surface-2">Select a conversation</div>
      )}

      {/* ── New DM picker ─────────────────────────────────────────────────── */}
      {showNewDM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNewDM(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-text-primary">New Message</h2>
              <button onClick={() => setShowNewDM(false)} className="p-1.5 btn-ghost rounded-lg"><X size={15} /></button>
            </div>
            <p className="text-xs text-text-muted mb-3">Choose someone to message</p>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {allProfiles.length === 0
                ? <p className="text-sm text-text-muted text-center py-4">No other users yet.</p>
                : allProfiles.map(p => (
                  <button key={p.id} onClick={() => startDM(p.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors text-left">
                    <Avatar name={p.full_name} url={p.avatar_url} size={8} />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{p.full_name}</p>
                      <p className="text-xs text-text-muted capitalize">{p.role}</p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
