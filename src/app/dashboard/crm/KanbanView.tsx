'use client'
import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bot, UserCheck, Phone, ChevronRight, Clock, Flame, CreditCard, MessageCircle, AlertCircle, Trash2, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

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
    leads: any[]
    onRefresh: () => void
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

const STAGE_TO_TAG: Record<string, string> = {
    'NOVO': 'NOVO_LEAD',
    'ATENDIMENTO': 'EM_ATENDIMENTO',
    'QUALIFICADO': 'QUALIFICADO',
    'INTERESSADO': 'INTERESSADO',
    'PROPOSTA': 'PROPOSTA_ENVIADA',
    'AGUARDANDO': 'AGUARDANDO_RESPOSTA',
    'HUMANO': 'HUMANO',
    'FECHADO': 'FECHADO',
    'PERDIDO': 'PERDIDO'
}

import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'


export default function KanbanView({ leads, onRefresh }: KanbanViewProps) {
    const router = useRouter()
    const [selectedLead, setSelectedLead] = useState<any>(null)
    const [isMoving, setIsMoving] = useState(false)
    const columns = useMemo(() => {
        const groups: Record<string, any[]> = {}
        STAGES.forEach(s => groups[s.id] = [])
        
        leads.forEach(l => {
            const stage = mapTagToStage(l.ai_tag)
            if (groups[stage]) groups[stage].push(l)
        })
        
        return groups
    }, [leads])

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

    const deleteLead = async (lead: any) => {
        const displayName = lead.name || lead.push_name || lead.phone || 'Contato'
        if (!confirm(`Tem certeza que deseja excluir "${displayName}"? Isso apagará todo o histórico permanentemente.`)) return
        
        const { error } = await supabase.from('contacts').delete().eq('id', lead.id)
        if (!error) {
            toast.success('Contato removido com sucesso')
            onRefresh()
        } else {
            toast.error('Erro ao remover contato')
        }
    }

    const toggleHumano = async (lead: any) => {
        const newTag = lead.ai_tag === 'HUMANO' ? 'INTERESSADO' : 'HUMANO'
        const { error } = await supabase.from('contacts').update({ ai_tag: newTag }).eq('id', lead.id)
        if (!error) {
            toast.success(newTag === 'HUMANO' ? 'Atendimento Humano Ativado' : 'IA Assumiu o controle')
            onRefresh()
        } else {
            toast.error('Erro ao atualizar status')
        }
    }

    const moveLeadToStage = async (lead: any, stageId: string) => {
        const newTag = STAGE_TO_TAG[stageId]
        if (lead.ai_tag === newTag) return

        const { error } = await supabase.from('contacts').update({ 
            ai_tag: newTag,
            last_stage_change_at: new Date().toISOString()
        }).eq('id', lead.id)

        if (!error) {
            toast.success(`Lead movido para ${STAGES.find(s => s.id === stageId)?.label}`)
            onRefresh()
        } else {
            toast.error('Erro ao mover lead')
        }
    }

    const onDragStart = (e: React.DragEvent, leadId: string) => {
        e.dataTransfer.setData('leadId', leadId)
        // Efeito visual de arrastar
        const dragImage = document.getElementById(`card-${leadId}`)
        if (dragImage) {
            e.dataTransfer.setDragImage(dragImage, 10, 10)
        }
    }

    const onDrop = (e: React.DragEvent, stageId: string) => {
        e.preventDefault()
        const leadId = e.dataTransfer.getData('leadId')
        const lead = leads.find(l => l.id === leadId)
        if (lead) {
            moveLeadToStage(lead, stageId)
        }
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
                    <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDrop(e, stage.id)}
                        className="flex flex-col gap-3 overflow-y-auto pr-2 min-h-[150px] rounded-xl transition-colors duration-200"
                    >

                        {columns[stage.id]?.map((lead) => {
                            const urgency = getUrgencyStatus(lead.last_message_at)
                            const displayName = lead.name || lead.push_name || lead.phone || 'Contato'
                            
                            return (
                                <div
                                    key={lead.id}
                                    id={`card-${lead.id}`}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, lead.id)}
                                    className={cn(
                                        "w-full bg-secondary/20 border border-border/50 rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:border-primary/30 group relative overflow-hidden cursor-grab active:cursor-grabbing",
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
                                        <span className="font-bold text-sm text-foreground truncate max-w-[150px]">
                                            {displayName}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    deleteLead(lead)
                                                }}
                                                className="p-1.5 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                                                title="Excluir Contato"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    router.push(`/dashboard/chat?contactId=${lead.id}`)
                                                }}
                                                className="p-1.5 rounded-lg bg-primary/10 text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/20 transition-all font-bold"
                                                title="Ir para o Chat"
                                            >
                                                <MessageCircle className="w-3 h-3" />
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleHumano(lead)
                                                }}
                                                className={cn(
                                                    "p-1.5 rounded-lg transition-all",
                                                    lead.ai_tag === 'HUMANO' 
                                                    ? "bg-amber-500/20 text-amber-500" 
                                                    : "bg-blue-500/10 text-blue-400 opacity-0 group-hover:opacity-100"
                                                )}
                                                title={lead.ai_tag === 'HUMANO' ? 'Devolver para IA' : 'Assumir Atendimento'}
                                            >
                                                {lead.ai_tag === 'HUMANO' ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSelectedLead(lead)
                                                }}
                                                className="p-1.5 rounded-lg bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-secondary/50 transition-all"
                                                title="Mover Manualmente"
                                            >
                                                <ChevronRight className="w-3 h-3" />
                                            </button>
                                            <div className="flex items-center gap-1 text-[10px] whitespace-nowrap text-muted-foreground">
                                                <Clock className="w-3 h-3" />
                                                {getTimeDiff(lead.last_message_at)}
                                            </div>

                                        </div>
                                    </div>

                                    {/* Info de Inteligência */}
                                    <div className="space-y-2">
                                        {lead.ai_last_action && (
                                            <div className="text-[10px] text-primary/80 flex items-center gap-1 bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
                                                <Bot className="w-3 h-3" />
                                                <span className="truncate">{lead.ai_last_action}</span>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between mt-3">
                                            <div className="flex items-center gap-3">
                                                {/* Temperatura */}
                                                <div className={cn(
                                                    "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase",
                                                    lead.lead_temperature && lead.lead_temperature > 70 ? "bg-orange-500/10 border-orange-500/30 text-orange-500" : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                                )}>
                                                    <Flame className="w-3 h-3" />
                                                    {lead.lead_temperature && lead.lead_temperature > 70 ? 'Quente' : 'Morno'}
                                                </div>

                                                {lead.phone && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Phone className="w-2.5 h-2.5" />
                                                        {lead.phone.slice(-4)}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                        </div>
                                    </div>
                                    
                                    {/* Overlay de Resgate no Modo Caça */}
                                    {stage.id === 'AGUARDANDO' && (
                                        <div className="mt-3 pt-3 border-t border-border/50 flex justify-end">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    router.push(`/dashboard/chat?contactId=${lead.id}`)
                                                }}
                                                className="text-[9px] font-bold text-primary flex items-center gap-1 hover:underline cursor-pointer"
                                            >
                                                <AlertCircle className="w-3 h-3" />
                                                Resgatar agora
                                            </button>
                                        </div>
                                    )}
                                </div>
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

            {/* Modal de Movimentação */}
            {selectedLead && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/50">
                            <div>
                                <h3 className="font-bold text-sm">Mover Contato</h3>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                    {selectedLead.name || selectedLead.push_name || selectedLead.phone}
                                </p>
                            </div>
                            <button 
                                onClick={() => setSelectedLead(null)} 
                                className="p-1.5 rounded-lg hover:bg-background/80 text-muted-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-3 flex flex-col gap-1.5 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20">
                            <p className="text-[10px] text-muted-foreground px-2 mb-1 uppercase font-bold">Selecione a nova etapa:</p>
                            {STAGES.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => moveLeadToStage(selectedLead, s.id)}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-xl border text-sm transition-all hover:scale-[1.01] hover:shadow-md",
                                            mapTagToStage(selectedLead.ai_tag) === s.id 
                                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20" 
                                            : "border-border bg-background hover:border-primary/50 text-foreground"
                                        )}
                                    >
                                        <span className="font-medium">{s.label}</span>
                                        {mapTagToStage(selectedLead.ai_tag) === s.id && (
                                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                        )}
                                    </button>

                            ))}
                        </div>

                        <div className="p-3 bg-muted/30 border-t border-border flex gap-2">
                           <button 
                                onClick={() => setSelectedLead(null)} 
                                className="flex-1 py-2 text-xs font-bold rounded-xl border border-border bg-background hover:bg-secondary transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => router.push(`/dashboard/chat?contactId=${selectedLead.id}`)} 
                                className="flex-1 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2"
                            >
                                <MessageCircle className="w-3 h-3" />
                                Abrir Chat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

