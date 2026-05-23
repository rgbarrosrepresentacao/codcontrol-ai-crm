'use client'
import React, { useState, useEffect, useCallback } from 'react'
import {
    Facebook, Settings, Activity, Zap, Eye, EyeOff, Save, Loader2,
    CheckCircle2, XCircle, AlertCircle, Clock,
    BarChart3, Send, RefreshCw, Shield, Info, ChevronDown, ChevronUp,
    ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tab = 'dashboard' | 'config' | 'eventos' | 'regras'

interface PixelSettings {
    pixelId: string
    capiToken: string
    testEventCode: string
    isActive: boolean
}

interface ConversionEvent {
    id: string
    event_name: string
    status: 'sent' | 'pending' | 'failed' | 'duplicate'
    event_id: string
    pixel_id: string | null
    error_message: string | null
    created_at: string
    sent_at: string | null
    contacts?: { name: string | null; push_name: string | null; phone: string | null } | null
    payload?: any
    response?: any
}

interface DashboardStats {
    totalSent: number
    totalFailed: number
    totalPending: number
    totalValue: number
    matchRate: number
}

function StatusBadge({ status }: { status: ConversionEvent['status'] }) {
    const map = {
        sent:      { label: 'Enviado',    icon: <CheckCircle2 className="w-3 h-3" />, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        failed:    { label: 'Erro',        icon: <XCircle className="w-3 h-3" />,      cls: 'bg-red-500/10 text-red-400 border-red-500/20'             },
        pending:   { label: 'Pendente',   icon: <Clock className="w-3 h-3" />,         cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20'        },
        duplicate: { label: 'Duplicado',  icon: <AlertCircle className="w-3 h-3" />,  cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20'           },
    }
    const cfg = map[status] || map.pending
    return (
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border', cfg.cls)}>
            {cfg.icon} {cfg.label}
        </span>
    )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
    return (
        <div className={cn('rounded-2xl border p-5 space-y-2 relative overflow-hidden', color)}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-3xl font-black text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-current opacity-5" />
        </div>
    )
}

export default function PixelConversionsPage() {
    const [activeTab, setActiveTab] = useState<Tab>('dashboard')
    const [settings, setSettings] = useState<PixelSettings>({ pixelId: '', capiToken: '', testEventCode: '', isActive: true })
    const [showToken, setShowToken] = useState(false)
    const [savingSettings, setSavingSettings] = useState(false)
    const [settingsLoaded, setSettingsLoaded] = useState(false)
    const [testingEvent, setTestingEvent] = useState(false)
    const [events, setEvents] = useState<ConversionEvent[]>([])
    const [loadingEvents, setLoadingEvents] = useState(false)
    const [stats, setStats] = useState<DashboardStats>({ totalSent: 0, totalFailed: 0, totalPending: 0, totalValue: 0, matchRate: 0 })
    const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

    // Load settings
    useEffect(() => {
        async function load() {
            try {
                const res = await fetch('/api/pixel/settings')
                const data = await res.json()
                if (data.settings) {
                    setSettings({
                        pixelId: data.settings.pixelId || '',
                        capiToken: data.settings.capiToken || '',
                        testEventCode: data.settings.testEventCode || '',
                        isActive: data.settings.isActive !== false,
                    })
                }
            } catch (err) {
                console.error('Error loading pixel settings:', err)
            } finally {
                setSettingsLoaded(true)
            }
        }
        load()
    }, [])

    const loadEvents = useCallback(async () => {
        setLoadingEvents(true)
        try {
            const res = await fetch('/api/pixel/events')
            const data = await res.json()
            const evts: ConversionEvent[] = data.events || []
            setEvents(evts)

            // Compute dashboard stats
            const sent = evts.filter(e => e.status === 'sent').length
            const failed = evts.filter(e => e.status === 'failed').length
            const pending = evts.filter(e => e.status === 'pending').length
            const matchRate = evts.length > 0 ? Math.round((sent / evts.length) * 100) : 0
            setStats({ totalSent: sent, totalFailed: failed, totalPending: pending, totalValue: 0, matchRate })
        } catch (err) {
            console.error('Error loading events:', err)
        } finally {
            setLoadingEvents(false)
        }
    }, [])

    useEffect(() => {
        if (activeTab === 'eventos' || activeTab === 'dashboard') {
            loadEvents()
        }
    }, [activeTab, loadEvents])

    async function handleSaveSettings() {
        if (!settings.pixelId) { toast.error('Pixel ID é obrigatório'); return }
        if (!settings.capiToken) { toast.error('Access Token CAPI é obrigatório'); return }
        setSavingSettings(true)
        try {
            const res = await fetch('/api/pixel/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pixelId: settings.pixelId,
                    capiToken: settings.capiToken,
                    testEventCode: settings.testEventCode || null,
                    isActive: settings.isActive,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            toast.success('✅ Configurações salvas com segurança!')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar configurações')
        } finally {
            setSavingSettings(false)
        }
    }

    async function handleTestEvent() {
        setTestingEvent(true)
        try {
            const res = await fetch('/api/pixel/test', { method: 'POST' })
            const data = await res.json()
            if (!res.ok || !data.success) throw new Error(data.error || 'Teste falhou')
            toast.success(`✅ ${data.message}`)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao testar evento')
        } finally {
            setTestingEvent(false)
        }
    }

    const hasConfig = !!settings.pixelId && !!settings.capiToken

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'dashboard', label: 'Dashboard',    icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'config',    label: 'Configuração',  icon: <Settings className="w-4 h-4" />  },
        { id: 'eventos',   label: 'Eventos',       icon: <Activity className="w-4 h-4" />  },
        { id: 'regras',    label: 'Regras',         icon: <Zap className="w-4 h-4" />      },
    ]

    return (
        <div className="min-h-screen p-6 md:p-8 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                            <Facebook className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-foreground tracking-tight">Pixel & Conversões</h1>
                            <p className="text-sm text-muted-foreground">Meta Conversions API — rastreamento de vendas</p>
                        </div>
                    </div>
                </div>
                {/* Status badge */}
                <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border',
                    hasConfig
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-secondary border-border text-muted-foreground'
                )}>
                    <div className={cn('w-2 h-2 rounded-full', hasConfig ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/40')} />
                    {hasConfig ? 'Pixel Configurado' : 'Não configurado'}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-secondary/40 p-1 rounded-2xl border border-border/40 w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                            activeTab === tab.id
                                ? 'bg-background text-foreground shadow-sm border border-border/40'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {tab.icon}
                        <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Dashboard Tab ── */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard label="Enviados ao Facebook" value={stats.totalSent} sub="eventos Purchase" color="border-emerald-500/20 bg-emerald-500/5" />
                        <StatCard label="Erros" value={stats.totalFailed} sub="precisam de atenção" color="border-red-500/20 bg-red-500/5" />
                        <StatCard label="Pendentes" value={stats.totalPending} sub="sem pixel configurado" color="border-amber-500/20 bg-amber-500/5" />
                        <StatCard label="Match Rate" value={`${stats.matchRate}%`} sub="taxa de paridade CAPI" color="border-blue-500/20 bg-blue-500/5" />
                    </div>

                    {/* Recent events preview */}
                    <div className="bg-card border border-border rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                            <h2 className="font-bold text-sm flex items-center gap-2">
                                <Activity className="w-4 h-4 text-primary" />
                                Últimos Eventos
                            </h2>
                            <button
                                onClick={() => setActiveTab('eventos')}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                Ver todos <ExternalLink className="w-3 h-3" />
                            </button>
                        </div>
                        {loadingEvents ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            </div>
                        ) : events.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                                <Activity className="w-10 h-10 opacity-20" />
                                <p className="text-sm font-medium">Nenhum evento registrado ainda</p>
                                <p className="text-xs opacity-60">Marque uma venda no Chat ao Vivo para ver os eventos aqui</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/40">
                                {events.slice(0, 5).map(evt => (
                                    <div key={evt.id} className="px-5 py-3 flex items-center gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate">
                                                {evt.contacts?.name || evt.contacts?.push_name || evt.contacts?.phone || 'Lead'}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{evt.event_name} · {new Date(evt.created_at).toLocaleDateString('pt-BR')}</p>
                                        </div>
                                        <StatusBadge status={evt.status} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Info box */}
                    {!hasConfig && (
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-blue-300">Configure seu Pixel para começar</p>
                                <p className="text-xs text-blue-400/70 mt-0.5">
                                    Acesse a aba <strong>Configuração</strong> e insira seu Pixel ID e Access Token CAPI para ativar o rastreamento de conversões.
                                </p>
                                <button onClick={() => setActiveTab('config')} className="mt-2 text-xs text-blue-400 hover:underline font-semibold">
                                    Ir para Configuração →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Config Tab ── */}
            {activeTab === 'config' && (
                <div className="max-w-2xl space-y-6">
                    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                                <Facebook className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="font-bold text-sm">Configuração do Facebook Pixel</h2>
                                <p className="text-xs text-muted-foreground">Acesse o Gerenciador de Eventos da Meta para obter esses dados</p>
                            </div>
                        </div>

                        {/* Pixel ID */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pixel ID</label>
                            <input
                                value={settings.pixelId}
                                onChange={e => setSettings(s => ({ ...s, pixelId: e.target.value }))}
                                placeholder="Ex: 1234567890123456"
                                className="w-full bg-background border border-border/60 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all placeholder:text-muted-foreground/50"
                            />
                            <p className="text-xs text-muted-foreground">Encontre em: Gerenciador de Eventos → Seu Pixel → Configurações</p>
                        </div>

                        {/* Access Token CAPI */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Shield className="w-3 h-3 text-emerald-400" /> Access Token CAPI
                            </label>
                            <div className="relative">
                                <input
                                    type={showToken ? 'text' : 'password'}
                                    value={settings.capiToken}
                                    onChange={e => setSettings(s => ({ ...s, capiToken: e.target.value }))}
                                    placeholder="Cole seu token de acesso aqui"
                                    className="w-full bg-background border border-border/60 rounded-xl px-4 py-3 pr-12 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all placeholder:text-muted-foreground/50"
                                />
                                <button
                                    onClick={() => setShowToken(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                ⚠️ O token é salvo <strong>criptografado</strong> no banco e nunca retornado ao frontend completo.
                            </p>
                        </div>

                        {/* Test Event Code */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Test Event Code <span className="text-muted-foreground/40 font-normal">(opcional)</span>
                            </label>
                            <input
                                value={settings.testEventCode}
                                onChange={e => setSettings(s => ({ ...s, testEventCode: e.target.value }))}
                                placeholder="Ex: TEST12345"
                                className="w-full bg-background border border-border/60 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all placeholder:text-muted-foreground/50"
                            />
                            <p className="text-xs text-muted-foreground">Usado para testar eventos no Gerenciador de Eventos sem afetar dados de produção.</p>
                        </div>

                        {/* Active toggle */}
                        <div
                            onClick={() => setSettings(s => ({ ...s, isActive: !s.isActive }))}
                            className={cn(
                                'flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all',
                                settings.isActive ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-secondary/30 border-border/40'
                            )}
                        >
                            <div className={cn(
                                'w-10 h-6 rounded-full transition-all relative flex-shrink-0',
                                settings.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                            )}>
                                <div className={cn(
                                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all',
                                    settings.isActive ? 'left-5' : 'left-1'
                                )} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold">{settings.isActive ? 'Integração Ativa' : 'Integração Inativa'}</p>
                                <p className="text-xs text-muted-foreground">{settings.isActive ? 'Eventos serão enviados ao Facebook' : 'Nenhum evento será disparado'}</p>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleSaveSettings}
                                disabled={savingSettings || !settingsLoaded}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-sm transition-all disabled:opacity-60 shadow-lg shadow-blue-500/20"
                            >
                                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Salvar Configurações
                            </button>
                            <button
                                onClick={handleTestEvent}
                                disabled={testingEvent || !hasConfig}
                                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border/60 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-40"
                                title={!hasConfig ? 'Salve as configurações antes de testar' : 'Enviar evento de teste'}
                            >
                                {testingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Testar
                            </button>
                        </div>
                    </div>

                    {/* Security note */}
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15">
                        <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-emerald-400/80 space-y-1">
                            <p className="font-bold text-emerald-400">Segurança & Privacidade</p>
                            <p>• O Access Token é <strong>criptografado com AES-256-CBC</strong> antes de ser salvo.</p>
                            <p>• Dados do cliente (telefone, nome, email) são hashados com <strong>SHA-256</strong> antes do envio.</p>
                            <p>• O token completo nunca é exposto no frontend.</p>
                            <p>• RLS (Row Level Security) garante isolamento total entre contas.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Eventos Tab ── */}
            {activeTab === 'eventos' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Log de Eventos CAPI</h2>
                        <button
                            onClick={loadEvents}
                            disabled={loadingEvents}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-secondary"
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', loadingEvents && 'animate-spin')} />
                            Atualizar
                        </button>
                    </div>

                    {loadingEvents ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4 bg-card border border-border rounded-2xl">
                            <Activity className="w-12 h-12 opacity-20" />
                            <div className="text-center">
                                <p className="font-semibold text-foreground/60">Nenhum evento registrado</p>
                                <p className="text-xs mt-1 opacity-60">Os eventos aparecerão aqui quando você marcar uma venda no Chat ao Vivo</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-card border border-border rounded-2xl overflow-hidden">
                            <div className="divide-y divide-border/40">
                                {events.map(evt => (
                                    <div key={evt.id} className="group">
                                        <div
                                            className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                                            onClick={() => setExpandedEvent(expandedEvent === evt.id ? null : evt.id)}
                                        >
                                            {/* Event type dot */}
                                            <div className={cn(
                                                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black',
                                                evt.event_name === 'Purchase' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                                            )}>
                                                {evt.event_name === 'Purchase' ? '$' : 'L'}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-semibold truncate">
                                                        {evt.contacts?.name || evt.contacts?.push_name || evt.contacts?.phone || '—'}
                                                    </p>
                                                    <span className="text-xs text-muted-foreground flex-shrink-0">{evt.event_name}</span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(evt.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </span>
                                                    {evt.error_message && (
                                                        <span className="text-xs text-red-400 truncate max-w-[200px]">{evt.error_message}</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <StatusBadge status={evt.status} />
                                                {expandedEvent === evt.id
                                                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                                }
                                            </div>
                                        </div>

                                        {/* Expanded payload */}
                                        {expandedEvent === evt.id && (
                                            <div className="px-5 pb-4 space-y-3 border-t border-border/40 bg-secondary/10">
                                                <div className="pt-3 grid grid-cols-2 gap-3 text-xs">
                                                    <div>
                                                        <p className="text-muted-foreground font-semibold mb-1">Event ID</p>
                                                        <p className="font-mono text-foreground/80 break-all">{evt.event_id}</p>
                                                    </div>
                                                    {evt.pixel_id && (
                                                        <div>
                                                            <p className="text-muted-foreground font-semibold mb-1">Pixel ID</p>
                                                            <p className="font-mono text-foreground/80">{evt.pixel_id}</p>
                                                        </div>
                                                    )}
                                                    {evt.sent_at && (
                                                        <div>
                                                            <p className="text-muted-foreground font-semibold mb-1">Enviado em</p>
                                                            <p className="text-foreground/80">{new Date(evt.sent_at).toLocaleString('pt-BR')}</p>
                                                        </div>
                                                    )}
                                                </div>
                                                {evt.response && (
                                                    <div>
                                                        <p className="text-xs text-muted-foreground font-semibold mb-1">Resposta do Facebook</p>
                                                        <pre className="text-[10px] font-mono bg-background rounded-lg p-3 border border-border/40 overflow-x-auto text-foreground/70 max-h-32">
                                                            {JSON.stringify(evt.response, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Regras Tab ── */}
            {activeTab === 'regras' && (
                <div className="max-w-2xl space-y-4">
                    <p className="text-sm text-muted-foreground">Entenda como o sistema dispara eventos para o Facebook automaticamente.</p>

                    {[
                        {
                            icon: '✋',
                            title: 'Gatilho Manual — Marcar Venda',
                            desc: 'Operador clica em "Marcar Venda / Fechado" no Chat ao Vivo e confirma os dados da venda.',
                            trigger: 'Botão "Marcar Venda"',
                            event: 'Purchase',
                            status: 'ativo',
                            color: 'border-emerald-500/20 bg-emerald-500/5',
                            badge: 'bg-emerald-500/10 text-emerald-400',
                        },
                        {
                            icon: '🚫',
                            title: 'Cancelamento — Sem Envio',
                            desc: 'Se a tag do lead for alterada para CANCELADO, nenhum evento de Purchase é disparado.',
                            trigger: 'Tag CANCELADO',
                            event: 'Nenhum',
                            status: 'ativo',
                            color: 'border-red-500/20 bg-red-500/5',
                            badge: 'bg-red-500/10 text-red-400',
                        },
                        {
                            icon: '🤖',
                            title: 'Gatilho por Funil (Kanban) — Em Breve',
                            desc: 'Quando um lead for movido para a coluna "Fechado" no Kanban, disparar automaticamente um evento Purchase.',
                            trigger: 'Kanban → Fechado',
                            event: 'Purchase',
                            status: 'em breve',
                            color: 'border-border/40 bg-secondary/20',
                            badge: 'bg-secondary text-muted-foreground',
                        },
                        {
                            icon: '🧠',
                            title: 'Detecção de Intenção por IA — Em Breve',
                            desc: 'IA detecta frases como "quero pagar", "me manda o pix", "confirmado" e sugere marcar a venda.',
                            trigger: 'IA detecta intenção',
                            event: 'Sugestão (humano confirma)',
                            status: 'em breve',
                            color: 'border-border/40 bg-secondary/20',
                            badge: 'bg-secondary text-muted-foreground',
                        },
                    ].map((rule, i) => (
                        <div key={i} className={cn('rounded-2xl border p-5 space-y-3', rule.color)}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{rule.icon}</span>
                                    <div>
                                        <h3 className="font-bold text-sm">{rule.title}</h3>
                                        <p className="text-xs text-muted-foreground mt-0.5">{rule.desc}</p>
                                    </div>
                                </div>
                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0', rule.badge)}>
                                    {rule.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Zap className="w-3 h-3" />
                                    <span><strong className="text-foreground">Gatilho:</strong> {rule.trigger}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Send className="w-3 h-3" />
                                    <span><strong className="text-foreground">Evento:</strong> {rule.event}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
