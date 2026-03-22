'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Truck, Plus, Trash2, Loader2, Save, MapPin, Search, AlertCircle } from 'lucide-react'

interface LogisticsRule {
    id: string
    name: string
    type: 'zipcode' | 'city'
    content: string
    is_active: boolean
}

export default function LogisticaPage() {
    const [rules, setRules] = useState<LogisticsRule[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [showAdd, setShowAdd] = useState(false)
    const [newRule, setNewRule] = useState<Partial<LogisticsRule>>({
        name: '',
        type: 'city',
        content: '',
        is_active: true
    })

    useEffect(() => {
        loadRules()
    }, [])

    async function loadRules() {
        const { data, error } = await supabase
            .from('logistics_rules')
            .select('*')
            .order('created_at', { ascending: false })
        
        if (!error && data) setRules(data)
        setLoading(false)
    }

    async function handleAdd() {
        if (!newRule.name || !newRule.content) {
            toast.error('Preencha o nome e a lista de cidades/CEPs')
            return
        }

        setSaving(true)
        const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
        if (!user) return

        const { data, error } = await supabase
            .from('logistics_rules')
            .insert({ ...newRule, user_id: user.id })
            .select()
            .single()

        if (error) {
            toast.error('Erro ao criar regra')
        } else {
            setRules([data, ...rules])
            setShowAdd(false)
            setNewRule({ name: '', type: 'city', content: '', is_active: true })
            toast.success('Regra de logística criada!')
        }
        setSaving(false)
    }

    async function handleDelete(id: string) {
        if (!confirm('Tem certeza que deseja excluir esta regra?')) return
        
        const { error } = await supabase.from('logistics_rules').delete().eq('id', id)
        if (error) {
            toast.error('Erro ao excluir')
        } else {
            setRules(rules.filter(r => r.id !== id))
            toast.success('Regra removida')
        }
    }

    if (loading) return (
        <div className="p-8 flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
    )

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Truck className="w-6 h-6 text-primary" />Logística Inteligente
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Configure onde seu negócio faz pagamento na entrega</p>
                </div>
                <button 
                    onClick={() => setShowAdd(!showAdd)}
                    className="gradient-primary text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Nova Regra
                </button>
            </div>

            {showAdd && (
                <div className="gradient-card border border-border rounded-xl p-6 space-y-4 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">Nome da Regra</label>
                            <input 
                                value={newRule.name}
                                onChange={e => setNewRule({...newRule, name: e.target.value})}
                                placeholder="Ex: Cidades de SP atendidas"
                                className="w-full bg-input border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">Tipo de Filtro</label>
                            <select 
                                value={newRule.type}
                                onChange={e => setNewRule({...newRule, type: e.target.value as any})}
                                className="w-full bg-input border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                            >
                                <option value="city">Cidades (Nomes)</option>
                                <option value="zipcode">CEPs (Números)</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Lista de {newRule.type === 'city' ? 'Cidades' : 'CEPs'}</label>
                        <p className="text-[10px] text-muted-foreground mb-2">Separe os itens por vírgula ou por linha.</p>
                        <textarea 
                            value={newRule.content}
                            onChange={e => setNewRule({...newRule, content: e.target.value})}
                            rows={5}
                            placeholder={newRule.type === 'city' ? "São Paulo, Guarulhos, Campinas..." : "01000-000, 04543-000..."}
                                className="w-full bg-input border border-border rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none font-mono resize-none"
                        />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                        <button 
                            onClick={handleAdd}
                            disabled={saving}
                            className="bg-primary text-black font-bold px-6 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Salvar Regra
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rules.length === 0 && !showAdd && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-card/50 border border-dashed border-border rounded-2xl">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                            <MapPin className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <h3 className="font-semibold text-foreground">Nenhuma regra cadastrada</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xs px-4">
                            Crie regras para que a IA saiba exatamente onde seu negócio faz pagamento na entrega.
                        </p>
                    </div>
                )}
                
                {rules.map(rule => (
                    <div key={rule.id} className="gradient-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all group shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                                    {rule.type === 'city' ? <Search className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-foreground line-clamp-1">{rule.name}</h3>
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                        {rule.type === 'city' ? 'Filtro por Cidade' : 'Filtro por CEP'}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleDelete(rule.id)}
                                className="p-2 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 rounded-lg"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="bg-input/50 border border-border/50 rounded-xl p-3 mb-4">
                             <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                                {rule.content}
                             </p>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold bg-emerald-500/5 px-2.5 py-1.5 rounded-lg border border-emerald-500/10">
                            <AlertCircle className="w-3 h-3" />
                            INTELIGÊNCIA LOGÍSTICA ATIVA
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

