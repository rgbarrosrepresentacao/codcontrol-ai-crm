'use client'
import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, UserCheck, Phone, ChevronRight, Clock, Flame, CreditCard, MessageCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Contact {
    id: string
    phone: string | null
    name: string | null
    push_name: string | null
    last_message_at: string | null
    ai_tag: string | null
    lead_temperature?: number
    ai_last_action?: string
    last_stage_change_at?: string
}

interface KanbanViewProps {
    contacts: Contact[]
    onOpenContact: (contact: Contact) => void
}

const STAGES = [
    { id: 'NOVO', label: '🟢 Novo Lead', color: 'border-emerald-500/30 bg-emerald-500/5' },
    { id: 'ATENDIMENTO', label: '🤖 Em Atendimento (IA)', color: 'border-blue-500/30 bg-blue-500/5' },
    { id: 'QUALIFICADO', label: '🧠 Qualificado', color: 'border-indigo-500/30 bg-indigo-500/5' },
    { id: 'INTERESSADO', label: '🔥 Interessado', color: 'border-orange-500/30 bg-orange-500/5' },
    { id: 'PROPOSTA', label: '💰 Proposta Enviada', color: 'border-purple-500/30 bg-purple-500/5' },
    { id: 'AGUARDANDO', label: '🕒 Aguardando Resposta', color: 'border-yellow-500/30 bg-yellow-500/5' },
    { id: 'HUMANO', label: '👤 Atend. Humano', color: 'border-cyan-500/30 bg-cyan-500/5' },
    { id: 'FECHADO', label: '✅ Fechado', color: 'border-green-500/30 bg-green-500/5' },
    { id: 'PERDIDO', label: '❌ Perdido', color: 'border-red-500/30 bg-red-500/5' },
]

// Mapeia as tags antigas para as novas colunas
const mapTagToStage = (tag: string | null): string => {
    if (!tag) return 'NOVO'
    const tagMap: Record<string, string> = {
        'NOVO_LEAD': 'NOVO',
        'EM_ATENDIMENTO': 'ATENDIMENTO',
        'QUALIFICADO': 'QUALIFICADO',
        'INTERESSADO': 'INTERESSADO',
        'PROPOSTA_ENVIADA': 'PROPOSTA',
        'AGUARDANDO_RESPOSTA': 'AGUARDANDO',
        'FECHADO': 'FECHADO',
        'PERDIDO': 'PERDIDO',
        // Legacy
        'PEDIDO_FECHADO': 'FECHADO',
        'POSSIVEL_COMPRADOR': 'INTERESSADO',
        'LEAD_FRIO': 'PERDIDO',
        'CANCELADO': 'PERDIDO',
        'HUMANO': 'HUMANO'
    }
    return tagMap[tag] || 'NOVO'
}

