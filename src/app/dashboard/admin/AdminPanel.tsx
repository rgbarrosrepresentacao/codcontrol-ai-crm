'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Shield, Users, Smartphone, BarChart3, Search, Ban, CheckCircle2, Loader2, Megaphone, Trash2, Send, Calendar, Clock, GraduationCap, Plus, ExternalLink, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { toggleUserStatusAction, updateUserTrialAction, saveAnnouncementAction, deleteAnnouncementAction, saveMaterialAction, deleteMaterialAction } from './actions'

interface AdminPanelProps {
    users: any[]
    instances: any[]
    plans: any[]
    initialAnnouncements: any[]
    initialMaterials: any[]
}

export default function AdminPanel({ users, instances, plans, initialAnnouncements, initialMaterials }: AdminPanelProps) {
    const [search, setSearch] = useState('')
    const [toggling, setToggling] = useState<string | null>(null)
    const [updatingTrial, setUpdatingTrial] = useState<string | null>(null)
    const [localUsers, setLocalUsers] = useState(users)
    const [announcement, setAnnouncement] = useState({ title: '', content: '', type: 'info' })
    const [sending, setSending] = useState(false)
    const [localAnnouncements, setLocalAnnouncements] = useState(initialAnnouncements)
    const [deletingAnnouncement, setDeletingAnnouncement] = useState<string | null>(null)

    // Academy Materials State
    const [material, setMaterial] = useState({ title: '', type: 'PDF', link: '' })
    const [savingMaterial, setSavingMaterial] = useState(false)
    const [localMaterials, setLocalMaterials] = useState(initialMaterials)
    const [deletingMaterial, setDeletingMaterial] = useState<string | null>(null)

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

            {/* Global Announcements Section */}
            <div className="grid lg:grid-cols-2 gap-6">
                <div className="gradient-card border border-border rounded-xl p-6">
                    <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-primary" /> Novo Comunicado Global
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Título do Aviso</label>
                            <input
                                value={announcement.title}
                                onChange={e => setAnnouncement({ ...announcement, title: e.target.value })}
                                placeholder="Ex: Manutenção, Novidade..."
                                className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Mensagem</label>
                            <textarea
                                value={announcement.content}
                                onChange={e => setAnnouncement({ ...announcement, content: e.target.value })}
                                placeholder="Digite a mensagem para todos os usuários..."
                                rows={3}
                                className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                        </div>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">Tipo de Alerta</label>
                                <select
                                    value={announcement.type}
                                    onChange={e => setAnnouncement({ ...announcement, type: e.target.value })}
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                                >
                                    <option value="info">💡 Informativo (Azul)</option>
                                    <option value="warning">⚠️ Aviso (Laranja)</option>
                                    <option value="critical">⚡ Crítico (Vermelho)</option>
                                </select>
                            </div>
                            <button
                                onClick={handleSendAnnouncement}
                                disabled={sending}
                                className="gradient-primary text-black font-bold h-10 px-6 rounded-lg text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Disparar
                            </button>
                        </div>
                    </div>
                </div>

                <div className="gradient-card border border-border rounded-xl p-6 flex flex-col">
                    <h2 className="font-semibold text-foreground mb-4">📢 Comunicados Ativos</h2>
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                        {localAnnouncements.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-xs italic">Nenhum comunicado ativo</div>
                        ) : (
                            localAnnouncements.map(a => (
                                <div key={a.id} className="bg-secondary/30 border border-border/50 rounded-lg p-3 flex items-start justify-between gap-3 group">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`w-2 h-2 rounded-full ${a.type === 'critical' ? 'bg-red-500' : a.type === 'warning' ? 'bg-orange-500' : 'bg-primary'}`} />
                                            <span className="text-xs font-bold text-foreground">[{a.title}]</span>
                                            <span className="text-[10px] text-muted-foreground">{formatDate(a.created_at)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">{a.content}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteAnnouncement(a.id)}
                                        disabled={deletingAnnouncement === a.id}
                                        className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        {deletingAnnouncement === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Academy Materials Management Section */}
            <div className="grid lg:grid-cols-2 gap-6">
                <div className="gradient-card border border-border rounded-xl p-6">
                    <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                        <GraduationCap className="w-5 h-5 text-primary" /> Novo Material de Estudo
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Título do Material</label>
                            <input
                                value={material.title}
                                onChange={e => setMaterial({ ...material, title: e.target.value })}
                                placeholder="Ex: Manual de Configuração, PDF de Estratégias..."
                                className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Link do Material (PDF, Drive, Web)</label>
                            <input
                                value={material.link}
                                onChange={e => setMaterial({ ...material, link: e.target.value })}
                                placeholder="https://..."
                                className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                        </div>
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                                <select
                                    value={material.type}
                                    onChange={e => setMaterial({ ...material, type: e.target.value })}
                                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                                >
                                    <option value="PDF">📄 PDF</option>
                                    <option value="LINK">🔗 Link Externo</option>
                                    <option value="VIDEO">🎥 Vídeo Extra</option>
                                    <option value="DOC">📝 Documento</option>
                                </select>
                            </div>
                            <button
                                onClick={handleSaveMaterial}
                                disabled={savingMaterial}
                                className="gradient-primary text-black font-bold h-10 px-6 rounded-lg text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
                            >
                                {savingMaterial ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>

                <div className="gradient-card border border-border rounded-xl p-6 flex flex-col">
                    <h2 className="font-semibold text-foreground mb-4">📚 Materiais Cadastrados</h2>
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                        {localMaterials.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-xs italic">Nenhum material cadastrado</div>
                        ) : (
                            localMaterials.map((m: any) => (
                                <div key={m.id} className="bg-secondary/30 border border-border/50 rounded-lg p-3 flex items-start justify-between gap-3 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            {m.type === 'PDF' ? <FileText className="w-4 h-4 text-primary" /> : <ExternalLink className="w-4 h-4 text-primary" />}
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-foreground">{m.title}</div>
                                            <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{m.link}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteMaterial(m.id)}
                                        disabled={deletingMaterial === m.id}
                                        className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        {deletingMaterial === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
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
