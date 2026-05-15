import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Loader2, MessageSquare, Image, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Avatar from '../../components/ui/Avatar'
import { format, isToday, isYesterday } from 'date-fns'

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

function dateSep(ts) {
  const d = new Date(ts)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMMM d, yyyy')
}

// ── Find or create a 1:1 conversation between two users ───────────────────────
async function findOrCreateDM(myId, otherId, label) {
  // Look for existing DM between these two people
  const { data: myConvs } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('profile_id', myId)

  const myConvIds = (myConvs || []).map((m) => m.conversation_id)

  if (myConvIds.length) {
    const { data: shared } = await supabase
      .from('conversation_members')
      .select('conversation_id, conversations!inner(id, is_group)')
      .eq('profile_id', otherId)
      .in('conversation_id', myConvIds)
      .eq('conversations.is_group', false)

    if (shared?.length) return shared[0].conversation_id
  }

  // Create new DM
  const { data: conv } = await supabase
    .from('conversations')
    .insert({ is_group: false, name: label })
    .select('id')
    .single()

  if (!conv) return null

  await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, profile_id: myId },
    { conversation_id: conv.id, profile_id: otherId },
  ])

  return conv.id
}

// ── Chat view ──────────────────────────────────────────────────────────────────
function ChatView({ convId, otherProfile, label, onBack, isMobile }) {
  const { user } = useAuth()
  const [messages,  setMessages]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [text,      setText]      = useState('')
  const [sending,   setSending]   = useState(false)
  const [imgUploading, setImgUploading] = useState(false)
  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)
  const imageRef    = useRef(null)

  const loadMessages = useCallback(async () => {
    if (!convId) return
    const { data } = await supabase
      .from('messages')
      .select('id, content, image_url, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(200)
    setMessages(data || [])
    setLoading(false)
  }, [convId])

  useEffect(() => { loadMessages() }, [loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime
  useEffect(() => {
    if (!convId) return
    const ch = supabase
      .channel(`client-msgs-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        async (payload) => {
          const { data } = await supabase
            .from('messages')
            .select('id, content, image_url, created_at, sender_id, profiles!sender_id(id, full_name, avatar_url)')
            .eq('id', payload.new.id)
            .single()
          if (data) setMessages((prev) => [...prev, data])
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [convId])

  const send = async () => {
    if (!text.trim() || !convId) return
    setSending(true)
    const content = text.trim()
    setText('')
    await supabase.from('messages').insert({ conversation_id: convId, sender_id: user.id, content })
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: content }).eq('id', convId)
    setSending(false)
    inputRef.current?.focus()
  }

  const handleImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !convId) return
    setImgUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `messages/${convId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        await supabase.from('messages').insert({ conversation_id: convId, sender_id: user.id, content: '', image_url: publicUrl })
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: '📷 Photo' }).eq('id', convId)
      }
    } finally {
      setImgUploading(false)
      e.target.value = ''
    }
  }

  // Group messages for display
  const grouped = messages.map((msg, i) => {
    const prev = messages[i - 1]
    const next = messages[i + 1]
    const sameDay = (a, b) => format(new Date(a.created_at), 'yyyy-MM-dd') === format(new Date(b.created_at), 'yyyy-MM-dd')
    const within3 = (a, b) => Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 3 * 60 * 1000
    return {
      ...msg,
      isMe:         msg.sender_id === user.id,
      topGrouped:   !!(prev && prev.sender_id === msg.sender_id && sameDay(prev, msg) && within3(prev, msg)),
      bottomGrouped:!!(next && next.sender_id === msg.sender_id && sameDay(msg, next) && within3(msg, next)),
      showDate:     !prev || !sameDay(prev, msg),
    }
  })

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 shrink-0">
        {isMobile && (
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 mr-1">
            <ArrowLeft size={18} />
          </button>
        )}
        <Avatar profile={otherProfile} size={36} />
        <div>
          <p className="text-sm font-bold text-gray-900">{otherProfile?.full_name || label}</p>
          <p className="text-xs text-gray-400">{label}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400 font-medium">Start the conversation</p>
            <p className="text-xs text-gray-300 mt-1">Say hello to {otherProfile?.full_name?.split(' ')[0] || 'them'}!</p>
          </div>
        ) : (
          grouped.map((msg, i) => (
            <div key={msg.id}>
              {msg.showDate && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[11px] text-gray-400 font-medium">{dateSep(msg.created_at)}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}
              <div className={`flex items-end gap-2 ${msg.isMe ? 'flex-row-reverse' : 'flex-row'} ${msg.topGrouped ? 'mt-0.5' : 'mt-3'}`}>
                {/* Avatar — show only for last in group */}
                <div className="w-7 shrink-0">
                  {!msg.bottomGrouped && !msg.isMe && (
                    <Avatar profile={msg.profiles} size={28} />
                  )}
                </div>

                <div className={`max-w-[72%] ${msg.isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {msg.image_url ? (
                    <img
                      src={msg.image_url}
                      alt=""
                      className="max-w-[240px] rounded-2xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(msg.image_url, '_blank')}
                    />
                  ) : (
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.isMe
                        ? 'bg-accent text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-900 rounded-bl-md'
                    } ${msg.topGrouped && msg.isMe ? 'rounded-tr-2xl' : ''} ${msg.topGrouped && !msg.isMe ? 'rounded-tl-2xl' : ''}`}>
                      {msg.content}
                    </div>
                  )}
                  {!msg.bottomGrouped && (
                    <p className="text-[10px] text-gray-400 mt-1 px-1">{fmtTime(msg.created_at)}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 shrink-0">
        <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-2.5">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={`Message ${otherProfile?.full_name?.split(' ')[0] || 'them'}…`}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <button
            onClick={() => imageRef.current?.click()}
            disabled={imgUploading}
            className="text-gray-400 hover:text-accent transition-colors p-1"
          >
            {imgUploading ? <Loader2 size={16} className="animate-spin" /> : <Image size={16} />}
          </button>
          <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="text-accent disabled:text-gray-300 transition-colors p-1"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main client messages page ──────────────────────────────────────────────────
export default function ClientMessages() {
  const { user } = useAuth()
  const [contacts,   setContacts]   = useState([])  // [{ profile, label, convId }]
  const [selected,   setSelected]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [mobileView, setMobileView] = useState(false) // true = showing chat on mobile

  useEffect(() => {
    if (!user?.id) return

    const setup = async () => {
      // 1. Find the client record
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (!client) { setLoading(false); return }

      // 2. Get all their projects and assigned team members
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, creative_id, editor_id')
        .eq('client_id', client.id)
        .neq('stage', 'archived')

      if (!projects?.length) { setLoading(false); return }

      // Collect unique creative + editor IDs
      const creativeId = projects.find((p) => p.creative_id)?.creative_id || null
      const editorId   = projects.find((p) => p.editor_id)?.editor_id     || null

      const teamIds = [...new Set([creativeId, editorId].filter(Boolean))]

      // 3. Fetch team profiles + all admins in parallel
      const [teamRes, adminRes] = await Promise.all([
        teamIds.length
          ? supabase.from('profiles').select('id, full_name, avatar_url, role').in('id', teamIds)
          : { data: [] },
        supabase.from('profiles').select('id, full_name, avatar_url, role').eq('role', 'admin'),
      ])

      const profileMap = Object.fromEntries(
        [...(teamRes.data || []), ...(adminRes.data || [])].map((p) => [p.id, p])
      )

      // 4. Find or create conversations
      const result = []
      if (creativeId && profileMap[creativeId]) {
        const label = `Your Photographer · ${profileMap[creativeId].full_name}`
        const convId = await findOrCreateDM(user.id, creativeId, label)
        result.push({ profile: profileMap[creativeId], label: 'Your Photographer', convId })
      }
      if (editorId && editorId !== creativeId && profileMap[editorId]) {
        const label = `Your Editor · ${profileMap[editorId].full_name}`
        const convId = await findOrCreateDM(user.id, editorId, label)
        result.push({ profile: profileMap[editorId], label: 'Your Editor', convId })
      }
      // Admins — always available (skip if already added as photographer/editor)
      const addedIds = new Set(result.map((r) => r.profile.id))
      for (const admin of (adminRes.data || [])) {
        if (addedIds.has(admin.id)) continue
        const label = `C4 Lab Support · ${admin.full_name}`
        const convId = await findOrCreateDM(user.id, admin.id, label)
        result.push({ profile: admin, label: 'C4 Lab Support', convId })
      }

      setContacts(result)
      if (result.length > 0) setSelected(result[0])
      setLoading(false)
    }

    setup()
  }, [user])

  if (loading) return (
    <div className="flex justify-center py-24">
      <Loader2 size={22} className="animate-spin text-gray-300" />
    </div>
  )

  if (!contacts.length) return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center px-6">
      <MessageSquare size={40} className="text-gray-200 mb-4" />
      <h2 className="text-lg font-semibold text-gray-400 mb-1">No messages yet</h2>
      <p className="text-sm text-gray-300">
        Once a photographer or editor is assigned to your project, you'll be able to message them here.
      </p>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar — contact list */}
      <div className={`w-64 border-r border-gray-100 flex flex-col shrink-0 ${mobileView ? 'hidden sm:flex' : 'flex'}`}>
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="text-base font-bold text-gray-900">Messages</h1>
          <p className="text-xs text-gray-400 mt-0.5">Your creative team</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {contacts.map((contact) => (
            <button
              key={contact.convId}
              onClick={() => { setSelected(contact); setMobileView(true) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                selected?.convId === contact.convId ? 'bg-accent/5 border-r-2 border-accent' : 'hover:bg-gray-50'
              }`}
            >
              <Avatar profile={contact.profile} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{contact.profile?.full_name}</p>
                <p className="text-xs text-gray-400 truncate">{contact.label}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 min-w-0 ${mobileView ? 'flex' : 'hidden sm:flex'} flex-col`}>
        {selected ? (
          <ChatView
            convId={selected.convId}
            otherProfile={selected.profile}
            label={selected.label}
            onBack={() => setMobileView(false)}
            isMobile={mobileView}
          />
        ) : (
          <div className="flex items-center justify-center flex-1 text-gray-300">
            <MessageSquare size={32} />
          </div>
        )}
      </div>
    </div>
  )
}
