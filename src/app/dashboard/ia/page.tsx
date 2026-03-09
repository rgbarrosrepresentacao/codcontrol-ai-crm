'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Brain, Save, Loader2, Plus, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff } from 'lucide-react'

interface AiConfig {
    id?: string
    instance_id: string | null
    bot_name: string
    system_prompt: string
    tone: 'professional' | 'friendly' | 'casual' | 'formal'
    language: string
    is_active: boolean
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
    const [activeTab, setActiveTab] = useState<string>('global')

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const [instancesRes, configsRes, profileRes] = await Promise.all([
                supabase.from('whatsapp_instances').select('*').eq('user_id', user.id),
                supabase.from('ai_configurations').select('*').eq('user_id', user.id),
                supabase.from('profiles').select('openai_api_key').eq('id', user.id).single(),
            ])
            setInstances(instancesRes.data || [])
            setConfigs(configsRes.data || [])
            setOpenaiKey(profileRes.data?.openai_api_key || '')
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
                }).select().single()
                if (error) throw error
                setConfigs(prev => [...prev, data])
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
                        onClick={() => updateConfig('is_active', !currentConfig.is_active)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${currentConfig.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'border border-border text-muted-foreground'}`}
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

                {/* System Prompt */}
                <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Prompt do assistente</label>
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
        </div>
    )
}
