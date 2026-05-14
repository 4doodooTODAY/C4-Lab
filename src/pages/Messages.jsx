import { useState, useEffect, useRef, useCallback } from 'react'
import { Users2, Plus, Send, Loader2, MessageSquare, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, isToday, isYesterday } from 'date-fns'

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

// Precompute grouping: is this message part of a run from the same sender?
function computeGroups(msgs) {
  return msgs.map((msg, i) => {
    const prev = msgs[i - 1]
    const next = msgs[i + 1]
    const sameDay = (a, b) =>
      format(new Date(a.created_at), 'yyyy-MM-dd') === format(new Date(b.created_at), 'yyyy-MM-dd')
    const within5 = (a, b) =>
      Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 5 * 60 * 1000

    const topGrouped =
      prev &&
      prev.sender_id === msg.sender_id &&
      sameDay(prev, msg) &&
      within5(prev, msg)

    const bottomGrouped =
      next &&
      next.sender_id === msg.sender_id &&
      sameDay(msg, next) &&
      within5(msg, next)

    // Date separator: show when day changes
    const showDate =
      !prev ||
      format(new Date(prev.created_at), 'yyyy-MM-dd') !== format(new Date(msg.created_at), 'yyyy-MM-dd')

    return { ...msg, topGrouped, bottomGrouped, showDate }
  })
}

