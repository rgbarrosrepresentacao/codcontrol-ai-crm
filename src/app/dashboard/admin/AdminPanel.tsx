'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Shield, Users, Smartphone, BarChart3, Search, Ban, CheckCircle2, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { toggleUserStatusAction, updateUserTrialAction } from './actions'
import { Calendar, Clock } from 'lucide-react'

interface AdminPanelProps {
    users: any[]
    instances: any[]
    plans: any[]
}

export default function AdminPanel({ users, instances, plans }: AdminPanelProps) {
    const [search, setSearch] = useState('')
    const [toggling, setToggling] = useState<string | null>(null)
    const [updatingTrial, setUpdatingTrial] = useState<string | null>(null)
    const [localUsers, setLocalUsers] = useState(users)

    const filtered = localUsers.filter(u =>
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

    const connectedCount = instances.filter(i => i.status === 'connected').length
    const totalRevenue = localUsers.reduce((acc: number, u: any) => {
        const plan = plans.find((p: any) => p.id === u.plan_id)
        return acc + (plan?.price || 0)
    }, 0)

    const stats = [
        { label: 'Total Usuários', value: localUsers.length, icon: Users, color: 'from-blue-500/20 to-cyan-500/20', textColor: 'text-blue-400' },
        { label: 'WhatsApps Conectados', value: connectedCount, icon: Smartphone, color: 'from-emerald-500/20 to-teal-500/20', textColor: 'text-emerald-400' },
        { label: 'Total Instâncias', value: instances.length, icon: Smartphone, color: 'from-purple-500/20 to-pink-500/20', textColor: 'text-purple-400' },
        { label: 'MRR (estimado)', value: `R$${totalRevenue.toFixed(0)}`, icon: BarChart3, color: 'from-orange-500/20 to-red-500/20', textColor: 'text-orange-400' },
    ]

    return (
        <div className="p-6 md:p-8 space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <Shield className="w-6 h-6 text-primary" />Painel Administrativo
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Visão geral de toda a plataforma</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className="gradient-card border border-border rounded-xl p-5">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                            <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
                        </div>
                        <div className={`text-2xl font-bold ${stat.textColor} mb-0.5`}>{stat.value}</div>
                        <div className="text-muted-foreground text-xs">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Plan Distribution */}
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
                                <div className="text-xs text-muted-foreground">{pct}% dos usuários</div>
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
                <div className="p-4 border-b border-border flex items-center gap-3">
                    <h2 className="font-semibold text-foreground flex-1">👥 Todos os Usuários</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar usuário..."
                            className="bg-input border border-border rounded-lg pl-9 pr-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm w-56"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-secondary/30">
                                {['Usuário', 'Plano', 'Status', 'Criado em', 'Ações'].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filtered.map((user: any) => (
                                <tr key={user.id} className="hover:bg-secondary/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-xs">
                                                {(user.name || 'U').slice(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-foreground">{user.name || 'Sem nome'}</div>
                                                <div className="text-xs text-muted-foreground">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {(!user.is_admin && user.stripe_subscription_status !== 'active' && user.trial_ends_at) ? (
                                            <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs rounded-full font-bold">
                                                Modo Teste
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-xs rounded-full">
                                                {user.plans?.name || 'Básico'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`flex items-center gap-1 text-xs font-medium ${user.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                            {user.is_active ? 'Ativo' : 'Bloqueado'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {formatDate(user.created_at)}
                                        {user.trial_ends_at && (
                                            <div className="flex items-center gap-1 mt-1 text-[10px] text-orange-400 font-medium whitespace-nowrap">
                                                <Calendar className="w-3 h-3" />Expira: {formatDate(user.trial_ends_at)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => toggleUser(user.id, user.is_active)}
                                                    disabled={toggling === user.id}
                                                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${user.is_active ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}`}
                                                >
                                                    {toggling === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : user.is_active ? <Ban className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                                    {user.is_active ? 'Bloquear' : 'Ativar'}
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] text-muted-foreground mr-1">Trial:</span>
                                                {[7, 15, 30].map(days => (
                                                    <button
                                                        key={days}
                                                        onClick={() => addTrialDays(user.id, days)}
                                                        disabled={updatingTrial === user.id}
                                                        className="flex-1 text-[10px] font-bold px-1.5 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-all disabled:opacity-50"
                                                    >
                                                        +{days}d
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filtered.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">Nenhum usuário encontrado</div>
                    )}
                </div>
            </div>
        </div>
    )
}
