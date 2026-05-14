'use client'
import { useState } from 'react'
import {
    Bot, UserCheck, ChevronLeft, Phone, Trash2, MoreVertical,
    Loader2, Command, Info, Flame, Snowflake, Eye, CheckCircle,
    XCircle, MessageCircle, Wifi
} from 'lucide-react'
import { cn } from '@/lib/utils'
import React from 'react'

interface Contact {
    id: string
    name: string | null
    push_name: string | null
    phone: string | null
    whatsapp_id: string
    ai_tag: string | null
    active_campaign_id: string | null
    campaigns?: { name: string }
    profile_picture?: string | null
    status?: string | null
}

interface Props {
    contact: Contact
    onBack: () => void
    onTakeover: (action: 'take' | 'return') => Promise<void>
    onDelete: () => void
    onToggleLeadPanel: () => void
    onToggleQuickReplies: () => void
    leadPanelOpen: boolean
}

const AI_ACTIVE_TAGS = new Set([null, undefined, 'INTERESSADO', 'POSSIVEL_COMPRADOR', 'LEAD_FRIO'])

function displayName(c: Contact) {
    return c.name || c.push_name || c.phone || c.whatsapp_id.split('@')[0]
}

function initials(name: string) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
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

function avatarGradient(name: string) {
    return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length]
}

interface TagConfig {
    label: string
    icon: React.ReactNode
    color: string
    bg: string
    border: string
}

function getTagConfig(aiTag: string | null): TagConfig | null {
    const map: Record<string, TagConfig> = {
        POSSIVEL_COMPRADOR: {
            label: 'Quente',
            icon: <Flame className="w-3 h-3" />,
            color: 'text-orange-400',
            bg: 'bg-orange-500/10',
            border: 'border-orange-500/30',
        },
        INTERESSADO: {
            label: 'Interesse',
            icon: <Eye className="w-3 h-3" />,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/30',
        },
        LEAD_FRIO: {
            label: 'Frio',
            icon: <Snowflake className="w-3 h-3" />,
            color: 'text-slate-400',
            bg: 'bg-slate-500/10',
            border: 'border-slate-500/30',
        },
        PEDIDO_FECHADO: {
            label: 'Fechado',
            icon: <CheckCircle className="w-3 h-3" />,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/30',
        },
        CANCELADO: {
            label: 'Cancelado',
            icon: <XCircle className="w-3 h-3" />,
            color: 'text-red-400',
            bg: 'bg-red-500/10',
            border: 'border-red-500/30',
        },
    }
    return aiTag ? (map[aiTag] ?? null) : null
}

