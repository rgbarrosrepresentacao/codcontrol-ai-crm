'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
    BookOpen, Plus, Trash2, Loader2, Upload, Image as ImageIcon,
    Video, FileText, Info, X, CheckCircle2
} from 'lucide-react'

interface KnowledgeItem {
    id: string
    name: string
    description: string
    media_url: string
    media_type: 'image' | 'video' | 'document'
    created_at: string
}

const MEDIA_TYPE_CONFIG = {
    image:    { label: 'Imagem',    icon: ImageIcon,  color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  accept: 'image/*' },
    video:    { label: 'Vídeo',     icon: Video,      color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  accept: 'video/*' },
    document: { label: 'Documento', icon: FileText,   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    accept: '.pdf,.doc,.docx' },
}

export default function ConhecimentoPage() {
    const [items, setItems] = useState<KnowledgeItem[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState({
        name: '',
        description: '',
        media_url: '',
        media_type: 'image' as 'image' | 'video' | 'document',
    })

    useEffect(() => { loadItems() }, [])

    async function loadItems() {
        const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
        if (!user) return

        const { data } = await supabase
            .from('ai_knowledge')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            
        if (data) setItems(data)
        setLoading(false)
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        const toastId = toast.loading('Fazendo upload da mídia...')

        try {
            const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
            if (!user) throw new Error('Não autenticado')

            const ext = file.name.split('.').pop()
            const path = `${user.id}/knowledge/${Date.now()}.${ext}`

            const { error: uploadErr } = await supabase.storage
                .from('funnel-assets')
                .upload(path, file)

            if (uploadErr) throw uploadErr

            const { data: { publicUrl } } = supabase.storage
                .from('funnel-assets')
                .getPublicUrl(path)

            setForm(prev => ({ ...prev, media_url: publicUrl }))
            toast.success('Upload concluído! ✅', { id: toastId })
        } catch (err: any) {
            toast.error('Erro no upload: ' + err.message, { id: toastId })
        } finally {
            setUploading(false)
        }
    }

    async function handleSave() {
        if (!form.name.trim()) return toast.error('Dê um nome para esta mídia.')
        if (!form.description.trim()) return toast.error('Preencha a descrição para a IA saber quando enviar.')
        if (!form.media_url.trim()) return toast.error('Faça o upload de um arquivo ou cole o link.')

        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
            if (!user) throw new Error('Não autenticado')

            const { data, error } = await supabase
                .from('ai_knowledge')
                .insert({ ...form, user_id: user.id })
                .select()
                .single()

            if (error) throw error
            setItems(prev => [data, ...prev])
            setForm({ name: '', description: '', media_url: '', media_type: 'image' })
            setShowForm(false)
            toast.success('Mídia adicionada ao conhecimento da IA! 🧠')
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Remover esta mídia do conhecimento da IA?')) return
        
        const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
        if (!user) return

        const { error } = await supabase
            .from('ai_knowledge')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) return toast.error('Erro ao remover.')
        setItems(prev => prev.filter(i => i.id !== id))
        toast.success('Mídia removida.')
    }

    function resetForm() {
        setForm({ name: '', description: '', media_url: '', media_type: 'image' })
        setShowForm(false)
    }

    if (loading) return (
        <div className="p-8 flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
    )

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-primary" />Conhecimento da IA
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Mídias que a Camila pode enviar automaticamente quando o cliente precisar
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="gradient-primary text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm"
                >
                    <Plus className="w-4 h-4" />Nova Mídia
                </button>
            </div>

            {/* Info Banner */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3 text-sm text-primary/80">
                <Info className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
                <p>
                    <strong>Como funciona:</strong> Cada mídia tem uma descrição que ensina a IA <em>quando</em> enviá-la.
                    Exemplo: <em>"Envie quando o cliente pedir para ver o produto ou quiser entender como funciona."</em>{' '}
                    A IA decide sozinha o momento certo, sem interromper o flow natural da conversa.
                </p>
            </div>

            {/* Add Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="gradient-card border border-border rounded-2xl w-full max-w-xl animate-slide-up">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="text-lg font-bold text-foreground">Adicionar Mídia ao Conhecimento</h2>
                            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground p-1 hover:bg-secondary rounded-lg transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Tipo de mídia */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">Tipo de Mídia</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(Object.entries(MEDIA_TYPE_CONFIG) as [string, typeof MEDIA_TYPE_CONFIG.image][]).map(([type, cfg]) => {
                                        const Icon = cfg.icon
                                        const isSelected = form.media_type === type
                                        return (
                                            <button
                                                key={type}
                                                onClick={() => setForm(prev => ({ ...prev, media_type: type as any, media_url: '' }))}
                                                className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2 ${isSelected ? `${cfg.bg} ${cfg.border} border` : 'border-border hover:border-primary/30 hover:bg-secondary/50'}`}
                                            >
                                                <Icon className={`w-4 h-4 ${isSelected ? cfg.color : 'text-muted-foreground'}`} />
                                                <span className={`text-sm font-medium ${isSelected ? cfg.color : 'text-muted-foreground'}`}>{cfg.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Nome */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">
                                    Nome da Mídia <span className="text-muted-foreground font-normal">(só você vê)</span>
                                </label>
                                <input
                                    value={form.name}
                                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ex: Foto Kit Bronze | Vídeo de Depoimento"
                                    className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                                />
                            </div>

                            {/* Descrição para a IA */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">
                                    Quando a IA deve enviar? <span className="text-red-400">*</span>
                                </label>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Seja específico. Isso é o que a IA vai ler para decidir quando enviar.
                                </p>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                    rows={3}
                                    placeholder='Ex: "Envie quando o cliente pedir para ver o produto, quiser ver uma foto ou perguntar como é."'
                                    className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm resize-none"
                                />
                            </div>

                            {/* Upload / URL */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Arquivo</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={form.media_url}
                                        onChange={e => setForm(prev => ({ ...prev, media_url: e.target.value }))}
                                        placeholder="Cole o link da mídia ou faça upload →"
                                        className="flex-1 bg-input border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                    />
                                    <label className={`flex items-center justify-center w-11 h-11 rounded-lg border transition-all cursor-pointer flex-shrink-0 ${uploading ? 'bg-secondary border-border cursor-wait' : 'bg-secondary border-border hover:border-primary/50 hover:bg-secondary/80'}`}>
                                        {uploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept={MEDIA_TYPE_CONFIG[form.media_type].accept}
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                        />
                                    </label>
                                </div>
                                {form.media_url && (
                                    <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Arquivo pronto para salvar
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex gap-3 p-6 border-t border-border">
                            <button onClick={resetForm} className="flex-1 border border-border text-foreground font-semibold py-2.5 rounded-xl hover:bg-secondary transition-all text-sm">
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || uploading}
                                className="flex-[2] gradient-primary text-black font-bold py-2.5 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                                {saving ? 'Salvando...' : 'Adicionar ao Conhecimento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {items.length === 0 && (
                <div className="py-16 flex flex-col items-center justify-center text-center bg-card/50 border border-dashed border-border rounded-2xl">
                    <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-4">
                        <BookOpen className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-foreground text-lg">Nenhuma mídia cadastrada ainda</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                        Adicione fotos do produto, vídeos de depoimentos ou documentos para a Camila enviar automaticamente na hora certa.
                    </p>
                    <button
                        onClick={() => setShowForm(true)}
                        className="mt-6 gradient-primary text-black font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm"
                    >
                        <Plus className="w-4 h-4" />Adicionar primeira mídia
                    </button>
                </div>
            )}

            {/* Items Grid */}
            {items.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {items.map(item => {
                        const cfg = MEDIA_TYPE_CONFIG[item.media_type]
                        const Icon = cfg.icon
                        return (
                            <div key={item.id} className="gradient-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all group shadow-sm flex flex-col gap-4">
                                {/* Card Header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl ${cfg.bg} ${cfg.border} border flex items-center justify-center`}>
                                            <Icon className={`w-5 h-5 ${cfg.color}`} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-foreground text-sm line-clamp-1">{item.name}</h3>
                                            <span className={`text-[10px] uppercase font-bold tracking-wider ${cfg.color}`}>
                                                {cfg.label}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="p-2 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 rounded-lg"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Description */}
                                <div className="bg-input/50 border border-border/50 rounded-xl p-3 flex-1">
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Quando a IA vai enviar:</p>
                                    <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">{item.description}</p>
                                </div>

                                {/* Preview Link */}
                                <a
                                    href={item.media_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline truncate block"
                                >
                                    🔗 Ver arquivo
                                </a>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