export default function KanbanView({ contacts, onOpenContact }: KanbanViewProps) {
    const columns = useMemo(() => {
        const groups: Record<string, Contact[]> = {}
        STAGES.forEach(s => groups[s.id] = [])
        
        contacts.forEach(c => {
            const stage = mapTagToStage(c.ai_tag)
            if (groups[stage]) groups[stage].push(c)
        })
        
        return groups
    }, [contacts])

    const getTemperatureColor = (temp: number = 0) => {
        if (temp > 80) return 'text-orange-500'
        if (temp > 50) return 'text-yellow-500'
        return 'text-blue-400'
    }

    const getTimeDiff = (date: string | null) => {
        if (!date) return 'Sem registro'
        try {
            return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
                .replace('aproximadamente ', '')
                .replace('há ', '')
        } catch (e) {
            return 'Data inválida'
        }
    }

    // Calcula urgência visual (Minutos)
    const getUrgencyStatus = (lastMsg: string | null) => {
        if (!lastMsg) return 'normal'
        const diff = (new Date().getTime() - new Date(lastMsg).getTime()) / (1000 * 60)
        
        if (diff > 30) return 'critical' // +30min (Vermelho)
        if (diff > 10) return 'warning'  // 10 a 30min (Amarelo)
        return 'normal' // até 10min (Verde)
    }

    return (
        <div className="flex gap-4 overflow-x-auto pb-6 h-[calc(100vh-280px)] min-h-[500px] scrollbar-thin scrollbar-thumb-primary/20">
            {STAGES.map((stage) => (
                <div key={stage.id} className="flex-shrink-0 w-80 flex flex-col gap-3">
                    {/* Header da Coluna */}
                    <div className={cn(
                        "p-3 rounded-xl border flex items-center justify-between font-bold text-xs sticky top-0 z-10 backdrop-blur-md",
                        stage.color
                    )}>
                        <span>{stage.label}</span>
                        <span className="bg-background/50 px-2 py-0.5 rounded-full border border-current/20">
                            {columns[stage.id]?.length || 0}
                        </span>
                    </div>

                    {/* Lista de Cards */}
                    <div className="flex flex-col gap-3 overflow-y-auto pr-2">
                        {columns[stage.id]?.map((contact) => {
                            const urgency = getUrgencyStatus(contact.last_message_at)
                            const displayName = contact.name || contact.push_name || contact.phone || 'Contato'
                            
                            return (
                                <button
                                    key={contact.id}
                                    onClick={() => onOpenContact(contact)}
                                    className={cn(
                                        "w-full bg-secondary/20 border border-border/50 rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:border-primary/30 group relative overflow-hidden",
                                        urgency === 'critical' && "border-red-500/30 bg-red-500/5",
                                        urgency === 'warning' && "border-yellow-500/30 bg-yellow-500/5",
                                        urgency === 'normal' && "border-emerald-500/30 bg-emerald-500/5"
                                    )}
                                >
                                    {/* Indicador Lateral de Urgência */}
                                    <div className={cn(
                                        "absolute left-0 top-0 bottom-0 w-1",
                                        urgency === 'critical' ? "bg-red-500" : urgency === 'warning' ? "bg-yellow-500" : "bg-emerald-500"
                                    )} />

                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-bold text-sm text-foreground truncate max-w-[180px]">
                                            {displayName}
                                        </span>
                                        <div className="flex items-center gap-1 text-[10px] whitespace-nowrap text-muted-foreground">
                                            <Clock className="w-3 h-3" />
                                            {getTimeDiff(contact.last_message_at)}
                                        </div>
                                    </div>

                                    {/* Info de Inteligência */}
                                    <div className="space-y-2">
                                        {contact.ai_last_action && (
                                            <div className="text-[10px] text-primary/80 flex items-center gap-1 bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
                                                <Bot className="w-3 h-3" />
                                                <span className="truncate">{contact.ai_last_action}</span>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between mt-3">
                                            <div className="flex items-center gap-3">
                                                {/* Temperatura */}
                                                <div className={cn(
                                                    "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase",
                                                    contact.lead_temperature && contact.lead_temperature > 70 ? "bg-orange-500/10 border-orange-500/30 text-orange-500" : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                                )}>
                                                    <Flame className="w-3 h-3" />
                                                    {contact.lead_temperature && contact.lead_temperature > 70 ? 'Quente' : 'Morno'}
                                                </div>

                                                {contact.phone && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Phone className="w-2.5 h-2.5" />
                                                        {contact.phone.slice(-4)}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                        </div>
                                    </div>
                                    
                                    {/* Overlay de Resgate no Modo Caça (Esqueleto) */}
                                    {stage.id === 'AGUARDANDO' && (
                                        <div className="mt-3 pt-3 border-t border-border/50 flex justify-end">
                                            <div className="text-[9px] font-bold text-primary flex items-center gap-1 hover:underline">
                                                <AlertCircle className="w-3 h-3" />
                                                Resgatar agora
                                            </div>
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                        {columns[stage.id]?.length === 0 && (
                            <div className="py-8 text-center border-2 border-dashed border-border/20 rounded-xl">
                                <span className="text-[10px] text-muted-foreground/50 italic">Vazio</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