export default function Messages() {
  const { user, profile } = useAuth()
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [allProfiles, setAllProfiles] = useState([])
  const [showNewDM, setShowNewDM] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msgsLoading, setMsgsLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  // ── Load conversations ───────────────────────────────────────────────────
  const loadConversations = useCallback(async (keepSelected = false) => {
    const { data } = await supabase
      .from('conversations')
      .select('id, name, is_group, created_at, conversation_members(profile_id, profiles(id, full_name))')

    const sorted = (data || []).sort((a, b) => {
      if (a.is_group && !b.is_group) return -1
      if (!a.is_group && b.is_group) return 1
      const nameA = getConvName(a, user?.id)
      const nameB = getConvName(b, user?.id)
      return nameA.localeCompare(nameB)
    })

    setConversations(sorted)
    if (!keepSelected && sorted.length > 0) {
      setSelectedId(sorted[0].id)
    }
    setLoading(false)
    return sorted
  }, [user?.id])

  useEffect(() => { loadConversations() }, [])

  // Load other profiles for DM picker
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .neq('id', user.id)
      .order('full_name')
      .then(({ data }) => setAllProfiles(data || []))
  }, [user?.id])

  // ── Load messages when conversation changes ──────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    setMsgsLoading(true)
    setMessages([])
    supabase
      .from('messages')
      .select('id, content, created_at, sender_id, profiles!sender_id(id, full_name)')
      .eq('conversation_id', selectedId)
      .order('created_at', { ascending: true })
      .limit(150)
      .then(({ data }) => {
        setMessages(data || [])
        setMsgsLoading(false)
      })
  }, [selectedId])

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase
      .channel(`msgs-${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` },
        async (payload) => {
          // Skip if it's our own message (already added optimistically)
          if (payload.new.sender_id === user?.id) return

          // Fetch with sender profile
          const { data } = await supabase
            .from('messages')
            .select('id, content, created_at, sender_id, profiles!sender_id(id, full_name)')
            .eq('id', payload.new.id)
            .single()

          if (data) {
            setMessages((prev) =>
              prev.some((m) => m.id === data.id) ? prev : [...prev, data]
            )
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedId, user?.id])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'instant' })
  }, [messages])

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault()
    const content = text.trim()
    if (!content || !selectedId) return

    setText('')
    inputRef.current?.focus()

    const tempId = `opt-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content,
        created_at: new Date().toISOString(),
        sender_id: user.id,
        profiles: { id: user.id, full_name: profile?.full_name },
      },
    ])

    const { data } = await supabase
      .from('messages')
      .insert({ conversation_id: selectedId, sender_id: user.id, content })
      .select('id, content, created_at, sender_id, profiles!sender_id(id, full_name)')
      .single()

    if (data) setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)))
  }

  // ── Start / open DM ──────────────────────────────────────────────────────
  const startDM = async (otherProfileId) => {
    const { data: convId } = await supabase.rpc('create_or_get_dm', { other_profile_id: otherProfileId })
    setShowNewDM(false)
    const updated = await loadConversations(true)
    // Make sure the new conv is in state
    if (!conversations.some((c) => c.id === convId)) {
      await loadConversations(false)
    }
    setSelectedId(convId)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  const selectedConv = conversations.find((c) => c.id === selectedId) || null
  const grouped = computeGroups(messages)

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT: Conversation list ──────────────────────────────────────── */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col bg-white">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Messages</h2>
          <button
            onClick={() => setShowNewDM(true)}
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
            title="New message"
          >
            <Plus size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={18} className="animate-spin text-text-muted" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-10 px-4">No conversations yet.</p>
          ) : (
            conversations.map((conv) => {
              const name = getConvName(conv, user?.id)
              const isSelected = conv.id === selectedId
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isSelected ? 'bg-accent/10' : 'hover:bg-surface-2'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                      conv.is_group ? 'bg-accent text-white' : 'bg-accent/20 text-accent'
                    }`}
                  >
                    {conv.is_group ? <Users2 size={15} /> : getInitials(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                      {name}
                    </p>
                    {conv.is_group && (
                      <p className="text-xs text-text-muted">
                        {conv.conversation_members?.length} members
                      </p>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: Chat view ─────────────────────────────────────────────── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Header */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                selectedConv.is_group ? 'bg-accent text-white' : 'bg-accent/20 text-accent'
              }`}
            >
              {selectedConv.is_group
                ? <Users2 size={14} />
                : getInitials(getConvName(selectedConv, user?.id))}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{getConvName(selectedConv, user?.id)}</p>
              {selectedConv.is_group && (
                <p className="text-xs text-text-muted">
                  {selectedConv.conversation_members?.length} members
                </p>
              )}
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {msgsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 size={18} className="animate-spin text-text-muted" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center select-none">
                <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-3">
                  <MessageSquare size={24} className="text-accent" />
                </div>
                <p className="text-sm font-semibold text-text-primary mb-1">
                  {selectedConv.is_group ? 'Welcome to Team chat!' : `Start a conversation`}
                </p>
                <p className="text-xs text-text-muted max-w-[200px]">
                  {selectedConv.is_group
                    ? 'This is the shared space for your whole team.'
                    : `Say something to ${getConvName(selectedConv, user?.id)}.`}
                </p>
              </div>
            ) : (
              <div>
                {grouped.map((msg) => {
                  const isMine = msg.sender_id === user?.id
                  const senderName = msg.profiles?.full_name || 'Unknown'
                  const showName = !isMine && selectedConv.is_group && !msg.topGrouped
                  const showAvatar = !isMine && !msg.bottomGrouped

                  // iMessage-style border radius
                  const radius = isMine
                    ? `${msg.topGrouped ? '18px' : '18px'} ${msg.topGrouped ? '4px' : '18px'} ${msg.bottomGrouped ? '4px' : '18px'} 18px`
                    : `${msg.topGrouped ? '4px' : '18px'} 18px 18px ${msg.bottomGrouped ? '4px' : '18px'}`

                  return (
                    <div key={msg.id}>
                      {/* Date separator */}
                      {msg.showDate && (
                        <div className="flex items-center gap-3 my-5">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-text-muted shrink-0">
                            {dateSeparatorLabel(msg.created_at)}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${msg.topGrouped ? 'mt-0.5' : 'mt-3'}`}>
                        {/* Avatar for others */}
                        {!isMine && (
                          <div className="mr-2 flex flex-col justify-end w-7 shrink-0">
                            {showAvatar ? (
                              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-semibold">
                                {getInitials(senderName)}
                              </div>
                            ) : null}
                          </div>
                        )}

                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[65%]`}>
                          {showName && (
                            <p className="text-xs text-text-muted mb-1 mx-1">{senderName}</p>
                          )}
                          <div
                            className={`px-3.5 py-2 text-sm leading-relaxed ${
                              isMine
                                ? 'bg-accent text-white'
                                : 'bg-[#f0f0f0] text-text-primary'
                            }`}
                            style={{ borderRadius: radius }}
                          >
                            {msg.content}
                          </div>
                          {/* Timestamp after last in group */}
                          {!msg.bottomGrouped && (
                            <p className="text-xs text-text-muted mt-1 mx-1">
                              {format(new Date(msg.created_at), 'h:mm a')}
                            </p>
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

          {/* Input bar */}
          <form onSubmit={handleSend} className="px-4 py-3 border-t border-border shrink-0">
            <div className="flex items-center gap-2 bg-[#f0f0f0] rounded-full px-4 py-2">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                }}
                placeholder={`Message ${getConvName(selectedConv, user?.id)}…`}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity"
              >
                <Send size={13} className="text-white translate-x-px" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-text-muted bg-surface-2">
          Select a conversation
        </div>
      )}

      {/* ── New DM picker ────────────────────────────────────────────────── */}
      {showNewDM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNewDM(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-text-primary">New Message</h2>
              <button onClick={() => setShowNewDM(false)} className="p-1.5 btn-ghost rounded-lg">
                <X size={15} />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-3">Choose someone to message</p>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {allProfiles.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-4">No other users yet.</p>
              ) : (
                allProfiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startDM(p.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-semibold shrink-0">
                      {getInitials(p.full_name)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{p.full_name}</p>
                      <p className="text-xs text-text-muted capitalize">{p.role}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper outside component so it's stable
function getConvName(conv, currentUserId) {
  if (conv.is_group) return conv.name || 'Team'
  const other = conv.conversation_members?.find((m) => m.profile_id !== currentUserId)
  return other?.profiles?.full_name || 'Unknown'
}
