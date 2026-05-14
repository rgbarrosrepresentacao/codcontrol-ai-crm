'use client'
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Bot, UserCheck, Search, Filter } from 'lucide-react'

interface Contact {
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

interface Conversation {
    id: string
    contact_id: string
    last_message: string | null
    last_message_at: string | null
    status: string
    instance_id: string
    unread_count: number
    contact: Contact
}

type Tab = 'all' | 'unread' | 'mine' | 'ai'

const TAG_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    PEDIDO_FECHADO:     { label: 'Fechado',   color: 'text-emerald-400', bg: 'bg-emerald-500/15', dot: 'bg-emerald-400' },
    POSSIVEL_COMPRADOR: { label: 'Quente 🔥', color: 'text-orange-400',  bg: 'bg-orange-500/15',  dot: 'bg-orange-400' },
    INTERESSADO:        { label: 'Interesse', color: 'text-blue-400',    bg: 'bg-blue-500/15',    dot: 'bg-blue-400'   },
    LEAD_FRIO:          { label: 'Frio ❄️',   color: 'text-slate-400',   bg: 'bg-slate-500/15',   dot: 'bg-slate-400'  },
    CANCELADO:          { label: 'Cancelado', color: 'text-red-400',     bg: 'bg-red-500/15',     dot: 'bg-red-400'    },
    HUMANO:             { label: 'Humano',    color: 'text-violet-400',  bg: 'bg-violet-500/15',  dot: 'bg-violet-400' },
}

const AVATAR_GRADIENTS = [
    'from-violet-500 to-purple-700',
    'from-blue-500 to-cyan-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-amber-600',
    'from-pink-500 to-rose-600',
    'from-indigo-500 to-blue-600',
    'from-fuchsia-500 to-pink-600',
    'from-cyan-500 to-blue-500',
]

function displayName(c: Contact) {
    return c.name || c.push_name || c.phone || c.whatsapp_id.split('@')[0]
}

function initials(name: string) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
}

function avatarGradient(name: string) {
    const idx = name.charCodeAt(0) % AVATAR_GRADIENTS.length
    return AVATAR_GRADIENTS[idx]
}

