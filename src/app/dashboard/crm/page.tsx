'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, Search, Tag, MessageSquare, Phone, ChevronRight, Loader2, Filter } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const statusConfig = {
    new: { label: 'Novo', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    active: { label: 'Ativo', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    lead: { label: 'Lead', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    customer: { label: 'Cliente', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    inactive: { label: 'Inativo', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
}

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
}

export default function CRMPage() {
    const [contacts, setContacts] = useState<Contact[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
    const [editNotes, setEditNotes] = useState('')
    const [editStatus, setEditStatus] = useState<string>('')
    const [savingContact, setSavingContact] = useState(false)

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase.from('contacts').select('*').eq('user_id', user.id).order('last_message_at', { ascending: false })
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
        return matchSearch && matchStatus
    })

    const openContact = (contact: Contact) => {
        setSelectedContact(contact)
        setEditNotes(contact.notes || '')
        setEditStatus(contact.status)
    }

    const saveContact = async () => {
        if (!selectedContact) return
        setSavingContact(true)
        await supabase.from('contacts').update({ notes: editNotes, status: editStatus as any }).eq('id', selectedContact.id)
        setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, notes: editNotes, status: editStatus as any } : c))
        setSavingContact(false)
        setSelectedContact(null)
    }

    const displayName = (c: Contact) => c.name || c.push_name || c.phone || c.whatsapp_id.split('@')[0]

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Users className="w-6 h-6 text-primary" />CRM de Atendimento
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Gerencie seus contatos e conversas</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {[
                    { label: 'Total', count: contacts.length, color: 'text-foreground', bg: 'bg-secondary/50' },
                    { label: 'Novos', count: contacts.filter(c => c.status === 'new').length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'Ativos', count: contacts.filter(c => c.status === 'active').length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'Leads', count: contacts.filter(c => c.status === 'lead').length, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                    { label: 'Clientes', count: contacts.filter(c => c.status === 'customer').length, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} border border-border rounded-xl p-3 text-center`}>
                        <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
                        <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
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

            {/* Contact List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="gradient-card border border-border rounded-xl p-12 text-center">
                    <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-40" />
                    <h3 className="text-foreground font-semibold text-lg mb-2">
                        {search ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
                    </h3>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                        {search ? 'Tente outros termos de busca.' : 'Os contatos aparecem aqui quando seu WhatsApp receber mensagens.'}
                    </p>
                </div>
            ) : (
                <div className="gradient-card border border-border rounded-xl overflow-hidden">
                    <div className="divide-y divide-border">
                        {filtered.map((contact) => {
                            const s = statusConfig[contact.status] || statusConfig.new
                            return (
                                <button
                                    key={contact.id}
                                    onClick={() => openContact(contact)}
                                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/50 transition-colors text-left group"
                                >
                                    <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-sm flex-shrink-0">
                                        {displayName(contact).slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-foreground text-sm truncate">{displayName(contact)}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs border ${s.color} hidden sm:inline-block`}>{s.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            {contact.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                                            {contact.tags?.length > 0 && (
                                                <span className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="w-3 h-3" />{contact.tags.join(', ')}</span>
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
                            <div>
                                <h2 className="text-lg font-bold text-foreground">{displayName(selectedContact)}</h2>
                                <p className="text-muted-foreground text-sm">{selectedContact.phone || selectedContact.whatsapp_id}</p>
                            </div>
                        </div>

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

                            {selectedContact.tags?.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">Tags</label>
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
