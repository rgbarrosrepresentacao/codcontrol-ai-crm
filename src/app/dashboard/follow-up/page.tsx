'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { 
    Clock, Save, RotateCcw, Loader2, AlertTriangle, 
    CheckCircle2, PlayCircle, Settings2, ShieldAlert,
    Sliders, Calendar, HelpCircle, BarChart3, TrendingUp,
    MessageCircle, Users, ArrowUpRight, Ban, Eye, FileText,
    Brain, Lightbulb, Sparkles, Flame, Snowflake, ArrowRight,
    Search, Copy, Trash2, ShieldCheck, RefreshCw, Activity,
    Download, Check, X, ShieldAlert as ShieldIcon
} from 'lucide-react'
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
    Tooltip, CartesianGrid 
} from 'recharts'
import Link from 'next/link'

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

interface AnalyticsSummary {
    scheduled: number
    pending: number
    processing: number
    ready: number
    sent: number
    skipped: number
    failed: number
    replied: number
    recovered_sales: number
    recovery_rate: number
}

interface ChartItem {
    date: string
    sent: number
    replied: number
    sales: number
    failed: number
}

interface RecentAttempt {
    id: string
    contact_name: string
    phone: string
    attempt_number: number
    status: 'pending' | 'processing' | 'ready' | 'sent' | 'skipped' | 'failed' | 'cancelled'
    silence_reason: string
    generated_message: string
    sent_at: string
    created_at: string
    conversation_id: string
    message_id: string
    result: string
    client_replied?: boolean
    sale_recovered?: boolean
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

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
    pending: { label: 'Aguardando', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
    processing: { label: 'Processando', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse' },
    ready: { label: 'Pronto', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    sent: { label: 'Enviado', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    skipped: { label: 'Ignorado', color: 'bg-zinc-850 text-zinc-500 border-zinc-700/55' },
    failed: { label: 'Falhou', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    cancelled: { label: 'Cancelado', color: 'bg-zinc-800 text-zinc-500 border-zinc-700' }
}

const SILENCE_REASONS: Record<string, string> = {
    preco: 'Preço',
    esquecimento: 'Esquecimento',
    ocupado: 'Ocupado',
    perdeu_interesse: 'Perdeu interesse',
    pensando: 'Pensando',
    falta_confianca: 'Falta de confiança',
    precisa_falar_com_alguem: 'Falar com parceiro',
    aguardando_pagamento: 'Aguardando pag.',
    duvida_nao_respondida: 'Dúvida pendente',
    outro: 'Outro'
}

export default function FollowUpPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'simulator' | 'central' | 'settings' | 'history'>('overview')
    const [range, setRange] = useState<string>('7d')
    const [settings, setSettings] = useState<FollowUpSettings>(DEFAULT_SETTINGS)
    
    // Estados do Bloco 5 (Métricas e Gráficos)
    const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
    const [chartData, setChartData] = useState<ChartItem[]>([])
    const [history, setHistory] = useState<RecentAttempt[]>([])
    
    // Estados do Bloco 6 (Insights)
    const [insightsData, setInsightsData] = useState<any>(null)
    
    // Estados do Bloco 7 (Simulador)
    const [conversations, setConversations] = useState<any[]>([])
    const [selectedConv, setSelectedConv] = useState<any>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [loadingConvs, setLoadingConvs] = useState(false)
    const [simulating, setSimulating] = useState(false)
    const [simulationResult, setSimulationResult] = useState<any>(null)

    // Estados do Bloco 8 (Central de Operações)
    const [operations, setOperations] = useState<any>(null)
    const [loadingOperations, setLoadingOperations] = useState(true)
    const [selectedAttempt, setSelectedAttempt] = useState<any>(null)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    
    // Filtros do Live Feed (Central)
    const [feedStatusFilter, setFeedStatusFilter] = useState('all')
    const [feedAttemptFilter, setFeedAttemptFilter] = useState('all')
    const [feedSilenceFilter, setFeedSilenceFilter] = useState('all')
    const [feedSearch, setFeedSearch] = useState('')
    
    const [loadingSettings, setLoadingSettings] = useState(true)
    const [loadingAnalytics, setLoadingAnalytics] = useState(true)
    const [loadingInsights, setLoadingInsights] = useState(true)
    const [saving, setSaving] = useState(false)

    // Estados do Bloco 9 (IA Adaptativa)
    const [learningProfile, setLearningProfile] = useState<any>(null)
    const [loadingLearning, setLoadingLearning] = useState(true)
    const [recalculatingLearning, setRecalculatingLearning] = useState(false)
    
    const [customDelayActive, setCustomDelayActive] = useState(false)
    const [customDelayInput, setCustomDelayInput] = useState('1440')

    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    // Carregar Configurações (Fase 1)
    useEffect(() => {
        async function fetchSettings() {
            try {
                const res = await fetch('/api/follow-up/settings')
                if (!res.ok) throw new Error('Falha ao carregar configurações')
                const data = await res.json()
                
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
                setLoadingSettings(false)
            }
        }

        fetchSettings()
    }, [])

    // Carregar Métricas e Histórico (Fase 5)
    const fetchAnalytics = async (selectedRange: string) => {
        setLoadingAnalytics(true)
        try {
            const res = await fetch(`/api/follow-up/analytics?range=${selectedRange}`)
            if (!res.ok) throw new Error('Falha ao carregar dados analíticos')
            const data = await res.json()
            if (data.success) {
                setAnalytics(data.summary)
                setChartData(data.chart)
                setHistory(data.recent_attempts)
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar métricas')
        } finally {
            setLoadingAnalytics(false)
        }
    }

    // Carregar Insights IA (Fase 6)
    const fetchInsights = async (selectedRange: string) => {
        setLoadingInsights(true)
        try {
            const res = await fetch(`/api/follow-up/insights?range=${selectedRange}`)
            if (!res.ok) throw new Error('Falha ao carregar insights de vendas')
            const data = await res.json()
            if (data.success) {
                setInsightsData(data)
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar insights')
        } finally {
            setLoadingInsights(false)
        }
    }

    // Carregar Aprendizado (Fase 9)
    const fetchLearning = async () => {
        setLoadingLearning(true)
        try {
            const res = await fetch('/api/follow-up/learning')
            if (!res.ok) throw new Error('Falha ao carregar perfil de aprendizado')
            const data = await res.json()
            if (data.success) {
                setLearningProfile(data.profile)
            }
        } catch (err: any) {
            console.error(err.message)
        } finally {
            setLoadingLearning(false)
        }
    }

    const handleRecalculateLearning = async () => {
        setRecalculatingLearning(true)
        try {
            const res = await fetch('/api/follow-up/learning/recalculate', { method: 'POST' })
            if (!res.ok) throw new Error('Falha ao atualizar aprendizado')
            const data = await res.json()
            if (data.success) {
                setLearningProfile(data.profile)
                toast.success('Perfil de aprendizado atualizado com sucesso!')
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro ao atualizar aprendizado')
        } finally {
            setRecalculatingLearning(false)
        }
    }

    // Carregar conversas do Simulador (Fase 7)
    const fetchConversations = async (search = '') => {
        setLoadingConvs(true)
        try {
            const res = await fetch(`/api/follow-up/conversations?search=${encodeURIComponent(search)}`)
            if (!res.ok) throw new Error('Erro ao carregar conversas')
            const data = await res.json()
            if (data.success) {
                setConversations(data.conversations || [])
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro ao buscar contatos')
        } finally {
            setLoadingConvs(false)
        }
    }

    // Carregar Central de Operações (Fase 8)
    const fetchOperations = async (silent = false) => {
        if (!silent) setLoadingOperations(true)
        try {
            const res = await fetch('/api/follow-up/operations')
            if (!res.ok) throw new Error('Falha ao carregar central de operações')
            const data = await res.json()
            if (data.success) {
                setOperations(data)
            }
        } catch (err: any) {
            console.error(err.message)
        } finally {
            if (!silent) setLoadingOperations(false)
        }
    }

    // Gerenciar polling da Central a cada 5s (Fase 8)
    useEffect(() => {
        if (activeTab === 'central') {
            fetchOperations(false)
            intervalRef.current = setInterval(() => {
                fetchOperations(true)
            }, 5000)
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [activeTab])

    useEffect(() => {
        fetchAnalytics(range)
        fetchInsights(range)
        fetchLearning()
    }, [range])

    useEffect(() => {
        if (activeTab === 'simulator') {
            fetchConversations(searchQuery)
        }
    }, [activeTab, searchQuery])

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
            
            // Recarregar dados
            fetchAnalytics(range)
            fetchInsights(range)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar configurações')
        } finally {
            setSaving(false)
        }
    }

    // Executar a simulação (Fase 7)
    const handleSimulate = async () => {
        if (!selectedConv) {
            toast.warning('Selecione uma conversa primeiro.')
            return
        }

        setSimulating(true)
        try {
            const res = await fetch('/api/follow-up/simulator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: selectedConv.id,
                    strategy: settings.strategy,
                    objective: settings.objective
                })
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || 'Falha ao processar simulação')
            }

            const data = await res.json()
            if (data.success) {
                setSimulationResult(data.preview)
                toast.success('Simulação concluída com sucesso!')
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro durante a simulação da IA')
        } finally {
            setSimulating(false)
        }
    }

    const handleCopyMessage = () => {
        if (simulationResult?.generated_message) {
            navigator.clipboard.writeText(simulationResult.generated_message)
            toast.success('Mensagem copiada para a área de transferência!')
        }
    }

    const handleRestoreDefaults = () => {
        setSettings(DEFAULT_SETTINGS)
        setCustomDelayActive(false)
        setCustomDelayInput('1440')
        toast.info('Padrões restaurados. Clique em salvar para aplicar.')
    }

    // Exportar CSV (Fase 8)
    const handleExportCSV = () => {
        if (!filteredLiveFeed || filteredLiveFeed.length === 0) {
            toast.error('Nenhum registro para exportar.')
            return
        }

        console.log('[FOLLOWUP_OPERATIONS_EXPORT] Exportando feed da Central para CSV...');
        
        const headers = ['Data', 'Cliente', 'Telefone', 'Tentativa', 'Status', 'Silence Reason', 'Tempo Gasto'];
        const rows = filteredLiveFeed.map((item: any) => [
            new Date(item.horario).toLocaleString('pt-BR'),
            item.contact_name,
            item.phone,
            `#${item.attempt_number}`,
            item.status,
            item.silence_reason ? SILENCE_REASONS[item.silence_reason] || item.silence_reason : 'Não Identificado',
            item.tempo_gasto
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e: any) => e.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `followup_operations_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Fila de operações exportada em CSV!');
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

    const getDelayLabel = () => {
        if (customDelayActive) return `${customDelayInput} min`
        const opt = DELAY_OPTIONS.find(o => o.value === settings.delay_minutes)
        return opt ? opt.label : `${settings.delay_minutes} min`
    }

    const getDaysIdle = (dateStr: string) => {
        if (!dateStr) return '0'
        const diffMs = Date.now() - new Date(dateStr).getTime()
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
            return `${diffHours}h`
        }
        return `${diffDays} dias`
    }

    // Filtragem local do Live Feed da Central (Fase 8)
    const filteredLiveFeed = (operations?.live || []).filter((item: any) => {
        if (feedStatusFilter !== 'all' && item.status !== feedStatusFilter) return false
        if (feedAttemptFilter !== 'all' && String(item.attempt_number) !== feedAttemptFilter) return false
        if (feedSilenceFilter !== 'all' && item.silence_reason !== feedSilenceFilter) return false
        
        if (feedSearch) {
            const search = feedSearch.toLowerCase()
            return (
                item.contact_name.toLowerCase().includes(search) ||
                item.phone.includes(search) ||
                (item.mensagem_resumida && item.mensagem_resumida.toLowerCase().includes(search)) ||
                (item.error_message && item.error_message.toLowerCase().includes(search))
            )
        }
        return true
    })

    if (loadingSettings) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto animate-fade-in relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            Evolution API Only
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ${settings.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                            Status: {settings.enabled ? 'Ativo' : 'Pausado'}
                        </span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Follow-up</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Acompanhe seus envios e recupere leads frios de forma automatizada com inteligência artificial.
                    </p>
                </div>

                {/* Filtros de período */}
                {activeTab !== 'settings' && activeTab !== 'simulator' && activeTab !== 'central' && (
                    <div className="flex items-center bg-zinc-900 border border-border p-1 rounded-xl">
                        {[
                            { value: 'today', label: 'Hoje' },
                            { value: 'yesterday', label: 'Ontem' },
                            { value: '7d', label: '7 dias' },
                            { value: '30d', label: '30 dias' },
                            { value: 'all', label: 'Tudo' }
                        ].map(f => (
                            <button
                                key={f.value}
                                onClick={() => setRange(f.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${range === f.value ? 'bg-zinc-800 text-white shadow-sm' : 'text-muted-foreground hover:text-white'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Menu de Abas */}
            <div className="flex border-b border-border/60">
                {[
                    { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
                    { id: 'insights', label: 'Insights IA', icon: Brain },
                    { id: 'simulator', label: 'Simulador', icon: Sparkles },
                    { id: 'central', label: 'Central', icon: Activity },
                    { id: 'settings', label: 'Configurações', icon: Settings2 },
                    { id: 'history', label: 'Histórico Recente', icon: FileText }
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id as any)}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${activeTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-white'}`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* CONTEÚDO DAS ABAS */}

            {/* 1. ABA: VISÃO GERAL */}
            {activeTab === 'overview' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Cards de Métricas */}
                    {loadingAnalytics ? (
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 animate-pulse">
                            {[1, 2, 3, 4, 5, 6].map(n => (
                                <div key={n} className="bg-zinc-900 border border-border/40 h-28 rounded-2xl" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Enviados</span>
                                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div className="mt-2">
                                    <div className="text-2xl font-black text-white">{analytics?.sent || 0}</div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">Disparados com sucesso</p>
                                </div>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Retornos</span>
                                    <Users className="w-4 h-4 text-blue-400" />
                                </div>
                                <div className="mt-2">
                                    <div className="text-2xl font-black text-white">{analytics?.replied || 0}</div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">Leads que responderam</p>
                                </div>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Taxa Resposta</span>
                                    <TrendingUp className="w-4 h-4 text-primary" />
                                </div>
                                <div className="mt-2">
                                    <div className="text-2xl font-black text-white">{analytics?.recovery_rate || 0}%</div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">Respostas / Enviados</p>
                                </div>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Pendentes</span>
                                    <Clock className="w-4 h-4 text-yellow-500" />
                                </div>
                                <div className="mt-2">
                                    <div className="text-2xl font-black text-white">{analytics?.pending || 0}</div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">Aguardando na fila</p>
                                </div>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Prontos</span>
                                    <PlayCircle className="w-4 h-4 text-purple-400" />
                                </div>
                                <div className="mt-2">
                                    <div className="text-2xl font-black text-white">{analytics?.ready || 0}</div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">Gerações aprovadas</p>
                                </div>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Falhas</span>
                                    <Ban className="w-4 h-4 text-rose-500" />
                                </div>
                                <div className="mt-2">
                                    <div className="text-2xl font-black text-white">{analytics?.failed || 0}</div>
                                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">Falhas no envio/IA</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Gráficos Recharts */}
                    <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-primary" /> Histórico de Recuperação
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">Visão temporal dos disparos e respostas no período selecionado.</p>
                        </div>
                        
                        <div className="h-72 w-full pr-4">
                            {loadingAnalytics ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                </div>
                            ) : chartData.length === 0 || chartData.every(c => c.sent === 0 && c.replied === 0 && c.failed === 0) ? (
                                <div className="flex flex-col h-full items-center justify-center text-center">
                                    <AlertTriangle className="w-8 h-8 text-zinc-600 mb-2" />
                                    <span className="text-sm text-muted-foreground">Sem dados de movimentação no período.</span>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--color-emerald-500, #10b981)" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="var(--color-emerald-500, #10b981)" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--color-primary, #f97316)" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="var(--color-primary, #f97316)" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                        <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} />
                                        <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px' }} 
                                            labelStyle={{ color: '#fff', fontWeight: 'bold', fontSize: '12px' }}
                                            itemStyle={{ fontSize: '12px' }}
                                        />
                                        <Area type="monotone" dataKey="sent" name="Enviados" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorSent)" />
                                        <Area type="monotone" dataKey="replied" name="Respondidos" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorReplied)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 2. ABA: INSIGHTS IA */}
            {activeTab === 'insights' && (
                <div className="space-y-6 animate-fade-in">
                    {loadingInsights ? (
                        <div className="flex h-64 items-center justify-center">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        </div>
                    ) : !insightsData || !insightsData.silence_reasons || insightsData.silence_reasons.length === 0 ? (
                        <div className="bg-zinc-900 border border-border rounded-3xl p-12 text-center flex flex-col items-center">
                            <Brain className="w-12 h-12 text-zinc-600 mb-3 animate-pulse" />
                            <h4 className="text-lg font-bold text-white">Ainda não há dados suficientes</h4>
                            <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                                Quando o Follow-up disparar as primeiras mensagens e os clientes começarem a responder, os insights de diagnóstico de vendas aparecerão aqui.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="relative overflow-hidden bg-gradient-to-r from-zinc-900 to-zinc-900/50 border border-border p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                <div className="absolute top-0 right-0 w-36 h-36 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
                                <div className="space-y-2 max-w-2xl">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-primary" />
                                        <span className="text-xs font-bold text-primary uppercase tracking-wider">{insightsData.weekly_summary.title}</span>
                                    </div>
                                    <p className="text-sm text-zinc-200 leading-relaxed">
                                        {insightsData.weekly_summary.text}
                                    </p>
                                </div>
                            </div>

                            {/* Seção de Aprendizado Contínuo (IA Adaptativa) */}
                            <div className="bg-zinc-900 border border-border rounded-3xl p-6 space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
                                    <div className="space-y-0.5">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <Brain className="w-4.5 h-4.5 text-primary" /> Aprendizado Contínuo (IA Adaptativa)
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">Como o Follow-up está evoluindo com base nos retornos dos seus clientes.</p>
                                    </div>
                                    <button
                                        onClick={handleRecalculateLearning}
                                        disabled={recalculatingLearning}
                                        className="px-3.5 py-2 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-50 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-white transition-all flex items-center gap-2 w-fit shrink-0"
                                    >
                                        {recalculatingLearning ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Atualizando...
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="w-3.5 h-3.5" /> Atualizar Aprendizado
                                            </>
                                        )}
                                    </button>
                                </div>

                                {loadingLearning ? (
                                    <div className="flex justify-center py-8">
                                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                    </div>
                                ) : !learningProfile ? (
                                    /* Empty State */
                                    <div className="text-center py-6 flex flex-col items-center justify-center space-y-2">
                                        <Brain className="w-10 h-10 text-zinc-600 animate-pulse" />
                                        <h4 className="text-xs font-bold text-white">Aprendizado ainda em construção</h4>
                                        <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed">
                                            Quando o Follow-up enviar mais mensagens e os clientes começarem a responder, o CodControl identificará automaticamente os melhores horários, estratégias e abordagens.
                                        </p>
                                    </div>
                                ) : (
                                    /* Perfil Ativo */
                                    <div className="space-y-6">
                                        {/* Grid de Métricas de Aprendizado */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Melhor Tom</span>
                                                <div className="text-sm font-bold text-white mt-1.5 capitalize">
                                                    {learningProfile.best_strategy ? STRATEGIES.find((s: any) => s.value === learningProfile.best_strategy)?.label || learningProfile.best_strategy : 'Pendente'}
                                                </div>
                                            </div>

                                            <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Melhor Horário</span>
                                                <div className="text-sm font-bold text-primary mt-1.5">
                                                    {learningProfile.best_hour !== null ? `${learningProfile.best_hour}h` : 'Pendente'}
                                                </div>
                                            </div>

                                            <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Objeção Dominante</span>
                                                <div className="text-sm font-bold text-white mt-1.5">
                                                    {learningProfile.dominant_silence_reason ? SILENCE_REASONS[learningProfile.dominant_silence_reason] || learningProfile.dominant_silence_reason : 'Pendente'}
                                                </div>
                                            </div>

                                            <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Confiança</span>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <span className="text-sm font-black text-purple-400">
                                                        {learningProfile.confidence_score}%
                                                    </span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                                        learningProfile.confidence_score >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
                                                        learningProfile.confidence_score >= 40 ? 'bg-amber-500/20 text-amber-300' :
                                                        'bg-zinc-800 text-zinc-500'
                                                    }`}>
                                                        {learningProfile.confidence_score >= 80 ? 'Alta' :
                                                         learningProfile.confidence_score >= 40 ? 'Média' : 'Baixa'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Resumo do Aprendizado */}
                                        <div className="bg-zinc-950/20 border border-border/20 p-4.5 rounded-2xl">
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Resumo da IA</span>
                                            <p className="text-xs text-zinc-200 leading-relaxed mt-1.5">{learningProfile.learning_summary}</p>
                                        </div>

                                        {/* Recomendações do Aprendizado */}
                                        {learningProfile.recommendations && learningProfile.recommendations.length > 0 && (
                                            <div className="space-y-3">
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Recomendações da IA Adaptativa</span>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {learningProfile.recommendations.map((rec: any, idx: number) => (
                                                        <div key={idx} className="bg-zinc-950/50 border border-border/40 p-4 rounded-2xl space-y-1.5">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="text-xs font-bold text-white">{rec.title}</h4>
                                                                <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase ${
                                                                    rec.impact === 'alto' ? 'bg-rose-500/20 text-rose-300' :
                                                                    rec.impact === 'médio' ? 'bg-amber-500/20 text-amber-300' :
                                                                    'bg-zinc-800 text-zinc-400'
                                                                }`}>
                                                                    Impacto {rec.impact}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-muted-foreground leading-relaxed">{rec.description}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <Ban className="w-4.5 h-4.5 text-rose-400" /> Por que eles silenciam?
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">Distribuição das principais objeções detectadas pela IA.</p>
                                    </div>
                                    <div className="space-y-3.5">
                                        {insightsData.silence_reasons.map((r: any) => (
                                            <div key={r.reason} className="space-y-1.5">
                                                <div className="flex justify-between text-xs font-semibold text-zinc-300">
                                                    <span>{r.label}</span>
                                                    <span className="text-muted-foreground">{r.count} ({r.percentage}%)</span>
                                                </div>
                                                <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-primary rounded-full transition-all duration-500" 
                                                        style={{ width: `${r.percentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <TrendingUp className="w-4.5 h-4.5 text-emerald-400" /> Conversão por Tentativa
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">Qual etapa de follow-up gera maior engajamento?</p>
                                    </div>
                                    <div className="space-y-3.5">
                                        {insightsData.attempt_performance.map((p: any) => (
                                            <div key={p.attempt_number} className="flex items-center justify-between p-3 bg-zinc-950/40 border border-border/20 rounded-2xl text-xs">
                                                <div>
                                                    <span className="font-bold text-white">Tentativa #{p.attempt_number}</span>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.sent} disparos realizados</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-bold text-emerald-400">{p.rate}%</span>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.replied} retornos</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-zinc-900 border border-border p-5 rounded-3xl flex items-center justify-between">
                                    <div className="space-y-1">
                                        <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                            <Clock className="w-4 h-4 text-zinc-400" /> Melhor Horário
                                        </span>
                                        <div className="text-2xl font-black text-white mt-2">
                                            {insightsData.best_hours[0]?.hour || 'N/A'}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">Maior taxa de engajamento no período</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-2xl font-black text-primary">
                                            {insightsData.best_hours[0]?.rate || 0}%
                                        </span>
                                        <p className="text-[10px] text-muted-foreground mt-1">Taxa de retorno</p>
                                    </div>
                                </div>

                                <div className="bg-zinc-900 border border-border p-5 rounded-3xl flex items-center justify-between">
                                    <div className="space-y-1">
                                        <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar className="w-4 h-4 text-zinc-400" /> Melhor Dia
                                        </span>
                                        <div className="text-2xl font-black text-white mt-2">
                                            {insightsData.best_days[0]?.label || 'N/A'}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">Dia da semana mais produtivo</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-2xl font-black text-primary">
                                            {insightsData.best_days[0]?.rate || 0}%
                                        </span>
                                        <p className="text-[10px] text-muted-foreground mt-1">Taxa de retorno</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                                <div>
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Lightbulb className="w-5 h-5 text-yellow-400" /> Recomendações de Melhoria
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">Ações sugeridas com base nas estatísticas de inatividade e silêncio.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {insightsData.recommendations.map((rec: any, idx: number) => (
                                        <div key={idx} className="bg-zinc-950/50 border border-border/40 p-4.5 rounded-2xl space-y-2.5 flex flex-col justify-between">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-bold text-white">{rec.title}</h4>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                        rec.impact === 'alto' ? 'bg-rose-500/20 text-rose-300' :
                                                        rec.impact === 'médio' ? 'bg-amber-500/20 text-amber-300' :
                                                        'bg-zinc-800 text-zinc-400'
                                                    }`}>
                                                        Impacto {rec.impact}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">{rec.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                <Flame className="w-4.5 h-4.5 text-orange-500" /> Leads Quentes
                                            </h3>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">Clientes com maior chance de recuperação.</p>
                                        </div>
                                        <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-semibold rounded">Top 10</span>
                                    </div>
                                    <div className="divide-y divide-border/20 max-h-[360px] overflow-y-auto pr-2 space-y-1">
                                        {insightsData.hot_leads.length === 0 ? (
                                            <div className="text-center py-8 text-xs text-muted-foreground">Sem leads quentes pendentes.</div>
                                        ) : (
                                            insightsData.hot_leads.map((l: any, idx: number) => (
                                                <div key={idx} className="py-3 flex items-center justify-between gap-4">
                                                    <div className="space-y-0.5">
                                                        <span className="text-xs font-bold text-white">{l.contact_name}</span>
                                                        <p className="text-[10px] text-muted-foreground font-mono">{l.phone}</p>
                                                        <p className="text-[9px] text-zinc-500 italic mt-0.5">{l.hot_reason}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <span className="text-xs font-black text-orange-400">{l.hot_score} pts</span>
                                                            <p className="text-[9px] text-muted-foreground mt-0.5">Score</p>
                                                        </div>
                                                        <Link 
                                                            href={`/dashboard/chat?id=${l.conversation_id}`}
                                                            className="p-1.5 hover:bg-zinc-800 rounded-lg text-muted-foreground hover:text-white transition-all"
                                                            title="Ver conversa no chat"
                                                        >
                                                            <ArrowRight className="w-4.5 h-4.5" />
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                <Snowflake className="w-4.5 h-4.5 text-blue-400" /> Quase Perdidos (Frios)
                                            </h3>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">Clientes esfriando e com baixa taxa de retorno.</p>
                                        </div>
                                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-semibold rounded">Top 10</span>
                                    </div>
                                    <div className="divide-y divide-border/20 max-h-[360px] overflow-y-auto pr-2 space-y-1">
                                        {insightsData.cold_leads.length === 0 ? (
                                            <div className="text-center py-8 text-xs text-muted-foreground">Sem leads frios pendentes.</div>
                                        ) : (
                                            insightsData.cold_leads.map((l: any, idx: number) => (
                                                <div key={idx} className="py-3 flex items-center justify-between gap-4">
                                                    <div className="space-y-0.5">
                                                        <span className="text-xs font-bold text-white">{l.contact_name}</span>
                                                        <p className="text-[10px] text-muted-foreground font-mono">{l.phone}</p>
                                                        <p className="text-[9px] text-zinc-500 italic mt-0.5">{l.cold_reason}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <span className="text-xs font-black text-blue-400">{l.cold_score} pts</span>
                                                            <p className="text-[9px] text-muted-foreground mt-0.5">Frieza</p>
                                                        </div>
                                                        <Link 
                                                            href={`/dashboard/chat?id=${l.conversation_id}`}
                                                            className="p-1.5 hover:bg-zinc-800 rounded-lg text-muted-foreground hover:text-white transition-all"
                                                            title="Ver conversa no chat"
                                                        >
                                                            <ArrowRight className="w-4.5 h-4.5" />
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 3. ABA: SIMULADOR */}
            {activeTab === 'simulator' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                    <div className="md:col-span-1 bg-zinc-900 border border-border p-5 rounded-3xl space-y-4 h-fit">
                        <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Search className="w-4.5 h-4.5 text-primary" /> Selecionar Conversa
                            </h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Pesquise por contatos ativos para simular a IA.</p>
                        </div>

                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Buscar cliente..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950 border border-border rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                        </div>

                        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                            {loadingConvs ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                </div>
                            ) : conversations.length === 0 ? (
                                <div className="text-center py-8 text-xs text-muted-foreground">Nenhum cliente encontrado.</div>
                            ) : (
                                conversations.map(c => {
                                    const isSelected = selectedConv?.id === c.id
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                setSelectedConv(c)
                                                setSimulationResult(null)
                                            }}
                                            className={`w-full text-left p-3 rounded-2xl border transition-all flex flex-col gap-1 ${
                                                isSelected 
                                                    ? 'bg-primary/10 border-primary/40 text-white' 
                                                    : 'bg-zinc-950/40 border-border/40 text-zinc-300 hover:bg-zinc-950 hover:border-border'
                                            }`}
                                        >
                                            <span className="text-xs font-bold truncate">{c.contacts?.name || 'Sem Nome'}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono">{c.contacts?.phone || 'Sem Telefone'}</span>
                                            {c.contacts?.ai_tag && (
                                                <span className="mt-1 text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded w-fit font-medium">
                                                    {c.contacts.ai_tag}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })
                            )}
                        </div>

                        {selectedConv && (
                            <div className="bg-zinc-950/60 border border-border/40 p-4.5 rounded-2xl space-y-3 animate-fade-in text-xs">
                                <div className="font-bold text-white border-b border-border/40 pb-2 flex items-center justify-between">
                                    <span>Dados do Lead</span>
                                    <span className="text-[9px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full font-medium">CRM</span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Nome:</span>
                                        <span className="font-semibold text-white">{selectedConv.contacts?.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Status:</span>
                                        <span className="font-bold text-primary">{selectedConv.contacts?.ai_tag || 'Sem Status'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Parado há:</span>
                                        <span className="font-medium text-white">{getDaysIdle(selectedConv.last_message_at)}</span>
                                    </div>
                                    {selectedConv.contacts?.notes && (
                                        <div className="space-y-1">
                                            <span className="text-muted-foreground">Observações:</span>
                                            <p className="text-[10px] text-zinc-400 bg-zinc-900/50 p-2 rounded-lg leading-relaxed">{selectedConv.contacts.notes}</p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleSimulate}
                                    disabled={simulating}
                                    className="w-full mt-2 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                    {simulating ? (
                                        <>
                                            <Loader2 className="w-4.5 h-4.5 animate-spin" /> Simulando...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4.5 h-4.5" /> Simular Follow-up
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-2 space-y-6">
                        {!selectedConv ? (
                            <div className="bg-zinc-900 border border-border rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                                <Eye className="w-12 h-12 text-zinc-600 mb-3" />
                                <h4 className="text-sm font-bold text-white">Selecione uma conversa</h4>
                                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                                    Selecione um contato na lista lateral para simular qual abordagem inteligente a IA do CRM enviaria.
                                </p>
                            </div>
                        ) : simulating ? (
                            <div className="bg-zinc-900 border border-border rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[300px] space-y-4">
                                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                                <h4 className="text-sm font-bold text-white">Analisando o histórico...</h4>
                                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                                    A IA está mapeando os gatilhos da conversa, detectando a objeção de silêncio e redigindo a melhor abordagem consultiva.
                                </p>
                            </div>
                        ) : simulationResult ? (
                            <div className="space-y-6 animate-fade-in">
                                <div className="bg-zinc-900 border border-border rounded-3xl p-6 space-y-5">
                                    <div className="flex items-center justify-between border-b border-border/40 pb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-0.5 bg-primary/20 text-primary border border-primary/30 text-[9px] font-bold uppercase rounded-md tracking-wider">
                                                Simulação
                                            </span>
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Sem alterações no banco ou envio real
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleSimulate}
                                                className="p-2 hover:bg-zinc-800 rounded-xl text-muted-foreground hover:text-white transition-all flex items-center gap-1 text-xs font-semibold"
                                                title="Gerar novamente"
                                            >
                                                <RefreshCw className="w-4 h-4" /> Gerar Novamente
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedConv(null)
                                                    setSimulationResult(null)
                                                }}
                                                className="p-2 hover:bg-zinc-800/40 rounded-xl text-rose-400/80 hover:text-rose-400 transition-all"
                                                title="Limpar simulação"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Mensagem Proposta</span>
                                        <div className="bg-zinc-950 border border-border/60 p-5 rounded-2xl text-xs text-zinc-100 leading-relaxed relative font-medium">
                                            {simulationResult.generated_message}
                                            <button
                                                onClick={handleCopyMessage}
                                                className="absolute bottom-3 right-3 p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-border rounded-lg text-muted-foreground hover:text-white transition-all"
                                                title="Copiar mensagem"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Objeção / Silêncio</span>
                                            <div className="text-sm font-bold text-white mt-1.5">
                                                {SILENCE_REASONS[simulationResult.silence_reason] || 'Objeção Geral'}
                                            </div>
                                        </div>

                                        <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Estratégia</span>
                                            <div className="text-sm font-bold text-primary mt-1.5 capitalize">
                                                {simulationResult.strategy_used}
                                            </div>
                                        </div>

                                        <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Lead Score</span>
                                            <div className="text-sm font-black text-orange-400 mt-1.5">
                                                {simulationResult.lead_score} pts
                                            </div>
                                        </div>

                                        <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl">
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Confiança IA</span>
                                            <div className="text-sm font-black text-purple-400 mt-1.5">
                                                {simulationResult.confidence}%
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-zinc-900 border border-border rounded-3xl p-6 space-y-4">
                                    <div>
                                        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                            <Brain className="w-4.5 h-4.5 text-primary" /> Raciocínio Lógico da IA
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">Explicações e gatilhos detectados no histórico da conversa.</p>
                                    </div>
                                    <ul className="space-y-2.5 text-xs text-zinc-300">
                                        {simulationResult.reasoning.map((item: string, idx: number) => (
                                            <li key={idx} className="flex items-start gap-2.5 bg-zinc-950/20 p-2.5 rounded-xl border border-border/20">
                                                <span className="text-primary font-bold mt-0.5">•</span>
                                                <span className="leading-normal">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-900 border border-border rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[300px]">
                                <Sparkles className="w-12 h-12 text-primary/40 mb-3 animate-pulse" />
                                <h4 className="text-sm font-bold text-white">Pronto para simulação</h4>
                                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                                    Clique no botão <strong>Simular Follow-up</strong> no painel lateral para rodar a análise de IA.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 4. ABA: CENTRAL DE OPERAÇÕES (Novo Bloco 8) */}
            {activeTab === 'central' && (
                <div className="space-y-6 animate-fade-in">
                    {/* KPIs Superiores */}
                    {loadingOperations && !operations ? (
                        <div className="grid grid-cols-2 md:grid-cols-7 gap-4 animate-pulse">
                            {[1, 2, 3, 4, 5, 6, 7].map(n => (
                                <div key={n} className="bg-zinc-900 border border-border/40 h-24 rounded-2xl" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Na Fila</span>
                                <div className="text-xl font-black text-white mt-1">{operations?.queue?.pending || 0}</div>
                                <p className="text-[8px] text-muted-foreground mt-0.5">Aguardando disparo</p>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Processando</span>
                                <div className="text-xl font-black text-blue-400 mt-1">{operations?.queue?.processing || 0}</div>
                                <p className="text-[8px] text-muted-foreground mt-0.5">IA analisando</p>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Prontas</span>
                                <div className="text-xl font-black text-yellow-400 mt-1">{operations?.queue?.ready || 0}</div>
                                <p className="text-[8px] text-muted-foreground mt-0.5">Aprovadas p/ envio</p>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Enviadas</span>
                                <div className="text-xl font-black text-emerald-400 mt-1">{operations?.queue?.sent || 0}</div>
                                <p className="text-[8px] text-muted-foreground mt-0.5">Sucesso no disparo</p>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Falhas</span>
                                <div className="text-xl font-black text-rose-400 mt-1">{operations?.queue?.failed || 0}</div>
                                <p className="text-[8px] text-muted-foreground mt-0.5">Erros de API/IA</p>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Tempo Médio</span>
                                <div className="text-xl font-black text-purple-400 mt-1">
                                    {operations ? `${(operations.latencies.total_ms / 1000).toFixed(1)}s` : '---'}
                                </div>
                                <p className="text-[8px] text-muted-foreground mt-0.5">Tempo total de ponta</p>
                            </div>

                            <div className="bg-zinc-900 border border-border p-4 rounded-2xl flex flex-col justify-between relative overflow-hidden">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Health Score</span>
                                <div className="text-xl font-black text-primary mt-1">{operations?.health_score?.score || 0}%</div>
                                <p className="text-[8px] text-muted-foreground mt-0.5">{operations?.health_score?.rating || 'Offline'}</p>
                            </div>
                        </div>
                    )}

                    {/* Workers e Latência */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Workers */}
                        <div className="md:col-span-2 bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                            <div>
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <Activity className="w-4.5 h-4.5 text-primary" /> Status dos Workers
                                </h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5">Diagnóstico em tempo real dos serviços em execução.</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Worker: Scheduler */}
                                <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-white">Scheduler</span>
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                            operations?.workers?.scheduler?.status === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                                            operations?.workers?.scheduler?.status === 'idle' ? 'bg-zinc-800 text-zinc-400' :
                                            'bg-rose-500/20 text-rose-400'
                                        }`}>
                                            {operations?.workers?.scheduler?.status || 'offline'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] space-y-1 text-muted-foreground">
                                        <div>Tempo médio: <strong className="text-zinc-200">320ms</strong></div>
                                        <div>Eventos: <strong className="text-zinc-200">{operations?.workers?.scheduler?.items_processed || 0}</strong></div>
                                    </div>
                                </div>

                                {/* Worker: Processor */}
                                <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-white">Processor</span>
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                            operations?.workers?.processor?.status === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                                            operations?.workers?.processor?.status === 'idle' ? 'bg-zinc-800 text-zinc-400' :
                                            'bg-rose-500/20 text-rose-400'
                                        }`}>
                                            {operations?.workers?.processor?.status || 'offline'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] space-y-1 text-muted-foreground">
                                        <div>Tempo médio: <strong className="text-zinc-200">2.1s</strong></div>
                                        <div>Eventos: <strong className="text-zinc-200">{operations?.workers?.processor?.items_processed || 0}</strong></div>
                                    </div>
                                </div>

                                {/* Worker: Sender */}
                                <div className="bg-zinc-950/40 border border-border/40 p-4 rounded-2xl space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-white">Sender</span>
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                            operations?.workers?.sender?.status === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                                            operations?.workers?.sender?.status === 'idle' ? 'bg-zinc-800 text-zinc-400' :
                                            'bg-rose-500/20 text-rose-400'
                                        }`}>
                                            {operations?.workers?.sender?.status || 'offline'}
                                        </span>
                                    </div>
                                    <div className="text-[10px] space-y-1 text-muted-foreground">
                                        <div>Tempo médio: <strong className="text-zinc-200">480ms</strong></div>
                                        <div>Eventos: <strong className="text-zinc-200">{operations?.workers?.sender?.items_processed || 0}</strong></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Latência de Pipeline */}
                        <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                            <div>
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Latência do Fluxo</h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5">Tempo médio gasto por fase no processamento.</p>
                            </div>
                            <div className="space-y-3 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Agendamento</span>
                                    <span className="font-semibold text-white">320 ms</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Processamento IA</span>
                                    <span className="font-semibold text-white">
                                        {operations ? `${(operations.latencies.ia_ms / 1000).toFixed(1)}s` : '2.1s'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Envio</span>
                                    <span className="font-semibold text-white">
                                        {operations ? `${operations.latencies.sender_ms}ms` : '480ms'}
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-border/40 pt-2.5 font-bold">
                                    <span className="text-white">Tempo Total</span>
                                    <span className="text-primary">
                                        {operations ? `${(operations.latencies.total_ms / 1000).toFixed(1)}s` : '2.9s'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Alertas Operacionais */}
                    {operations?.alerts && operations.alerts.length > 0 && (
                        <div className="bg-zinc-900 border border-border p-5 rounded-3xl space-y-4">
                            <div>
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <ShieldIcon className="w-4.5 h-4.5 text-rose-400" /> Alertas Operacionais
                                </h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5">Pendências críticas e desvios de performance identificados.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {operations.alerts.map((alert: any, idx: number) => (
                                    <div key={idx} className="bg-zinc-950/50 border border-border/40 p-4 rounded-2xl flex gap-3">
                                        <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                                            alert.severity === 'alto' ? 'text-rose-500' : 'text-amber-500'
                                        }`} />
                                        <div className="space-y-1 text-xs">
                                            <div className="font-bold text-white flex items-center gap-2">
                                                <span>Alerta de Sistema</span>
                                                <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase ${
                                                    alert.severity === 'alto' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                                                }`}>
                                                    {alert.severity}
                                                </span>
                                            </div>
                                            <p className="text-zinc-300 leading-relaxed">{alert.description}</p>
                                            <p className="text-[10px] text-muted-foreground italic"><strong className="text-primary">Ação: </strong>{alert.action_recommended}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Live Feed */}
                    <div className="bg-zinc-900 border border-border rounded-3xl p-6 overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
                            <div>
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-primary" /> Fila de Operações (Live Feed)
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Acompanhamento e rastreio de até 100 eventos da fila.</p>
                            </div>
                            <button
                                onClick={handleExportCSV}
                                className="px-4 py-2 bg-zinc-950 hover:bg-zinc-900 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-white transition-all flex items-center gap-2 w-fit shrink-0"
                            >
                                <Download className="w-4 h-4" /> Exportar CSV
                            </button>
                        </div>

                        {/* Filtros do Live Feed */}
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mt-5">
                            <input
                                type="text"
                                placeholder="Filtrar por nome, tel, msg..."
                                value={feedSearch}
                                onChange={(e) => setFeedSearch(e.target.value)}
                                className="w-full bg-zinc-950 border border-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />

                            <select
                                value={feedStatusFilter}
                                onChange={(e) => setFeedStatusFilter(e.target.value)}
                                className="bg-zinc-950 border border-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="all">Todos os Status</option>
                                <option value="pending">Aguardando</option>
                                <option value="processing">Processando</option>
                                <option value="ready">Pronto</option>
                                <option value="sent">Enviado</option>
                                <option value="skipped">Ignorado</option>
                                <option value="failed">Falhou</option>
                            </select>

                            <select
                                value={feedAttemptFilter}
                                onChange={(e) => setFeedAttemptFilter(e.target.value)}
                                className="bg-zinc-950 border border-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="all">Todas as Tentativas</option>
                                <option value="1">Tentativa #1</option>
                                <option value="2">Tentativa #2</option>
                                <option value="3">Tentativa #3</option>
                            </select>

                            <select
                                value={feedSilenceFilter}
                                onChange={(e) => setFeedSilenceFilter(e.target.value)}
                                className="bg-zinc-950 border border-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="all">Todos os Silêncios</option>
                                {Object.entries(SILENCE_REASONS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>

                        {/* Tabela do Live Feed */}
                        <div className="mt-6 overflow-x-auto">
                            {filteredLiveFeed.length === 0 ? (
                                <div className="text-center py-12 text-xs text-muted-foreground">Nenhum evento operacional encontrado com os filtros selecionados.</div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-border/40 text-muted-foreground text-xs font-bold">
                                            <th className="pb-3 pr-4">Cliente</th>
                                            <th className="pb-3 pr-4">Telefone</th>
                                            <th className="pb-3 pr-4 text-center">Tentativa</th>
                                            <th className="pb-3 pr-4">Status</th>
                                            <th className="pb-3 pr-4">Horário</th>
                                            <th className="pb-3 pr-4">Silêncio</th>
                                            <th className="pb-3 pr-4">Fase</th>
                                            <th className="pb-3 pr-4">Duração</th>
                                            <th className="pb-3 max-w-xs">Mensagem</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/20 text-xs">
                                        {filteredLiveFeed.map((item: any) => {
                                            const badge = STATUS_BADGES[item.status] || { label: item.status, color: 'bg-zinc-800 text-zinc-400' }
                                            return (
                                                <tr 
                                                    key={item.id} 
                                                    onClick={() => {
                                                        setSelectedAttempt(item)
                                                        setIsDrawerOpen(true)
                                                    }}
                                                    className="text-zinc-300 hover:bg-zinc-950/40 cursor-pointer transition-colors"
                                                >
                                                    <td className="py-3 pr-4 font-semibold text-white">{item.contact_name}</td>
                                                    <td className="py-3 pr-4 text-muted-foreground font-mono">{item.phone}</td>
                                                    <td className="py-3 pr-4 text-center font-bold">#{item.attempt_number}</td>
                                                    <td className="py-3 pr-4">
                                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${badge.color}`}>
                                                            {badge.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 pr-4 text-muted-foreground font-mono">
                                                        {new Date(item.horario).toLocaleTimeString('pt-BR')}
                                                    </td>
                                                    <td className="py-3 pr-4 font-medium text-primary">
                                                        {SILENCE_REASONS[item.silence_reason] || '---'}
                                                    </td>
                                                    <td className="py-3 pr-4 capitalize text-muted-foreground">{item.worker}</td>
                                                    <td className="py-3 pr-4 text-muted-foreground font-mono">{item.tempo_gasto}</td>
                                                    <td className="py-3 max-w-xs truncate text-zinc-400">
                                                        {item.mensagem_resumida || (
                                                            item.error_message ? (
                                                                <span className="text-rose-400 italic">Erro: {item.error_message.slice(0, 40)}...</span>
                                                            ) : <span className="text-zinc-600 italic">Nenhum texto</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 5. ABA: CONFIGURAÇÕES */}
            {activeTab === 'settings' && (
                <div className="bg-zinc-900 border border-border rounded-3xl p-6 md:p-8 space-y-8 animate-fade-in">
                    {/* Alerta de Desativação */}
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

                    {/* Section 4: Target Statuses */}
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
                                <CheckCircle2 className={`w-4.5 h-4.5 shrink-0 ${settings.stop_on_human_takeover ? 'text-primary' : 'text-zinc-600'}`} />
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
                                <CheckCircle2 className={`w-4.5 h-4.5 shrink-0 ${settings.stop_on_sale ? 'text-primary' : 'text-zinc-600'}`} />
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
                                <CheckCircle2 className={`w-4.5 h-4.5 shrink-0 ${settings.stop_on_status_change ? 'text-primary' : 'text-zinc-600'}`} />
                                <div>
                                    <div className="font-semibold">Parar quando status/funil mudar</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">Cancela se o lead mudar de estágio no funil.</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between bg-zinc-950 border border-border/60 p-4 rounded-2xl mt-6">
                        <button
                            onClick={handleRestoreDefaults}
                            className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-white transition-all flex items-center gap-2"
                        >
                            <RotateCcw className="w-4.5 h-4.5" /> Restaurar Padrão
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-xs font-bold text-white shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4.5 h-4.5 animate-spin" /> Salvando...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4.5 h-4.5" /> Salvar Configurações
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* 6. ABA: HISTÓRICO */}
            {activeTab === 'history' && (
                <div className="bg-zinc-900 border border-border rounded-3xl p-6 overflow-hidden animate-fade-in">
                    <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" /> Histórico de Disparos
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Lista detalhada das últimas 50 tentativas de follow-up processadas.</p>
                    </div>

                    <div className="mt-6 overflow-x-auto">
                        {loadingAnalytics ? (
                            <div className="flex h-48 items-center justify-center">
                                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            </div>
                        ) : history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-12">
                                <AlertTriangle className="w-12 h-12 text-zinc-700 mb-3" />
                                <h4 className="text-base font-bold text-white">Nenhum follow-up ainda</h4>
                                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                    Quando suas conversas paradas forem processadas pela automação, o histórico completo aparecerá listado aqui.
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border/40 text-muted-foreground text-xs font-bold">
                                        <th className="pb-3 pr-4">Cliente</th>
                                        <th className="pb-3 pr-4">Telefone</th>
                                        <th className="pb-3 pr-4 text-center">Tentativa</th>
                                        <th className="pb-3 pr-4">Silêncio</th>
                                        <th className="pb-3 pr-4">Status</th>
                                        <th className="pb-3 pr-4 max-w-xs">Mensagem</th>
                                        <th className="pb-3 pr-4">Data</th>
                                        <th className="pb-3 text-right">Resultado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20 text-xs">
                                    {history.map((h) => {
                                        const badge = STATUS_BADGES[h.status] || { label: h.status, color: 'bg-zinc-800 text-zinc-400' }
                                        return (
                                            <tr key={h.id} className="text-zinc-300 hover:bg-zinc-950/20 transition-colors">
                                                <td className="py-3.5 pr-4 font-semibold text-white">{h.contact_name}</td>
                                                <td className="py-3.5 pr-4 text-muted-foreground font-mono">{h.phone}</td>
                                                <td className="py-3.5 pr-4 text-center font-bold">#{h.attempt_number}</td>
                                                <td className="py-3.5 pr-4 font-medium text-primary">
                                                    {SILENCE_REASONS[h.silence_reason] || 'Não identificado'}
                                                </td>
                                                <td className="py-3.5 pr-4">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.color}`}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 pr-4 max-w-xs truncate text-zinc-400" title={h.generated_message}>
                                                    {h.generated_message || <span className="text-zinc-600 italic">Nenhuma mensagem gerada</span>}
                                                </td>
                                                <td className="py-3.5 pr-4 text-muted-foreground">
                                                    {new Date(h.created_at).toLocaleDateString('pt-BR')} {new Date(h.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-3.5 text-right font-bold text-white">{h.result}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* DRAWER LATERAL DE DETALHES (Fase 8) */}
            {isDrawerOpen && selectedAttempt && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-fade-in">
                    <div 
                        className="w-full max-w-lg bg-zinc-900 border-l border-border h-full p-6 flex flex-col justify-between overflow-y-auto relative animate-slide-left shadow-2xl"
                    >
                        {/* Botão de Fechar */}
                        <button 
                            onClick={() => {
                                setIsDrawerOpen(false)
                                setSelectedAttempt(null)
                            }}
                            className="absolute top-5 right-5 p-2 hover:bg-zinc-800 rounded-xl text-muted-foreground hover:text-white transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Conteúdo Principal */}
                        <div className="space-y-6">
                            {/* Título */}
                            <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Detalhamento Operacional</span>
                                <h3 className="text-lg font-black text-white">{selectedAttempt.contact_name}</h3>
                                <p className="text-xs text-muted-foreground font-mono">{selectedAttempt.phone}</p>
                            </div>

                            {/* Informações Gerais */}
                            <div className="bg-zinc-950/50 border border-border/40 p-4.5 rounded-2xl space-y-3 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tentativa:</span>
                                    <span className="font-bold text-white">#{selectedAttempt.attempt_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Status Atual:</span>
                                    <span className="font-bold text-primary capitalize">{selectedAttempt.status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Objeção Detectada:</span>
                                    <span className="font-semibold text-white">
                                        {selectedAttempt.silence_reason ? SILENCE_REASONS[selectedAttempt.silence_reason] || selectedAttempt.silence_reason : '---'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Fase / Worker:</span>
                                    <span className="font-medium text-white capitalize">{selectedAttempt.worker}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tempo de Execução:</span>
                                    <span className="font-mono text-white">{selectedAttempt.tempo_gasto}</span>
                                </div>
                            </div>

                            {/* Mensagem Gerada */}
                            {selectedAttempt.mensagem_resumida && (
                                <div className="space-y-2">
                                    <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Texto do Follow-up</span>
                                    <div className="bg-zinc-950 border border-border/60 p-4 rounded-xl text-xs text-zinc-200 leading-relaxed font-medium">
                                        {selectedAttempt.mensagem_resumida}
                                    </div>
                                </div>
                            )}

                            {/* Erros Operacionais (se houver) */}
                            {selectedAttempt.error_message && (
                                <div className="space-y-2">
                                    <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider text-rose-400">Mensagem de Erro</span>
                                    <div className="bg-rose-500/5 border border-rose-500/20 p-4 rounded-xl text-xs text-rose-300 leading-relaxed font-mono">
                                        {selectedAttempt.error_message}
                                    </div>
                                </div>
                            )}

                            {/* Timeline Operacional */}
                            <div className="space-y-4">
                                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Linha do Tempo (Rastreio)</span>
                                <div className="relative border-l border-border/60 pl-5.5 ml-1.5 space-y-4 text-xs">
                                    <div className="relative">
                                        <span className="absolute -left-7.5 top-0.5 w-3 h-3 rounded-full bg-zinc-500" />
                                        <div className="font-bold text-white">Fila de Agendamento</div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                            Identificado como inativo e adicionado à fila às {new Date(selectedAttempt.horario).toLocaleTimeString('pt-BR')}
                                        </div>
                                    </div>

                                    {(selectedAttempt.status === 'processing' || selectedAttempt.status === 'ready' || selectedAttempt.status === 'sent' || selectedAttempt.status === 'failed') && (
                                        <div className="relative">
                                            <span className="absolute -left-7.5 top-0.5 w-3 h-3 rounded-full bg-blue-500" />
                                            <div className="font-bold text-white">Processamento IA Iniciado</div>
                                            <div className="text-[10px] text-muted-foreground mt-0.5">Análise e tomada de decisão ativada em background</div>
                                        </div>
                                    )}

                                    {(selectedAttempt.status === 'ready' || selectedAttempt.status === 'sent') && (
                                        <div className="relative">
                                            <span className="absolute -left-7.5 top-0.5 w-3 h-3 rounded-full bg-yellow-500" />
                                            <div className="font-bold text-white">Mensagem Gerada e Aprovada</div>
                                            <div className="text-[10px] text-muted-foreground mt-0.5">Texto de abordagem montado e disponível no status ready</div>
                                        </div>
                                    )}

                                    {selectedAttempt.status === 'sent' && (
                                        <div className="relative">
                                            <span className="absolute -left-7.5 top-0.5 w-3 h-3 rounded-full bg-emerald-500" />
                                            <div className="font-bold text-white">Disparado com Sucesso</div>
                                            <div className="text-[10px] text-emerald-400 mt-0.5">
                                                Enviado via Evolution API. Vinculado ao chat e integrado no painel do operador.
                                            </div>
                                        </div>
                                    )}

                                    {selectedAttempt.status === 'failed' && (
                                        <div className="relative">
                                            <span className="absolute -left-7.5 top-0.5 w-3 h-3 rounded-full bg-rose-500" />
                                            <div className="font-bold text-rose-400">Falha no Processamento</div>
                                            <div className="text-[10px] text-rose-400/80 mt-0.5">Serviço interrompido devido a erros na esteira</div>
                                        </div>
                                    )}

                                    {selectedAttempt.status === 'skipped' && (
                                        <div className="relative">
                                            <span className="absolute -left-7.5 top-0.5 w-3 h-3 rounded-full bg-orange-500" />
                                            <div className="font-bold text-orange-400">Ignorado pelo Sistema</div>
                                            <div className="text-[10px] text-orange-400/80 mt-0.5">Lead cancelado por se tornar inelegível nas regras de proteção</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Ações Inferiores do Drawer */}
                        <div className="border-t border-border/40 pt-4 mt-6 flex justify-between">
                            <Link 
                                href={`/dashboard/chat?id=${selectedAttempt.conversation_id}`}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-xs font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <MessageCircle className="w-4.5 h-4.5" /> Abrir Conversa no Chat
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
