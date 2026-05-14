'use client'
import { useState, useEffect } from 'react'
import {
    X, User, Phone, Tag, FileText, Save, Loader2, MessageSquare,
    Info, Flame, Snowflake, Eye, CheckCircle, XCircle, Zap,
    Link, Clock, Star, Copy, ExternalLink
} from 'lucide-react'
import React from 'react'
import { Contact } from '@/app/dashboard/chat/page'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface QuickReply {
    id: string
    shortcut: string
    content: string
}

interface Props {
    contact: Contact
    onClose: () => void
    onUpdate?: (updated: Partial<Contact>) => void
    onInsertSnippet?: (text: string) => void
}

const STATUS_OPTIONS = [
    { value: 'new',      label: 'Novo',      color: 'bg-blue-500',   text: 'text-blue-400',   ring: 'ring-blue-500/30'  },
    { value: 'active',   label: 'Ativo',     color: 'bg-green-500',  text: 'text-green-400',  ring: 'ring-green-500/30' },
    { value: 'lead',     label: 'Lead',      color: 'bg-orange-500', text: 'text-orange-400', ring: 'ring-orange-500/30'},
    { value: 'customer', label: 'Cliente',   color: 'bg-purple-500', text: 'text-purple-400', ring: 'ring-purple-500/30'},
    { value: 'inactive', label: 'Inativo',   color: 'bg-gray-500',   text: 'text-gray-400',   ring: 'ring-gray-500/30'  },
]

const TAG_SCORES: Record<string, number> = {
    PEDIDO_FECHADO:     100,
    POSSIVEL_COMPRADOR: 80,
    INTERESSADO:        55,
    LEAD_FRIO:          20,
    HUMANO:             65,
    CANCELADO:          5,
}

function getScoreFromTag(tag: string | null): number {
    return tag ? (TAG_SCORES[tag] ?? 35) : 35
}

function getScoreLabel(score: number) {
    if (score >= 80) return { label: 'Lead Quente 🔥', color: 'text-orange-400', bar: 'bg-orange-400' }
    if (score >= 55) return { label: 'Interessado 👀', color: 'text-blue-400',   bar: 'bg-blue-400'   }
    if (score >= 30) return { label: 'Em negociação', color: 'text-yellow-400',  bar: 'bg-yellow-400' }
    return                  { label: 'Lead Frio ❄️',   color: 'text-slate-400',  bar: 'bg-slate-400'  }
}

function getAiTagDisplay(tag: string | null) {
    const map: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
        POSSIVEL_COMPRADOR: { label: 'Quente',    icon: <Flame className="w-3.5 h-3.5" />,        color: 'text-orange-400', bg: 'bg-orange-500/10' },
        INTERESSADO:        { label: 'Interesse', icon: <Eye className="w-3.5 h-3.5" />,           color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
        LEAD_FRIO:          { label: 'Frio',      icon: <Snowflake className="w-3.5 h-3.5" />,     color: 'text-slate-400',  bg: 'bg-slate-500/10'  },
        PEDIDO_FECHADO:     { label: 'Fechado',   icon: <CheckCircle className="w-3.5 h-3.5" />,   color: 'text-emerald-400',bg: 'bg-emerald-500/10'},
        CANCELADO:          { label: 'Cancelado', icon: <XCircle className="w-3.5 h-3.5" />,       color: 'text-red-400',    bg: 'bg-red-500/10'    },
        HUMANO:             { label: 'Humano',    icon: <User className="w-3.5 h-3.5" />,          color: 'text-violet-400', bg: 'bg-violet-500/10' },
    }
    return tag ? (map[tag] ?? { label: tag, icon: <Tag className="w-3.5 h-3.5" />, color: 'text-muted-foreground', bg: 'bg-secondary' }) : null
}

type PanelTab = 'info' | 'activity' | 'history'

