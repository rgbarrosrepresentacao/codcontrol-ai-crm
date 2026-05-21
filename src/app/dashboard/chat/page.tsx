'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import MessageInput from '@/components/chat/MessageInput'
import MessageBubble from '@/components/chat/MessageBubble'
import ChatHeader from '@/components/chat/ChatHeader'
import ConversationList from '@/components/chat/ConversationList'
import LeadPanel from '@/components/chat/LeadPanel'
import QuickRepliesManager from '@/components/chat/QuickRepliesManager'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Contact {
    id: string
    name: string | null
    push_name: string | null
    phone: string | null
    whatsapp_id: string
    ai_tag: string | null
    active_campaign_id: string | null
    status: string | null
    notes: string | null
    profile_picture: string | null
    campaigns?: { name: string }
}

export interface Conversation {
    id: string
    contact_id: string
    last_message: string | null
    last_message_at: string | null
    status: string
    instance_id: string
    unread_count: number
    contact: Contact
}

interface Message {
    id: string
    content: string
    from_me: boolean
    ai_generated: boolean
    type: string
    created_at: string
    status: string
    // Optional fields used in optimistic updates
    conversation_id?: string
    user_id?: string
    instance_id?: string
    contact_id?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONV_SELECT = `
  id, contact_id, last_message, last_message_at, status, instance_id, unread_count,
  contact:contacts(
    id, name, push_name, phone, whatsapp_id, ai_tag, 
    active_campaign_id, status, notes, last_message_at, profile_picture,
    campaigns:campaigns(name)
  )
`

// ─── Main component ───────────────────────────────────────────────────────────

function ChatContent() {
    const searchParams = useSearchParams()
    const contactIdParam = searchParams.get('contactId')

    const [userId, setUserId] = useState<string | null>(null)
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [selected, setSelected] = useState<Conversation | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [sending, setSending] = useState(false)
    const [loadingMsg, setLoadingMsg] = useState(false)
    const [search, setSearch] = useState('')
    const [mobileShowChat, setMobileShowChat] = useState(false)
    const [leadPanelOpen, setLeadPanelOpen] = useState(false)
    const [quickRepliesOpen, setQuickRepliesOpen] = useState(false)
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
    const [insertText, setInsertText] = useState<string | undefined>(undefined)
    const [newMsgCount, setNewMsgCount] = useState(0)

    const bottomRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const selectedRef = useRef<Conversation | null>(null)
    selectedRef.current = selected

    // ── Auth ──────────────────────────────────────────────────────────────────

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserId(user.id)
        })
    }, [])

    // ── Fetch single conversation (for realtime updates) ───────────────────

    const fetchSingleConversation = useCallback(async (convId: string): Promise<Conversation | null> => {
        const { data } = await supabase
            .from('conversations')
            .select(CONV_SELECT)
            .eq('id', convId)
            .single()
        return data as unknown as Conversation | null
    }, [])

    // ── Load all conversations ─────────────────────────────────────────────

    const loadConversations = useCallback(async () => {
        if (!userId) return
        const { data } = await supabase
            .from('conversations')
            .select(CONV_SELECT)
            .eq('user_id', userId)
            .order('last_message_at', { ascending: false })
            .limit(150)

        if (!data) return
        const convs = data as unknown as Conversation[]
        setConversations(convs)

        // Auto-select from URL param
        if (contactIdParam && !selectedRef.current) {
            const found = convs.find(c => c.contact_id === contactIdParam || c.contact.id === contactIdParam)
            if (found) { selectConversation(found) }
        }
    }, [userId, contactIdParam]) // eslint-disable-line

    useEffect(() => { loadConversations() }, [loadConversations])

    // ── Realtime: conversations (cirúrgico) ───────────────────────────────

    useEffect(() => {
        if (!userId) return

        const channel = supabase
            .channel(`chat-conversations-${userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'conversations',
                filter: `user_id=eq.${userId}`,
            }, async (payload) => {
                const fresh = await fetchSingleConversation(payload.new.id as string)
                if (fresh) {
                    setConversations(prev => {
                        if (prev.some(c => c.id === fresh.id)) return prev
                        return [fresh, ...prev]
                    })
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'conversations',
                filter: `user_id=eq.${userId}`,
            }, async (payload) => {
                const updatedId = payload.new.id as string
                const fresh = await fetchSingleConversation(updatedId)
                if (!fresh) return

                setConversations(prev => {
                    const without = prev.filter(c => c.id !== updatedId)
                    if (selectedRef.current?.id === updatedId) {
                        fresh.unread_count = 0
                    }
                    return [fresh, ...without]
                })

                if (selectedRef.current?.id === updatedId) {
                    setSelected(prev => prev ? { ...prev, ...fresh, unread_count: 0 } : prev)
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [userId, fetchSingleConversation])

    // ── Realtime: contacts ────────────────────────────────────────────────

    useEffect(() => {
        if (!userId) return

        const channel = supabase
            .channel(`chat-contacts-${userId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'contacts',
                filter: `user_id=eq.${userId}`,
            }, (payload) => {
                const updatedContact = payload.new as Contact
                
                setConversations(prev => prev.map(conv => 
                    conv.contact_id === updatedContact.id 
                        ? { ...conv, contact: { ...conv.contact, ...updatedContact } }
                        : conv
                ))

                if (selectedRef.current?.contact_id === updatedContact.id) {
                    setSelected(prev => {
                        if (!prev) return prev
                        return { ...prev, contact: { ...prev.contact, ...updatedContact } }
                    })
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [userId])

    // ── Pagination state ──────────────────────────────────────────────────

    const [hasMoreMessages, setHasMoreMessages] = useState(false)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const MSG_PAGE_SIZE = 50

    // ── Load messages (initial, paginated) ───────────────────────────────

    const loadMessages = useCallback(async (convId: string) => {
        setLoadingMsg(true)
        setHasMoreMessages(false)
        // FIX: include `payload` so audioUrl is available in MessageBubble
        const { data } = await supabase
            .from('messages')
            .select('id, content, from_me, ai_generated, type, created_at, status, payload')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: false })
            .limit(MSG_PAGE_SIZE)
        const msgs = (data || []).reverse()
        setMessages(msgs)
        setHasMoreMessages(msgs.length === MSG_PAGE_SIZE)
        setLoadingMsg(false)
        setNewMsgCount(0)
        setAutoScrollEnabled(true)
    }, [])

    // ── Load older messages (load-more) ───────────────────────────────────

    const loadMoreMessages = useCallback(async () => {
        if (!selected || loadingOlder || !hasMoreMessages) return
        setLoadingOlder(true)
        const oldest = messages[0]?.created_at
        if (!oldest) { setLoadingOlder(false); return }
        const { data } = await supabase
            .from('messages')
            .select('id, content, from_me, ai_generated, type, created_at, status, payload')
            .eq('conversation_id', selected.id)
            .order('created_at', { ascending: false })
            .lt('created_at', oldest)
            .limit(MSG_PAGE_SIZE)
        const older = (data || []).reverse()
        setMessages(prev => [...older, ...prev])
        setHasMoreMessages(older.length === MSG_PAGE_SIZE)
        setLoadingOlder(false)
    }, [selected, loadingOlder, hasMoreMessages, messages])

    useEffect(() => {
        if (!selected) return
        loadMessages(selected.id)
    }, [selected?.id]) // eslint-disable-line

    // ── FIX: Keep autoScrollEnabled in a stable ref so the messages channel
    //    doesn't get destroyed/recreated every time the user scrolls ─────
    const autoScrollRef = useRef(autoScrollEnabled)
    useEffect(() => { autoScrollRef.current = autoScrollEnabled }, [autoScrollEnabled])

    // ── Realtime: messages ────────────────────────────────────────────────
    // Depends only on selected?.id — NOT on autoScrollEnabled.
    // This prevents subscription churn on every scroll event.

    useEffect(() => {
        if (!selected) return

        const channel = supabase
            .channel(`chat-messages-${selected.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${selected.id}`,
            }, payload => {
                const newMsg = payload.new as Message
                setMessages(prev => {
                    if (prev.some(m => m.id === newMsg.id)) return prev

                    // ── Optimistic reconciliation by temp-ID prefix ──
                    // For text: match by content. For media: match by type+from_me (first pending temp).
                    // We read autoScroll from the stable ref to avoid channel re-subscription.
                    const tempIdx = prev.findIndex(m => {
                        if (!m.id.startsWith('temp-')) return false
                        if (m.type !== newMsg.type) return false
                        if (m.from_me !== newMsg.from_me) return false
                        if (m.type === 'text') return m.content === newMsg.content
                        return true
                    })
                    if (tempIdx >= 0) {
                        const next = [...prev]
                        next[tempIdx] = newMsg
                        return next
                    }

                    // Incoming message from client
                    if (!autoScrollRef.current && !newMsg.from_me) {
                        setNewMsgCount(c => c + 1)
                    }
                    return [...prev, newMsg]
                })
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [selected?.id]) // eslint-disable-line — stable ref used for autoScroll

    // ── Auto-scroll ───────────────────────────────────────────────────────

    useEffect(() => {
        if (autoScrollEnabled) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, autoScrollEnabled])

    function handleScroll() {
        const el = messagesContainerRef.current
        if (!el) return
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        setAutoScrollEnabled(isAtBottom)
        if (isAtBottom) setNewMsgCount(0)
    }

    function scrollToBottom() {
        setAutoScrollEnabled(true)
        setNewMsgCount(0)
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // ── Select conversation ───────────────────────────────────────────────

    function selectConversation(conv: Conversation) {
        setSelected(conv)
        setMessages([])
        setMobileShowChat(true)
        setLeadPanelOpen(false)
        // Mark as read
        if (conv.unread_count > 0) {
            fetch('/api/chat/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: conv.id }),
            }).catch(console.error)
            // Optimistically zero the badge
            setConversations(prev => prev.map(c =>
                c.id === conv.id ? { ...c, unread_count: 0 } : c
            ))
        }
    }

    // ── Send message ──────────────────────────────────────────────────────

    async function sendMessage(body: string) {
        if (!selected || sending) return
        setSending(true)

        const tempId = `temp-${Date.now()}`
        const optimistic: Message = {
            id: tempId,
            content: body,
            from_me: true,
            ai_generated: false,
            type: 'text',
            created_at: new Date().toISOString(),
            status: 'sending',
        }
        setMessages(prev => [...prev, optimistic])
        setAutoScrollEnabled(true)

        try {
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: selected.id,
                    instanceId: selected.instance_id,
                    contactWhatsappId: selected.contact.whatsapp_id,
                    message: body,
                }),
            })

            if (!res.ok) {
                setMessages(prev => prev.filter(m => m.id !== tempId))
                toast.error('Falha ao enviar mensagem')
            } else {
                const data = await res.json()
                if (data.message) {
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
                } else {
                    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m))
                }
                // Update local contact ai_tag to HUMANO
                setSelected(prev => prev ? {
                    ...prev,
                    contact: { ...prev.contact, ai_tag: 'HUMANO' }
                } : prev)
            }
        } catch {
            setMessages(prev => prev.filter(m => m.id !== tempId))
            toast.error('Erro de conexão')
        } finally {
            setSending(false)
        }
    }

    async function sendMedia(file: File | Blob, type: string) {
        if (!selected || sending) return

        const tempId = 'temp-' + Date.now()
        let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) {
            if (file.type.includes('webm')) mediaType = 'audio'
            else mediaType = 'video'
        } else if (file.type.startsWith('audio/')) mediaType = 'audio'

        // ── FIX: Create ObjectURL once, track it for revocation ──
        const previewUrl = URL.createObjectURL(file)

        const optimistic: Message = {
            id: tempId,
            content: previewUrl,
            from_me: true,
            type: mediaType,
            created_at: new Date().toISOString(),
            status: 'sending',
            ai_generated: false,
            conversation_id: selected.id,
            user_id: '',
            instance_id: selected.instance_id,
            contact_id: selected.contact.id
        }

        setMessages(prev => [...prev, optimistic])
        setSending(true)
        setAutoScrollEnabled(true)

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('conversationId', selected.id)
            formData.append('instanceId', selected.instance_id)
            formData.append('contactWhatsappId', selected.contact.whatsapp_id)
            formData.append('contactId', selected.contact.id)

            const res = await fetch('/api/chat/send-media', {
                method: 'POST',
                body: formData
            })

            // ── FIX: Revoke ObjectURL after server responds (success or failure) ──
            URL.revokeObjectURL(previewUrl)

            if (!res.ok) {
                const data = await res.json()
                setMessages(prev => prev.filter(m => m.id !== tempId))
                throw new Error(data.error || 'Erro ao enviar mídia')
            } else {
                const data = await res.json()
                if (data.message) {
                    // Replace with real server message (has public URL)
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
                } else {
                    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m))
                }
                setSelected(prev => prev ? {
                    ...prev,
                    contact: { ...prev.contact, ai_tag: 'HUMANO' }
                } : prev)
            }
        } catch (err: any) {
            URL.revokeObjectURL(previewUrl) // also revoke on network error
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m))
            toast.error(err.message || 'Não foi possível enviar o arquivo')
        } finally {
            setSending(false)
        }
    }

    // ── Takeover ──────────────────────────────────────────────────────────

    async function handleTakeover(action: 'take' | 'return') {
        if (!selected) return
        try {
            const res = await fetch('/api/chat/takeover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId: selected.contact.id, action }),
            })
            if (!res.ok) throw new Error()
            const newTag = action === 'take' ? 'HUMANO' : null
            setSelected(prev => prev ? {
                ...prev,
                contact: { ...prev.contact, ai_tag: newTag }
            } : prev)
            setConversations(prev => prev.map(c =>
                c.id === selected.id
                    ? { ...c, contact: { ...c.contact, ai_tag: newTag } }
                    : c
            ))
            toast.success(action === 'take' ? '✋ Conversa assumida — IA pausada' : '🤖 Conversa devolvida para a IA')
        } catch {
            toast.error('Erro ao alterar modo de atendimento')
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────

    async function deleteContact() {
        if (!selected) return
        if (!confirm(`Excluir contato "${selected.contact.name || selected.contact.push_name || selected.contact.phone}"? Isso apagará todo o histórico.`)) return
        const { error } = await supabase.from('contacts').delete().eq('id', selected.contact.id)
        if (!error) {
            toast.success('Contato excluído')
            setSelected(null)
            setConversations(prev => prev.filter(c => c.id !== selected.id))
        } else {
            toast.error('Erro ao excluir contato')
        }
    }

    const handleContactUpdate = (updated: Partial<Contact>) => {
        if (!selected) return
        const newSelected = {
            ...selected,
            contact: { ...selected.contact, ...updated }
        }
        setSelected(newSelected)
        setConversations(prev => prev.map(c => c.id === selected.id ? newSelected : c))
    }

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className="flex h-screen bg-background overflow-hidden">

            {/* ── Conversations sidebar ── */}
            <div className={`
                flex flex-col w-full md:w-80 lg:w-96 border-r border-border bg-sidebar flex-shrink-0
                ${mobileShowChat ? 'hidden md:flex' : 'flex'}
            `}>
                <ConversationList
                    conversations={conversations}
                    selectedId={selected?.id || null}
                    search={search}
                    onSelect={selectConversation}
                    onSearchChange={setSearch}
                />
            </div>

            {/* ── Chat area ── */}
            <div className={`flex flex-col flex-1 min-w-0 ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
                {!selected ? (
                    <div className="flex flex-col items-center justify-center h-full gap-6 text-muted-foreground px-8">
                        <div className="relative">
                            <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center glow-primary shadow-2xl">
                                <MessageCircle className="w-12 h-12 text-black" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
                        </div>
                        <div className="text-center space-y-2">
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Chat ao Vivo</h2>
                            <p className="text-sm text-muted-foreground/80 max-w-xs leading-relaxed">
                                Selecione uma conversa na lista para iniciar o atendimento em tempo real
                            </p>
                        </div>
                        <div className="flex items-center gap-6 text-[11px] text-muted-foreground/60">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span>IA respondendo</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-violet-500" />
                                <span>Atendimento humano</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1 min-h-0">
                        <ChatHeader
                            contact={selected.contact}
                            onBack={() => setMobileShowChat(false)}
                            onTakeover={handleTakeover}
                            onDelete={deleteContact}
                            onToggleLeadPanel={() => setLeadPanelOpen(o => !o)}
                            onToggleQuickReplies={() => setQuickRepliesOpen(o => !o)}
                            leadPanelOpen={leadPanelOpen}
                        />

                        {/* Messages area */}
                        <div
                            ref={messagesContainerRef}
                            onScroll={handleScroll}
                            className="flex-1 overflow-y-auto relative"
                            style={{
                                backgroundImage: [
                                    'radial-gradient(circle at 15% 85%, rgba(99,102,241,0.04) 0%, transparent 50%)',
                                    'radial-gradient(circle at 85% 15%, rgba(139,92,246,0.03) 0%, transparent 50%)',
                                ].join(', '),
                            }}
                        >
                            <div className="flex flex-col py-6 px-4 md:px-8 min-h-full">
                                {loadingMsg ? (
                                    <div className="flex items-center justify-center flex-1 h-full py-20">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="relative w-10 h-10">
                                                <Loader2 className="w-10 h-10 animate-spin text-primary/30" />
                                                <Loader2 className="w-6 h-6 animate-spin text-primary absolute top-2 left-2" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
                                            </div>
                                            <span className="text-xs text-muted-foreground">Carregando mensagens...</span>
                                        </div>
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center flex-1 h-full py-20 gap-4 text-muted-foreground">
                                        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg glow-primary">
                                            <MessageCircle className="w-8 h-8 text-black" />
                                        </div>
                                        <div className="text-center">
                                            <p className="font-semibold text-foreground/70">Nenhuma mensagem ainda</p>
                                            <p className="text-xs mt-1 text-muted-foreground/70">Envie a primeira mensagem para iniciar o atendimento</p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* ── Load more (pagination) ── */}
                                        {hasMoreMessages && (
                                            <div className="flex justify-center mb-4">
                                                <button
                                                    onClick={loadMoreMessages}
                                                    disabled={loadingOlder}
                                                    className="flex items-center gap-2 text-xs text-muted-foreground/70 hover:text-foreground bg-secondary/60 hover:bg-secondary px-4 py-2 rounded-full transition-all disabled:opacity-50"
                                                >
                                                    {loadingOlder
                                                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</>
                                                        : '⬆ Carregar mensagens anteriores'
                                                    }
                                                </button>
                                            </div>
                                        )}

                                        {messages.map((msg, idx) => {
                                            const prev = idx > 0 ? messages[idx - 1] : null
                                            const showDate = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString()
                                            return <MessageBubble key={msg.id} msg={msg} showDate={showDate} prevMsg={prev} />
                                        })}
                                    </>
                                )}
                                <div ref={bottomRef} className="h-2" />
                            </div>

                            {/* New messages floating pill */}
                            {newMsgCount > 0 && (
                                <div className="sticky bottom-4 flex justify-center pointer-events-none">
                                    <button
                                        onClick={scrollToBottom}
                                        className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground text-xs font-bold px-4 py-2.5 rounded-full shadow-lg shadow-primary/30 hover:opacity-90 transition-all hover:scale-105 active:scale-95"
                                    >
                                        <span>↓</span>
                                        <span>{newMsgCount} nova{newMsgCount > 1 ? 's' : ''} mensagen{newMsgCount > 1 ? 's' : ''}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <MessageInput
                            onSend={sendMessage}
                            onSendMedia={sendMedia}
                            sending={sending}
                            insertText={insertText}
                        />
                    </div>
                )}
            </div>

            {/* ── Lead Panel ── */}
            {selected && leadPanelOpen && (
                <LeadPanel
                    contact={selected.contact}
                    onClose={() => setLeadPanelOpen(false)}
                    onUpdate={handleContactUpdate}
                    onInsertSnippet={(text) => {
                        setInsertText(text)
                        // Reset after a tick so the effect re-triggers on next use
                        setTimeout(() => setInsertText(undefined), 100)
                    }}
                />
            )}

            {/* ── Quick Replies Manager ── */}
            {quickRepliesOpen && (
                <QuickRepliesManager onClose={() => setQuickRepliesOpen(false)} />
            )}
        </div>
    )
}

export default function ChatPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-background">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        }>
            <ChatContent />
        </Suspense>
    )
}
