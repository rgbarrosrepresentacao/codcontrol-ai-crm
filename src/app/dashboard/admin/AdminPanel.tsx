'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { 
    Shield, Users, Smartphone, Search, Ban, CheckCircle2, 
    Loader2, Megaphone, Trash2, Send, Clock, GraduationCap, 
    Plus, ExternalLink, FileText, Wallet, History, RefreshCcw, DollarSign,
    AlertCircle, Mail, UserCheck, UserX, UsersRound, ListPlus
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { 
    toggleUserStatusAction, updateUserTrialAction, saveAnnouncementAction, 
    deleteAnnouncementAction, saveMaterialAction, deleteMaterialAction, 
    deleteUserAction, getKiwifyStatsAction, refundKiwifyOrderAction,
    sendMarketingEmailAction
} from './actions'
import { parseEmailList, type EmailActionResult } from '@/lib/emailUtils'

interface AdminPanelProps {
    users: any[]
    instances: any[]
    plans: any[]
    initialAnnouncements: any[]
    initialMaterials: any[]
}

export default function AdminPanel({ users, instances, plans, initialAnnouncements, initialMaterials }: AdminPanelProps) {
    const [activeTab, setActiveTab] = useState<'users' | 'finance' | 'academy' | 'communications' | 'marketing'>('users')
    const [search, setSearch] = useState('')
    const [userFilter, setUserFilter] = useState<'all' | 'paid' | 'no_payment'>('all')
    const [toggling, setToggling] = useState<string | null>(null)
    const [updatingTrial, setUpdatingTrial] = useState<string | null>(null)
    const [deletingUser, setDeletingUser] = useState<string | null>(null)
    const [localUsers, setLocalUsers] = useState(users)
    
    // Kiwify Stats State
    const [kiwifyData, setKiwifyData] = useState<any>(null)
    const [loadingKiwify, setLoadingKiwify] = useState(false)
    const [refunding, setRefunding] = useState<string | null>(null)

    // Announcements State
    const [announcement, setAnnouncement] = useState({ title: '', content: '', type: 'info' })
    const [sending, setSending] = useState(false)
    const [localAnnouncements, setLocalAnnouncements] = useState(initialAnnouncements)
    const [deletingAnnouncement, setDeletingAnnouncement] = useState<string | null>(null)

    // Academy Materials State
    const [material, setMaterial] = useState({ title: '', type: 'PDF', link: '' })
    const [savingMaterial, setSavingMaterial] = useState(false)

    // Email Marketing State
    const [emailAudience, setEmailAudience] = useState<'leads' | 'paid' | 'all' | 'external'>('leads')
    const [emailSubject, setEmailSubject] = useState('')
    const [emailBody, setEmailBody] = useState('')
    const [externalList, setExternalList] = useState('') // lista avulsa de e-mails
    const [sendingEmail, setSendingEmail] = useState(false)
    const [emailResult, setEmailResult] = useState<EmailActionResult | null>(null)
    const [localMaterials, setLocalMaterials] = useState(initialMaterials)
    const [deletingMaterial, setDeletingMaterial] = useState<string | null>(null)

    const fetchKiwifyStats = async () => {
        setLoadingKiwify(true)
        try {
            const data = await getKiwifyStatsAction()
            setKiwifyData(data)
        } catch (e: any) {
            console.error('Kiwify Error:', e.message)
            toast.error('Erro ao conectar com API da Kiwify: Chaves podem estar inválidas.')
        } finally {
            setLoadingKiwify(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'finance') fetchKiwifyStats()
    }, [activeTab])

    const handleRefund = async (orderId: string) => {
        if (!confirm('💸 DESEJA REALMENTE REEMBOLSAR ESTA VENDA? \n\nO dinheiro será devolvido ao cliente na Kiwify e o acesso dele será revogado automaticamente.')) return
        
        setRefunding(orderId)
        try {
            await refundKiwifyOrderAction(orderId)
            toast.success('Reembolso solicitado com sucesso na Kiwify!')
            fetchKiwifyStats() // Refresh sales list
        } catch (e: any) {
            toast.error('Erro ao processar reembolso: ' + e.message)
        } finally {
            setRefunding(null)
        }
    }

    // Classificação: pagante = status ativo na Kiwify OU dentro do período de trial/cortesia
    const isPaid = (u: any) => {
        if (u.is_admin) return true
        
        const kiwifyActive = u.kiwify_subscription_status === 'paid' || 
                           u.kiwify_subscription_status === 'active' || 
                           u.kiwify_subscription_status === 'aprovado' || 
                           u.kiwify_subscription_status === 'approved'
        const stripeActive = u.stripe_subscription_status === 'active' || u.stripe_subscription_status === 'trialing'
        const trialActive = u.trial_ends_at && new Date(u.trial_ends_at) > new Date()
        
        // Mantém ativo se tiver qualquer assinatura OU trial OU se for conta legada ativa sem dados de sub
        return kiwifyActive || stripeActive || trialActive || (u.is_active && !u.kiwify_subscription_status && !u.stripe_subscription_status)
    }
    const isNoPayment = (u: any) => !isPaid(u) && !u.is_admin

    const paidCount = localUsers.filter(isPaid).length
    const noPaymentCount = localUsers.filter(isNoPayment).length

    const filtered = localUsers
        .filter(u => {
            if (userFilter === 'paid') return isPaid(u)
            if (userFilter === 'no_payment') return isNoPayment(u)
            return true
        })
        .filter(u =>
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase())
        )

    const toggleUser = async (userId: string, isActive: boolean) => {
        setToggling(userId)
        try {
            await toggleUserStatusAction(userId, isActive)
            setLocalUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !isActive } : u))
            toast.success(isActive ? 'Usuário bloqueado' : 'Usuário ativado')
        } catch {
            toast.error('Erro ao alterar usuário')
        }
        setToggling(null)
    }

    const addTrialDays = async (userId: string, days: number) => {
        setUpdatingTrial(userId)
        try {
            const newDate = await updateUserTrialAction(userId, days)
            setLocalUsers(prev => prev.map(u => u.id === userId ? { ...u, trial_ends_at: newDate } : u))
            toast.success(`Mais ${days} dias adicionados!`)
        } catch {
            toast.error('Erro ao adicionar dias')
        }
        setUpdatingTrial(null)
    }

    const deleteUser = async (userId: string) => {
        if (!confirm('⚠️ ATENÇÃO: Deseja excluir PERMANENTEMENTE este usuário e todos os dados dele? Esta ação não pode ser desfeita.')) return
        
        setDeletingUser(userId)
        try {
            await deleteUserAction(userId)
            setLocalUsers(prev => prev.filter(u => u.id !== userId))
            toast.success('Usuário removido da plataforma!')
        } catch (e: any) {
            toast.error('Erro ao excluir: ' + e.message)
        }
        setDeletingUser(null)
    }

    const handleSendAnnouncement = async () => {
        if (!announcement.title || !announcement.content) return toast.error('Preencha título e conteúdo')
        setSending(true)
        try {
            await saveAnnouncementAction(announcement.title, announcement.content, announcement.type)
            toast.success('Comunicado disparado!')
            setAnnouncement({ title: '', content: '', type: 'info' })
            window.location.reload()
        } catch (e: any) {
            toast.error('Erro ao disparar: ' + e.message)
        } finally {
            setSending(false)
        }
    }

    const handleDeleteAnnouncement = async (id: string) => {
        setDeletingAnnouncement(id)
        try {
            await deleteAnnouncementAction(id)
            setLocalAnnouncements(prev => prev.filter(a => a.id !== id))
            toast.success('Comunicado removido')
        } catch {
            toast.error('Erro ao remover')
        }
        setDeletingAnnouncement(null)
    }

    const handleSaveMaterial = async () => {
        if (!material.title || !material.link) return toast.error('Preencha título e link')
        setSavingMaterial(true)
        try {
            await saveMaterialAction(material.title, material.type, material.link)
            toast.success('Material adicionado!')
            setMaterial({ title: '', type: 'PDF', link: '' })
            window.location.reload()
        } catch (e: any) {
            toast.error('Erro ao salvar: ' + e.message)
        } finally {
            setSavingMaterial(false)
        }
    }

    const handleDeleteMaterial = async (id: string) => {
        setDeletingMaterial(id)
        try {
            await deleteMaterialAction(id)
            setLocalMaterials(prev => prev.filter(m => m.id !== id))
            toast.success('Material removido')
        } catch {
            toast.error('Erro ao remover')
        }
        setDeletingMaterial(null)
    }

    // Sub-componente para organizar a linha do usuário com segurança total (definido aqui para ter acesso ao escopo de AdminPanel)
    function UserTableRow({ 
        user, 
        toggling, 
        deletingUser, 
        updatingTrial 
    }: { 
        user: any, 
        toggling: string | null, 
        deletingUser: string | null, 
        updatingTrial: string | null 
    }) {
        const kiwifyActive = user.kiwify_subscription_status === 'paid' || 
                           user.kiwify_subscription_status === 'active' || 
                           user.kiwify_subscription_status === 'aprovado' || 
                           user.kiwify_subscription_status === 'approved';
                           
        const stripeActive = user.stripe_subscription_status === 'active' || 
                           user.stripe_subscription_status === 'trialing';

        const hasKiwify = !!user.kiwify_subscription_status;
        const hasStripe = !!user.stripe_subscription_status;
        const trialActive = user.trial_ends_at && new Date(user.trial_ends_at) > new Date();
        const noSub = !hasKiwify && !hasStripe;

        return (
            <tr key={user.id} className={`hover:bg-secondary/20 transition-colors ${isNoPayment(user) ? 'border-l-2 border-l-orange-500/40' : ''}`}>
                <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-black font-bold text-sm shadow-inner ${isNoPayment(user) ? 'bg-orange-500/70' : 'gradient-primary'}`}>
                            {(user.name || 'U').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-foreground">{user.name || 'Sem nome'}</div>
                                {isNoPayment(user) && (
                                    <span className="px-1.5 py-0.5 bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[9px] rounded font-black uppercase tracking-wide">Lead</span>
                                )}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">{user.email}</div>
                        </div>
                    </div>
                </td>
                <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                        {hasKiwify && (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase text-center ${user.kiwify_subscription_status === 'paid' || user.kiwify_subscription_status === 'active' || user.kiwify_subscription_status === 'aprovado' || user.kiwify_subscription_status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                Kiwify: {user.kiwify_subscription_status === 'paid' ? 'PAGO' : (user.kiwify_subscription_status === 'active' || user.kiwify_subscription_status === 'aprovado' || user.kiwify_subscription_status === 'approved') ? 'ATIVO' : user.kiwify_subscription_status.toUpperCase()}
                            </span>
                        )}
                        {hasStripe && (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase text-center ${user.stripe_subscription_status === 'active' || user.stripe_subscription_status === 'trialing' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                Stripe: {user.stripe_subscription_status.toUpperCase()}
                            </span>
                        )}
                        {/* Selo de Acesso Manual quando não houver assinatura ativa mas estiver liberado pelo prazo */}
                        {(!kiwifyActive && !stripeActive && trialActive) && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-center bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                Acesso Manual/Trial
                            </span>
                        )}
                        {(noSub && trialActive) && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-center bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                Período de Teste
                            </span>
                        )}
                        {(noSub && !trialActive) && (
                            <span className="text-[10px] text-muted-foreground italic truncate">Nenhuma assinatura</span>
                        )}
                    </div>
                </td>
                <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${user.is_active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                        {user.is_active ? 'ATIVO' : 'BLOQUEADO'}
                    </span>
                </td>
                <td className="px-4 py-4">
                    <div className="text-xs text-foreground font-medium">{formatDate(user.created_at)}</div>
                    {user.trial_ends_at && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-orange-400 font-bold uppercase">
                            <Clock className="w-3 h-3" />Expira: {formatDate(user.trial_ends_at)}
                        </div>
                    )}
                </td>
                <td className="px-4 py-4 text-right">
                    <div className="flex flex-col gap-2 items-end">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => toggleUser(user.id, user.is_active)}
                                disabled={toggling === user.id}
                                className={`h-8 px-3 rounded-lg border text-xs font-bold transition-all flex items-center gap-2 ${user.is_active ? 'border-red-500/30 text-red-500 hover:bg-red-500/10' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}`}
                            >
                                {toggling === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : user.is_active ? <Ban className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                {user.is_active ? 'Bloquear' : 'Ativar'}
                            </button>

                            <button
                                onClick={() => deleteUser(user.id)}
                                disabled={deletingUser === user.id}
                                className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-red-500 border border-border/50 rounded-lg hover:bg-red-500/10 transition-all"
                            >
                                {deletingUser === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </button>
                        </div>

                        <div className="flex items-center gap-1">
                            {[7, 15, 30].map(days => (
                                <button
                                    key={days}
                                    onClick={() => addTrialDays(user.id, days)}
                                    disabled={updatingTrial === user.id}
                                    className="h-6 px-2 text-[10px] font-bold rounded bg-secondary/50 border border-border text-muted-foreground hover:border-orange-500/30 hover:text-orange-400 transition-all"
                                >
                                    +{days}d
                                </button>
                            ))}
                        </div>
                    </div>
                </td>
            </tr>
        )
    }

    const connectedCount = instances.filter(i => i.status === 'connected').length
    const totalRevenue = localUsers.reduce((acc: number, u: any) => {
        const plan = plans.find((p: any) => p.id === u.plan_id)
        return acc + (plan?.price || 0)
    }, 0)

    const statsOverview = [
        { label: 'Total Usuários', value: localUsers.length, icon: Users, color: 'from-blue-500/20 to-cyan-500/20', textColor: 'text-blue-400' },
        { label: 'Clientes Pagantes', value: paidCount, icon: CheckCircle2, color: 'from-emerald-500/20 to-teal-500/20', textColor: 'text-emerald-400' },
        { label: 'Só Cadastro', value: noPaymentCount, icon: AlertCircle, color: 'from-orange-500/20 to-red-500/20', textColor: 'text-orange-400' },
        { label: 'WhatsApps Conectados', value: connectedCount, icon: Smartphone, color: 'from-purple-500/20 to-pink-500/20', textColor: 'text-purple-400' },
    ]

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Shield className="w-6 h-6 text-primary" />Gerenciamento Master
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Controle total da sua operação e faturamento</p>
            </div>

            {/* Tabs Navigation */}
            <div className="flex flex-wrap gap-2 p-1.5 bg-secondary/30 rounded-xl border border-border w-fit">
                <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-primary text-black' : 'text-muted-foreground hover:bg-secondary/50'}`}>
                    <Users className="w-4 h-4" /> Usuários
                </button>
                <button onClick={() => setActiveTab('finance')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'finance' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-secondary/50'}`}>
                    <Wallet className="w-4 h-4" /> Financeiro Kiwify
                </button>
                <button onClick={() => setActiveTab('academy')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'academy' ? 'bg-primary text-black' : 'text-muted-foreground hover:bg-secondary/50'}`}>
                    <GraduationCap className="w-4 h-4" /> Academia
                </button>
                <button onClick={() => setActiveTab('communications')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'communications' ? 'bg-primary text-black' : 'text-muted-foreground hover:bg-secondary/50'}`}>
                    <Megaphone className="w-4 h-4" /> Comunicados
                </button>
                <button onClick={() => { setActiveTab('marketing'); setEmailResult(null) }} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'marketing' ? 'bg-primary text-black' : 'text-muted-foreground hover:bg-secondary/50'}`}>
                    <Mail className="w-4 h-4" /> E-mail Marketing
                </button>
            </div>

            {/* TAB: USERS */}
            {activeTab === 'users' && (
                <div className="space-y-6 animate-slide-up">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {statsOverview.map((stat) => (
                            <div key={stat.label} className="gradient-card border border-border rounded-xl p-5">
                                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                                    <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
                                </div>
                                <div className={`text-2xl font-bold ${stat.textColor} mb-0.5`}>{stat.value}</div>
                                <div className="text-muted-foreground text-xs">{stat.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="gradient-card border border-border rounded-xl p-6">
                        <h2 className="font-semibold text-foreground mb-4">📊 Distribuição por Plano</h2>
                        <div className="grid grid-cols-3 gap-4">
                            {plans.map((plan: any) => {
                                const count = localUsers.filter(u => u.plan_id === plan.id).length
                                const pct = localUsers.length > 0 ? (count / localUsers.length * 100).toFixed(0) : 0
                                return (
                                    <div key={plan.id} className="bg-secondary/50 rounded-xl p-4 text-center">
                                        <div className="text-2xl font-bold text-foreground">{count}</div>
                                        <div className="text-sm font-medium text-primary">{plan.name}</div>
                                        <div className="text-xs text-muted-foreground">{pct}%</div>
                                        <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
                                            <div className="h-full gradient-primary rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Users Table */}
                    <div className="gradient-card border border-border rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-border flex flex-col gap-3">
                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <h2 className="font-semibold text-foreground flex-1">👥 Gestão de Assinantes</h2>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Buscar por nome ou email..."
                                        className="bg-input border border-border rounded-lg pl-9 pr-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm w-full md:w-64"
                                    />
                                </div>
                            </div>
                            {/* Filtros de conversão */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUserFilter('all')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        userFilter === 'all'
                                            ? 'bg-primary text-black border-primary shadow-lg shadow-primary/20'
                                            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                    }`}
                                >
                                    <Users className="w-3 h-3" />
                                    Todos
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                        userFilter === 'all' ? 'bg-black/20' : 'bg-secondary/80'
                                    }`}>{localUsers.length}</span>
                                </button>

                                <button
                                    onClick={() => setUserFilter('paid')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        userFilter === 'paid'
                                            ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20'
                                            : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                                    }`}
                                >
                                    <CheckCircle2 className="w-3 h-3" />
                                    💰 Pagantes
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                        userFilter === 'paid' ? 'bg-black/20' : 'bg-emerald-500/20'
                                    }`}>{paidCount}</span>
                                </button>

                                <button
                                    onClick={() => setUserFilter('no_payment')}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        userFilter === 'no_payment'
                                            ? 'bg-orange-500 text-black border-orange-500 shadow-lg shadow-orange-500/20'
                                            : 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10'
                                    }`}
                                >
                                    <AlertCircle className="w-3 h-3" />
                                    🎯 Só Cadastro (Não Pagou)
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                        userFilter === 'no_payment' ? 'bg-black/20' : 'bg-orange-500/20'
                                    }`}>{noPaymentCount}</span>
                                </button>
                            </div>
                            {userFilter === 'no_payment' && noPaymentCount > 0 && (
                                <div className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/20 rounded-lg p-3">
                                    <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-orange-300 leading-relaxed">
                                        <span className="font-bold">Leads não convertidos:</span> Esses usuários criaram conta mas não realizaram pagamento. Use os botões <span className="font-bold">+7d / +15d / +30d</span> para oferecer um período de avaliação e recuperar essas vendas.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase">
                                        <th className="text-left px-4 py-4 tracking-wider">Usuário</th>
                                        <th className="text-left px-4 py-4 tracking-wider">Assinatura</th>
                                        <th className="text-left px-4 py-4 tracking-wider">Status</th>
                                        <th className="text-left px-4 py-4 tracking-wider">Expiração</th>
                                        <th className="text-left px-4 py-4 tracking-wider text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filtered.map((user: any) => (
                                        <UserTableRow 
                                            key={user.id} 
                                            user={user} 
                                            toggling={toggling}
                                            deletingUser={deletingUser}
                                            updatingTrial={updatingTrial}
                                        />
                                    ))}
                                </tbody>
                            </table>
                            {filtered.length === 0 && (
                                <div className="text-center py-12">
                                    <Search className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                                    <p className="text-muted-foreground text-sm">Nenhum usuário encontrado na base de dados.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: FINANCE (KIWIFY API) */}
            {activeTab === 'finance' && (
                <div className="space-y-6 animate-slide-up">
                    {/* Kiwify Balance */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="gradient-card border border-border rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full group-hover:bg-primary/10 transition-all blur-xl" />
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                    <Wallet className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm text-muted-foreground">Saldo Disponível (Kiwify)</h3>
                                    <div className="text-3xl font-bold text-emerald-400">
                                        {loadingKiwify ? <Loader2 className="w-6 h-6 animate-spin" /> : `R$ ${(kiwifyData?.balance?.available / 100 || 0).toFixed(2)}`}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="bg-emerald-500/10 px-2 py-0.5 rounded text-emerald-400 font-bold uppercase tracking-tight">Pronto para Saque</span>
                            </div>
                        </div>

                        <div className="gradient-card border border-border rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full group-hover:bg-primary/10 transition-all blur-xl" />
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                    <DollarSign className="w-6 h-6 text-orange-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm text-muted-foreground">Saldo Pendente</h3>
                                    <div className="text-3xl font-bold text-orange-400">
                                        {loadingKiwify ? <Loader2 className="w-6 h-6 animate-spin" /> : `R$ ${(kiwifyData?.balance?.pending / 100 || 0).toFixed(2)}`}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="bg-orange-500/10 px-2 py-0.5 rounded text-orange-400 font-bold uppercase tracking-tight">Liberando nos próximos dias</span>
                            </div>
                        </div>
                    </div>

                    {/* Sales Table */}
                    <div className="gradient-card border border-border rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-border flex items-center justify-between">
                            <h2 className="font-semibold text-foreground flex items-center gap-2">
                                <History className="w-5 h-5 text-primary" /> Histórico de Vendas Recentes
                            </h2>
                            <button 
                                onClick={fetchKiwifyStats} 
                                disabled={loadingKiwify}
                                className="p-2 text-muted-foreground hover:text-primary transition-all rounded-lg hover:bg-primary/10"
                            >
                                <RefreshCcw className={`w-4 h-4 ${loadingKiwify ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase">
                                        <th className="text-left px-4 py-4">Status</th>
                                        <th className="text-left px-4 py-4">Cliente</th>
                                        <th className="text-left px-4 py-4">Faturamento</th>
                                        <th className="text-left px-4 py-4">Data</th>
                                        <th className="text-right px-4 py-4">Ação Financeira</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {loadingKiwify ? (
                                        <tr><td colSpan={5} className="py-20 text-center"><Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" /></td></tr>
                                    ) : kiwifyData?.sales?.length > 0 ? (
                                        kiwifyData.sales.map((sale: any) => (
                                            <tr key={sale.id} className="hover:bg-secondary/20 transition-colors">
                                                <td className="px-4 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${sale.order_status === 'paid' ? 'bg-emerald-500 text-black' : sale.order_status === 'refunded' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'}`}>
                                                        {sale.order_status === 'paid' ? 'Paga' : sale.order_status === 'refunded' ? 'Reembolsada' : sale.order_status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-sm font-medium text-foreground">{sale.Customer?.full_name || 'Desconhecido'}</div>
                                                    <div className="text-[11px] text-muted-foreground">{sale.Customer?.email}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-sm font-bold text-foreground">R$ {(sale.order_amount / 100).toFixed(2)}</div>
                                                    <div className="text-[10px] text-muted-foreground">ID: {sale.order_id}</div>
                                                </td>
                                                <td className="px-4 py-4 text-xs text-muted-foreground">
                                                    {formatDate(sale.created_at)}
                                                </td>
                                                <td className="px-4 py-4 text-right">
                                                    {sale.order_status === 'paid' && (
                                                        <button 
                                                            onClick={() => handleRefund(sale.order_id)}
                                                            disabled={refunding === sale.order_id}
                                                            className="text-xs font-bold text-red-500 hover:text-red-400 px-3 py-1.5 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-all flex items-center gap-1 ml-auto"
                                                        >
                                                            {refunding === sale.order_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                                                            Reembolsar
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5} className="py-12 text-center text-muted-foreground text-sm italic">Nenhuma venda encontrada na Kiwify.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-primary mb-1">Dica de Segurança</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                A função de **Reembolso** revoga o acesso do cliente instantaneamente em nosso banco de dados. Tenha certeza absoluta antes de clicar, pois o processamento na Kiwify é imediato e irreversível via API.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: ACADEMY (Materiais) */}
            {activeTab === 'academy' && (
                <div className="grid lg:grid-cols-2 gap-6 animate-slide-up">
                    <div className="gradient-card border border-border rounded-xl p-6">
                        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" /> Adicionar Novo Material
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Título</label>
                                <input value={material.title} onChange={e => setMaterial({ ...material, title: e.target.value })} placeholder="Manual, aula de estratégia..." className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Link</label>
                                <input value={material.link} onChange={e => setMaterial({ ...material, link: e.target.value })} placeholder="https://..." className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
                            </div>
                            <div className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                                    <select value={material.type} onChange={e => setMaterial({ ...material, type: e.target.value })} className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none">
                                        <option value="PDF">📄 PDF</option>
                                        <option value="LINK">🔗 Link Externo</option>
                                        <option value="VIDEO">🎥 Vídeo/Aula</option>
                                    </select>
                                </div>
                                <button onClick={handleSaveMaterial} disabled={savingMaterial} className="gradient-primary text-black font-bold h-10 px-6 rounded-lg text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
                                    {savingMaterial ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="gradient-card border border-border rounded-xl p-6">
                        <h2 className="font-semibold text-foreground mb-4">📚 Acervo da Academia</h2>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {localMaterials.length === 0 ? <p className="text-center py-8 text-muted-foreground text-xs italic">Nenhum material.</p> : localMaterials.map((m: any) => (
                                <div key={m.id} className="bg-secondary/30 border border-border/50 rounded-lg p-3 flex items-start justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            {m.type === 'PDF' ? <FileText className="w-4 h-4 text-primary" /> : <ExternalLink className="w-4 h-4 text-primary" />}
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-foreground">{m.title}</div>
                                            <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{m.link}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteMaterial(m.id)} disabled={deletingMaterial === m.id} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                        {deletingMaterial === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: COMMUNICATIONS (Avisos) */}
            {activeTab === 'communications' && (
                <div className="space-y-6 animate-slide-up">
                    <div className="grid lg:grid-cols-2 gap-6">
                        <div className="gradient-card border border-border rounded-xl p-6">
                            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                                <Megaphone className="w-5 h-5 text-primary" /> Novo Comunicado Global
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-muted-foreground mb-1 block">Título</label>
                                    <input value={announcement.title} onChange={e => setAnnouncement({ ...announcement, title: e.target.value })} placeholder="Título" className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none" />
                                </div>
                                <textarea value={announcement.content} onChange={e => setAnnouncement({ ...announcement, content: e.target.value })} placeholder="Mensagem..." rows={4} className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none" />
                                <div className="flex gap-4 items-end">
                                    <select value={announcement.type} onChange={e => setAnnouncement({ ...announcement, type: e.target.value })} className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground">
                                        <option value="info">💡 Info</option>
                                        <option value="warning">⚠️ Aviso</option>
                                        <option value="critical">⚡ Crítico</option>
                                    </select>
                                    <button onClick={handleSendAnnouncement} disabled={sending} className="gradient-primary text-black font-bold h-10 px-6 rounded-lg text-sm flex items-center gap-2">
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Disparar
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="gradient-card border border-border rounded-xl p-6">
                            <h2 className="font-semibold text-foreground mb-4">📢 Histórico de Avisos</h2>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {localAnnouncements.map(a => (
                                    <div key={a.id} className="bg-secondary/30 border border-border/50 rounded-lg p-3 flex justify-between items-start group">
                                        <div>
                                            <div className="text-xs font-bold text-foreground mb-1">[{a.title}] · {formatDate(a.created_at)}</div>
                                            <p className="text-xs text-muted-foreground">{a.content}</p>
                                        </div>
                                        <button onClick={() => handleDeleteAnnouncement(a.id)} disabled={deletingAnnouncement === a.id} className="p-1.5 text-muted-foreground hover:text-red-400 group-hover:opacity-100 opacity-0">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: E-MAIL MARKETING */}
            {activeTab === 'marketing' && (
                <div className="space-y-6 animate-slide-up">

                    {/* Aviso de segurança */}
                    <div className="flex items-start gap-3 bg-orange-500/8 border border-orange-500/25 rounded-xl p-4">
                        <AlertCircle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-orange-300 mb-0.5">Atenção antes de disparar</p>
                            <p className="text-xs text-orange-300/70 leading-relaxed">
                                Os e-mails serão enviados um a um via SMTP da Hostinger. Selecione o público com cuidado.
                                <strong className="text-orange-300"> Clientes pagantes</strong> devem receber comunicações de valor, não spam.
                            </p>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6">

                        {/* Formulário de disparo */}
                        <div className="gradient-card border border-border rounded-xl p-6 space-y-5">
                            <h2 className="font-semibold text-foreground flex items-center gap-2">
                                <Mail className="w-5 h-5 text-primary" /> Compor E-mail
                            </h2>

                            {/* Seleção de público */}
                            <div>
                                <label className="text-xs text-muted-foreground mb-2 block font-semibold uppercase tracking-wide">Público-alvo</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setEmailAudience('leads')}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                                            emailAudience === 'leads'
                                                ? 'bg-orange-500 text-black border-orange-500 shadow-lg shadow-orange-500/20'
                                                : 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10'
                                        }`}
                                    >
                                        <UserX className="w-4 h-4" />
                                        <span>Leads</span>
                                        <span className="text-[10px] opacity-70">Não pagaram</span>
                                    </button>
                                    <button
                                        onClick={() => setEmailAudience('paid')}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                                            emailAudience === 'paid'
                                                ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20'
                                                : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                                        }`}
                                    >
                                        <UserCheck className="w-4 h-4" />
                                        <span>Pagantes</span>
                                        <span className="text-[10px] opacity-70">Clientes ativos</span>
                                    </button>
                                    <button
                                        onClick={() => setEmailAudience('all')}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                                            emailAudience === 'all'
                                                ? 'bg-primary text-black border-primary shadow-lg shadow-primary/20'
                                                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                        }`}
                                    >
                                        <UsersRound className="w-4 h-4" />
                                        <span>Todos</span>
                                        <span className="text-[10px] opacity-70">{localUsers.filter(u => !u.is_admin).length} usuários</span>
                                    </button>
                                    <button
                                        onClick={() => setEmailAudience('external')}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition-all ${
                                            emailAudience === 'external'
                                                ? 'bg-violet-500 text-black border-violet-500 shadow-lg shadow-violet-500/20'
                                                : 'border-violet-500/30 text-violet-400 hover:bg-violet-500/10'
                                        }`}
                                    >
                                        <ListPlus className="w-4 h-4" />
                                        <span>Lista Externa</span>
                                        <span className="text-[10px] opacity-70">Cole seus e-mails</span>
                                    </button>
                                </div>
                            </div>

                            {/* Campo lista externa — aparece só quando selecionado */}
                            {emailAudience === 'external' && (() => {
                                const parsed = externalList.trim() ? parseEmailList(externalList) : null
                                return (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Lista de E-mails</label>
                                            {parsed && (
                                                <div className="flex items-center gap-2 text-[10px] font-bold">
                                                    <span className="text-emerald-400">{parsed.valid.length} válidos</span>
                                                    {parsed.duplicates > 0 && <span className="text-orange-400">{parsed.duplicates} dupl.</span>}
                                                    {parsed.invalid.length > 0 && <span className="text-red-400">{parsed.invalid.length} inválidos</span>}
                                                </div>
                                            )}
                                        </div>
                                        <textarea
                                            value={externalList}
                                            onChange={e => setExternalList(e.target.value)}
                                            placeholder={`Cole aqui sua lista de e-mails — um por linha ou separados por vírgula:\n\nexemplo1@gmail.com\nexemplo2@hotmail.com\nexemplo3@empresa.com.br`}
                                            rows={6}
                                            className="w-full bg-secondary/50 border border-violet-500/30 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/40 resize-none font-mono text-[12px]"
                                        />
                                        {parsed && parsed.invalid.length > 0 && (
                                            <div className="bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
                                                <p className="text-[10px] text-red-400 font-bold mb-1">E-mails com formato inválido (serão ignorados):</p>
                                                <p className="text-[10px] text-red-400/70 font-mono">{parsed.invalid.slice(0, 8).join(', ')}{parsed.invalid.length > 8 ? '...' : ''}</p>
                                            </div>
                                        )}
                                        {parsed && parsed.valid.length > 0 && (
                                            <div className="bg-violet-500/8 border border-violet-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                                                <ListPlus className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                                <p className="text-[11px] text-violet-300 font-semibold">
                                                    Pronto para disparar para <span className="text-violet-400 font-black">{parsed.valid.length}</span> e-mail(s) válidos
                                                    {parsed.duplicates > 0 && <span className="text-orange-400 font-normal"> · {parsed.duplicates} duplicata(s) removida(s)</span>}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}

                            {/* Assunto */}
                            <div>
                                <label className="text-xs text-muted-foreground mb-1.5 block font-semibold uppercase tracking-wide">Assunto do E-mail</label>
                                <input
                                    value={emailSubject}
                                    onChange={e => setEmailSubject(e.target.value)}
                                    placeholder="Ex: 🎁 Oferta especial para você!"
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                />
                            </div>

                            {/* Corpo */}
                            <div>
                                <label className="text-xs text-muted-foreground mb-1.5 block font-semibold uppercase tracking-wide">Mensagem</label>
                                <textarea
                                    value={emailBody}
                                    onChange={e => setEmailBody(e.target.value)}
                                    placeholder={`Ex: Olá! Notamos que você se cadastrou mas ainda não começou sua jornada de automação.\n\nPor isso, preparamos uma condição especial exclusiva para você: 30 dias grátis para testar tudo sem compromisso.\n\nClique no botão abaixo e comece agora!`}
                                    rows={8}
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Use quebras de linha — elas serão preservadas no e-mail.</p>
                            </div>

                            {/* Botão de disparo */}
                            <button
                                onClick={async () => {
                                    if (!emailSubject.trim() || !emailBody.trim()) {
                                        return toast.error('Preencha o assunto e a mensagem.')
                                    }
                                    if (emailAudience === 'external' && !externalList.trim()) {
                                        return toast.error('Cole pelo menos um e-mail na lista externa.')
                                    }
                                    const audienceLabel = {
                                        leads: 'leads (não pagaram)',
                                        paid: 'clientes pagantes',
                                        all: 'TODOS os usuários do sistema',
                                        external: `lista externa`,
                                    }[emailAudience]
                                    if (!confirm(`⚠️ Confirmar disparo de e-mail para ${audienceLabel}?\n\nAssunto: "${emailSubject}"\n\nEste envio é irreversível.`)) return
                                    setSendingEmail(true)
                                    setEmailResult(null)
                                    const result = await sendMarketingEmailAction(
                                        emailSubject,
                                        emailBody,
                                        emailAudience,
                                        emailAudience === 'external' ? externalList : undefined
                                    )
                                    setEmailResult(result)
                                    if (result.error) {
                                        toast.error('❌ Erro: ' + result.error)
                                    } else if (result.sent > 0) {
                                        toast.success(`✅ ${result.sent} e-mail(s) enviado(s) com sucesso!`)
                                        setEmailSubject('')
                                        setEmailBody('')
                                        if (emailAudience === 'external') setExternalList('')
                                    }
                                    if (result.failed > 0) {
                                        toast.error(`⚠️ ${result.failed} falha(s) de envio. Veja o relatório.`)
                                    }
                                    setSendingEmail(false)
                                }}
                                disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim() || (emailAudience === 'external' && !externalList.trim())}
                                className="w-full gradient-primary text-black font-bold h-12 rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {sendingEmail ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                                ) : (
                                    <><Send className="w-4 h-4" /> Disparar E-mail Marketing</>
                                )}
                            </button>
                        </div>

                        {/* Painel direito: resultado + dicas */}
                        <div className="space-y-4">

                            {/* Resultado do último disparo */}
                            {emailResult && (
                                <div className="gradient-card border border-border rounded-xl p-6 space-y-4">
                                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                                        <Send className="w-4 h-4 text-primary" /> Relatório do Disparo
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                                            <div className="text-3xl font-black text-emerald-400">{emailResult?.sent ?? 0}</div>
                                            <div className="text-xs text-emerald-400/70 mt-1">✅ Enviados</div>
                                        </div>
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                                            <div className="text-3xl font-black text-red-400">{emailResult?.failed ?? 0}</div>
                                            <div className="text-xs text-red-400/70 mt-1">❌ Falhas</div>
                                        </div>
                                    </div>
                                    {(emailResult?.errors?.length ?? 0) > 0 && (
                                        <div className="bg-secondary/30 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                                            <p className="text-xs font-bold text-muted-foreground mb-2">Detalhes das falhas:</p>
                                            {emailResult?.errors?.map((err, i) => (
                                                <p key={i} className="text-[10px] text-red-400 font-mono">{err}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}


                            {/* Dicas de uso */}
                            <div className="gradient-card border border-border rounded-xl p-6 space-y-4">
                                <h3 className="font-semibold text-foreground">💡 Dicas para boa conversão</h3>
                                <div className="space-y-3">
                                    {[
                                        { icon: '🎯', title: 'Leads (Não Pagaram)', tip: 'Ofereça um bônus, desconto ou período grátis. Crie urgência com prazo.' },
                                        { icon: '⭐', title: 'Clientes Pagantes', tip: 'Comunique novidades, atualizações e recursos exclusivos. Eles valorizam atenção.' },
                                        { icon: '📝', title: 'Bons assuntos', tip: 'Use emojis, números e palavras como "exclusivo", "grátis" ou o nome deles.' },
                                    ].map(item => (
                                        <div key={item.title} className="flex gap-3">
                                            <span className="text-lg shrink-0">{item.icon}</span>
                                            <div>
                                                <p className="text-xs font-bold text-foreground">{item.title}</p>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">{item.tip}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
