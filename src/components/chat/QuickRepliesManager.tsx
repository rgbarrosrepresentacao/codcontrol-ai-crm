'use client'
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Command, Save, Loader2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface QuickReply {
    id: string
    shortcut: string
    content: string
}

interface Props {
    onClose: () => void
}

export default function QuickRepliesManager({ onClose }: Props) {
    const [replies, setReplies] = useState<QuickReply[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')
    
    // New entry state
    const [newShortcut, setNewShortcut] = useState('')
    const [newContent, setNewContent] = useState('')
    const [showAdd, setShowAdd] = useState(false)

    useEffect(() => {
        loadReplies()
    }, [])

    async function loadReplies() {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from('quick_replies')
            .select('*')
            .eq('user_id', user.id)
            .order('shortcut', { ascending: true })

        if (error) {
            toast.error('Erro ao carregar respostas rápidas')
        } else {
            setReplies(data || [])
        }
        setLoading(false)
    }

    async function handleAdd() {
        if (!newShortcut || !newContent) {
            toast.error('Preencha o atalho e o conteúdo')
            return
        }

        setSaving(true)
        const { data: { user } } = await supabase.auth.getUser()
        
        const { data, error } = await supabase
            .from('quick_replies')
            .insert({
                user_id: user?.id,
                shortcut: newShortcut.startsWith('/') ? newShortcut : `/${newShortcut}`,
                content: newContent
            })
            .select()
            .single()

        if (error) {
            toast.error('Erro ao salvar resposta')
        } else {
            setReplies(prev => [...prev, data].sort((a, b) => a.shortcut.localeCompare(b.shortcut)))
            setNewShortcut('')
            setNewContent('')
            setShowAdd(false)
            toast.success('Resposta rápida adicionada!')
        }
        setSaving(false)
    }

    async function handleDelete(id: string) {
        const { error } = await supabase
            .from('quick_replies')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('Erro ao excluir')
        } else {
            setReplies(prev => prev.filter(r => r.id !== id))
            toast.success('Excluído com sucesso')
        }
    }

    const filtered = replies.filter(r => 
        r.shortcut.toLowerCase().includes(search.toLowerCase()) || 
        r.content.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-sidebar border border-border w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between bg-background/50">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Command className="w-5 h-5 text-primary" />
                            Respostas Rápidas
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">Configure atalhos para agilizar seu atendimento</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-border flex items-center gap-4 bg-secondary/20">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por atalho ou conteúdo..."
                            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    <button 
                        onClick={() => setShowAdd(!showAdd)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                            showAdd ? "bg-secondary text-foreground" : "gradient-primary text-white glow-primary"
                        )}
                    >
                        {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {showAdd ? 'Cancelar' : 'Novo Atalho'}
                    </button>
                </div>

                {/* Add New Form */}
                {showAdd && (
                    <div className="p-6 border-b border-border bg-primary/5 animate-in slide-in-from-top duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-1">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1 mb-1 block">Atalho</label>
                                <input 
                                    value={newShortcut}
                                    onChange={e => setNewShortcut(e.target.value)}
                                    placeholder="/bomdia"
                                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1 mb-1 block">Conteúdo da Mensagem</label>
                                <div className="flex gap-2">
                                    <textarea 
                                        value={newContent}
                                        onChange={e => setNewContent(e.target.value)}
                                        placeholder="Olá! Como posso ajudar hoje?"
                                        className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-10"
                                    />
                                    <button 
                                        onClick={handleAdd}
                                        disabled={saving}
                                        className="bg-primary text-white p-2 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center w-10 h-10 flex-shrink-0"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm">Carregando seus atalhos...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground opacity-50 text-center">
                            <Command className="w-12 h-12" />
                            <div>
                                <p className="font-bold">Nenhum atalho encontrado</p>
                                <p className="text-xs mt-1">Crie atalhos como "/oi" para enviar textos longos rapidamente.</p>
                            </div>
                        </div>
                    ) : (
                        filtered.map((reply) => (
                            <div 
                                key={reply.id}
                                className="group flex items-center justify-between p-4 bg-background border border-border rounded-2xl hover:border-primary/50 hover:shadow-md transition-all"
                            >
                                <div className="flex-1 min-w-0 pr-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-md border border-primary/20">
                                            {reply.shortcut}
                                        </span>
                                    </div>
                                    <p className="text-sm text-foreground line-clamp-2">{reply.content}</p>
                                </div>
                                <button 
                                    onClick={() => handleDelete(reply.id)}
                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-secondary/10 flex justify-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                        Dica: Digite <span className="text-primary">/</span> no chat para ver suas respostas rápidas
                    </p>
                </div>
            </div>
        </div>
    )
}
