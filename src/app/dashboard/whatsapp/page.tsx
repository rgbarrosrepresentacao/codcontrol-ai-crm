'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Smartphone, Plus, QrCode, Trash2, RefreshCw, CheckCircle2, Loader2, Wifi, WifiOff, X } from 'lucide-react'
import { generateInstanceName, cn } from '@/lib/utils'
import Image from 'next/image'

interface Instance {
    id: string
    instance_name: string
    display_name: string | null
    status: string
    phone_number: string | null
    webhook_configured: boolean
    messages_received: number
    messages_sent: number
    provider_type?: 'EVOLUTION' | 'META'
}

export default function WhatsAppPage() {
    const router = useRouter()
    const [instances, setInstances] = useState<Instance[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [displayName, setDisplayName] = useState('')
    const [showCreate, setShowCreate] = useState(false)
    const [qrModal, setQrModal] = useState<{ instance: string; qr: string } | null>(null)
    const [checkingStatus, setCheckingStatus] = useState<string | null>(null)
    const [connectionType, setConnectionType] = useState<'evolution' | 'meta'>('evolution')

    const fetchInstances = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from('whatsapp_instances').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
        setInstances(data || [])
        setLoading(false)
    }, [])

    useEffect(() => { fetchInstances() }, [fetchInstances])

    const createInstance = async () => {
        if (connectionType === 'meta') {
            setShowCreate(false)
            router.push('/dashboard/admin/meta-api')
            return
        }

        if (!displayName.trim()) { toast.error('Digite um nome para a instância'); return }
        setCreating(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const res = await fetch('/api/whatsapp/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: displayName.trim() }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao criar instância')

            toast.success('Instância criada! Escaneie o QR Code.')
            setShowCreate(false)
            setDisplayName('')

            // Meta Pixel: Track Custom Event
            if (typeof window !== 'undefined' && (window as any).fbq) {
                (window as any).fbq('trackCustom', 'WhatsApp_CreateInstance', { display_name: displayName.trim() })
            }

            await fetchInstances()

            if (data.qrCode) {
                setQrModal({ instance: data.instanceName, qr: data.qrCode })
            } else {
                // fetch qr code
                await showQrCode(data.instanceName)
            }
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setCreating(false)
        }
    }

    const showQrCode = async (instanceName: string) => {
        try {
            const res = await fetch(`/api/whatsapp/qrcode?instance=${instanceName}`)
            const data = await res.json()
            if (data.qrCode) {
                setQrModal({ instance: instanceName, qr: data.qrCode })
            } else {
                toast.warning('QR Code não disponível. Aguarde alguns segundos.')
            }
        } catch {
            toast.error('Erro ao buscar QR Code')
        }
    }

    const checkStatus = async (instanceName: string, instanceId: string) => {
        setCheckingStatus(instanceId)
        try {
            const res = await fetch(`/api/whatsapp/status?instance=${instanceName}`)
            const data = await res.json()
            const newStatus = data.status || 'disconnected'
            await supabase.from('whatsapp_instances').update({ status: newStatus, phone_number: data.phone || null }).eq('id', instanceId)
            await fetchInstances()
            if (newStatus === 'connected') {
                toast.success('WhatsApp conectado com sucesso!')

                // Meta Pixel: Track Custom Event
                if (typeof window !== 'undefined' && (window as any).fbq) {
                    (window as any).fbq('trackCustom', 'WhatsApp_ConnectSuccess', { instance: instanceName })
                }

                setQrModal(null)
            } else {
                toast.info(`Status: ${newStatus}`)
            }
        } catch {
            toast.error('Erro ao verificar status')
        } finally {
            setCheckingStatus(null)
        }
    }

    const deleteInstance = async (instanceName: string, instanceId: string) => {
        if (!confirm('Tem certeza que deseja remover esta instância? Todos os dados vinculados a ela serão apagados para liberar espaço no seu plano.')) return
        
        const loadingToast = toast.loading('Removendo instância e limpando dados...')
        
        try {
            // Agora a nossa API interna cuida de TUDO: Evolution e Banco de Dados (Supabase)
            const res = await fetch(`/api/whatsapp/delete?instance=${instanceName}`, { 
                method: 'DELETE' 
            })
            
            const data = await res.json()
            
            if (!res.ok) {
                throw new Error(data.error || 'Erro ao remover instância no servidor')
            }

            toast.success('Instância e dados removidos com sucesso!', { id: loadingToast })
            await fetchInstances() // Atualiza a lista para liberar a criação de nova instância
        } catch (err: any) {
            console.error('Erro ao deletar:', err)
            toast.error(`Falha ao remover: ${err.message}`, { id: loadingToast })
        }
    }

    const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
        connected: { label: 'Conectado', color: 'text-emerald-400', icon: <Wifi className="w-4 h-4 text-emerald-400" /> },
        disconnected: { label: 'Desconectado', color: 'text-muted-foreground', icon: <WifiOff className="w-4 h-4 text-muted-foreground" /> },
        qr_code: { label: 'Aguardando QR', color: 'text-yellow-400', icon: <QrCode className="w-4 h-4 text-yellow-400" /> },
        connecting: { label: 'Conectando...', color: 'text-blue-400', icon: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" /> },
    }

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Smartphone className="w-6 h-6 text-primary" />WhatsApp
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Gerencie suas conexões de WhatsApp</p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="gradient-primary text-black font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 text-sm"
                >
                    <Plus className="w-4 h-4" />Nova conexão
                </button>
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="gradient-card border border-border rounded-2xl p-6 w-full max-w-md animate-slide-up">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-foreground">Nova instância WhatsApp</h2>
                            <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setConnectionType('evolution')}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center",
                                        connectionType === 'evolution' 
                                            ? "bg-primary/10 border-primary text-primary" 
                                            : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30"
                                    )}
                                >
                                    <QrCode className="w-5 h-5" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold">QR Code</span>
                                        <span className="text-[10px] opacity-70">Evolution API</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setConnectionType('meta')}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center",
                                        connectionType === 'meta' 
                                            ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" 
                                            : "bg-secondary/50 border-border text-muted-foreground hover:border-emerald-500/30"
                                    )}
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold">API Oficial</span>
                                        <span className="text-[10px] opacity-70">Meta Business</span>
                                    </div>
                                </button>
                            </div>

                            {connectionType === 'evolution' ? (
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1.5">Nome da instância</label>
                                    <input
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Ex: Atendimento, Vendas..."
                                        className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && createInstance()}
                                    />
                                    <div className="mt-3 bg-primary/10 border border-primary/20 rounded-lg p-3 text-xs text-muted-foreground">
                                        <p className="text-primary font-medium mb-1">Passo a passo:</p>
                                        <ol className="list-decimal list-inside space-y-0.5">
                                            <li>Crie a instância e aguarde o QR</li>
                                            <li>Escaneie com seu celular físico</li>
                                            <li>Pronto! IA ativa no seu número</li>
                                        </ol>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-muted-foreground">
                                    <p className="text-emerald-400 font-medium mb-1">Vantagens da API Oficial:</p>
                                    <ul className="list-disc list-inside space-y-0.5">
                                        <li>Conexão 100% estável (sem queda)</li>
                                        <li>Permitido pela Meta (Oficial)</li>
                                        <li>Sem risco de banimento por conexão</li>
                                        <li>Suporte a múltiplos números</li>
                                    </ul>
                                    <p className="mt-2 opacity-70 italic">* Requer conta de desenvolvedor Facebook.</p>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button onClick={() => setShowCreate(false)} className="flex-1 border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-secondary transition-colors text-sm">Cancelar</button>
                                <button 
                                    onClick={createInstance} 
                                    disabled={creating} 
                                    className={cn(
                                        "flex-1 font-semibold py-2.5 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60",
                                        connectionType === 'meta' ? "bg-emerald-500 text-white" : "gradient-primary text-black"
                                    )}
                                >
                                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {connectionType === 'meta' ? 'Ir para Configuração' : (creating ? 'Criando...' : 'Criar e conectar')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* QR Modal */}
            {qrModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="gradient-card border border-border rounded-2xl p-6 w-full max-w-sm text-center animate-slide-up">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-foreground">Escaneie o QR Code</h2>
                            <button onClick={() => setQrModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-muted-foreground text-sm mb-4">Abra o WhatsApp → Aparelhos Conectados → Conectar Aparelho</p>
                        <div className="bg-white p-3 rounded-xl inline-block mb-4">
                            {qrModal.qr.startsWith('data:image') ? (
                                <img src={qrModal.qr} alt="QR Code" className="w-56 h-56" />
                            ) : (
                                <img src={`data:image/png;base64,${qrModal.qr}`} alt="QR Code" className="w-56 h-56" />
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => showQrCode(qrModal.instance)}
                                className="flex-1 border border-border text-foreground font-medium py-2.5 rounded-lg hover:bg-secondary transition-colors text-sm flex items-center justify-center gap-1.5"
                            >
                                <RefreshCw className="w-4 h-4" />Atualizar QR
                            </button>
                            <button
                                onClick={async () => {
                                    const inst = instances.find(i => i.instance_name === qrModal.instance)
                                    if (inst) await checkStatus(qrModal.instance, inst.id)
                                }}
                                className="flex-1 gradient-primary text-black font-semibold py-2.5 rounded-lg hover:opacity-90 transition-all text-sm flex items-center justify-center gap-1.5"
                            >
                                <CheckCircle2 className="w-4 h-4" />Conectado!
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Instances List */}
            {loading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => <div key={i} className="skeleton h-44 rounded-xl" />)}
                </div>
            ) : instances.length === 0 ? (
                <div className="gradient-card border border-border rounded-xl p-12 text-center">
                    <Smartphone className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-40" />
                    <h3 className="text-foreground font-semibold text-lg mb-2">Nenhum WhatsApp conectado</h3>
                    <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">Conecte seu WhatsApp para começar a automatizar o atendimento com IA.</p>
                    <button onClick={() => setShowCreate(true)} className="gradient-primary text-black font-semibold px-6 py-3 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 mx-auto">
                        <Plus className="w-4 h-4" />Conectar WhatsApp
                    </button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {instances.map((inst) => {
                        const isMeta = inst.provider_type === 'META'
                        const s = isMeta 
                            ? { label: 'API Oficial', color: 'text-emerald-400', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> }
                            : (statusConfig[inst.status] || statusConfig.disconnected)
                        
                        return (
                            <div key={inst.id} className="gradient-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full ${isMeta ? 'bg-emerald-500' : 'gradient-primary'} flex items-center justify-center text-black font-bold text-sm`}>
                                            {(inst.display_name || inst.instance_name).slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-foreground text-sm">{inst.display_name || inst.instance_name}</div>
                                            <div className="text-xs text-muted-foreground">{inst.phone_number || (isMeta ? 'WhatsApp Business' : 'Sem número')}</div>
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-1.5 text-xs font-medium ${s.color}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${isMeta ? 'bg-emerald-400' : `status-${inst.status}`}`} />
                                        {s.label}
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                                        <div className="text-lg font-bold text-foreground">{inst.messages_received}</div>
                                        <div className="text-xs text-muted-foreground">Recebidas</div>
                                    </div>
                                    <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                                        <div className="text-lg font-bold text-foreground">{inst.messages_sent}</div>
                                        <div className="text-xs text-muted-foreground">Enviadas</div>
                                    </div>
                                </div>

                                {/* Webhook badge */}
                                {!isMeta && (
                                    <div className="flex items-center gap-1.5 mb-4">
                                        <div className={`w-1.5 h-1.5 rounded-full ${inst.webhook_configured ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                                        <span className="text-xs text-muted-foreground">{inst.webhook_configured ? 'Webhook configurado' : 'Webhook não configurado'}</span>
                                    </div>
                                )}
                                {isMeta && (
                                    <div className="flex items-center gap-1.5 mb-4">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        <span className="text-xs text-muted-foreground">Conexão Oficial Estável</span>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2">
                                    {!isMeta && inst.status !== 'connected' && (
                                        <button
                                            onClick={() => showQrCode(inst.instance_name)}
                                            className="flex-1 gradient-primary text-black font-medium py-2 rounded-lg text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <QrCode className="w-3.5 h-3.5" />QR Code
                                        </button>
                                    )}
                                    {isMeta ? (
                                        <button
                                            onClick={() => window.location.href = '/dashboard/admin/meta-api'}
                                            className="flex-1 border border-border text-foreground font-medium py-2 rounded-lg text-xs hover:bg-secondary transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Configurar
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => checkStatus(inst.instance_name, inst.id)}
                                            disabled={checkingStatus === inst.id}
                                            className="flex-1 border border-border text-foreground font-medium py-2 rounded-lg text-xs hover:bg-secondary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                                        >
                                            {checkingStatus === inst.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                            Status
                                        </button>
                                    )}
                                    <button
                                        onClick={() => deleteInstance(inst.instance_name, inst.id)}
                                        className="p-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

