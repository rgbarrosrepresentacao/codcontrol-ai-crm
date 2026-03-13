'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { 
    Plus, Trash2, 
    MessageSquare, Mic, Video, Image as ImageIcon,
    Save, ChevronRight, Layout, Sparkles, Filter, Star,
    Upload, Loader2
} from 'lucide-react'
import { toast } from 'sonner'

interface Funnel {
    id: string
    name: string
    is_active: boolean
    is_default: boolean
}

interface Step {
    id: string
    type: 'text' | 'audio' | 'video' | 'image'
    content: string
    order_index: number
    delay_seconds: number
    wait_for_reply: boolean
}

export default function FunnelsPage() {
    const [funnels, setFunnels] = useState<Funnel[]>([])
    const [selectedFunnel, setSelectedFunnel] = useState<Funnel | null>(null)
    const [steps, setSteps] = useState<Step[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState<string | null>(null) // stepId do upload atual
    const fileInputRef = useRef<HTMLInputElement>(null)
    const activeStepIdForUpload = useRef<string | null>(null)

    useEffect(() => {
        loadFunnels()
    }, [])

    async function loadFunnels() {
        const { data, error } = await supabase
            .from('funnels')
            .select('*')
            .order('created_at', { ascending: false })
        
        if (!error && data) {
            setFunnels(data)
        }
        setLoading(false)
    }

    async function loadSteps(funnelId: string) {
        const { data, error } = await supabase
            .from('funnel_steps')
            .select('*')
            .eq('funnel_id', funnelId)
            .order('order_index', { ascending: true })
        
        if (!error && data) setSteps(data)
    }

    async function createFunnel() {
        const name = prompt('Nome do Funil:')
        if (!name) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from('funnels')
            .insert({ name, user_id: user.id })
            .select()
            .single()

        if (error) {
            toast.error('Erro ao criar funil')
        } else {
            setFunnels([data, ...funnels])
            setSelectedFunnel(data)
            setSteps([])
            toast.success('Funil criado!')
        }
    }

    function addStep(type: Step['type']) {
        const newStep: Step = {
            id: `temp-${Date.now()}`,
            type,
            content: '',
            order_index: steps.length,
            delay_seconds: 0,
            wait_for_reply: false
        }
        setSteps([...steps, newStep])
    }

    async function saveFunnel() {
        if (!selectedFunnel) return
        setSaving(true)

        // Delete old steps and insert new ones
        await supabase.from('funnel_steps').delete().eq('funnel_id', selectedFunnel.id)

        const stepsToInsert = steps.map((s, idx) => ({
            funnel_id: selectedFunnel.id,
            type: s.type,
            content: s.content,
            order_index: idx,
            delay_seconds: s.delay_seconds,
            wait_for_reply: !!s.wait_for_reply
        }))

        const { error } = await supabase.from('funnel_steps').insert(stepsToInsert)

        if (error) {
            toast.error('Erro ao salvar funil')
        } else {
            toast.success('Funil salvo com sucesso!')
            loadSteps(selectedFunnel.id)
        }
        setSaving(false)
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        const stepId = activeStepIdForUpload.current
        if (!file || !stepId) return

        // Travas de segurança solicitadas:
        // 1. Limite de 16MB
        if (file.size > 16 * 1024 * 1024) {
            toast.error('Arquivo muito grande! Limite de 16MB.')
            return
        }

        setUploading(stepId)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            const fileExt = file.name.split('.').pop()
            const fileName = `${user.id}/${Date.now()}.${fileExt}`

            const { data, error } = await supabase.storage
                .from('funnel-assets')
                .upload(fileName, file)

            if (error) throw error

            const { data: { publicUrl } } = supabase.storage
                .from('funnel-assets')
                .getPublicUrl(fileName)

            // Atualiza o conteúdo do passo com a URL pública
            setSteps(prev => prev.map(s => s.id === stepId ? { ...s, content: publicUrl } : s))
            toast.success('Upload concluído!')
        } catch (err) {
            console.error(err)
            toast.error('Erro ao fazer upload')
        } finally {
            setUploading(null)
            activeStepIdForUpload.current = null
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    function triggerUpload(stepId: string) {
        activeStepIdForUpload.current = stepId
        fileInputRef.current?.click()
    }

    return (
        <div className="p-8 max-w-6xl mx-auto min-h-screen">
            {/* Input invisível para upload */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="audio/*,video/*,image/*"
            />

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Filter className="w-5 h-5 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">Funis de Venda</h1>
                    </div>
                    <p className="text-muted-foreground">Configure sequências automáticas de mensagens, áudios e vídeos.</p>
                </div>
                <button 
                    onClick={createFunnel}
                    className="flex items-center gap-2 px-4 py-2 gradient-primary text-white rounded-xl font-medium hover:opacity-90 transition-all glow-primary"
                >
                    <Plus className="w-4 h-4" />
                    Novo Funil
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Lateral: Lista de Funis */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-card border border-border rounded-2xl p-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">Meus Funis</h3>
                        <div className="space-y-1">
                            {funnels.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => {
                                        setSelectedFunnel(f)
                                        loadSteps(f.id)
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${selectedFunnel?.id === f.id ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-secondary text-muted-foreground'}`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {f.is_default && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                                        <span className="truncate font-medium">{f.name}</span>
                                    </div>
                                    {selectedFunnel?.id === f.id && <ChevronRight className="w-4 h-4" />}
                                </button>
                            ))}
                            {funnels.length === 0 && !loading && (
                                <div className="text-center py-8 text-xs text-muted-foreground italic">
                                    Nenhum funil criado
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Principal: Construtor */}
                <div className="lg:col-span-3 space-y-6">
                    {!selectedFunnel ? (
                        <div className="bg-card border border-border border-dashed rounded-3xl h-[400px] flex flex-col items-center justify-center text-center p-8">
                            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
                                <Layout className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground mb-2">Selecione um funil para editar</h2>
                            <p className="text-muted-foreground max-w-sm">Escolha um funil na lateral ou crie um novo para começar a configurar os passos da sua automação.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Toolbar Step Selection */}
                            <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center gap-4">
                                <span className="text-sm font-medium text-muted-foreground mr-2">Adicionar Passo:</span>
                                <button onClick={() => addStep('text')} className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-all">
                                    <MessageSquare className="w-4 h-4 text-blue-400" /> Texto
                                </button>
                                <button onClick={() => addStep('audio')} className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-all">
                                    <Mic className="w-4 h-4 text-emerald-400" /> Áudio
                                </button>
                                <button onClick={() => addStep('video')} className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-all">
                                    <Video className="w-4 h-4 text-purple-400" /> Vídeo
                                </button>
                                <button onClick={() => addStep('image')} className="flex items-center gap-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-all">
                                    <ImageIcon className="w-4 h-4 text-orange-400" /> Imagem
                                </button>

                                <div className="ml-auto flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Padrão:</span>
                                        <input 
                                            type="checkbox"
                                            checked={selectedFunnel.is_default}
                                            onChange={async (e) => {
                                                const val = e.target.checked
                                                if (val) {
                                                    const { data: user } = await supabase.auth.getUser()
                                                    if (user.user) {
                                                        await supabase.from('funnels').update({ is_default: false }).eq('user_id', user.user.id)
                                                    }
                                                }
                                                const { error } = await supabase.from('funnels').update({ is_default: val }).eq('id', selectedFunnel.id)
                                                if (!error) {
                                                    setSelectedFunnel({...selectedFunnel, is_default: val})
                                                    loadFunnels()
                                                }
                                            }}
                                            className="w-4 h-4 rounded text-primary focus:ring-primary bg-secondary border-border"
                                        />
                                    </div>
                                    <button 
                                        onClick={saveFunnel}
                                        disabled={saving}
                                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Salvar Funil
                                    </button>
                                </div>
                            </div>

                            {/* Steps List */}
                            <div className="space-y-4">
                                {steps.map((step, index) => (
                                    <div key={step.id} className="group relative flex items-start gap-4">
                                        <div className="flex flex-col items-center gap-2 mt-4">
                                            <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold">
                                                {index + 1}
                                            </div>
                                            {index < steps.length - 1 && <div className="w-0.5 h-full bg-border" />}
                                        </div>

                                        <div className="flex-1 bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all shadow-sm">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    {step.type === 'text' && <MessageSquare className="w-4 h-4 text-blue-400" />}
                                                    {step.type === 'audio' && <Mic className="w-4 h-4 text-emerald-400" />}
                                                    {step.type === 'video' && <Video className="w-4 h-4 text-purple-400" />}
                                                    {step.type === 'image' && <ImageIcon className="w-4 h-4 text-orange-400" />}
                                                    <span className="text-sm font-bold capitalize">{step.type}</span>
                                                </div>
                                                <button 
                                                    onClick={() => setSteps(steps.filter(s => s.id !== step.id))}
                                                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {step.type === 'text' ? (
                                                <textarea 
                                                    value={step.content}
                                                    onChange={e => {
                                                        const newSteps = [...steps]
                                                        newSteps[index].content = e.target.value
                                                        setSteps(newSteps)
                                                    }}
                                                    placeholder="Digite a mensagem..."
                                                    className="w-full bg-input border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px] resize-none"
                                                />
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="relative">
                                                        <input 
                                                            type="text"
                                                            value={step.content}
                                                            onChange={e => {
                                                                const newSteps = [...steps]
                                                                newSteps[index].content = e.target.value
                                                                setSteps(newSteps)
                                                            }}
                                                            placeholder={`Link do ${step.type} ou subir arquivo do PC...`}
                                                            className="w-full bg-input border border-border rounded-xl pl-3 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                        />
                                                        <button 
                                                            onClick={() => triggerUpload(step.id)}
                                                            disabled={uploading === step.id}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-secondary rounded-lg transition-colors text-primary"
                                                            title="Subir arquivo do computador"
                                                        >
                                                            {uploading === step.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                                        </button>
                                                    </div>
                                                    
                                                    {step.content && step.content.startsWith('http') && (
                                                        <div className="text-[10px] text-emerald-400 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10 truncate">
                                                            Arquivo pronto: {step.content.split('/').pop()}
                                                        </div>
                                                    )}

                                                    <div className="text-[10px] text-muted-foreground bg-primary/5 p-2 rounded-lg flex items-start gap-2">
                                                        <Sparkles className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                                                        <span>
                                                            {step.type === 'audio' 
                                                                ? 'Dica: Use arquivos .ogg para aparecer como "gravado na hora".' 
                                                                : `Dica: O arquivo será enviado automaticamente no passo ${index + 1}.`}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 cursor-pointer" onClick={() => {
                                                    const newSteps = [...steps]
                                                    newSteps[index].wait_for_reply = !newSteps[index].wait_for_reply
                                                    setSteps(newSteps)
                                                }}>
                                                    <span className="text-xs font-medium text-muted-foreground">Esperar resposta para enviar?</span>
                                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors ${step.wait_for_reply ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary text-muted-foreground border border-border'}`}>
                                                        {step.wait_for_reply ? 'Sim' : 'Não'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">Atraso:</span>
                                                    <input 
                                                        type="number"
                                                        value={step.delay_seconds}
                                                        onChange={e => {
                                                            const newSteps = [...steps]
                                                            newSteps[index].delay_seconds = parseInt(e.target.value) || 0
                                                            setSteps(newSteps)
                                                        }}
                                                        className="w-16 bg-input border border-border rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
                                                    />
                                                    <span className="text-xs text-muted-foreground">segundos</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {steps.length === 0 && (
                                    <div className="text-center py-12 bg-secondary/30 rounded-3xl border-2 border-dashed border-border">
                                        <p className="text-muted-foreground text-sm">Crie a sequência do seu funil adicionando passos acima.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