function timeLabel(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMin / 60)

    if (d.toDateString() === now.toDateString()) {
        if (diffMin < 1) return 'Agora'
        if (diffMin < 60) return `${diffMin}m`
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

interface Props {
    conversations: Conversation[]
    selectedId: string | null
    search: string
    onSelect: (conv: Conversation) => void
    onSearchChange: (v: string) => void
}

export default function ConversationList({ conversations, selectedId, search, onSelect, onSearchChange }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('all')

    const counts = useMemo(() => ({
        all: conversations.length,
        unread: conversations.filter(c => (c.unread_count || 0) > 0).length,
        mine: conversations.filter(c => c.contact.ai_tag === 'HUMANO').length,
        ai: conversations.filter(c => !c.contact.ai_tag || c.contact.ai_tag !== 'HUMANO').length,
    }), [conversations])

    const filtered = useMemo(() => {
        let list = conversations

        // Tab filter
        if (activeTab === 'unread') list = list.filter(c => (c.unread_count || 0) > 0)
        else if (activeTab === 'mine') list = list.filter(c => c.contact.ai_tag === 'HUMANO')
        else if (activeTab === 'ai') list = list.filter(c => !c.contact.ai_tag || c.contact.ai_tag !== 'HUMANO')

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase().trim()
            list = list.filter(c => {
                const n = displayName(c.contact).toLowerCase()
                const p = (c.contact.phone || '').replace(/\D/g, '')
                const tag = c.contact.ai_tag?.toLowerCase() || ''
                const campaign = c.contact.campaigns?.name?.toLowerCase() || ''
                return n.includes(q) || p.includes(q) || tag.includes(q) || campaign.includes(q)
            })
        }

        return list
    }, [conversations, activeTab, search])

    const totalUnread = useMemo(() =>
        conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
        [conversations]
    )

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: 'all',    label: 'Todas',     count: counts.all    },
        { key: 'unread', label: 'Não lidas', count: counts.unread },
        { key: 'mine',   label: 'Minhas',    count: counts.mine   },
        { key: 'ai',     label: 'IA',        count: counts.ai     },
    ]

    return (
        <div className="flex flex-col h-full bg-sidebar">
            {/* ── Header ── */}
            <div className="flex-shrink-0 border-b border-border/60">
                {/* Title row */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center shadow-sm">
                            <Bot className="w-4 h-4 text-black" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-foreground leading-none">Chat ao Vivo</h1>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                                {conversations.length} conversas
                                {totalUnread > 0 && (
                                    <span className="text-primary font-bold"> · {totalUnread} não lidas</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {totalUnread > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1.5 animate-pulse">
                                {totalUnread > 99 ? '99+' : totalUnread}
                            </span>
                        )}
                        <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/70 rounded-lg transition-colors">
                            <Filter className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 pb-3">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        <input
                            value={search}
                            onChange={e => onSearchChange(e.target.value)}
                            placeholder="Buscar conversas..."
                            className="w-full bg-input/80 border border-border/60 rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
                        />
                        {search && (
                            <button
                                onClick={() => onSearchChange('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <span className="text-xs">✕</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 px-2 pb-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all border-b-2',
                                activeTab === tab.key
                                    ? 'text-primary border-primary'
                                    : 'text-muted-foreground border-transparent hover:text-foreground/70'
                            )}
                        >
                            {tab.label}
                            {tab.count > 0 && (
                                <span className={cn(
                                    'flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold px-1',
                                    activeTab === tab.key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-secondary text-muted-foreground'
                                )}>
                                    {tab.count > 99 ? '99+' : tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Conversation List ── */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground px-6 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center">
                            <UserCheck className="w-6 h-6 opacity-30" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-foreground/60">
                                {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa nesta categoria'}
                            </p>
                            {search && (
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Tente buscar por nome, número ou tag
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border/30">
                        {filtered.map((conv, index) => {
                            const name = displayName(conv.contact)
                            const tagCfg = conv.contact.ai_tag ? TAG_CONFIG[conv.contact.ai_tag] : null
                            const isActive = selectedId === conv.id
                            const hasUnread = (conv.unread_count || 0) > 0
                            const isHuman = conv.contact.ai_tag === 'HUMANO'
                            const isAiActive = !conv.contact.ai_tag || conv.contact.ai_tag !== 'HUMANO'
                            const grad = avatarGradient(name)
                            const hasPic = !!conv.contact.profile_picture

                            return (
                                <button
                                    key={conv.id}
                                    onClick={() => onSelect(conv)}
                                    style={{ animationDelay: `${index * 20}ms` }}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all duration-150 relative group',
                                        'hover:bg-secondary/50',
                                        isActive
                                            ? 'bg-primary/8 border-l-[3px] border-l-primary pl-[13px]'
                                            : hasUnread
                                                ? 'bg-primary/4'
                                                : 'border-l-[3px] border-l-transparent'
                                    )}
                                >
                                    {/* Active indicator line */}
                                    {isActive && (
                                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r-full" />
                                    )}

                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        {hasPic ? (
                                            <img
                                                src={conv.contact.profile_picture!}
                                                alt={name}
                                                className="w-12 h-12 rounded-full object-cover border-2 border-background shadow-sm"
                                            />
                                        ) : (
                                            <div className={cn(
                                                'w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shadow-sm',
                                                grad
                                            )}>
                                                {initials(name)}
                                            </div>
                                        )}

                                        {/* AI / Human status dot */}
                                        <div className={cn(
                                            'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-[2.5px] border-sidebar flex items-center justify-center shadow-sm',
                                            isHuman ? 'bg-violet-500' : 'bg-emerald-500'
                                        )}>
                                            {isHuman ? (
                                                <span className="text-[7px] text-white font-black">H</span>
                                            ) : (
                                                <span className="text-[7px] text-white font-black">AI</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        {/* Row 1: Name + Time */}
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className={cn(
                                                'text-sm truncate leading-tight',
                                                hasUnread
                                                    ? 'font-bold text-foreground'
                                                    : 'font-medium text-foreground/90'
                                            )}>
                                                {name}
                                            </span>
                                            <span className={cn(
                                                'text-[10px] flex-shrink-0 font-medium',
                                                hasUnread ? 'text-primary font-bold' : 'text-muted-foreground'
                                            )}>
                                                {timeLabel(conv.last_message_at)}
                                            </span>
                                        </div>

                                        {/* Row 2: Preview + Badges */}
                                        <div className="flex items-center gap-1.5">
                                            <p className={cn(
                                                'text-[11px] truncate flex-1 leading-tight',
                                                hasUnread
                                                    ? 'text-foreground/80 font-medium'
                                                    : 'text-muted-foreground'
                                            )}>
                                                {conv.last_message || 'Sem mensagens'}
                                            </p>

                                            {/* Tags row */}
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {/* Campaign badge */}
                                                {conv.contact.campaigns?.name && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold max-w-[60px] truncate hidden">
                                                        {conv.contact.campaigns.name}
                                                    </span>
                                                )}

                                                {/* AI Tag pill */}
                                                {tagCfg && conv.contact.ai_tag !== 'HUMANO' && (
                                                    <span className={cn(
                                                        'text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0',
                                                        tagCfg.bg, tagCfg.color
                                                    )}>
                                                        {conv.contact.ai_tag === 'POSSIVEL_COMPRADOR' ? '🔥' :
                                                         conv.contact.ai_tag === 'INTERESSADO' ? '👀' :
                                                         conv.contact.ai_tag === 'PEDIDO_FECHADO' ? '✅' :
                                                         conv.contact.ai_tag === 'LEAD_FRIO' ? '❄️' :
                                                         conv.contact.ai_tag === 'CANCELADO' ? '❌' : ''}
                                                    </span>
                                                )}

                                                {/* Unread badge */}
                                                {hasUnread && !isActive && (
                                                    <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center px-1.5 shadow-sm">
                                                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Row 3: Campaign (if exists) */}
                                        {conv.contact.campaigns?.name && (
                                            <div className="mt-1">
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/15 font-semibold">
                                                    📢 {conv.contact.campaigns.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ── Footer stats ── */}
            <div className="flex-shrink-0 border-t border-border/50 px-4 py-2.5 bg-background/40 backdrop-blur-sm">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Conexão Online</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <Bot className="w-3 h-3 text-emerald-400" />
                            <span>{counts.ai} com IA</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-violet-400" />
                            <span>{counts.mine} humano</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
