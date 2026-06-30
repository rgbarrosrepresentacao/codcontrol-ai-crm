'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { 
    Clock, Save, RotateCcw, Loader2, AlertTriangle, 
    CheckCircle2, PlayCircle, Settings2, ShieldAlert,
    Sliders, Calendar, HelpCircle
} from 'lucide-react'

interface FollowUpSettings {
    enabled: boolean
    delay_minutes: number
    max_attempts: number
    allowed_start_time: string
    allowed_end_time: string
    allowed_days: number[]
    allowed_statuses: string[]
    stop_on_reply: boolean
    stop_on_human_takeover: boolean
    stop_on_sale: boolean
    stop_on_status_change: boolean
    strategy: string
    objective: string
    custom_prompt: string
    use_ai: boolean
}

const DEFAULT_SETTINGS: FollowUpSettings = {
    enabled: false,
    delay_minutes: 1440,
    max_attempts: 3,
    allowed_start_time: '08:00',
    allowed_end_time: '18:00',
    allowed_days: [1, 2, 3, 4, 5],
    allowed_statuses: [],
    stop_on_reply: true,
    stop_on_human_takeover: true,
    stop_on_sale: true,
    stop_on_status_change: true,
    strategy: 'consultivo',
    objective: 'recuperar_venda',
    custom_prompt: '',
    use_ai: true
}

const AVAILABLE_STATUSES = [
    { value: 'NOVO_LEAD', label: 'Novo Lead' },
    { value: 'EM_ATENDIMENTO', label: 'Em Atendimento' },
    { value: 'QUALIFICADO', label: 'Qualificado' },
    { value: 'INTERESSADO', label: 'Interessado' },
    { value: 'PROPOSTA_ENVIADA', label: 'Proposta Enviada' },
    { value: 'AGUARDANDO_RESPOSTA', label: 'Aguardando Resposta' },
    { value: 'FRIO', label: 'Frio' },
    { value: 'MORNO', label: 'Morno' },
    { value: 'QUENTE', label: 'Quente' },
    { value: 'LEAD_QUALIFICADO', label: 'Lead Qualificado' }
]

const DAYS_OF_WEEK = [
    { value: 0, label: 'Dom' },
    { value: 1, label: 'Seg' },
    { value: 2, label: 'Ter' },
    { value: 3, label: 'Qua' },
    { value: 4, label: 'Qui' },
    { value: 5, label: 'Sex' },
    { value: 6, label: 'Sáb' }
]

const DELAY_OPTIONS = [
    { value: 30, label: '30 minutos' },
    { value: 60, label: '1 hora' },
    { value: 120, label: '2 horas' },
    { value: 360, label: '6 horas' },
    { value: 720, label: '12 horas' },
    { value: 1440, label: '24 horas' },
    { value: 2880, label: '48 horas' },
    { value: -1, label: 'Personalizado' }
]

const STRATEGIES = [
    { value: 'muito_leve', label: 'Muito leve', desc: 'Mensagens discretas e sutis' },
    { value: 'leve', label: 'Leve', desc: 'Lembretes amigáveis de baixa pressão' },
    { value: 'consultivo', label: 'Consultivo', desc: 'Focado em ajudar e tirar dúvidas (Recomendado)' },
    { value: 'persuasivo', label: 'Persuasivo', desc: 'Focado em conversão e gatilhos de urgência' }
]

const OBJECTIVES = [
    { value: 'recuperar_venda', label: 'Recuperar venda' },
    { value: 'tirar_duvida', label: 'Tirar dúvida' },
    { value: 'agendar_atendimento', label: 'Agendar atendimento' },
    { value: 'confirmar_pagamento', label: 'Confirmar pagamento' },
    { value: 'reativar_cliente', label: 'Reativar cliente' },
    { value: 'personalizado', label: 'Personalizado (Prompt próprio)' }
]

