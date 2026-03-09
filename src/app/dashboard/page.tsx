import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { MessageSquare, Smartphone, Brain, Users, TrendingUp, Zap, Clock, CheckCircle2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default async function DashboardPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [profileRes, instancesRes, contactsRes, conversationsRes, messagesRes] = await Promise.all([
        supabase.from('profiles').select('*, plans(name, max_whatsapp, max_messages)').eq('id', user.id).single(),
        supabase.from('whatsapp_instances').select('*').eq('user_id', user.id),
        supabase.from('contacts').select('id', { count: 'exact' }).eq('user_id', user.id),
        supabase.from('conversations').select('*', { count: 'exact' }).eq('user_id', user.id).eq('status', 'open'),
        supabase.from('messages').select('id, from_me, ai_generated', { count: 'exact' }).eq('user_id', user.id),
    ])

    const profile = profileRes.data as any
    const instances = instancesRes.data || []
    const contactCount = contactsRes.count || 0
    const openConversations = conversationsRes.count || 0
    const messages = messagesRes.data || []
    const totalMessages = messagesRes.count || 0
    const aiMessages = messages.filter((m: any) => m.ai_generated).length
    const connectedInstances = instances.filter((i: any) => i.status === 'connected')

    const planName = profile?.plans?.name || 'Básico'
    const maxWhatsapps = profile?.plans?.max_whatsapp || 1
    const maxMessages = profile?.plans?.max_messages || 1000
    const messagesUsed = profile?.messages_used || 0

    const stats = [
        { label: 'WhatsApps Conectados', value: `${connectedInstances.length}/${maxWhatsapps}`, icon: Smartphone, color: 'from-emerald-500/20 to-teal-500/20', textColor: 'text-emerald-400', sub: `${instances.length} total` },
        { label: 'Mensagens Recebidas', value: messages.filter((m: any) => !m.from_me).length.toLocaleString(), icon: MessageSquare, color: 'from-blue-500/20 to-cyan-500/20', textColor: 'text-blue-400', sub: 'Histórico total' },
        { label: 'Conversas Ativas', value: openConversations.toLocaleString(), icon: Users, color: 'from-purple-500/20 to-pink-500/20', textColor: 'text-purple-400', sub: 'Em aberto' },
        { label: 'Respostas com IA', value: aiMessages.toLocaleString(), icon: Brain, color: 'from-orange-500/20 to-red-500/20', textColor: 'text-orange-400', sub: `${totalMessages} total de msgs` },
    ]

    return (
        <div className="p-6 md:p-8 space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Olá, {profile?.name?.split(' ')[0] || 'usuário'} 👋
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Bem-vindo ao seu painel — {formatDate(new Date())}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg">
                        <span className="text-primary text-sm font-medium">Plano {planName}</span>
                    </div>
                    {profile?.plan_expires_at && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            Expira em {formatDate(profile.plan_expires_at)}
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <div key={stat.label} className="gradient-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
                        <div className="flex items-start justify-between mb-3">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                                <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
                            </div>
                            <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className={`text-2xl font-bold ${stat.textColor} mb-0.5`}>{stat.value}</div>
                        <div className="text-foreground text-sm font-medium">{stat.label}</div>
                        <div className="text-muted-foreground text-xs mt-0.5">{stat.sub}</div>
                    </div>
                ))}
            </div>

            {/* Middle Row */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* AI Usage */}
                <div className="gradient-card border border-border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-foreground flex items-center gap-2">
                            <Brain className="w-4 h-4 text-primary" />Uso de IA
                        </h2>
                        <span className="text-xs text-muted-foreground">Mensal</span>
                    </div>
                    <div className="mb-3">
                        <div className="flex items-center justify-between text-sm mb-1.5">
                            <span className="text-muted-foreground">Mensagens usadas</span>
                            <span className="text-foreground font-medium">
                                {messagesUsed} / {maxMessages === -1 ? '∞' : maxMessages.toLocaleString()}
                            </span>
                        </div>
                        {maxMessages !== -1 && (
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                <div
                                    className="h-full gradient-primary rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min((messagesUsed / maxMessages) * 100, 100)}%` }}
                                />
                            </div>
                        )}
                        {maxMessages === -1 && (
                            <div className="h-2 bg-primary/30 rounded-full overflow-hidden">
                                <div className="h-full gradient-primary rounded-full w-1/3 animate-pulse-soft" />
                            </div>
                        )}
                    </div>
                    {maxMessages !== -1 && (
                        <p className="text-xs text-muted-foreground">
                            {Math.max(0, maxMessages - messagesUsed).toLocaleString()} mensagens restantes
                        </p>
                    )}
                    {maxMessages === -1 && (
                        <p className="text-xs text-primary">✓ Mensagens ilimitadas</p>
                    )}
                </div>

                {/* WhatsApp Status */}
                <div className="gradient-card border border-border rounded-xl p-6 lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-foreground flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-primary" />Instâncias WhatsApp
                        </h2>
                        <a href="/dashboard/whatsapp" className="text-xs text-primary hover:underline">Ver todas →</a>
                    </div>
                    {instances.length === 0 ? (
                        <div className="text-center py-8">
                            <Smartphone className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                            <p className="text-muted-foreground text-sm mb-4">Nenhum WhatsApp conectado ainda</p>
                            <a href="/dashboard/whatsapp" className="gradient-primary text-black text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5" /> Conectar agora
                            </a>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {instances.map((inst: any) => (
                                <div key={inst.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2.5 h-2.5 rounded-full status-${inst.status}`} />
                                        <div>
                                            <div className="text-sm font-medium text-foreground">{inst.display_name || inst.instance_name}</div>
                                            <div className="text-xs text-muted-foreground">{inst.phone_number || 'Sem número'}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-muted-foreground">
                                            {inst.messages_received} recebidas · {inst.messages_sent} enviadas
                                        </div>
                                        <div className={`text-xs font-medium mt-0.5 ${inst.status === 'connected' ? 'text-emerald-400' : inst.status === 'qr_code' ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                                            {inst.status === 'connected' ? '● Online' : inst.status === 'qr_code' ? '◎ Aguardando QR' : '○ Desconectado'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="gradient-card border border-border rounded-xl p-6">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />Ações rápidas
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { href: '/dashboard/whatsapp', label: 'Conectar WhatsApp', icon: Smartphone, color: 'from-emerald-500/20 to-teal-500/20', textColor: 'text-emerald-400' },
                        { href: '/dashboard/ia', label: 'Configurar IA', icon: Brain, color: 'from-purple-500/20 to-pink-500/20', textColor: 'text-purple-400' },
                        { href: '/dashboard/crm', label: 'Ver Contatos', icon: Users, color: 'from-blue-500/20 to-cyan-500/20', textColor: 'text-blue-400' },
                        { href: '/dashboard/planos', label: 'Upgrade de Plano', icon: TrendingUp, color: 'from-orange-500/20 to-red-500/20', textColor: 'text-orange-400' },
                    ].map((action) => (
                        <a key={action.href} href={action.href} className="flex flex-col items-center gap-2 p-4 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors group text-center">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                <action.icon className={`w-5 h-5 ${action.textColor}`} />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{action.label}</span>
                        </a>
                    ))}
                </div>
            </div>

            {/* System Status */}
            <div className="grid md:grid-cols-3 gap-4">
                {[
                    { label: 'Evolution API', status: 'online', desc: 'api.codcontrolpro.bond' },
                    { label: 'n8n Webhook', status: 'online', desc: 'n8n.codcontrolpro.bond' },
                    { label: 'Banco de dados', status: 'online', desc: 'Supabase PostgreSQL' },
                ].map((s) => (
                    <div key={s.label} className="gradient-card border border-border rounded-xl p-4 flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${s.status === 'online' ? 'status-connected' : 'status-disconnected'}`} />
                        <div>
                            <div className="text-sm font-medium text-foreground">{s.label}</div>
                            <div className="text-xs text-muted-foreground">{s.desc}</div>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    )
}
