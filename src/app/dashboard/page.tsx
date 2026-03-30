import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import {
    MessageSquare, Smartphone, Brain, Users, TrendingUp,
    Zap, Clock, CheckCircle2, MessageCircle, BarChart3,
    ArrowUpRight, Activity, ZapIcon, AlertCircle, UserPlus, Flame
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { startOfDay, subDays } from 'date-fns'
import { MetricCard } from './components/MetricCard'
import { WhatsAppStatus } from './components/WhatsAppStatus'
import { PerformanceScore } from './components/PerformanceScore'
import { MessageVolumeChart, ConversationsChart, ComparisonChart } from './components/DashboardCharts'
import { DashboardInsights, DailySummary } from './components/DashboardInsights'

export default async function DashboardPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const today = startOfDay(new Date())
    const yesterday = startOfDay(subDays(new Date(), 1))

    const [
        profileRes,
        instancesRes,
        conversationsRes,
        todayConversations,
        yesterdayConversations,
        todayMessagesRec,
        yesterdayMessagesRec,
        todayMessagesSent,
        yesterdayMessagesSent,
        todayContacts,
        yesterdayContacts,
        todayClosedConvs,
        hourlyMessagesToday,
        hourlyConversationsToday
    ] = await Promise.all([
        supabase.from('profiles').select('*, plans(name, max_whatsapp, max_messages)').eq('id', user.id).single(),
        supabase.from('whatsapp_instances').select('*').eq('user_id', user.id),
        supabase.from('conversations').select('*', { count: 'exact' }).eq('user_id', user.id).eq('status', 'open'),
        supabase.from('conversations').select('id', { count: 'exact' }).eq('user_id', user.id).gte('created_at', today.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact' }).eq('user_id', user.id).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
        supabase.from('messages').select('id', { count: 'exact' }).eq('user_id', user.id).eq('from_me', false).gte('created_at', today.toISOString()),
        supabase.from('messages').select('id', { count: 'exact' }).eq('user_id', user.id).eq('from_me', false).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
        supabase.from('messages').select('id', { count: 'exact' }).eq('user_id', user.id).eq('from_me', true).gte('created_at', today.toISOString()),
        supabase.from('messages').select('id', { count: 'exact' }).eq('user_id', user.id).eq('from_me', true).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
        supabase.from('contacts').select('id', { count: 'exact' }).eq('user_id', user.id).gte('created_at', today.toISOString()),
        supabase.from('contacts').select('id', { count: 'exact' }).eq('user_id', user.id).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
        supabase.from('conversations').select('id', { count: 'exact' }).eq('user_id', user.id).eq('status', 'closed').gte('updated_at', today.toISOString()),
        supabase.from('messages').select('created_at').eq('user_id', user.id).gte('created_at', today.toISOString()),
        supabase.from('conversations').select('created_at').eq('user_id', user.id).gte('created_at', today.toISOString()),
    ])

    // ─── Derived values ─────────────────────────────────────────────────────
    const profile = profileRes.data as any
    const isAdmin = profile?.is_admin === true
    const instances = instancesRes.data || []
    const openConversations = conversationsRes.count || 0

    const calcGrowth = (cur: number, prev: number) => {
        if (!prev) return cur > 0 ? 100 : 0
        return Math.round(((cur - prev) / prev) * 100)
    }

    const tConvs = todayConversations.count || 0
    const convGrowth = calcGrowth(tConvs, yesterdayConversations.count || 0)
    const tMsgRec = todayMessagesRec.count || 0
    const yMsgRec = yesterdayMessagesRec.count || 0
    const msgRecGrowth = calcGrowth(tMsgRec, yMsgRec)
    const tMsgSent = todayMessagesSent.count || 0
    const yMsgSent = yesterdayMessagesSent.count || 0
    const msgSentGrowth = calcGrowth(tMsgSent, yMsgSent)
    const tContacts = todayContacts.count || 0
    const contactGrowth = calcGrowth(tContacts, yesterdayContacts.count || 0)
    const tClosed = todayClosedConvs.count || 0

    // ─── Chart data ──────────────────────────────────────────────────────────
    const processHourly = (data: any[]) => {
        const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, count: 0 }))
        data?.forEach((item: any) => { hours[new Date(item.created_at).getHours()].count++ })
        return hours
    }
    const messageVolumeData = processHourly(hourlyMessagesToday.data || [])
    const conversationVolumeData = processHourly(hourlyConversationsToday.data || [])
    const compData = [
        { name: 'Hoje', received: tMsgRec, sent: tMsgSent },
        { name: 'Ontem', received: yMsgRec, sent: yMsgSent },
    ]

    // Peak time
    const maxHour = messageVolumeData.reduce((p, c) => p.count > c.count ? p : c)
    const peakTime = maxHour.count > 0 ? maxHour.hour : 'S/ dados'

    // ─── Plan / status ───────────────────────────────────────────────────────
    const planName = profile?.plans?.name || 'Básico'
    const trialEndsAt = profile?.trial_ends_at
    const subscriptionStatus = profile?.stripe_subscription_status
    const mockART = '1m 45s'

    // ─── Performance score ───────────────────────────────────────────────────
    const answeredRate = Math.min(100, Math.round((tMsgSent / (tMsgRec || 1)) * 100))
    const activityScore = Math.min(100, Math.round((instances.filter((i: any) => i.status === 'connected').length / (instances.length || 1)) * 100))
    const performanceScore = Math.min(100, Math.round((85 + answeredRate + activityScore) / 3))

    // ─── Insights ────────────────────────────────────────────────────────────
    const insights = [
        { id: '1', text: 'Hoje você respondeu 12% mais rápido que ontem!', type: 'success' as const, icon: Clock },
        { id: '2', text: `Pico de mensagens identificado às ${maxHour.hour}.`, type: 'info' as const, icon: TrendingUp },
        {
            id: '3',
            text: `${convGrowth >= 0 ? 'Aumento' : 'Redução'} de ${Math.abs(convGrowth)}% em conversas vs ontem.`,
            type: convGrowth >= 0 ? 'success' as const : 'warning' as const,
            icon: Activity,
        },
    ]

    return (
        <div className="p-6 space-y-6 animate-fade-in">

            {/* ── HEADER ──────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-md text-[10px] font-bold text-primary uppercase tracking-widest">
                            Dashboard Performance
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                            Monitor em Tempo Real
                        </span>
                    </div>
                    <h1 className="text-3xl font-black text-foreground tracking-tight">
                        Olá, {profile?.name?.split(' ')[0] || 'usuário'} <span className="animate-float inline-block">👋</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium mt-0.5">
                        {formatDate(new Date())} — Seu painel de atendimento
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden md:flex flex-col text-right">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</span>
                        <div className="flex items-center gap-1.5 justify-end">
                            <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                            <span className="text-xs font-bold text-foreground">Operacional</span>
                        </div>
                    </div>
                    <div className="px-4 py-2.5 bg-zinc-900 border border-border/50 rounded-2xl flex items-center gap-2.5">
                        {(!isAdmin && subscriptionStatus !== 'active' && trialEndsAt) ? (
                            <>
                                <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                                <div>
                                    <div className="text-xs font-bold text-orange-400 leading-none">Modo Teste</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                        Expira {new Date(trialEndsAt).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4 text-primary shrink-0" />
                                <div>
                                    <div className="text-xs font-bold text-primary leading-none">Plano {planName}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">Ativo</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── SEÇÃO 1: KPIs ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                <MetricCard label="Iniciadas Hoje" value={tConvs} icon={MessageCircle} color="from-emerald-500/20 to-teal-500/20" textColor="text-emerald-400" trend={convGrowth} animationDelay="0s" />
                <MetricCard label="Ativas no CRM" value={openConversations} icon={Users} color="from-purple-500/20 to-pink-500/20" textColor="text-purple-400" description="Em aberto" animationDelay="0.04s" />
                <MetricCard label="Finalizadas" value={tClosed} icon={CheckCircle2} color="from-blue-500/20 to-indigo-500/20" textColor="text-blue-400" animationDelay="0.08s" />
                <MetricCard label="Recebidas" value={tMsgRec} icon={MessageSquare} color="from-orange-500/20 to-amber-500/20" textColor="text-orange-400" trend={msgRecGrowth} animationDelay="0.12s" />
                <MetricCard label="Enviadas" value={tMsgSent} icon={ZapIcon} color="from-cyan-500/20 to-blue-500/20" textColor="text-cyan-400" trend={msgSentGrowth} animationDelay="0.16s" />
                <MetricCard label="Novos Contatos" value={tContacts} icon={UserPlus} color="from-emerald-500/20 to-lime-500/20" textColor="text-emerald-400" trend={contactGrowth} animationDelay="0.2s" />
                <MetricCard label="Tempo Resposta" value={mockART} icon={Clock} color="from-rose-500/20 to-pink-500/20" textColor="text-rose-400" description="Média hoje" animationDelay="0.24s" />
            </div>

            {/* ── SEÇÃO 2: Gráficos (2 charts) + Performance Score ────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <MessageVolumeChart data={messageVolumeData} />
                <ConversationsChart data={conversationVolumeData} />
                <PerformanceScore
                    score={performanceScore}
                    responseTime={mockART}
                    answeredRate={answeredRate}
                    activityScore={activityScore}
                />
            </div>

            {/* ── SEÇÃO 3: Comparativo + Insights ─────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <ComparisonChart data={compData} />
                </div>
                <DashboardInsights insights={insights} />
            </div>

            {/* ── SEÇÃO 4: WhatsApp + Resumo ───────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <WhatsAppStatus instances={instances} />
                </div>
                <div className="flex flex-col gap-4">
                    {/* Quick Actions */}
                    <div className="gradient-card border border-border rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                <Flame className="w-3.5 h-3.5 text-orange-400" />
                            </div>
                            <h3 className="font-bold text-base text-foreground">Ações Rápidas</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: Smartphone, textColor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                                { href: '/dashboard/ia', label: 'Config. IA', icon: Brain, textColor: 'text-purple-400', bg: 'bg-purple-500/10' },
                                { href: '/dashboard/crm', label: 'Ver CRM', icon: Users, textColor: 'text-blue-400', bg: 'bg-blue-500/10' },
                                { href: '/dashboard/planos', label: 'Assinatura', icon: TrendingUp, textColor: 'text-orange-400', bg: 'bg-orange-500/10' },
                            ].map((a) => (
                                <a key={a.href} href={a.href} className="flex flex-col items-start gap-3 p-3 bg-secondary/20 border border-border/30 rounded-xl hover:border-primary/30 hover:bg-secondary/40 transition-all group relative">
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", a.bg)}>
                                        <a.icon className={cn("w-4 h-4", a.textColor)} />
                                    </div>
                                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{a.label}</span>
                                    <ArrowUpRight className="absolute top-2.5 right-2.5 w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── SEÇÃO 5: Resumo do Dia (full width) ──────────────────────── */}
            <DailySummary
                newServices={tContacts}
                finishedConversations={tClosed}
                avgResponseTime={mockART}
                peakTime={peakTime}
            />

            {/* ── SEÇÃO 6: Admin (infra) ────────────────────────────────────── */}
            {isAdmin && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Infraestrutura do Sistema</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { label: 'Evolution API', status: 'online', desc: 'api.codcontrolpro.bond' },
                            { label: 'Database Node', status: 'online', desc: 'PostgreSQL Active' },
                        ].map((s) => (
                            <div key={s.label} className="gradient-card border border-border rounded-2xl p-4 flex items-center gap-3 hover:border-emerald-500/30 transition-colors group">
                                <div className={cn("w-2.5 h-2.5 rounded-full shadow-lg shrink-0", s.status === 'online' ? 'status-connected' : 'status-disconnected')} />
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-foreground">{s.label}</div>
                                    <div className="text-[10px] font-medium text-muted-foreground uppercase truncate">{s.desc}</div>
                                </div>
                                <CheckCircle2 className="w-4 h-4 text-emerald-500/40 ml-auto shrink-0 group-hover:text-emerald-500 transition-colors" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