export default function ChatHeader({
    contact, onBack, onTakeover, onDelete,
    onToggleLeadPanel, onToggleQuickReplies, leadPanelOpen
}: Props) {
    const [loading, setLoading] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

    const name = displayName(contact)
    const isHuman = contact.ai_tag === 'HUMANO'
    const isClosed = contact.ai_tag === 'PEDIDO_FECHADO'
    const isAiActive = AI_ACTIVE_TAGS.has(contact.ai_tag as string | null)
    const tagCfg = getTagConfig(contact.ai_tag)
    const hasPic = !!contact.profile_picture
    const grad = avatarGradient(name)

    async function handleTakeover() {
        setLoading(true)
        await onTakeover(isHuman ? 'return' : 'take')
        setLoading(false)
    }

    return (
        <div className="flex flex-col flex-shrink-0 border-b border-border bg-sidebar/95 backdrop-blur-sm z-10">
            {/* ── Status bar ── */}
            <div className={cn(
                'px-5 py-2 text-[11px] font-semibold flex items-center gap-2 transition-all duration-300',
                isHuman
                    ? 'bg-violet-500/8 text-violet-400 border-b border-violet-500/15'
                    : isClosed
                        ? 'bg-emerald-500/8 text-emerald-400 border-b border-emerald-500/15'
                        : 'bg-primary/5 text-primary border-b border-primary/10'
            )}>
                <div className={cn(
                    'w-1.5 h-1.5 rounded-full animate-pulse',
                    isHuman ? 'bg-violet-400' : isClosed ? 'bg-emerald-400' : 'bg-primary'
                )} />
                {isHuman ? (
                    <><UserCheck className="w-3 h-3" /> Você está atendendo — <span className="opacity-70">IA pausada</span></>
                ) : isClosed ? (
                    <>✅ Pedido Fechado — <span className="opacity-70">IA monitorando</span></>
                ) : (
                    <><Bot className="w-3 h-3" /> IA Ativa — <span className="opacity-70">respondendo automaticamente</span></>
                )}

                {/* Right: quick stats */}
                <div className="ml-auto flex items-center gap-2 text-[10px] opacity-60 font-normal">
                    <Wifi className="w-3 h-3" />
                    <span>Tempo real</span>
                </div>
            </div>

            {/* ── Main header row ── */}
            <div className="flex items-center gap-3 px-4 py-3">
                {/* Back (mobile) */}
                <button
                    onClick={onBack}
                    className="md:hidden p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                    {hasPic ? (
                        <img
                            src={contact.profile_picture!}
                            alt={name}
                            className="w-11 h-11 rounded-full object-cover border-2 border-primary/20 shadow-md"
                        />
                    ) : (
                        <div className={cn(
                            'w-11 h-11 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shadow-md',
                            grad
                        )}>
                            {initials(name)}
                        </div>
                    )}
                    {/* Online / status dot */}
                    <div className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-sidebar',
                        isHuman ? 'bg-violet-500' : 'bg-emerald-500'
                    )} />
                </div>

                {/* Contact info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-sm truncate">{name}</span>
                        {/* Tags pills */}
                        {tagCfg && (
                            <span className={cn(
                                'hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold',
                                tagCfg.color, tagCfg.bg, tagCfg.border
                            )}>
                                {tagCfg.icon}{tagCfg.label}
                            </span>
                        )}
                        {/* Origin badge */}
                        <span className="hidden lg:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground border border-border/60 font-medium">
                            <MessageCircle className="w-2.5 h-2.5" />
                            WhatsApp
                        </span>
                        {/* Campaign badge */}
                        {contact.campaigns?.name && (
                            <span className="hidden xl:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">
                                📢 {contact.campaigns.name}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-[11px] text-muted-foreground truncate">
                            {contact.phone || contact.whatsapp_id.split('@')[0]}
                        </span>
                    </div>
                </div>

                {/* ── Action buttons ── */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Takeover button — primary action */}
                    <button
                        onClick={handleTakeover}
                        disabled={loading}
                        className={cn(
                            'hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 border shadow-sm',
                            isHuman
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hover:shadow-emerald-500/10'
                                : 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20 hover:shadow-violet-500/10'
                        )}
                    >
                        {loading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isHuman ? (
                            <><Bot className="w-3.5 h-3.5" /><span>Devolver à IA</span></>
                        ) : (
                            <><UserCheck className="w-3.5 h-3.5" /><span>Assumir</span></>
                        )}
                    </button>

                    {/* Divider */}
                    <div className="hidden sm:block w-px h-6 bg-border/60 mx-0.5" />

                    {/* Quick replies */}
                    <button
                        onClick={onToggleQuickReplies}
                        title="Gerenciar Respostas Rápidas (Snippets)"
                        className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                    >
                        <Command className="w-4 h-4" />
                    </button>

                    {/* Lead panel toggle */}
                    <button
                        onClick={onToggleLeadPanel}
                        title={leadPanelOpen ? 'Fechar painel do lead' : 'Ver informações do lead'}
                        className={cn(
                            'p-2 rounded-lg transition-all',
                            leadPanelOpen
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                        )}
                    >
                        <Info className="w-4 h-4" />
                    </button>

                    {/* More options */}
                    <div className="relative">
                        <button
                            onClick={() => setMenuOpen(o => !o)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/70 rounded-lg transition-all"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {menuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-2">
                                <button
                                    onClick={() => { onToggleLeadPanel(); setMenuOpen(false) }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-secondary/60 transition-colors text-left"
                                >
                                    <Info className="w-4 h-4 text-primary" />
                                    <span>Dados do Lead</span>
                                </button>
                                <button
                                    onClick={() => { handleTakeover(); setMenuOpen(false) }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-secondary/60 transition-colors text-left"
                                >
                                    {isHuman
                                        ? <><Bot className="w-4 h-4 text-emerald-400" /><span>Devolver à IA</span></>
                                        : <><UserCheck className="w-4 h-4 text-violet-400" /><span>Assumir Conversa</span></>
                                    }
                                </button>
                                <div className="h-px bg-border mx-2 my-1" />
                                <button
                                    onClick={() => { onDelete(); setMenuOpen(false) }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-red-500/10 text-red-400 transition-colors text-left"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span>Excluir Contato</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Click outside to close menu */}
            {menuOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                />
            )}
        </div>
    )
}
