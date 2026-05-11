'use client'

import { useState, useEffect } from 'react'
import {
    Smartphone, ShieldCheck, AlertCircle, CheckCircle2,
    Eye, EyeOff, Copy, RefreshCw, Loader2, ExternalLink,
    Info, Wifi, WifiOff, Clock
} from 'lucide-react'
import { toast } from 'sonner'

interface MetaConfigData {
    configured: boolean
    has_token?: boolean
    meta_status?: 'disconnected' | 'verified' | 'error'
    meta_last_error?: string | null
    meta_last_webhook_at?: string | null
    meta_config?: {
        waba_id: string
        phone_number_id: string
        business_id?: string
        verify_token: string
    }
    updated_at?: string
}

export default function MetaApiOficialPage() {
    const [config, setConfig] = useState<MetaConfigData | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [showToken, setShowToken] = useState(false)

    const [form, setForm] = useState({
        waba_id: '',
        phone_number_id: '',
        business_id: '',
        verify_token: '',
        access_token: '',
    })

    const webhookUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/api/whatsapp/meta/webhook`
        : '/api/whatsapp/meta/webhook'

    useEffect(() => { fetchConfig() }, [])

    async function fetchConfig() {
        setLoading(true)
        try {
            const res = await fetch('/api/whatsapp/meta/config')
            const data = await res.json()
            setConfig(data)
            if (data.configured && data.meta_config) {
                setForm(prev => ({
                    ...prev,
                    waba_id:        data.meta_config.waba_id || '',
                    phone_number_id: data.meta_config.phone_number_id || '',
                    business_id:    data.meta_config.business_id || '',
                    verify_token:   data.meta_config.verify_token || '',
                    access_token:   data.access_token || '',
                }))
            }
        } catch {
            toast.error('Erro ao carregar configurações')
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        if (!form.waba_id || !form.phone_number_id || !form.verify_token || !form.access_token) {
            toast.error('Preencha todos os campos obrigatórios (WABA ID, Phone ID, Verify Token e Access Token)')
            return
        }
        setSaving(true)
        try {
            const res = await fetch('/api/whatsapp/meta/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json()
            if (res.ok) {
                toast.success('✅ Configuração salva com sucesso!')
                setForm(prev => ({ ...prev, access_token: '' }))
                await fetchConfig()
            } else {
                toast.error(data.error || 'Erro ao salvar')
            }
        } catch {
            toast.error('Erro de conexão')
        } finally {
            setSaving(false)
        }
    }

    async function handleTest() {
        setTesting(true)
        try {
            const res = await fetch('/api/whatsapp/meta/test', { method: 'POST' })
            const data = await res.json()
            if (data.success) {
                toast.success(data.message)
                await fetchConfig()
            } else {
                toast.error(data.error || 'Falha na validação')
                await fetchConfig()
            }
        } catch {
            toast.error('Erro ao testar conexão')
        } finally {
            setTesting(false)
        }
    }

    function copyToClipboard(text: string, label: string) {
        navigator.clipboard.writeText(text)
        toast.success(`${label} copiado!`)
    }

    function generateVerifyToken() {
        const token = 'CODCTRL_' + Math.random().toString(36).substring(2, 14).toUpperCase()
        setForm(prev => ({ ...prev, verify_token: token }))
    }

    const statusMap = {
        verified:     { label: 'Conectado',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: Wifi },
        disconnected: { label: 'Desconectado', color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20',  Icon: WifiOff },
        error:        { label: 'Erro',         color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         Icon: AlertCircle },
    }
    const status = statusMap[config?.meta_status || 'disconnected']

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                            <Smartphone className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">WhatsApp API Oficial</h1>
                            <p className="text-sm text-muted-foreground">Integração com a API Oficial da Meta (Cloud API)</p>
                        </div>
                    </div>
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-1 rounded-lg border border-amber-500/30 font-black">
                    ADMIN ONLY
                </span>
            </div>

            {/* Status Card */}
            {config?.configured && (
                <div className={`flex items-center justify-between p-4 rounded-xl border ${status.bg}`}>
                    <div className="flex items-center gap-3">
                        <status.Icon className={`w-5 h-5 ${status.color}`} />
                        <div>
                            <p className={`text-sm font-semibold ${status.color}`}>{status.label}</p>
                            {config.meta_last_error && (
                                <p className="text-xs text-red-400 mt-0.5">{config.meta_last_error}</p>
                            )}
                            {config.meta_last_webhook_at && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Último webhook: {new Date(config.meta_last_webhook_at).toLocaleString('pt-BR')}
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleTest}
                        disabled={testing}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Testar Conexão
                    </button>
                </div>
            )}

            {/* Webhook Info Card */}
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-3">
                <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <p className="text-sm font-semibold text-blue-400">Dados para o Painel da Meta</p>
                </div>
                <p className="text-xs text-muted-foreground">
                    Cole estes valores na Etapa 2 do seu app em <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">developers.facebook.com</a>
                </p>
                <div className="space-y-2">
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">URL de Retorno de Chamada (Webhook URL)</p>
                        <div className="flex items-center gap-2 p-3 bg-card rounded-lg border border-border">
                            <code className="text-xs text-primary flex-1 break-all">{webhookUrl}</code>
                            <button onClick={() => copyToClipboard(webhookUrl, 'URL')} className="text-muted-foreground hover:text-foreground transition-colors">
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {form.verify_token && (
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Verificar Token</p>
                            <div className="flex items-center gap-2 p-3 bg-card rounded-lg border border-border">
                                <code className="text-xs text-emerald-400 flex-1">{form.verify_token}</code>
                                <button onClick={() => copyToClipboard(form.verify_token, 'Token')} className="text-muted-foreground hover:text-foreground transition-colors">
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Formulário de Configuração */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Credenciais da Meta
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* WABA ID */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">WABA ID <span className="text-red-400">*</span></label>
                        <input
                            type="text"
                            value={form.waba_id}
                            onChange={e => setForm(p => ({ ...p, waba_id: e.target.value }))}
                            placeholder="Ex: 123456789012345"
                            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                        />
                        <p className="text-[10px] text-muted-foreground">WhatsApp Business Account ID</p>
                    </div>

                    {/* Phone Number ID */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Phone Number ID <span className="text-red-400">*</span></label>
                        <input
                            type="text"
                            value={form.phone_number_id}
                            onChange={e => setForm(p => ({ ...p, phone_number_id: e.target.value }))}
                            placeholder="Ex: 987654321098765"
                            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                        />
                        <p className="text-[10px] text-muted-foreground">ID do número registrado na Meta</p>
                    </div>

                    {/* Business ID */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Business ID <span className="text-muted-foreground">(opcional)</span></label>
                        <input
                            type="text"
                            value={form.business_id}
                            onChange={e => setForm(p => ({ ...p, business_id: e.target.value }))}
                            placeholder="Ex: 111222333444555"
                            className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>

                    {/* Verify Token */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Verify Token <span className="text-red-400">*</span></label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={form.verify_token}
                                onChange={e => setForm(p => ({ ...p, verify_token: e.target.value }))}
                                placeholder="Sua senha secreta do webhook"
                                className="flex-1 px-3 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                            />
                            <button
                                onClick={generateVerifyToken}
                                title="Gerar token aleatório"
                                className="px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Use o mesmo valor no campo "Verificar Token" da Meta</p>
                    </div>
                </div>

                {/* Access Token — campo full width */}
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                        Permanent Access Token <span className="text-red-400">*</span>
                        {config?.has_token && (
                            <span className="ml-2 text-emerald-400 text-[10px]">✅ Token salvo (deixe em branco para manter)</span>
                        )}
                    </label>
                    <div className="relative">
                        <input
                            type={showToken ? 'text' : 'password'}
                            value={form.access_token}
                            onChange={e => setForm(p => ({ ...p, access_token: e.target.value }))}
                            placeholder={config?.has_token ? '••••••••••••••••••••••• (manter atual)' : 'Cole seu token permanente aqui'}
                            className="w-full px-3 py-2.5 pr-10 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors font-mono"
                        />
                        <button
                            onClick={() => setShowToken(p => !p)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Criptografado com AES-256. Nunca exposto após salvo.
                    </p>
                </div>

                {/* Botões */}
                <div className="flex items-center justify-between pt-2">
                    <a
                        href="https://developers.facebook.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" />
                        Abrir Painel da Meta
                    </a>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-black text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {saving ? 'Salvando...' : 'Salvar Configuração'}
                    </button>
                </div>
            </div>

            {/* Guia de Configuração */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">📋 Guia Rápido de Configuração</h2>
                <ol className="space-y-3">
                    {[
                        { step: '1', text: 'Acesse developers.facebook.com e crie um App do tipo "Business".' },
                        { step: '2', text: 'Em "Produtos", adicione o WhatsApp. Registre seu número de telefone.' },
                        { step: '3', text: 'Copie o WABA ID, Phone Number ID e gere um Token Permanente.' },
                        { step: '4', text: 'Preencha e salve as credenciais acima.' },
                        { step: '5', text: 'Na Etapa 2 do app da Meta, cole a URL do Webhook e o Verify Token.' },
                        { step: '6', text: 'Clique em "Verificar e Salvar" no painel da Meta, depois em "Testar Conexão" aqui.' },
                    ].map(({ step, text }) => (
                        <li key={step} className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0 mt-0.5">
                                {step}
                            </span>
                            <p className="text-sm text-muted-foreground">{text}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    )
}
