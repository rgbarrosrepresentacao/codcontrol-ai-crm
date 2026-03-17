'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Brain, Save, Loader2, Plus, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff, Sparkles, X, Target, Heart, Tag, Info, UserPen, Settings } from 'lucide-react'
import LogzzConfig from './LogzzConfig'

interface AiConfig {
    id?: string
    instance_id: string | null
    bot_name: string
    system_prompt: string
    tone: 'professional' | 'friendly' | 'casual' | 'formal'
    language: string
    is_active: boolean
    audio_enabled: boolean
    voice_id: string
}

interface Instance {
    id: string
    instance_name: string
    display_name: string | null
    status: string
}

const tones = [
    { value: 'professional', label: '💼 Profissional', desc: 'Formal e objetivo' },
    { value: 'friendly', label: '😊 Amigável', desc: 'Caloroso e próximo' },
    { value: 'casual', label: '😎 Casual', desc: 'Descontraído e informal' },
    { value: 'formal', label: '🎩 Formal', desc: 'Muito formal e respeitoso' },
]

const defaultPrompt = `Você é um assistente virtual prestativo e eficiente. Seu objetivo é ajudar os clientes com suas dúvidas e necessidades de forma clara e objetiva.

Diretrizes:
- Seja sempre educado e respeitoso
- Responda de forma clara e concisa
- Se não souber algo, diga honestamente
- Encaminhe para um humano quando necessário
- Mantenha o contexto da conversa`