export default function LeadPanel({ contact, onClose, onUpdate, onInsertSnippet }: Props) {
    const [activeTab, setActiveTab] = useState<PanelTab>('info')
    const [name, setName] = useState(contact.name || contact.push_name || '')
    const [notes, setNotes] = useState(contact.notes || '')
    const [status, setStatus] = useState(contact.status || 'new')
    const [saving, setSaving] = useState(false)
    const [snippets, setSnippets] = useState<QuickReply[]>([])
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const score = getScoreFromTag(contact.ai_tag)
    const scoreMeta = getScoreLabel(score)
    const aiTagDisplay = getAiTagDisplay(contact.ai_tag)
    const statusCfg = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]

    useEffect(() => {
        setName(contact.name || contact.push_name || '')
        setNotes(contact.notes || '')
        setStatus(contact.status || 'new')
    }, [contact])

    // Load snippets for quick insert
    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase
                .from('quick_replies')
                .select('id, shortcut, content')
                .eq('user_id', user.id)
                .limit(6)
            setSnippets(data || [])
        }
        load()
    }, [])

    async function handleSave() {
        setSaving(true)
        try {
            const res = await fetch('/api/chat/update-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId: contact.id, name, notes, status })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
            toast.success('Lead atualizado!')
            if (onUpdate) onUpdate({ name, notes, status })
        } catch (error: any) {
            toast.error(error.message || 'Erro ao atualizar lead')
        } finally {
            setSaving(false)
        }
    }

    function copySnippet(snippet: QuickReply) {
        if (onInsertSnippet) {
            onInsertSnippet(snippet.content)
            toast.success(`Snippet "${snippet.shortcut}" inserido!`)
        } else {
            navigator.clipboard.writeText(snippet.content)
            setCopiedId(snippet.id)
            setTimeout(() => setCopiedId(null), 1500)
        }
    }

    return (
        <aside className="w-[320px] xl:w-[360px] border-l border-border bg-sidebar flex flex-col h-full animate-in slide-in-from-right duration-300 shadow-2xl shadow-black/20 z-50 flex-shrink-0">
            {/* ── Header ── */}
            <div className="h-14 border-b border-border px-4 flex items-center justify-between bg-background/60 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-sm">Informações</h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* ── Tabs ── */}
            <div className="flex border-b border-border flex-shrink-0">
                {(['info', 'activity', 'history'] as PanelTab[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            'flex-1 py-2.5 text-[11px] font-semibold transition-all border-b-2',
                            activeTab === tab
                                ? 'text-primary border-primary'
                                : 'text-muted-foreground border-transparent hover:text-foreground/70'
                        )}
                    >
                        {tab === 'info' ? 'Informações' : tab === 'activity' ? 'Atividades' : 'Histórico'}
                    </button>
                ))}
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'info' && (
                    <div className="p-5 space-y-5">
                        {/* Profile Card */}
                        <div className="text-center">
                            <div className="relative inline-block">
                                {contact.profile_picture ? (
                                    <img
                                        src={contact.profile_picture}
                                        alt={name}
                                        className="w-20 h-20 rounded-full border-4 border-background shadow-xl object-cover mx-auto"
                                    />
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center border-4 border-background shadow-xl mx-auto ring-2 ring-primary/10">
                                        <User className="w-9 h-9 text-primary" />
                                    </div>
                                )}
                                <div className={cn(
                                    "absolute bottom-0 right-0 w-5 h-5 rounded-full border-2 border-background shadow-sm",
                                    statusCfg.color
                                )} />
                            </div>
                            <h2 className="mt-3 font-bold text-base tracking-tight truncate px-4">{name || 'Sem nome'}</h2>
                            <p className="text-muted-foreground text-xs flex items-center justify-center gap-1.5 mt-0.5">
                                <Phone className="w-3 h-3" />
                                {contact.phone || 'Sem telefone'}
                            </p>
                            {/* AI Tag badge */}
                            {aiTagDisplay && (
                                <div className="mt-2 flex justify-center">
                                    <span className={cn(
                                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border',
                                        aiTagDisplay.color, aiTagDisplay.bg,
                                        'border-current/20'
                                    )}>
                                        {aiTagDisplay.icon}
                                        {aiTagDisplay.label}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Score Bar */}
                        <div className="bg-secondary/40 rounded-2xl p-4 border border-border/50 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Star className="w-4 h-4 text-primary" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Score do Lead</span>
                                </div>
                                <span className={cn('text-sm font-black', scoreMeta.color)}>{score}</span>
                            </div>
                            <div className="h-2 bg-background rounded-full overflow-hidden">
                                <div
                                    className={cn('h-full rounded-full transition-all duration-700', scoreMeta.bar)}
                                    style={{ width: `${score}%` }}
                                />
                            </div>
                            <p className={cn('text-[11px] font-semibold', scoreMeta.color)}>{scoreMeta.label}</p>
                        </div>

                        {/* Lead Data */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dados do Lead</label>

                            <div className="grid grid-cols-1 gap-2">
                                <div className="bg-secondary/30 rounded-xl p-3 border border-border/40">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Tag className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Campanha</span>
                                        </div>
                                    </div>
                                    <p className="text-sm font-semibold mt-1.5 truncate">
                                        {contact.campaigns?.name || '—'}
                                    </p>
                                </div>

                                <div className="bg-secondary/30 rounded-xl p-3 border border-border/40">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Status IA</span>
                                    </div>
                                    <div className={cn(
                                        'mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold',
                                        contact.ai_tag === 'HUMANO'
                                            ? 'bg-orange-500/10 text-orange-400'
                                            : 'bg-emerald-500/10 text-emerald-400'
                                    )}>
                                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                        {contact.ai_tag === 'HUMANO' ? 'IA Pausada' : 'IA Ativa'}
                                    </div>
                                </div>

                                <div className="bg-secondary/30 rounded-xl p-3 border border-border/40">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Origem</span>
                                    </div>
                                    <p className="text-sm font-semibold mt-1.5">WhatsApp</p>
                                </div>
                            </div>
                        </div>

                        {/* Status Selector */}
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status do Funil</label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {STATUS_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setStatus(opt.value)}
                                        className={cn(
                                            'px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border',
                                            status === opt.value
                                                ? `ring-2 ${opt.ring} bg-primary/5 border-primary/30 text-foreground`
                                                : 'bg-background border-border/50 hover:border-muted-foreground/30 text-muted-foreground'
                                        )}
                                    >
                                        <div className={cn('w-2 h-2 rounded-full', opt.color)} />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Name Edit */}
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Nome</label>
                            <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-background border border-border/60 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    placeholder="Nome Completo"
                                />
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Anotações</label>
                                <FileText className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                className="w-full bg-background border border-border/60 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none h-28 placeholder:italic placeholder:text-muted-foreground/60"
                                placeholder="Observações importantes sobre este lead..."
                            />
                        </div>

                        {/* Ações Rápidas */}
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ações Rápidas</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button className="flex items-center gap-2 px-3 py-2.5 bg-secondary/50 hover:bg-secondary/80 border border-border/40 rounded-xl text-xs font-medium transition-all text-left group">
                                    <Link className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
                                    <span>Enviar Link</span>
                                </button>
                                <button className="flex items-center gap-2 px-3 py-2.5 bg-secondary/50 hover:bg-secondary/80 border border-border/40 rounded-xl text-xs font-medium transition-all text-left group">
                                    <Clock className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                                    <span>Agendar</span>
                                </button>
                                <button className="flex items-center gap-2 px-3 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-xs font-medium transition-all text-emerald-400 text-left group">
                                    <CheckCircle className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                                    <span>Marcar Fechado</span>
                                </button>
                                <button
                                    disabled
                                    title="Em breve"
                                    className="flex items-center gap-2 px-3 py-2.5 bg-secondary/30 border border-border/30 rounded-xl text-xs font-medium text-muted-foreground/50 cursor-not-allowed text-left"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Transferir</span>
                                </button>
                            </div>
                        </div>

                        {/* Snippets */}
                        {snippets.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Snippets</label>
                                    <span className="text-[10px] text-muted-foreground/60">Clique para inserir</span>
                                </div>
                                <div className="space-y-1.5">
                                    {snippets.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => copySnippet(s)}
                                            className={cn(
                                                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all group',
                                                copiedId === s.id
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                    : 'bg-background border-border/40 hover:border-primary/40 hover:bg-primary/5'
                                            )}
                                        >
                                            <Zap className={cn(
                                                'w-3.5 h-3.5 flex-shrink-0',
                                                copiedId === s.id ? 'text-emerald-400' : 'text-primary'
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold text-primary mb-0.5">/{s.shortcut}</p>
                                                <p className="text-[11px] text-muted-foreground truncate">{s.content}</p>
                                            </div>
                                            <Copy className={cn(
                                                'w-3 h-3 flex-shrink-0 transition-all',
                                                copiedId === s.id ? 'text-emerald-400' : 'text-muted-foreground/40 group-hover:text-primary'
                                            )} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="p-5 flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center">
                            <Clock className="w-6 h-6 opacity-30" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground/60">Timeline de Atividades</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Em breve — histórico de interações</p>
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="p-5 flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center">
                            <FileText className="w-6 h-6 opacity-30" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground/60">Histórico Completo</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Em breve — logs de atendimento</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            <div className="p-4 border-t border-border bg-background/50 backdrop-blur-sm flex-shrink-0">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full gradient-primary glow-primary text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 text-sm"
                >
                    {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <><Save className="w-4 h-4" /> Salvar Alterações</>
                    )}
                </button>
            </div>
        </aside>
    )
}
