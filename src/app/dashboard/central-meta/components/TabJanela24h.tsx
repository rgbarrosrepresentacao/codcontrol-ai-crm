'use client'
import { Clock, CheckCircle2, Loader2, AlertTriangle, Send } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

function formatTimeLeft(minutes: number): string {
    if (minutes <= 0) return 'Expirada'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0) return `${h}h ${m}m restantes`
    return `${m}m restantes`
}

function timeAgo(dateStr: string): string {
    if (!dateStr) return '—'
    const diff = Date.now() - new Date(dateStr).getTime()
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (h >= 24) return `${Math.floor(h / 24)}d atrás`
    if (h > 0) return `${h}h ${m}m atrás`
    return `${m}m atrás`
}

export function TabJanela24h({ data, loading, approvedTemplates }: any) {
    const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')
    const [selectedTemplate, setSelectedTemplate] = useState<string>('')
    const [sending, setSending] = useState<string | null>(null)

    const conversations = data?.conversations || []
    const filtered = filter === 'all' ? conversations
        : filter === 'open' ? conversations.filter((c: any) => c.window_open)
        : conversations.filter((c: any) => !c.window_open)

    const handleReopen = async (convId: string, contactPhone: string) => {
        if (!selectedTemplate) return
        setSending(convId)
        try {
            await fetch('/api/meta/send-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: convId, phone: contactPhone, templateName: selectedTemplate })
            })
        } finally {
            setSending(null)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
    )

    return (
        <div className="space-y-4">
            {/* Summary + Filter */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                    {[
                        { key: 'all', label: `Todas (${data?.total ?? 0})` },
                        { key: 'open', label: `Abertas (${data?.open ?? 0})` },
                        { key: 'closed', label: `Fechadas (${data?.closed ?? 0})` },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key as any)}
                            className={cn(
                                'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                                filter === f.key
                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                    : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Template Selector para Reabrir */}
                {approvedTemplates.length > 0 ? (
                    <select
                        value={selectedTemplate}
                        onChange={e => setSelectedTemplate(e.target.value)}
                        className="ml-auto px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 outline-none focus:border-purple-500/50"
                    >
                        <option value="">Selecionar template para reabrir</option>
                        {approvedTemplates.map((t: any) => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                    </select>
                ) : (
                    <div className="ml-auto flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Nenhum template aprovado para reabrir conversas
                    </div>
                )}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 border-dashed rounded-3xl">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mb-3" />
                    <p className="text-white font-medium">Nenhuma conversa neste filtro</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((conv: any) => (
                        <div
                            key={conv.id}
                            className={cn(
                                'flex items-center gap-4 p-4 rounded-2xl border transition-all',
                                conv.window_open
                                    ? 'bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/20'
                                    : 'bg-red-500/5 border-red-500/10 hover:border-red-500/20'
                            )}
                        >
                            {/* Avatar */}
                            <div className={cn(
                                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                                conv.window_open ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            )}>
                                {conv.contact?.name?.slice(0, 2)?.toUpperCase() || '??'}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                    {conv.contact?.name || conv.contact?.phone || 'Desconhecido'}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {conv.contact?.phone} {conv.contact?.product_name ? `• ${conv.contact.product_name}` : ''}
                                </p>
                            </div>

                            {/* Última msg */}
                            <div className="text-right hidden sm:block flex-shrink-0">
                                <p className="text-xs text-gray-400">{timeAgo(conv.last_message_at)}</p>
                                <p className="text-xs text-gray-600">última msg</p>
                            </div>

                            {/* Window Status */}
                            <div className="flex-shrink-0 text-right">
                                {conv.window_open ? (
                                    <div className="flex items-center gap-1.5 text-emerald-400">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-xs font-medium">{formatTimeLeft(conv.window_expires_in_minutes)}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-red-400">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span className="text-xs font-medium">Janela fechada</span>
                                    </div>
                                )}
                            </div>

                            {/* Reabrir */}
                            {!conv.window_open && (
                                <button
                                    onClick={() => handleReopen(conv.id, conv.contact?.phone)}
                                    disabled={!selectedTemplate || sending === conv.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all flex-shrink-0"
                                >
                                    {sending === conv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                    Reabrir
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