export default function FollowUpPage() {
    const [settings, setSettings] = useState<FollowUpSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [customDelayActive, setCustomDelayActive] = useState(false)
    const [customDelayInput, setCustomDelayInput] = useState('1440')

    useEffect(() => {
        async function fetchSettings() {
            try {
                const res = await fetch('/api/follow-up/settings')
                if (!res.ok) throw new Error('Falha ao carregar configurações')
                const data = await res.json()
                
                // Trata o delay personalizado
                const delayVal = data.delay_minutes
                const matchedOption = DELAY_OPTIONS.find(o => o.value === delayVal)
                if (!matchedOption) {
                    setCustomDelayActive(true)
                    setCustomDelayInput(String(delayVal))
                } else {
                    setCustomDelayActive(false)
                }

                setSettings(data)
            } catch (err: any) {
                toast.error(err.message || 'Erro ao carregar configurações')
            } finally {
                setLoading(false)
            }
        }

        fetchSettings()
    }, [])

    const handleSave = async () => {
        setSaving(true)
        try {
            let delayMinutes = settings.delay_minutes
            if (customDelayActive) {
                const parsed = parseInt(customDelayInput, 10)
                if (isNaN(parsed) || parsed < 5) {
                    throw new Error('O tempo personalizado deve ser de no mínimo 5 minutos.')
                }
                delayMinutes = parsed
            }

            const payload = {
                ...settings,
                delay_minutes: delayMinutes
            }

            const res = await fetch('/api/follow-up/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || 'Falha ao salvar')
            }

            const saved = await res.json()
            setSettings(saved)
            toast.success('Configurações salvas com sucesso!')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar configurações')
        } finally {
            setSaving(false)
        }
    }

    const handleRestoreDefaults = () => {
        setSettings(DEFAULT_SETTINGS)
        setCustomDelayActive(false)
        setCustomDelayInput('1440')
        toast.info('Padrões restaurados. Clique em salvar para aplicar.')
    }

    const handleDelayChange = (val: number) => {
        if (val === -1) {
            setCustomDelayActive(true)
        } else {
            setCustomDelayActive(false)
            setSettings({ ...settings, delay_minutes: val })
        }
    }

    const toggleDay = (day: number) => {
        const currentDays = [...settings.allowed_days]
        const index = currentDays.indexOf(day)
        if (index > -1) {
            currentDays.splice(index, 1)
        } else {
            currentDays.push(day)
        }
        setSettings({ ...settings, allowed_days: currentDays.sort() })
    }

    const toggleStatus = (status: string) => {
        const currentStatuses = [...settings.allowed_statuses]
        const index = currentStatuses.indexOf(status)
        if (index > -1) {
            currentStatuses.splice(index, 1)
        } else {
            currentStatuses.push(status)
        }
        setSettings({ ...settings, allowed_statuses: currentStatuses })
    }

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        )
    }

    // Tradução para exibição do tempo de espera nos cards do topo
    const getDelayLabel = () => {
        if (customDelayActive) return `${customDelayInput} min`
        const opt = DELAY_OPTIONS.find(o => o.value === settings.delay_minutes)
        return opt ? opt.label : `${settings.delay_minutes} min`
    }

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto animate-fade-in">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Evolution API Only
                    </span>
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">Follow-up</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Recupere conversas paradas com mensagens inteligentes e configuráveis baseadas no tempo de inatividade dos leads.
                </p>
            </div>

            {/* Top Cards (KPIs/Metrics Layout) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Card 1: Status */}
                <div className="bg-zinc-900 border border-border p-5 rounded-2xl flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Status do Sistema</span>
                    <div className="mt-4 flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${settings.enabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                        <span className="text-lg font-bold text-white">
                            {settings.enabled ? 'Ativo' : 'Inativo'}
                        </span>
                    </div>
                </div>

                {/* Card 2: Waiting Time */}
                <div className="bg-zinc-900 border border-border p-5 rounded-2xl flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Tempo de Espera</span>
                    <div className="mt-4 text-lg font-bold text-white">
                        {getDelayLabel()}
                    </div>
                </div>

                {/* Card 3: Attempts */}
                <div className="bg-zinc-900 border border-border p-5 rounded-2xl flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Máx. Tentativas</span>
                    <div className="mt-4 text-lg font-bold text-white">
                        {settings.max_attempts} {settings.max_attempts === 1 ? 'tentativa' : 'tentativas'}
                    </div>
                </div>

                {/* Card 4: Allowed Time */}
                <div className="bg-zinc-900 border border-border p-5 rounded-2xl flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Janela de Disparo</span>
                    <div className="mt-4 text-lg font-bold text-white">
                        {settings.allowed_start_time} às {settings.allowed_end_time}
                    </div>
                </div>
            </div>

            {/* Disabled System Warning */}
            {!settings.enabled && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-amber-300">Seu follow-up está desativado</h4>
                        <p className="text-xs text-amber-400/80 mt-0.5">
                            Ative o sistema na chave de configuração abaixo para começar a recuperar conversas paradas.
                        </p>
                    </div>
                </div>
            )}

            {/* Configuration Form */}
            <div className="bg-zinc-900 border border-border rounded-3xl p-6 md:p-8 space-y-8">
                
                {/* Section 1: Activation */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <PlayCircle className="w-5 h-5 text-primary" /> Ativar Follow-up Automático
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Quando ativado, o sistema analisará os leads inativos e agendará disparos conforme as regras abaixo.
                        </p>
                    </div>
                    <button
                        onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.enabled ? 'bg-primary' : 'bg-zinc-700'}`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.enabled ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                    </button>
                </div>

                {/* Section 2: Core Rules */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-border">
                    {/* Time Window Select */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-zinc-400" /> Tempo sem resposta
                        </label>
                        <select
                            value={customDelayActive ? -1 : settings.delay_minutes}
                            onChange={(e) => handleDelayChange(Number(e.target.value))}
                            className="w-full bg-zinc-950 border border-border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        >
                            {DELAY_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>

                        {/* Custom Input */}
                        {customDelayActive && (
                            <div className="mt-2 flex items-center gap-2 animate-fade-in">
                                <input
                                    type="number"
                                    value={customDelayInput}
                                    onChange={(e) => setCustomDelayInput(e.target.value)}
                                    placeholder="Minutos"
                                    min="5"
                                    className="flex-1 bg-zinc-950 border border-border rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                />
                                <span className="text-xs text-muted-foreground">minutos (mín. 5)</span>
                            </div>
                        )}
                    </div>

                    {/* Max Attempts */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white flex items-center gap-1.5">
                            <Sliders className="w-4 h-4 text-zinc-400" /> Máximo de tentativas
                        </label>
                        <select
                            value={settings.max_attempts}
                            onChange={(e) => setSettings({ ...settings, max_attempts: Number(e.target.value) })}
                            className="w-full bg-zinc-950 border border-border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        >
                            {[1, 2, 3, 4, 5].map(v => (
                                <option key={v} value={v}>{v} {v === 1 ? 'tentativa' : 'tentativas'}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Section 3: Time Constraints */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-border">
                    {/* Hours */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Horário permitido de envio</label>
                        <p className="text-xs text-muted-foreground">Evite acordar clientes fora do horário comercial.</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="time"
                                value={settings.allowed_start_time}
                                onChange={(e) => setSettings({ ...settings, allowed_start_time: e.target.value })}
                                className="flex-1 bg-zinc-950 border border-border rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                            />
                            <span className="text-muted-foreground text-sm">às</span>
                            <input
                                type="time"
                                value={settings.allowed_end_time}
                                onChange={(e) => setSettings({ ...settings, allowed_end_time: e.target.value })}
                                className="flex-1 bg-zinc-950 border border-border rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                            />
                        </div>
                    </div>

                    {/* Days */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-zinc-400" /> Dias permitidos
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {DAYS_OF_WEEK.map(d => {
                                const active = settings.allowed_days.includes(d.value)
                                return (
                                    <button
                                        key={d.value}
                                        type="button"
                                        onClick={() => toggleDay(d.value)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${active ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-zinc-950 border border-border text-muted-foreground'}`}
                                    >
                                        {d.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Section 4: Target Statuses (CRM Filter) */}
                <div className="space-y-3 pb-6 border-b border-border">
                    <div>
                        <h4 className="text-sm font-bold text-white">Status permitidos do CRM</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Selecione quais status ou tags do CRM receberão o follow-up automático. Se nenhum for selecionado, todos serão elegíveis.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {AVAILABLE_STATUSES.map(s => {
                            const active = settings.allowed_statuses.includes(s.value)
                            return (
                                <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => toggleStatus(s.value)}
                                    className={`px-3 py-2 rounded-xl text-left text-xs font-medium border transition-all ${active ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-zinc-950 border-border text-muted-foreground hover:text-white'}`}
                                >
                                    {s.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Section 5: Strategy & Objective */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-border">
                    {/* Strategy */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Abordagem / Tom de voz</label>
                        <select
                            value={settings.strategy}
                            onChange={(e) => setSettings({ ...settings, strategy: e.target.value })}
                            className="w-full bg-zinc-950 border border-border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        >
                            {STRATEGIES.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            {STRATEGIES.find(s => s.value === settings.strategy)?.desc}
                        </p>
                    </div>

                    {/* Objective */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Objetivo do follow-up</label>
                        <select
                            value={settings.objective}
                            onChange={(e) => setSettings({ ...settings, objective: e.target.value })}
                            className="w-full bg-zinc-950 border border-border rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        >
                            {OBJECTIVES.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Section 6: Custom Prompt */}
                <div className="space-y-2 pb-6 border-b border-border">
                    <label className="block text-sm font-semibold text-white flex items-center gap-1.5">
                        <Settings2 className="w-4 h-4 text-zinc-400" /> Instrução de Prompt Personalizada (Opcional)
                    </label>
                    <textarea
                        value={settings.custom_prompt}
                        onChange={(e) => setSettings({ ...settings, custom_prompt: e.target.value })}
                        placeholder="Exemplo: Analise a conversa, entenda por que o cliente parou de responder e envie uma mensagem curta, humana e natural. Nunca seja insistente."
                        maxLength={3000}
                        rows={4}
                        className="w-full bg-zinc-950 border border-border rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm placeholder:text-muted-foreground/40"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Forneça diretrizes adicionais sobre o que a IA deve falar ou focar.</span>
                        <span>{settings.custom_prompt.length} / 3000</span>
                    </div>
                </div>

                {/* Section 7: Stop triggers */}
                <div className="space-y-4">
                    <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <ShieldAlert className="w-4 h-4 text-zinc-400" /> Regras de Interrupção
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            O follow-up será interrompido automaticamente quando alguma das condições abaixo for atendida.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, stop_on_reply: !settings.stop_on_reply })}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left text-xs transition-all ${settings.stop_on_reply ? 'bg-primary/5 border-primary/30 text-white' : 'bg-zinc-950 border-border text-muted-foreground'}`}
                        >
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${settings.stop_on_reply ? 'text-primary' : 'text-zinc-600'}`} />
                            <div>
                                <div className="font-semibold">Parar ao receber resposta do cliente</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">Evita enviar mensagens após o cliente responder.</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, stop_on_human_takeover: !settings.stop_on_human_takeover })}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left text-xs transition-all ${settings.stop_on_human_takeover ? 'bg-primary/5 border-primary/30 text-white' : 'bg-zinc-950 border-border text-muted-foreground'}`}
                        >
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${settings.stop_on_human_takeover ? 'text-primary' : 'text-zinc-600'}`} />
                            <div>
                                <div className="font-semibold">Parar quando humano assumir</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">Interrompe se um atendente interagir no chat.</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, stop_on_sale: !settings.stop_on_sale })}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left text-xs transition-all ${settings.stop_on_sale ? 'bg-primary/5 border-primary/30 text-white' : 'bg-zinc-950 border-border text-muted-foreground'}`}
                        >
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${settings.stop_on_sale ? 'text-primary' : 'text-zinc-600'}`} />
                            <div>
                                <div className="font-semibold">Parar quando venda for registrada</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">Interrompe se o lead fechar a compra.</div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSettings({ ...settings, stop_on_status_change: !settings.stop_on_status_change })}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left text-xs transition-all ${settings.stop_on_status_change ? 'bg-primary/5 border-primary/30 text-white' : 'bg-zinc-950 border-border text-muted-foreground'}`}
                        >
                            <CheckCircle2 className={`w-4 h-4 shrink-0 ${settings.stop_on_status_change ? 'text-primary' : 'text-zinc-600'}`} />
                            <div>
                                <div className="font-semibold">Parar quando status/funil mudar</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">Cancela se o lead mudar de estágio no funil.</div>
                            </div>
                        </button>
                    </div>
                </div>

            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between bg-zinc-900 border border-border p-4 rounded-2xl">
                <button
                    onClick={handleRestoreDefaults}
                    className="px-4 py-2.5 bg-zinc-950 hover:bg-zinc-800 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-white transition-all flex items-center gap-2"
                >
                    <RotateCcw className="w-4 h-4" /> Restaurar Padrão
                </button>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2.5 bg-primary hover:bg-primary-dark rounded-xl text-xs font-bold text-white shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {saving ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4" /> Salvar Configurações
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}
