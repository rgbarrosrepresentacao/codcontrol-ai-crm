'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
    Phone, PhoneCall, Settings2, Zap, CheckCircle2,
    AlertCircle, Loader2, Shield, Volume2, Clock, ArrowLeft
} from 'lucide-react'
import Link from 'next/link'

export default function LigacaoIAPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)

    // Config
    const [vapiKey, setVapiKey] = useState('')
    const [vapiPhoneId, setVapiPhoneId] = useState('')
    const [vapiEnabled, setVapiEnabled] = useState(false)
    const [vapiStage, setVapiStage] = useState<number>(1)

    // Teste
    const [testPhone, setTestPhone] = useState('')
    const [lastCallId, setLastCallId] = useState<string | null>(null)

    useEffect(() => {
        loadConfig()
    }, [])

    const loadConfig = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin, vapi_api_key, vapi_enabled, vapi_stage, vapi_phone_number_id')
            .eq('id', user.id)
            .single()

        if (!profile?.is_admin) {
            toast.error('Acesso restrito ao administrador')
            router.push('/dashboard')
            return
        }

        setUserId(user.id)
        setVapiKey(profile.vapi_api_key || '')
        setVapiPhoneId(profile.vapi_phone_number_id || '')
        setVapiEnabled(profile.vapi_enabled || false)
        setVapiStage(profile.vapi_stage || 1)
        setLoading(false)
    }

    const handleSave = async () => {
        if (!userId) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    vapi_api_key: vapiKey || null,
                    vapi_phone_number_id: vapiPhoneId || null,
                    vapi_enabled: vapiEnabled,
                    vapi_stage: vapiStage,
                })
                .eq('id', userId)

            if (error) throw error
            toast.success('Configurações salvas com sucesso!')
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleTest = async () => {
        if (!testPhone || testPhone.replace(/\D/g, '').length < 10) {
            toast.error('Digite um número de telefone válido (com DDD)')
            return
        }
        if (!vapiKey) {
            toast.error('Salve sua Vapi API Key antes de testar')
            return
        }

        setTesting(true)
        setLastCallId(null)
        try {
            const res = await fetch('/api/admin/vapi-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: testPhone, userId, vapiPhoneId })
            })

            const text = await res.text()
            let data: any
            try {
                data = JSON.parse(text)
            } catch (e) {
                console.error('Resposta não-JSON da API:', text)
                throw new Error('O servidor retornou uma resposta inválida (não-JSON). Entre em contato com o suporte.')
            }

            if (!res.ok) {
                throw new Error(data.error || data.message || `Erro do servidor (Status ${res.status})`)
            }

            setLastCallId(data.callId)
            toast.success(`✅ Ligação iniciada! ID: ${data.callId}`)
        } catch (err: any) {
            console.error('Erro ao disparar ligação:', err)
            toast.error(err.message || 'Erro inesperado ao disparar ligação')
        } finally {
            setTesting(false)
        }
    }


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/dashboard/admin" className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-400" />
                </Link>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-white">Ligação Automática de IA</h1>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> ADMIN LAB
                        </span>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                        Configure e teste o sistema de follow-up por voz via Vapi.ai
                    </p>
                </div>
            </div>

            {/* Status Banner */}
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${vapiEnabled && vapiKey
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-yellow-500/10 border-yellow-500/30'
                }`}>
                {vapiEnabled && vapiKey ? (
                    <><CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                        <div>
                            <p className="text-green-300 font-medium text-sm">Sistema Ativo</p>
                            <p className="text-green-400/70 text-xs">A IA ligará automaticamente para leads inativos no stage {vapiStage}</p>
                        </div></>
                ) : (
                    <><AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                        <div>
                            <p className="text-yellow-300 font-medium text-sm">Sistema Inativo</p>
                            <p className="text-yellow-400/70 text-xs">Configure a API Key e ative o sistema abaixo</p>
                        </div></>
                )}
            </div>

            {/* Configurações */}
            <div className="card p-6 space-y-6">
                <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                    <Settings2 className="w-4 h-4 text-purple-400" />
                    <h2 className="font-semibold text-white">Configurações</h2>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Vapi API Key (Chave Privada)</label>
                    <input
                        type="password"
                        value={vapiKey}
                        onChange={e => setVapiKey(e.target.value)}
                        placeholder="sk-vapi-..."
                        className="input w-full"
                    />
                    <p className="text-xs text-gray-500">
                        Acesse <a href="https://dashboard.vapi.ai/org/api-keys" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">dashboard.vapi.ai → API Keys</a> → copie a <strong>Chave Privada</strong>
                    </p>
                </div>

                {/* Phone Number ID */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Vapi Phone Number ID</label>
                    <input
                        type="text"
                        value={vapiPhoneId}
                        onChange={e => setVapiPhoneId(e.target.value)}
                        placeholder="ID do número no Vapi (ex: uuid)"
                        className="input w-full"
                    />
                    <p className="text-xs text-gray-500">
                        Acesse <a href="https://dashboard.vapi.ai/phone-numbers" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">dashboard.vapi.ai → Phone Numbers</a> → copie o <strong>ID</strong> do número.
                    </p>
                </div>

                {/* Toggle Ativar */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/20">
                            <Zap className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Ativar Ligações Automáticas</p>
                            <p className="text-xs text-gray-400">O cron disparará ligações em vez de mensagens de texto</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setVapiEnabled(!vapiEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${vapiEnabled ? 'bg-purple-500' : 'bg-white/10'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${vapiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Stage Selector */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Em qual momento a IA deve ligar?
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { stage: 1, label: 'Follow-up 1', desc: '2h sem resposta' },
                            { stage: 2, label: 'Follow-up 2', desc: '6h sem resposta' },
                            { stage: 3, label: 'Follow-up 3', desc: '24h sem resposta' },
                        ].map(opt => (
                            <button
                                key={opt.stage}
                                onClick={() => setVapiStage(opt.stage)}
                                className={`p-3 rounded-xl border text-left transition-all ${vapiStage === opt.stage
                                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                                    }`}
                            >
                                <p className="text-sm font-medium">{opt.label}</p>
                                <p className="text-xs mt-0.5 opacity-70">{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {saving ? 'Salvando...' : 'Salvar Configurações'}
                </button>
            </div>

            {/* Teste Imediato */}
            <div className="card p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                    <PhoneCall className="w-4 h-4 text-green-400" />
                    <h2 className="font-semibold text-white">Testar Agora</h2>
                    <span className="text-xs text-gray-500">— Dispara uma ligação de teste imediatamente</span>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Número para receber a ligação</label>
                    <div className="flex gap-3">
                        <input
                            type="tel"
                            value={testPhone}
                            onChange={e => setTestPhone(e.target.value)}
                            placeholder="11999998888 (com DDD, sem +55)"
                            className="input flex-1"
                        />
                        <button
                            onClick={handleTest}
                            disabled={testing || !vapiKey}
                            className="btn-primary flex items-center gap-2 px-5 whitespace-nowrap"
                        >
                            {testing
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Ligando...</>
                                : <><Phone className="w-4 h-4" /> Ligar Agora</>
                            }
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        Use o seu número pessoal para ver como o cliente vai ouvir a IA.
                    </p>
                </div>

                {lastCallId && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                        <Volume2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-green-300 font-medium text-sm">Ligação em andamento!</p>
                            <p className="text-green-400/70 text-xs mt-1">ID da chamada: <code className="font-mono">{lastCallId}</code></p>
                            <p className="text-green-400/70 text-xs">Acesse <a href="https://dashboard.vapi.ai" target="_blank" rel="noreferrer" className="underline">dashboard.vapi.ai → Registros</a> para ver os detalhes.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-300 leading-relaxed">
                    <strong>Como funciona:</strong> Quando um lead fica inativo pelo tempo configurado, em vez de receber uma mensagem de texto, a IA da Vapi liga para o número do cliente usando a voz da <strong>Paula (ElevenLabs)</strong>. Ao final da ligação, o resultado chega no webhook e é registrado no histórico do chat.
                </p>
            </div>
        </div>
    )
}
