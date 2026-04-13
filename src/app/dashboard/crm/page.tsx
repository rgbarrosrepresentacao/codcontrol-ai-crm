'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Search, Tag, MessageSquare, Phone, ChevronRight, Loader2, Filter, Bot, UserCheck, Trash2, Megaphone, LayoutGrid, List, Brain } from 'lucide-react'
import { formatDateTime, cn } from '@/lib/utils'
import { toast } from 'sonner'
import KanbanView from './KanbanView'

const statusConfig = {
    new: { label: 'Novo', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    active: { label: 'Ativo', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    lead: { label: 'Lead', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    customer: { label: 'Cliente', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    inactive: { label: 'Inativo', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

// Configuração visual das etiquetas de IA (Funil Expandido de 8 Etapas)
const STAGES_CONFIG: Record<string, { label: string, color: string, bg: string, dot: string }> = {
    NOVO:               { label: '🟢 Novo Lead',          color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
    ATENDIMENTO:        { label: '🤖 Em Atendimento',     color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30',      dot: 'bg-blue-400' },
    QUALIFICADO:        { label: '🧠 Qualificado',        color: 'text-indigo-400',  bg: 'bg-indigo-500/15 border-indigo-500/30',  dot: 'bg-indigo-400' },
    INTERESSADO:        { label: '🔥 Interessado',        color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30',  dot: 'bg-orange-400' },
    PROPOSTA:           { label: '💰 Proposta Enviada',   color: 'text-purple-400',  bg: 'bg-purple-500/15 border-purple-500/30',  dot: 'bg-purple-400' },
    AGUARDANDO:         { label: '🕒 Aguardando Resp.',   color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30',  dot: 'bg-yellow-400' },
    HUMANO:             { label: '👤 Atend. Humano',      color: 'text-cyan-400',    bg: 'bg-cyan-500/15 border-cyan-500/30',      dot: 'bg-cyan-400' },
    FECHADO:            { label: '✅ Fechado',            color: 'text-green-400',   bg: 'bg-green-500/15 border-green-500/30',    dot: 'bg-green-400' },
    PERDIDO:            { label: '❌ Perdido',            color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',        dot: 'bg-red-400' },
}

// Mapeamento legado para compatibilidade com o banco atual
const mapLegacyTag = (tag: string | null): string => {
    if (!tag) return 'NOVO'
    const legacyMap: Record<string, string> = {
        'NOVO_LEAD': 'NOVO',
        'EM_ATENDIMENTO': 'ATENDIMENTO',
        'QUALIFICADO': 'QUALIFICADO',
        'INTERESSADO': 'INTERESSADO',
        'PROPOSTA_ENVIADA': 'PROPOSTA',
        'AGUARDANDO_RESPOSTA': 'AGUARDANDO',
        'HUMANO': 'HUMANO',
        'FECHADO': 'FECHADO',
        'PERDIDO': 'PERDIDO',
        // Legado
        'PEDIDO_FECHADO': 'FECHADO',
        'POSSIVEL_COMPRADOR': 'INTERESSADO',
        'LEAD_FRIO': 'PERDIDO',
        'CANCELADO': 'PERDIDO',
        'PROPOSTA': 'PROPOSTA',
        'AGUARDANDO': 'AGUARDANDO'
    }
    return legacyMap[tag] || tag || 'NOVO'
}

const HANDOFF_TAGS = ['FECHADO', 'PEDIDO_FECHADO', 'HUMANO']

interface Contact {
    id: string
    phone: string | null
    name: string | null
    push_name: string | null
    tags: string[]
    notes: string | null
    status: keyof typeof statusConfig
    last_message_at: string | null
    whatsapp_id: string
    ai_tag: string | null
    active_campaign_id: string | null
    campaigns?: { name: string }
    lead_temperature?: number
    ai_last_action?: string
}

export default function CRMPage() {
    const [contacts, setContacts] = useState<Contact[]>([])
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterAiTag, setFilterAiTag] = useState<string>('all')
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
    const [editNotes, setEditNotes] = useState('')
    const [editStatus, setEditStatus] = useState<string>('')
    const [editAiTag, setEditAiTag] = useState<string | null>(null)
    const [savingContact, setSavingContact] = useState(false)
    const [reactivating, setReactivating] = useState(false)

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Trava de Admin: Verifica permissão
            const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
            setIsAdmin(!!profile?.is_admin)

            const { data } = await supabase
                .from('contacts')
                .select('*, campaigns:campaigns(name)')
                .eq('user_id', user.id)
                .order('last_message_at', { ascending: false })
            setContacts(data || [])
            setLoading(false)
        }
        load()
    }, [])

    const filtered = contacts.filter(c => {
        const matchSearch = !search || (
            c.name?.toLowerCase().includes(search.toLowerCase()) ||
            c.push_name?.toLowerCase().includes(search.toLowerCase()) ||
            c.phone?.includes(search)
        )
        const matchStatus = filterStatus === 'all' || c.status === filterStatus
        const matchAiTag = filterAiTag === 'all' || mapLegacyTag(c.ai_tag) === filterAiTag
        return matchSearch && matchStatus && matchAiTag
    })

    const openContact = (contact: Contact) => {
        setSelectedContact(contact)
        setEditNotes(contact.notes || '')
        setEditStatus(contact.status)
        setEditAiTag(contact.ai_tag)
    }

    const reactivateAI = async () => {
        if (!selectedContact) return
        setReactivating(true)
        await supabase.from('contacts').update({ ai_tag: null }).eq('id', selectedContact.id)
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, ai_tag: null } : c))
        setSelectedContact(prev => prev ? { ...prev, ai_tag: null } : null)
        setEditAiTag(null)
        setReactivating(false)
    }

    const saveContact = async () => {
        if (!selectedContact) return
        setSavingContact(true)
        await supabase.from('contacts').update({ notes: editNotes, status: editStatus as any, ai_tag: editAiTag }).eq('id', selectedContact.id)
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, notes: editNotes, status: editStatus as any, ai_tag: editAiTag } : c))
        setSavingContact(false)
        setSelectedContact(null)
    }

    const runAnalyze = async () => {
        if (!selectedContact) return
        setReactivating(true)
        try {
            const res = await fetch('/api/crm/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId: selectedContact.id })
            })
            if (res.ok) {
                const { data } = await res.json()
                setContacts(prev => prev.map(c => c.id === selectedContact.id ? { 
                    ...c, 
                    ai_tag: data.tag, 
                    lead_temperature: data.temperature, 
                    ai_last_action: data.last_action 
                } : c))
                setEditAiTag(data.tag)
                toast.success('Análise Inteligente concluída!')
            } else {
                toast.error('Ocorreu um erro na análise da IA.')
            }
        } catch (err) {
            console.error(err)
            toast.error('Erro de conexão com o servidor de IA.')
        } finally {
            setReactivating(false)
        }
    }

    // Toggle de Atendimento Humano (pausa/retoma a IA)
    const toggleHumanTakeover = async () => {
        if (!selectedContact) return
        setSavingContact(true)
        const isCurrentlyHuman = selectedContact.ai_tag === 'HUMANO'
        const newTag = isCurrentlyHuman ? 'EM_ATENDIMENTO' : 'HUMANO'
        await supabase.from('contacts').update({ ai_tag: newTag }).eq('id', selectedContact.id)
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, ai_tag: newTag } : c))
        setSelectedContact(prev => prev ? { ...prev, ai_tag: newTag } : null)
        setEditAiTag(newTag)
        setSavingContact(false)
        toast.success(isCurrentlyHuman ? '🤖 IA reativada para este contato!' : '👤 IA pausada — Atendimento Humano ativo!')
    }

    const deleteContact = async () => {
        if (!selectedContact) return
        if (!confirm('Deseja realmente excluir este contato? Esta ação não pode ser desfeita.')) return
        setSavingContact(true)
        const { error } = await supabase.from('contacts').delete().eq('id', selectedContact.id)
        if (!error) {
            setContacts(prev => prev.filter(c => c.id !== selectedContact.id))
            toast.success('Contato excluído com sucesso')
            setSelectedContact(null)
        }
        setSavingContact(false)
    }

    const displayName = (c: Contact) => c.name || c.push_name || c.phone || c.whatsapp_id.split('@')[0]

    // Estatísticas dinâmicas baseadas no funil de 8 etapas
    const stageCounts = Object.keys(STAGES_CONFIG).reduce((acc, stage) => {
        acc[stage] = contacts.filter(c => mapLegacyTag(c.ai_tag) === stage).length
        return acc
    }, {} as Record<string, number>)

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in max-w-[1600px] mx-auto min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" />CRM de Atendimento
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Gerencie seus contatos e veja qual etapa do funil eles estão</p>
                </div>

                <div className="flex bg-secondary/30 p-1 rounded-xl border border-border">
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            viewMode === 'list' ? "bg-primary text-black shadow-lg" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <List className="w-4 h-4" /> Lista
                    </button>
                    <button
                        onClick={() => setViewMode('kanban')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            viewMode === 'kanban' ? "bg-primary text-black shadow-lg" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" /> Kanban
                    </button>
                </div>
            </div>

            {/* Widgets de Estágios (8 Colunas) */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                {Object.entries(STAGES_CONFIG).map(([stage, config]) => (
                    <button
                        key={stage}
                        onClick={() => setFilterAiTag(filterAiTag === stage ? 'all' : stage)}
                        className={cn(
                            "border rounded-2xl p-4 text-left transition-all hover:scale-[1.02] relative overflow-hidden group",
                            filterAiTag === stage ? config.bg + " border-primary/50 ring-1 ring-primary/30" : "bg-card border-border hover:border-primary/20"
                        )}
                    >
                        <div className={cn("text-2xl font-black mb-1 flex items-center justify-between", config.color)}>
                            {stageCounts[stage] || 0}
                            <div className={cn("w-2 h-2 rounded-full", config.dot)} />
                        </div>
                        <div className={cn("text-[9px] font-black tracking-widest uppercase", filterAiTag === stage ? config.color : "text-muted-foreground/70")}>
                            {config.label.replace(/^[^\s]+\s+/, '')}
                        </div>
                        
                        {/* Efeito de hover no widget */}
                        <div className="absolute -bottom-2 -right-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Tag className="w-12 h-12" />
                        </div>
                    </button>
                ))}
            </div>

            {/* Conteúdo Principal */}
            {viewMode === 'kanban' && isAdmin ? (
                <KanbanView contacts={contacts} onOpenContact={openContact} />
            ) : (
                <div className="space-y-4">
                    {/* Filtros da Visão de Lista */}
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por nome, telefone..."
                                className="w-full bg-input border border-border rounded-xl pl-10 pr-4 py-3 text-foreground focus:ring-2 focus:ring-primary/50 text-sm"
                            />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-input border border-border rounded-xl px-4 py-3 text-foreground text-sm"
                        >
                            <option value="all">Filtro de Status</option>
                            {Object.entries(statusConfig).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 gap-3">
                            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
                        </div>
                    ) : (
                        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
                            <div className="divide-y divide-border">
                                {filtered.map((contact) => {
                                    const stage = STAGES_CONFIG[mapLegacyTag(contact.ai_tag)]
                                    return (
                                        <button key={contact.id} onClick={() => openContact(contact)} className="w-full flex items-center gap-4 px-6 py-5 hover:bg-secondary/30 transition-all text-left group">
                                            <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-black font-black text-xs shadow-lg">
                                                {displayName(contact).slice(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-foreground text-sm truncate">{displayName(contact)}</span>
                                                    {stage && <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black border", stage.bg, stage.color)}>{stage.label}</span>}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {contact.phone}</span>
                                                    {contact.last_message_at && <span>• {formatDateTime(contact.last_message_at)}</span>}
                                                </div>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-all" />
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Detalhes (Manutenção da Lógica Existente) */}
            {selectedContact && (
                 <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-3xl p-8 w-full max-w-xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-6 mb-8">
                            <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-black font-black text-xl shadow-inner">
                                {displayName(selectedContact).slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-black text-foreground">{displayName(selectedContact)}</h2>
                                <p className="text-muted-foreground font-medium">{selectedContact.phone}</p>
                            </div>
                            <button onClick={() => setSelectedContact(null)} className="p-2 hover:bg-secondary rounded-full transition-colors">
                                <Trash2 className="w-5 h-5 text-muted-foreground hover:text-red-500" />
                            </button>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black uppercase text-muted-foreground mb-3 tracking-widest">Estágio (IA)</label>
                                    <select 
                                        value={editAiTag || ''}
                                        onChange={(e) => setEditAiTag(e.target.value)}
                                        className="w-full bg-secondary/50 border border-border rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                                    >
                                        <option value="">Nenhum</option>
                                        <option value="NOVO_LEAD">Novo Lead</option>
                                        <option value="EM_ATENDIMENTO">Em Atendimento</option>
                                        <option value="QUALIFICADO">Qualificado</option>
                                        <option value="INTERESSADO">Interessado</option>
                                        <option value="PROPOSTA_ENVIADA">Proposta Enviada</option>
                                        <option value="AGUARDANDO_RESPOSTA">Aguardando Resposta</option>
                                        <option value="HUMANO">👤 Atendimento Humano</option>
                                        <option value="FECHADO">Fechado</option>
                                        <option value="PERDIDO">Perdido</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button 
                                        onClick={runAnalyze}
                                        disabled={reactivating}
                                        className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary h-[54px] rounded-2xl font-bold transition-all border border-primary/20"
                                    >
                                        {reactivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                                        Escanear com IA
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase text-muted-foreground mb-3 tracking-widest">Notas do Atendimento</label>
                                <textarea 
                                    value={editNotes} 
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    className="w-full bg-secondary/50 border border-border rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary/50 transition-all outline-none resize-none"
                                    placeholder="Escreva algo sobre este lead..."
                                    rows={4}
                                />
                            </div>
                            
                            {/* Botão de Atendimento Humano — Toggle IA ON/OFF */}
                            <button
                                onClick={toggleHumanTakeover}
                                disabled={savingContact}
                                className={cn(
                                    "w-full flex items-center justify-center gap-2 h-[54px] rounded-2xl font-bold transition-all border text-sm",
                                    selectedContact?.ai_tag === 'HUMANO'
                                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30"
                                        : "bg-secondary/50 border-border text-muted-foreground hover:text-cyan-400 hover:border-cyan-500/30"
                                )}
                            >
                                {savingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                                {selectedContact?.ai_tag === 'HUMANO' ? '🤖 Devolver para IA' : '👤 Assumir Atendimento'}
                            </button>

                            <div className="flex gap-4">
                                <button onClick={() => setSelectedContact(null)} className="flex-1 bg-secondary hover:bg-secondary/80 py-4 rounded-2xl font-bold transition-all">Cancelar</button>
                                <button onClick={saveContact} className="flex-1 gradient-primary text-black font-black py-4 rounded-2xl shadow-lg hover:opacity-90 transition-all">
                                    {savingContact ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Salvar Alterações"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
