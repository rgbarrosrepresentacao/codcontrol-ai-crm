'use client'
import { Clock, CheckCircle2, Loader2, AlertTriangle, Send, Info } from 'lucide-react'
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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
    const [variableValues, setVariableValues] = useState<string[]>([])
    const [sending, setSending] = useState<string | null>(null)

    // ── LÓGICA DE VARIÁVEIS ──
    const selectedTemplateObj = useMemo(() => 
        approvedTemplates.find((t: any) => t.name === selectedTemplate),
    [selectedTemplate, approvedTemplates])

    const requiredVariables = useMemo(() => {
        if (!selectedTemplateObj) return []
        const body = selectedTemplateObj.components?.find((c: any) => c.type === 'BODY')
        const text = body?.text || ''
        const matches = text.match(/\{\{(\d+)\}\}/g) || []
        return matches
    }, [selectedTemplateObj])

    const handleTemplateChange = (val: string) => {
        setSelectedTemplate(val)
        setVariableValues([]) // Reseta valores ao trocar
    }

    const handleVariableChange = (index: number, value: string) => {
        const newValues = [...variableValues]
        newValues[index] = value
        setVariableValues(newValues)
    }

    // ── ORDENAÇÃO E FILTRO ──
    const sortedConversations = useMemo(() => {
        const conversations = data?.conversations || []
        const filtered = filter === 'all' ? conversations
            : filter === 'open' ? conversations.filter((c: any) => c.window_open)
            : conversations.filter((c: any) => !c.window_open)

        return [...filtered].sort((a: any, b: any) => {
            // Prioridade 1: Janelas abertas primeiro
            if (a.window_open && !b.window_open) return -1
            if (!a.window_open && b.window_open) return 1
            
            // Prioridade 2: Entre abertas, as que expiram antes primeiro
            if (a.window_open && b.window_open) {
                return a.window_expires_in_minutes - b.window_expires_in_minutes
            }
            
            // Prioridade 3: Entre fechadas, as mais recentes primeiro
            return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
        })
    }, [data, filter])

    const handleReopen = async (convId: string, contactPhone: string) => {
        if (!selectedTemplate) {
            toast.error('Selecione um template primeiro')
            return
        }

        // Validação Rígida no Front (Fase 3)
        const filledValues = variableValues.filter(v => v && v.trim() !== '')
        if (filledValues.length < requiredVariables.length) {
            toast.error(`Preencha todas as ${requiredVariables.length} variáveis obrigatórias antes de enviar.`)
            return
        }

        setSending(convId)
        try {
            const res = await fetch('/api/meta/send-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    conversationId: convId, 
                    phone: contactPhone, 
                    templateName: selectedTemplate,
                    variables: variableValues // Sanitização ocorre no backend
                })
            })
            const result = await res.json()
            
            if (!res.ok) {
                toast.error(result.error || 'Erro ao enviar template')
            } else {
                toast.success(`Template enviado com sucesso!`)
            }
        } catch (err) {
            toast.error('Erro de conexão ao enviar template')
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
            {/* Header com Seletor e Variáveis */}
            <div className="p-5 bg-white/5 border border-white/10 rounded-3xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl border border-white/5">
                        {[
                            { key: 'all', label: `Todas (${data?.total ?? 0})` },
                            { key: 'open', label: `Abertas (${data?.open ?? 0})` },
                            { key: 'closed', label: `Fechadas (${data?.closed ?? 0})` },
                        ].map(f => (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key as any)}
                                className={cn(
                                    'px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
                                    filter === f.key
                                        ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                                        : 'text-gray-400 hover:text-gray-300'
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 w-full sm:w-auto">
                        {approvedTemplates.length > 0 ? (
                            <select
                                value={selectedTemplate}
                                onChange={e => handleTemplateChange(e.target.value)}
                                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
                            >
                                <option value="">Selecionar template para reabrir...</option>
                                {approvedTemplates.map((t: any) => (
                                    <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                                ))}
                            </select>
                        ) : (
                            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
                                <AlertTriangle className="w-4 h-4" />
                                Nenhum template aprovado encontrado.
                            </div>
                        )}
                    </div>
                </div>

                {/* Formulário Dinâmico de Variáveis */}
                {selectedTemplate && requiredVariables.length > 0 && (
                    <div className="pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2 mb-3">
                            <Info className="w-4 h-4 text-purple-400" />
                            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Variáveis do Template</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {requiredVariables.map((v: string, idx: number) => (
                                <div key={idx} className="space-y-1.5">
                                    <label className="text-[10px] text-gray-500 ml-1">Campo {v}</label>
                                    <input
                                        type="text"
                                        placeholder={`Valor para ${v}...`}
                                        value={variableValues[idx] || ''}
                                        onChange={e => handleVariableChange(idx, e.target.value)}
                                        className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-gray-600 outline-none focus:border-purple-500/40"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Listagem */}
            {sortedConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 border-dashed rounded-3xl">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500/30 mb-3" />
                    <p className="text-gray-500 text-sm">Nenhuma conversa encontrada neste filtro.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2">
                    {sortedConversations.map((conv: any) => {
                        const isExpiringSoon = conv.window_open && conv.window_expires_in_minutes < 120
                        
                        return (
                            <div
                                key={conv.id}
                                className={cn(
                                    'flex items-center gap-4 p-4 rounded-2xl border transition-all relative overflow-hidden group',
                                    conv.window_open
                                        ? isExpiringSoon 
                                            ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                                            : 'bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/20'
                                        : 'bg-white/[0.02] border-white/5 hover:border-white/10 opacity-80 hover:opacity-100'
                                )}
                            >
                                {/* Indicador Visual de Urgência */}
                                {isExpiringSoon && (
                                    <div className="absolute top-0 right-0 w-1 h-full bg-amber-500 animate-pulse" />
                                )}

                                {/* Avatar */}
                                <div className={cn(
                                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                                    conv.window_open 
                                        ? isExpiringSoon ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                )}>
                                    {conv.contact?.name?.slice(0, 2)?.toUpperCase() || '??'}
                                </div>

                                {/* Info Contato */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-white truncate">
                                            {conv.contact?.name || conv.contact?.phone || 'Desconhecido'}
                                        </p>
                                        {isExpiringSoon && (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded uppercase">
                                                Urgente
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">
                                        {conv.contact?.phone} {conv.contact?.product_name ? `• ${conv.contact.product_name}` : ''}
                                    </p>
                                </div>

                                {/* Última msg */}
                                <div className="text-right hidden sm:block flex-shrink-0 px-4">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Última Atividade</p>
                                    <p className="text-xs text-gray-400 font-medium">{timeAgo(conv.last_message_at)}</p>
                                </div>

                                {/* Status Janela */}
                                <div className="flex-shrink-0 text-right min-w-[100px]">
                                    {conv.window_open ? (
                                        <div className={cn(
                                            "flex items-center justify-end gap-1.5 font-semibold",
                                            isExpiringSoon ? "text-amber-400" : "text-emerald-400"
                                        )}>
                                            <Clock className="w-3.5 h-3.5" />
                                            <span className="text-xs">{formatTimeLeft(conv.window_expires_in_minutes)}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-end gap-1.5 text-gray-600">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span className="text-xs font-medium">Janela fechada</span>
                                        </div>
                                    )}
                                </div>

                                {/* Ação de Reabrir */}
                                <div className="flex-shrink-0">
                                    {!conv.window_open ? (
                                        <button
                                            onClick={() => handleReopen(conv.id, conv.contact?.phone)}
                                            disabled={!selectedTemplate || sending === conv.id}
                                            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-30 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20"
                                        >
                                            {sending === conv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                            Reabrir
                                        </button>
                                    ) : (
                                        <div className="px-4 py-2 border border-white/5 rounded-xl text-[10px] text-gray-600 font-bold uppercase tracking-widest bg-white/5">
                                            Ativa
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
