'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Search, Tag, MessageSquare, Phone, ChevronRight, Loader2, Filter, Bot, UserCheck, Trash2, Megaphone } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'

const statusConfig = {
    new: { label: 'Novo', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    active: { label: 'Ativo', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    lead: { label: 'Lead', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    customer: { label: 'Cliente', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    inactive: { label: 'Inativo', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

// Configuração visual das etiquetas de IA
const aiTagConfig: Record<string, { label: string, color: string, bg: string, dot: string }> = {
    PEDIDO_FECHADO:     { label: '✅ Pedido Fechado',     color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
    POSSIVEL_COMPRADOR: { label: '🔥 Possível Comprador', color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30',  dot: 'bg-orange-400' },
    INTERESSADO:        { label: '👀 Interessado',         color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30',      dot: 'bg-blue-400' },
    LEAD_FRIO:          { label: '🧊 Lead Frio',           color: 'text-slate-400',   bg: 'bg-slate-500/15 border-slate-500/30',    dot: 'bg-slate-400' },
    CANCELADO:          { label: '❌ Cancelado',           color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',        dot: 'bg-red-400' },
    HUMANO:             { label: '👤 Atend. Humano',       color: 'text-violet-400',  bg: 'bg-violet-500/15 border-violet-500/30',  dot: 'bg-violet-400' },
}

// Tags que bloqueiam a IA (handoff para humano)
const HANDOFF_TAGS = ['PEDIDO_FECHADO', 'HUMANO']

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
}

export default function CRMPage() {
    const [contacts, setContacts] = useState<Contact[]>([])
    const [loading, setLoading] = useState(true)
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
            const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
            if (!user) return
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
        const matchAiTag = filterAiTag === 'all' || c.ai_tag === filterAiTag
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

    const deleteContact = async () => {
        if (!selectedContact) return
        if (!confirm('Deseja realmente excluir este contato? Esta ação não pode ser desfeita.')) return
        
        setSavingContact(true)
        const { error } = await supabase.from('contacts').delete().eq('id', selectedContact.id)
        
        if (!error) {
            setContacts(prev => prev.filter(c => c.id !== selectedContact.id))
            toast.success('Contato excluído com sucesso')
            setSelectedContact(null)
        } else {
            console.error('Erro ao excluir contato:', error)
            toast.error('Erro ao excluir contato')
        }
        setSavingContact(false)
    }

    const displayName = (c: Contact) => c.name || c.push_name || c.phone || c.whatsapp_id.split('@')[0]

    // Contagens por etiqueta de IA
    const tagCounts = Object.keys(aiTagConfig).reduce((acc, tag) => {
        acc[tag] = contacts.filter(c => c.ai_tag === tag).length
        return acc
    }, {} as Record<string, number>)

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Users className="w-6 h-6 text-primary" />CRM de Atendimento
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Gerencie seus contatos e veja qual produto despertou interesse</p>
            </div>

            {/* Stats de Etiquetas IA */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(aiTagConfig).map(([tag, config]) => (
                    <button
                        key={tag}
                        onClick={() => setFilterAiTag(filterAiTag === tag ? 'all' : tag)}
                        className={`border rounded-xl p-3 text-left transition-all hover:scale-[1.02] ${filterAiTag === tag ? config.bg + ' border-2' : 'bg-secondary/30 border-border hover:border-primary/30'}`}
                    >
                        <div className={`text-xl font-bold ${config.color}`}>{tagCounts[tag] || 0}</div>
                        <div className={`text-xs font-medium mt-0.5 ${filterAiTag === tag ? config.color : 'text-muted-foreground'}`}>
                            {config.label}
                        </div>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nome, telefone..."
                        className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                    />
                </div>
                <select
                    value={filterAiTag}
                    onChange={(e) => setFilterAiTag(e.target.value)}
                    className="bg-input border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                >
                    <option value="all">🏷️ Todas as etiquetas</option>
                    {Object.entries(aiTagConfig).map(([tag, config]) => (
                        <option key={tag} value={tag}>{config.label}</option>
                    ))}
                </select>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-input border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                >
                    <option value="all">Todos os status</option>
                    {Object.entries(statusConfig).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
                </select>
            </div>

            {/* Resultado filtrado */}
            {filterAiTag !== 'all' && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${aiTagConfig[filterAiTag]?.bg} ${aiTagConfig[filterAiTag]?.color}`}>
                    <Filter className="w-4 h-4" />
                    Filtrando: {aiTagConfig[filterAiTag]?.label} — {filtered.length} contato{filtered.length !== 1 ? 's' : ''}
                    <button onClick={() => setFilterAiTag('all')} className="ml-auto text-xs underline opacity-70 hover:opacity-100">Limpar</button>
                </div>
            )}

            {/* Contact List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="gradient-card border border-border rounded-xl p-12 text-center">
                    <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-40" />
                    <h3 className="text-foreground font-semibold text-lg mb-2">
                        {search || filterAiTag !== 'all' ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
                    </h3>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                        {search || filterAiTag !== 'all' ? 'Tente outros termos ou remova o filtro.' : 'Os contatos aparecem aqui quando seu WhatsApp receber mensagens.'}
                    </p>
                </div>
            ) : (
                <div className="gradient-card border border-border rounded-xl overflow-hidden">
                    <div className="divide-y divide-border">
                        {filtered.map((contact) => {
                            const s = statusConfig[contact.status] || statusConfig.new
                            const aiTag = contact.ai_tag ? aiTagConfig[contact.ai_tag] : null
                            const isHandoff = contact.ai_tag === 'PEDIDO_FECHADO'
                            return (
                                <button
                                    key={contact.id}
                                    onClick={() => openContact(contact)}
                                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/50 transition-colors text-left group"
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-sm">
                                            {displayName(contact).slice(0, 2).toUpperCase()}
                                        </div>
                                        {isHandoff && (
                                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-background">
                                                <UserCheck className="w-2.5 h-2.5 text-white" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-foreground text-sm truncate">{displayName(contact)}</span>
                                            {/* Etiqueta da IA */}
                                            {aiTag && (
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${aiTag.bg} ${aiTag.color}`}>
                                                    {aiTag.label}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            {contact.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                                            {contact.campaigns?.name && (
                                                <span className="text-xs text-primary/80 font-medium flex items-center gap-1">
                                                    <Megaphone className="w-3 h-3" /> {contact.campaigns.name}
                                                </span>
                                            )}
                                            {isHandoff && (
                                                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                                                    <UserCheck className="w-3 h-3" /> Aguardando atendimento humano
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-right flex-shrink-0">
                                        {contact.last_message_at && (
                                            <div className="text-xs text-muted-foreground">{formatDateTime(contact.last_message_at)}</div>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors ml-auto mt-1" />
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Contact Detail Modal */}
            {selectedContact && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="gradient-card border border-border rounded-2xl p-6 w-full max-w-lg animate-slide-up">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-lg">
                                {displayName(selectedContact).slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-bold text-foreground">{displayName(selectedContact)}</h2>
                                <p className="text-muted-foreground text-sm">{selectedContact.phone || selectedContact.whatsapp_id}</p>
                                {/* Etiqueta IA no modal */}
                                {selectedContact.ai_tag && aiTagConfig[selectedContact.ai_tag] && (
                                    <span className={`inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-full text-xs font-bold border ${aiTagConfig[selectedContact.ai_tag].bg} ${aiTagConfig[selectedContact.ai_tag].color}`}>
                                        <Bot className="w-3 h-3" /> {aiTagConfig[selectedContact.ai_tag].label}
                                        {HANDOFF_TAGS.includes(selectedContact.ai_tag) && <span className="opacity-70 ml-1">· IA pausada</span>}
                                    </span>
                                )}
                                {selectedContact.campaigns?.name && (
                                    <div className="mt-2 text-xs font-medium text-primary flex items-center gap-1.5 px-2 py-1 bg-primary/10 border border-primary/20 rounded-lg w-fit">
                                        <Megaphone className="w-3.5 h-3.5" />
                                        Interesse: {selectedContact.campaigns.name}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Aviso de handoff (PEDIDO_FECHADO ou HUMANO) */}
                        {HANDOFF_TAGS.includes(selectedContact.ai_tag || '') && (
                            <div className="mb-4 space-y-2">
                                <div className="flex items-center gap-2 px-4 py-3 bg-violet-500/10 border border-violet-500/30 rounded-xl text-xs text-violet-400 font-medium">
                                    <UserCheck className="w-4 h-4 flex-shrink-0" />
                                    IA está pausada. Atendimento humano está conduzindo esta conversa.
                                </div>
                                <button
                                    onClick={reactivateAI}
                                    disabled={reactivating}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {reactivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                                    {reactivating ? 'Reativando...' : '🤖 Reativar IA neste contato'}
                                </button>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Status do contato</label>
                                <div className="flex gap-2 flex-wrap">
                                    {Object.entries(statusConfig).map(([k, v]) => (
                                        <button key={k} onClick={() => setEditStatus(k)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${editStatus === k ? v.color : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                                            {v.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Seleção manual de Etiqueta de IA */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Etiqueta de IA <span className="text-muted-foreground font-normal text-xs">(manual)</span></label>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={() => setEditAiTag(null)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${editAiTag === null ? 'border-primary/50 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                                    >
                                        Sem etiqueta
                                    </button>
                                    {Object.entries(aiTagConfig).map(([tag, cfg]) => (
                                        <button
                                            key={tag}
                                            onClick={() => setEditAiTag(tag)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${editAiTag === tag ? `${cfg.bg} ${cfg.color}` : 'border-border text-muted-foreground hover:border-primary/30'}`}
                                        >
                                            {cfg.label}
                                        </button>
                                    ))}
                                </div>
                                {HANDOFF_TAGS.includes(editAiTag || '') && editAiTag !== selectedContact.ai_tag && (
                                    <p className="text-xs text-violet-400 mt-1.5 flex items-center gap-1">
                                        <UserCheck className="w-3 h-3" /> Ao salvar, a IA será pausada e o humano assume.
                                    </p>
                                )}
                            </div>

                            {selectedContact.tags?.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">Tags manuais</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {selectedContact.tags.map(tag => (
                                            <span key={tag} className="px-2 py-1 bg-primary/10 border border-primary/20 text-primary rounded-lg text-xs">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Notas internas</label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    rows={4}
                                    placeholder="Adicione notas sobre este contato..."
                                    className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button 
                                onClick={deleteContact} 
                                disabled={savingContact}
                                className="p-2.5 text-muted-foreground hover:text-red-400 border border-border rounded-lg transition-colors group"
                                title="Excluir contato"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                            <button onClick={() => setSelectedContact(null)} className="flex-1 border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-secondary transition-colors text-sm">Fechar</button>
                            <button onClick={saveContact} disabled={savingContact} className="flex-1 gradient-primary text-black font-semibold py-2.5 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60">
                                {savingContact && <Loader2 className="w-4 h-4 animate-spin" />}
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