export default function IAPage() {
    const [instances, setInstances] = useState<Instance[]>([])
    const [configs, setConfigs] = useState<AiConfig[]>([])
    const [openaiKey, setOpenaiKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [saving, setSaving] = useState(false)
    const [savingKey, setSavingKey] = useState(false)
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [activeTab, setActiveTab] = useState<string>('global')
    const [showWizard, setShowWizard] = useState(false)
    const [wizardData, setWizardData] = useState({
        productName: '',
        productResolves: '',
        benefits: '',
        prices: '',
        commonObjections: '',
        sellerName: 'Camila',
        tone: 'Amigável e Vendedora'
    })

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const [instancesRes, configsRes, profileRes] = await Promise.all([
                supabase.from('whatsapp_instances').select('*').eq('user_id', user.id),
                supabase.from('ai_configurations').select('*').eq('user_id', user.id),
                supabase.from('profiles').select('openai_api_key, is_admin').eq('id', user.id).single(),
            ])
            setInstances(instancesRes.data || [])
            setConfigs(configsRes.data || [])
            setOpenaiKey(profileRes.data?.openai_api_key || '')
            setIsAdmin(profileRes.data?.is_admin || false)
            setLoading(false)
        }
        load()
    }, [])

    const getConfigForInstance = (instanceId: string | null): AiConfig => {
        const existing = configs.find(c => c.instance_id === instanceId)
        return existing || {
            instance_id: instanceId,
            bot_name: 'Assistente IA',
            system_prompt: defaultPrompt,
            tone: 'professional',
            language: 'pt-BR',
            is_active: true,
            audio_enabled: false,
            voice_id: 'nova',
        }
    }

    const currentConfig = getConfigForInstance(activeTab === 'global' ? null : activeTab)

    const handleSave = async () => {
        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const config = currentConfig
            if (config.id) {
                const { error } = await supabase.from('ai_configurations').update({
                    bot_name: config.bot_name,
                    system_prompt: config.system_prompt,
                    tone: config.tone,
                    language: config.language,
                    is_active: config.is_active,
                    audio_enabled: config.audio_enabled,
                    voice_id: config.voice_id,
                }).eq('id', config.id)
                if (error) throw error
            } else {
                const { data, error } = await supabase.from('ai_configurations').insert({
                    user_id: user.id,
                    instance_id: config.instance_id,
                    bot_name: config.bot_name,
                    system_prompt: config.system_prompt,
                    tone: config.tone,
                    language: config.language,
                    is_active: config.is_active,
                    audio_enabled: config.audio_enabled,
                    voice_id: config.voice_id,
                }).select().single()
                if (error) throw error
                setConfigs(prev => {
                    const idx = prev.findIndex(c => c.instance_id === config.instance_id)
                    if (idx >= 0) { const updated = [...prev]; updated[idx] = data; return updated }
                    return [...prev, data]
                })
            }
            toast.success('Configuração de IA salva!')
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSaving(false)
        }
    }

    const updateConfig = (field: keyof AiConfig, value: any) => {
        const config = currentConfig
        const newConfig = { ...config, [field]: value }
        setConfigs(prev => {
            const idx = prev.findIndex(c => c.instance_id === newConfig.instance_id)
            if (idx >= 0) { const updated = [...prev]; updated[idx] = newConfig; return updated }
            return [...prev, newConfig]
        })
    }

    const handleGeneratePrompt = async () => {
        if (!openaiKey) {
            toast.error('Configure sua API Key da OpenAI primeiro!')
            return
        }
        if (!wizardData.productName || !wizardData.productResolves) {
            toast.error('Preencha pelo menos o nome e o que o produto resolve!')
            return
        }

        setGenerating(true)
        try {
            const res = await fetch('/api/whatsapp/generate-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wizardData),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao gerar prompt')

            updateConfig('system_prompt', data.prompt)
            toast.success('Prompt de Elite gerado com sucesso!')
            setShowWizard(false)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setGenerating(false)
        }
    }

    const handleToggleActive = async () => {
        const newValue = !currentConfig.is_active
        updateConfig('is_active', newValue)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const config = currentConfig

            if (config.id) {
                // Já existe no banco, atualiza diretamente
                const { error } = await supabase
                    .from('ai_configurations')
                    .update({ is_active: newValue })
                    .eq('id', config.id)
                if (error) throw error
            } else {
                // Cria um novo registro já com o estado correto
                const { data, error } = await supabase
                    .from('ai_configurations')
                    .insert({
                        user_id: user.id,
                        instance_id: config.instance_id,
                        bot_name: config.bot_name,
                        system_prompt: config.system_prompt,
                        tone: config.tone,
                        language: config.language,
                        is_active: newValue,
                        audio_enabled: config.audio_enabled,
                        voice_id: config.voice_id,
                    })
                    .select()
                    .single()
                if (error) throw error
                setConfigs(prev => {
                    const idx = prev.findIndex(c => c.instance_id === config.instance_id)
                    if (idx >= 0) { const updated = [...prev]; updated[idx] = { ...updated[idx], id: data.id }; return updated }
                    return [...prev, data]
                })
            }

            toast.success(newValue ? 'IA ativada! Respondendo mensagens.' : 'IA desativada. Não vai mais responder.')
        } catch (error: any) {
            // Reverte o estado visual em caso de erro
            updateConfig('is_active', !newValue)
            toast.error(`Erro ao alterar estado: ${error.message}`)
        }
    }

    const handleSaveKey = async () => {
        setSavingKey(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                toast.error('Usuário não autenticado')
                return
            }
            const { error } = await supabase.from('profiles').update({ openai_api_key: openaiKey }).eq('id', user.id)
            if (error) throw error
            toast.success('API Key salva com sucesso!')
        } catch (error: any) {
            console.error('Erro ao salvar chave:', error)
            toast.error(`Erro ao salvar API Key: ${error.message}`)
        } finally {
            setSavingKey(false)
        }
    }

    if (loading) return (
        <div className="p-8 flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
    )

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Brain className="w-6 h-6 text-primary" />Inteligência Artificial
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Configure o comportamento da IA para cada WhatsApp</p>
            </div>

            {/* OpenAI API Key */}
            <div className="gradient-card border border-border rounded-xl p-6">
                <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                    🔑 API Key OpenAI
                </h2>
                <p className="text-muted-foreground text-sm mb-4">Sua chave da OpenAI é usada para gerar as respostas automáticas. Nunca é compartilhada.</p>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={openaiKey}
                            onChange={(e) => setOpenaiKey(e.target.value)}
                            placeholder="sk-proj-..."
                            className="w-full bg-input border border-border rounded-lg px-4 py-2.5 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm font-mono"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <button onClick={handleSaveKey} disabled={savingKey} className="gradient-primary text-black font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm disabled:opacity-60">
                        {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar
                    </button>
                </div>
                {!openaiKey && (
                    <p className="text-yellow-400 text-xs mt-2 flex items-center gap-1">⚠️ Sem API Key, a IA não conseguirá responder mensagens</p>
                )}
            </div>

            {/* Tab selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                    onClick={() => setActiveTab('global')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeTab === 'global' ? 'gradient-primary text-black' : 'border border-border text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                >
                    🌐 Configuração Global
                </button>
                {instances.map(inst => (
                    <button
                        key={inst.id}
                        onClick={() => setActiveTab(inst.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${activeTab === inst.id ? 'gradient-primary text-black' : 'border border-border text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                    >
                        <div className={`w-1.5 h-1.5 rounded-full status-${inst.status}`} />
                        {inst.display_name || inst.instance_name}
                    </button>
                ))}
            </div>

            {/* Config Form */}
            <div className="gradient-card border border-border rounded-xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-foreground">
                        {activeTab === 'global' ? '🌐 Configuração Global' : instances.find(i => i.id === activeTab)?.display_name || 'Instância'}
                    </h2>
                    <button
                        onClick={handleToggleActive}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${currentConfig.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}
                    >
                        {currentConfig.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        {currentConfig.is_active ? 'IA Ativa' : 'IA Inativa'}
                    </button>
                </div>

                {/* Bot Name */}
                <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Nome do bot</label>
                    <input
                        value={currentConfig.bot_name}
                        onChange={(e) => updateConfig('bot_name', e.target.value)}
                        placeholder="Assistente IA"
                        className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                    />
                </div>

                {/* Tone */}
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Tom de conversa</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {tones.map(t => (
                            <button
                                key={t.value}
                                onClick={() => updateConfig('tone', t.value)}
                                className={`p-3 rounded-xl border text-left transition-all ${currentConfig.tone === t.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/30 hover:bg-secondary/50'}`}
                            >
                                <div className="text-sm font-medium text-foreground">{t.label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Language */}
                <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Idioma</label>
                    <select
                        value={currentConfig.language}
                        onChange={(e) => updateConfig('language', e.target.value)}
                        className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                    >
                        <option value="pt-BR">🇧🇷 Português (Brasil)</option>
                        <option value="en-US">🇺🇸 English (US)</option>
                        <option value="es-ES">🇪🇸 Español</option>
                    </select>
                </div>

                {/* Voice Selection (New Section) */}
                <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                🎙️ Voz da Atendente (IA)
                            </h3>
                            <p className="text-xs text-muted-foreground">Escolha a voz que será usada quando o cliente pedir áudio.</p>
                        </div>
                        <button
                            onClick={() => updateConfig('audio_enabled', !currentConfig.audio_enabled)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${currentConfig.audio_enabled ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary text-muted-foreground border border-border'}`}
                        >
                            {currentConfig.audio_enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            {currentConfig.audio_enabled ? 'Respostas por Áudio Ativas' : 'Áudio Desativado'}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Femininas */}
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vozes Femininas</span>
                            {[
                                { id: 'nova', name: 'Nova', desc: 'Energética e vibrante' },
                                { id: 'shimmer', name: 'Shimmer', desc: 'Suave e profissional' },
                                { id: 'coral', name: 'Coral', desc: 'Amigável e clara' }
                            ].map(v => (
                                <div key={v.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${currentConfig.voice_id === v.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                                    <div onClick={() => updateConfig('voice_id', v.id)} className="flex-1 cursor-pointer">
                                        <div className="text-sm font-medium text-foreground">{v.name}</div>
                                        <div className="text-[11px] text-muted-foreground">{v.desc}</div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const audio = new Audio(`https://cdn.openai.com/API/docs/audio/${v.id}.wav`);
                                            audio.play().catch(() => toast.error('Erro ao reproduzir amostra.'));
                                        }}
                                        className="p-2 hover:bg-primary/10 rounded-full text-primary transition-all"
                                        title="Ouvir Amostra"
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Masculinas */}
                        <div className="space-y-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Vozes Masculinas</span>
                            {[
                                { id: 'echo', name: 'Echo', desc: 'Confiante e maduro' },
                                { id: 'ash', name: 'Ash', desc: 'Sério e direto' }
                            ].map(v => (
                                <div key={v.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${currentConfig.voice_id === v.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                                    <div onClick={() => updateConfig('voice_id', v.id)} className="flex-1 cursor-pointer">
                                        <div className="text-sm font-medium text-foreground">{v.name}</div>
                                        <div className="text-[11px] text-muted-foreground">{v.desc}</div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const audio = new Audio(`https://cdn.openai.com/API/docs/audio/${v.id}.wav`);
                                            audio.play().catch(() => toast.error('Erro ao reproduzir amostra.'));
                                        }}
                                        className="p-2 hover:bg-primary/10 rounded-full text-primary transition-all"
                                        title="Ouvir Amostra"
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    {currentConfig.audio_enabled && (
                        <p className="mt-3 text-[11px] text-yellow-500 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5" /> A IA responderá por áudio apenas se o cliente pedir ou mandar áudio primeiro.
                        </p>
                    )}
                </div>

                {/* System Prompt */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-medium text-foreground">Prompt do assistente</label>
                        <button
                            onClick={() => setShowWizard(true)}
                            className="text-xs font-semibold gradient-primary text-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-90 transition-all shadow-sm"
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Gerar Prompt de Elite (Modo Joe Girard)
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Defina como o bot deve se comportar, o que pode e não pode responder.</p>
                    <textarea
                        value={currentConfig.system_prompt}
                        onChange={(e) => updateConfig('system_prompt', e.target.value)}
                        rows={10}
                        placeholder={defaultPrompt}
                        className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm font-mono resize-y"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{currentConfig.system_prompt.length} caracteres</p>
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full gradient-primary text-black font-semibold py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Salvando...' : 'Salvar configuração'}
                </button>
            </div>

            {/* Logzz Config (Admin Only) */}
            {isAdmin && <LogzzConfig />}

            {/* Elite Sales Wizard Modal */}
            {showWizard && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="gradient-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
                        <div className="sticky top-0 bg-background/95 backdrop-blur-sm p-6 border-b border-border flex items-center justify-between z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Sparkles className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-foreground">Gerador de Prompt de Elite</h2>
                                    <p className="text-muted-foreground text-xs">A mentalidade do maior vendedor do mundo guiando sua IA.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowWizard(false)} className="text-muted-foreground hover:text-foreground p-2 hover:bg-secondary rounded-lg transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                                        <Tag className="w-4 h-4 text-primary" /> Nome do Produto
                                    </label>
                                    <input
                                        value={wizardData.productName}
                                        onChange={(e) => setWizardData({ ...wizardData, productName: e.target.value })}
                                        placeholder="Ex: Liso Mágico Premium"
                                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                                        <UserPen className="w-4 h-4 text-primary" /> Nome da Atendente (IA)
                                    </label>
                                    <input
                                        value={wizardData.sellerName}
                                        onChange={(e) => setWizardData({ ...wizardData, sellerName: e.target.value })}
                                        placeholder="Ex: Camila"
                                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                                    <Target className="w-4 h-4 text-primary" /> O que o produto resolve? (A Dor)
                                </label>
                                <textarea
                                    value={wizardData.productResolves}
                                    onChange={(e) => setWizardData({ ...wizardData, productResolves: e.target.value })}
                                    placeholder="Ex: Resolve o problema de cabelos rebeldes, frizz e falta de brilho em casa."
                                    rows={2}
                                    className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                                    <Heart className="w-4 h-4 text-primary" /> Principais Benefícios (um por linha)
                                </label>
                                <textarea
                                    value={wizardData.benefits}
                                    onChange={(e) => setWizardData({ ...wizardData, benefits: e.target.value })}
                                    placeholder="Ex: Liso perfeito em 30 min, Não arde o olho, Sem formol..."
                                    rows={3}
                                    className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                                    <Info className="w-4 h-4 text-primary" /> Preços e Promoções (Kits)
                                </label>
                                <textarea
                                    value={wizardData.prices}
                                    onChange={(e) => setWizardData({ ...wizardData, prices: e.target.value })}
                                    placeholder="Ex: Kit 1 un por R$149, Kit 2 un (Campeão) por R$197..."
                                    rows={3}
                                    className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                                    <Target className="w-4 h-4 text-primary" /> Objeções Comuns (um por linha)
                                </label>
                                <textarea
                                    value={wizardData.commonObjections}
                                    onChange={(e) => setWizardData({ ...wizardData, commonObjections: e.target.value })}
                                    placeholder="Ex: Tá caro, Vou falar com meu marido, É seguro?..."
                                    rows={3}
                                    className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-foreground focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                />
                            </div>

                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-3 text-sm text-primary/80">
                                <Info className="w-5 h-5 shrink-0 mt-0.5" />
                                <p>A IA vai casar essas informações com a nossa estrutura de **Logística Própria** e as técnicas do **Joe Girard** automaticamente.</p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-border flex gap-3 sticky bottom-0 bg-background/95 backdrop-blur-sm">
                            <button
                                onClick={() => setShowWizard(false)}
                                className="flex-1 border border-border text-foreground font-semibold py-3 rounded-xl hover:bg-secondary transition-all text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleGeneratePrompt}
                                disabled={generating}
                                className="flex-[2] gradient-primary text-black font-bold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-primary/20"
                            >
                                {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                {generating ? 'Gerando Inteligência...' : 'Gerar Prompt de Elite'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
