'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
    Search, Send, Bot, UserCheck, Phone,
    MessageCircle, Loader2, ChevronLeft, Mic, Image, MoreVertical,
    Megaphone, Trash2
} from 'lucide-react'
import { toast } from 'sonner'

// Types

interface Conversation {
    id: string
    contact_id: string
    last_message: string | null
    last_message_at: string | null
    status: string
    instance_id: string
    contact: {
        id: string
        name: string | null
        push_name: string | null
        phone: string | null
        whatsapp_id: string
        ai_tag: string | null
        active_campaign_id: string | null
        campaigns?: { name: string }
    }
}

interface Message {
    id: string
    content: string
    from_me: boolean
    ai_generated: boolean
    type: string
    created_at: string
    status: string
}

// Helpers

const aiTagConfig: Record<string, { label: string; color: string; bg: string }> = {
    PEDIDO_FECHADO:     { label: 'Pedido Fechado',     color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
    POSSIVEL_COMPRADOR: { label: 'Possivel Comprador', color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30' },
    INTERESSADO:        { label: 'Interessado',        color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30' },
    LEAD_FRIO:          { label: 'Lead Frio',          color: 'text-slate-400',   bg: 'bg-slate-500/15 border-slate-500/30' },
    CANCELADO:          { label: 'Cancelado',          color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30' },
    HUMANO:             { label: 'Atend. Humano',      color: 'text-violet-400',  bg: 'bg-violet-500/15 border-violet-500/30' },
}

const aiTagEmoji: Record<string, string> = {
    PEDIDO_FECHADO: '✅',
    POSSIVEL_COMPRADOR: '🔥',
    INTERESSADO: '👀',
    LEAD_FRIO: '🧊',
    CANCELADO: '❌',
    HUMANO: '👤',
}

function displayName(c: Conversation['contact']) {
    return c.name || c.push_name || c.phone || c.whatsapp_id.split('@')[0]
}

function initials(name: string) {
    return name.slice(0, 2).toUpperCase()
}

function timeLabel(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// Wrap inner component to use searchParams
function ChatContent() {
    const searchParams = useSearchParams()
    const contactIdParam = searchParams.get('contactId')
    
    const [userId, setUserId] = useState<string | null>(null)
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [selected, setSelected] = useState<Conversation | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [loadingMsg, setLoadingMsg] = useState(false)
    const [search, setSearch] = useState('')
    const [mobileShowChat, setMobileShowChat] = useState(false)
    const bottomRef = useRef<HTMLDivElement>(null)

    // Get authenticated user
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserId(user.id)
        })
    }, [])

    // Load conversations
    const loadConversations = useCallback(async () => {
        if (!userId) return
        const { data } = await supabase
            .from('conversations')
            .select(`
                id, contact_id, last_message, last_message_at, status, instance_id,
                contact:contacts(id, name, push_name, phone, whatsapp_id, ai_tag, active_campaign_id, campaigns:campaigns(name))
            `)
            .eq('user_id', userId)
            .order('last_message_at', { ascending: false })
            .limit(100)
        
        if (data) {
            const convs = data as unknown as Conversation[]
            setConversations(convs)
            
            // Auto-select if parameter is present
            if (contactIdParam && !selected) {
                const found = convs.find(c => c.contact_id === contactIdParam || c.contact.id === contactIdParam)
                if (found) {
                    setSelected(found)
                    setMobileShowChat(true)
                }
            }
        }
    }, [userId, contactIdParam, selected])

    useEffect(() => { loadConversations() }, [loadConversations])

    // Realtime: conversation updates
    useEffect(() => {
        if (!userId) return
        const channel = supabase
            .channel('chat-conversations')
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'conversations',
                filter: `user_id=eq.${userId}`
            }, () => loadConversations())
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [userId, loadConversations])

    // Load messages for selected conversation
    const loadMessages = useCallback(async (convId: string) => {
        setLoadingMsg(true)
        const { data } = await supabase
            .from('messages')
            .select('id, content, from_me, ai_generated, type, created_at, status')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true })
            .limit(100)
        setMessages(data || [])
        setLoadingMsg(false)
    }, [])

    useEffect(() => {
        if (!selected) return
        loadMessages(selected.id)
    }, [selected, loadMessages])

    // Realtime: new incoming messages in the open conversation
    useEffect(() => {
        if (!selected) return
        const channel = supabase
            .channel(`chat-messages-${selected.id}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'messages',
                filter: `conversation_id=eq.${selected.id}`
            }, payload => {
                const newMsg = payload.new as Message
                // Avoid adding duplicates (optimistic + real)
                setMessages(prev => {
                    const isAlreadyThere = prev.some(m => m.id === newMsg.id)
                    const hasTempVersion = prev.some(
                        m => m.id.startsWith('temp-') && m.content === newMsg.content && m.from_me === newMsg.from_me
                    )
                    if (isAlreadyThere) return prev
                    if (hasTempVersion) {
                        // Replace temp with real
                        return prev.map(m =>
                            m.id.startsWith('temp-') && m.content === newMsg.content && m.from_me === newMsg.from_me
                                ? newMsg
                                : m
                        )
                    }
                    return [...prev, newMsg]
                })
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [selected])

    // Auto-scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Select a conversation
    const selectConversation = (conv: Conversation) => {
        setSelected(conv)
        setMessages([])
        setText('')
        setMobileShowChat(true)
    }

    // Send manual message with optimistic UI update
    const sendMessage = async () => {
        if (!text.trim() || !selected || sending) return
        setSending(true)
        const body = text.trim()
        setText('')

        // Show message immediately in chat (optimistic)
        const tempId = `temp-${Date.now()}`
        const optimisticMsg: Message = {
            id: tempId,
            content: body,
            from_me: true,
            ai_generated: false,
            type: 'text',
            created_at: new Date().toISOString(),
            status: 'sending',
        }
        setMessages(prev => [...prev, optimisticMsg])

        try {
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: selected.id,
                    instanceId: selected.instance_id,
                    contactWhatsappId: selected.contact.whatsapp_id,
                    message: body,
                })
            })

            if (!res.ok) {
                const err = await res.json()
                console.error('Erro ao enviar:', err)
                // Remove optimistic message on error
                setMessages(prev => prev.filter(m => m.id !== tempId))
            } else {
                const data = await res.json()
                if (data.message) {
                    // Replace optimistic with real DB record
                    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
                } else {
                    // Mark as sent
                    setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m))
                }
            }
        } catch (e) {
            console.error(e)
            setMessages(prev => prev.filter(m => m.id !== tempId))
        } finally {
            setSending(false)
        }
    }

    const deleteContact = async () => {
        if (!selected) return
        const name = displayName(selected.contact)
        if (!confirm(`Tem certeza que deseja excluir o contato "${name}"? Isso apagará todo o histórico permanentemente.`)) return
        
        try {
            const { error } = await supabase.from('contacts').delete().eq('id', selected.contact.id)
            if (!error) {
                toast.success('Contato excluído com sucesso')
                setSelected(null)
                loadConversations()
            } else {
                toast.error('Erro ao excluir contato: ' + error.message)
            }
        } catch (err) {
            console.error(err)
            toast.error('Erro ao excluir contato')
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const filtered = conversations.filter(c => {
        if (!search) return true
        const n = displayName(c.contact).toLowerCase()
        return n.includes(search.toLowerCase()) || (c.contact.phone || '').includes(search)
    })

    // Render
    return (
        <div className="flex h-screen bg-background overflow-hidden">

            {/* Conversations sidebar */}
            <div className={`
                flex flex-col w-full md:w-80 lg:w-96 border-r border-border bg-sidebar flex-shrink-0
                ${mobileShowChat ? 'hidden md:flex' : 'flex'}
            `}>
                {/* Header */}
                <div className="px-4 pt-5 pb-3 border-b border-border">
                    <div className="flex items-center gap-2 mb-3">
                        <MessageCircle className="w-5 h-5 text-primary" />
                        <h1 className="text-base font-bold text-foreground">Chat ao Vivo</h1>
                        <span className="ml-auto text-xs text-muted-foreground">{conversations.length} conversas</span>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar conversa..."
                            className="w-full bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground text-sm">
                            <MessageCircle className="w-8 h-8 opacity-30" />
                            <span>Nenhuma conversa ainda</span>
                        </div>
                    ) : (
                        filtered.map(conv => {
                            const name = displayName(conv.contact)
                            const tag = conv.contact.ai_tag ? aiTagConfig[conv.contact.ai_tag] : null
                            const tagEmoji = conv.contact.ai_tag ? aiTagEmoji[conv.contact.ai_tag] : null
                            const isActive = selected?.id === conv.id
                            return (
                                <button
                                    key={conv.id}
                                    onClick={() => selectConversation(conv)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left border-b border-border/40 ${isActive ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
                                >
                                    <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                                        {initials(name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-sm font-semibold text-foreground truncate">{name}</span>
                                            <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeLabel(conv.last_message_at)}</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <p className="text-xs text-muted-foreground truncate flex-1">
                                                {conv.last_message || 'Sem mensagens'}
                                            </p>
                                            {tag && tagEmoji && (
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold flex-shrink-0 ${tag.bg} ${tag.color}`}>
                                                    {tagEmoji} {tag.label}
                                                </span>
                                            )}
                                            {conv.contact.campaigns?.name && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-primary/20 bg-primary/5 text-primary/80 font-bold flex-shrink-0">
                                                    📦 {conv.contact.campaigns.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Chat area */}
            <div className={`flex flex-col flex-1 min-w-0 ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
                {!selected ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                        <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center glow-primary">
                            <MessageCircle className="w-10 h-10 text-white" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-lg font-bold text-foreground">Selecione uma conversa</h2>
                            <p className="text-sm mt-1">Clique em um contato a esquerda para abrir o chat</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Chat header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-sidebar flex-shrink-0">
                            <button
                                onClick={() => setMobileShowChat(false)}
                                className="md:hidden p-1.5 text-muted-foreground hover:text-foreground"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                                {initials(displayName(selected.contact))}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-foreground text-sm">{displayName(selected.contact)}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {selected.contact.phone || selected.contact.whatsapp_id}
                                </div>
                            </div>
                            {selected.contact.ai_tag && aiTagConfig[selected.contact.ai_tag] && (
                                <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold hidden sm:inline-flex items-center gap-1 ${aiTagConfig[selected.contact.ai_tag].bg} ${aiTagConfig[selected.contact.ai_tag].color}`}>
                                    {aiTagEmoji[selected.contact.ai_tag]} {aiTagConfig[selected.contact.ai_tag].label}
                                </span>
                            )}
                            {selected.contact.campaigns?.name && (
                                <span className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary font-bold hidden lg:inline-flex items-center gap-1">
                                    <Megaphone className="w-3 h-3" /> {selected.contact.campaigns.name}
                                </span>
                            )}
                            <button 
                                onClick={deleteContact}
                                className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Excluir Contato"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
                                <MoreVertical className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Messages area */}
                        <div
                            className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                            style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(99,102,241,0.03) 0%, transparent 60%)' }}
                        >
                            {loadingMsg ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                                    <MessageCircle className="w-8 h-8 opacity-30" />
                                    <span className="text-sm">Nenhuma mensagem ainda</span>
                                </div>
                            ) : (
                                messages.map((msg, idx) => {
                                    const prevMsg = idx > 0 ? messages[idx - 1] : null
                                    const showDate = !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString()
                                    const isSending = msg.status === 'sending'
                                    return (
                                        <div key={msg.id}>
                                            {showDate && (
                                                <div className="flex justify-center my-3">
                                                    <span className="text-[10px] text-muted-foreground bg-secondary/60 px-3 py-1 rounded-full">
                                                        {new Date(msg.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'} mb-0.5`}>
                                                <div className={`
                                                    max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed relative transition-opacity
                                                    ${isSending ? 'opacity-60' : 'opacity-100'}
                                                    ${msg.from_me
                                                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                                                        : 'bg-secondary/70 text-foreground rounded-bl-sm border border-border/50'
                                                    }
                                                `}>
                                                    {msg.content}
                                                    <div className={`flex items-center gap-1 mt-1 ${msg.from_me ? 'justify-end' : 'justify-start'}`}>
                                                        <span className={`text-[10px] ${msg.from_me ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                                            {isSending ? 'enviando...' : new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        {msg.from_me && msg.ai_generated && !isSending && (
                                                            <Bot className="w-3 h-3 text-primary-foreground/60" aria-label="Enviado pela IA" />
                                                        )}
                                                        {msg.from_me && !msg.ai_generated && !isSending && (
                                                            <UserCheck className="w-3 h-3 text-primary-foreground/60" aria-label="Enviado por humano" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Send input */}
                        <div className="px-4 py-3 border-t border-border bg-sidebar flex-shrink-0">
                            {selected.contact.ai_tag && ['PEDIDO_FECHADO', 'HUMANO'].includes(selected.contact.ai_tag) && (
                                <div className="flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2 mb-2">
                                    <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
                                    IA pausada &mdash; voce esta em atendimento humano
                                </div>
                            )}
                            <div className="flex items-end gap-2">
                                <button className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors flex-shrink-0">
                                    <Image className="w-5 h-5" />
                                </button>
                                <button className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors flex-shrink-0">
                                    <Mic className="w-5 h-5" />
                                </button>
                                <textarea
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Digite uma mensagem..."
                                    rows={1}
                                    className="flex-1 bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                    style={{ minHeight: '44px', maxHeight: '120px' }}
                                    onInput={e => {
                                        const el = e.currentTarget
                                        el.style.height = 'auto'
                                        el.style.height = el.scrollHeight + 'px'
                                    }}
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!text.trim() || sending}
                                    className="p-2.5 gradient-primary rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-50 hover:opacity-90 transition-all glow-primary"
                                >
                                    {sending ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Send className="w-5 h-5 text-white" />}
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                                Enter para enviar &middot; Shift+Enter para nova linha &middot; Mensagens humanas pausam a IA automaticamente
                            </p>
                        </div>
                    </>
                )}
            </div>
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

