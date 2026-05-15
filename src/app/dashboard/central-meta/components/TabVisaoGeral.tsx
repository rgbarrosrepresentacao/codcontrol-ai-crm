'use client'
import { ArrowUpRight, ArrowDownRight, MessageSquare, Clock, FileText, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TabVisaoGeral({ stats, templates, conversations }: any) {
    const recent = [...templates].slice(0, 5)

    const statCards = [
        { label: 'Conversas Abertas', value: stats.conversasAbertas, icon: MessageSquare, color: 'emerald', change: '+12%', trend: 'up' },
        { label: 'Fora da Janela 24h', value: stats.foraJanela, icon: Clock, color: 'amber', change: stats.foraJanela > 0 ? `${stats.foraJanela} aguardando` : '0', trend: 'neutral' },
        { label: 'Templates Sincronizados', value: stats.templates, icon: FileText, color: 'blue', change: `${stats.templatesAprovados} aprovados`, trend: 'up' },
        { label: 'Taxa de Aprovação', value: stats.templates > 0 ? `${Math.round((stats.templatesAprovados / stats.templates) * 100)}%` : '—', icon: CheckCircle2, color: 'purple', change: 'templates válidos', trend: 'up' },
    ]

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map(card => (
                    <div key={card.label} className="p-5 bg-white/5 border border-white/10 rounded-3xl space-y-4 hover:border-white/20 transition-all">
                        <div className="flex items-center justify-between">
                            <div className={cn(
                                'p-2.5 rounded-2xl border',
                                card.color === 'emerald' && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
                                card.color === 'amber' && 'bg-amber-500/10 border-amber-500/20 text-amber-400',
                                card.color === 'blue' && 'bg-blue-500/10 border-blue-500/20 text-blue-400',
                                card.color === 'purple' && 'bg-purple-500/10 border-purple-500/20 text-purple-400',
                            )}>
                                <card.icon className="w-5 h-5" />
                            </div>
                            <span className={cn(
                                'text-[10px] font-semibold px-2 py-1 rounded-lg',
                                card.trend === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                            )}>
                                {card.change}
                            </span>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">{card.label}</p>
                            <h4 className="text-2xl font-bold text-white mt-1">{card.value}</h4>
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Templates Recentes */}
                <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
                    <h3 className="font-semibold text-white">Templates Recentes</h3>
                    {recent.length === 0 ? (
                        <p className="text-gray-500 text-sm py-8 text-center">Nenhum template sincronizado ainda.<br/>Clique em "Sincronizar dados" para buscar.</p>
                    ) : (
                        <div className="space-y-2">
                            {recent.map((t: any) => (
                                <div key={t.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                                    <div>
                                        <p className="text-sm font-medium text-white">{t.name}</p>
                                        <p className="text-xs text-gray-500">{t.language}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            'text-[10px] font-bold px-2 py-1 rounded-lg border',
                                            t.category === 'marketing' && 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                                            t.category === 'utility' && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                                            t.category === 'authentication' && 'bg-orange-500/10 text-orange-400 border-orange-500/20',
                                        )}>
                                            {t.category?.toUpperCase()}
                                        </span>
                                        <StatusBadge status={t.status} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Janela 24h resumo */}
                <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
                    <h3 className="font-semibold text-white">Janela de 24h</h3>
                    {!conversations ? (
                        <p className="text-gray-500 text-sm py-8 text-center">Carregando dados...</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                                <div>
                                    <p className="text-xs text-emerald-400/70">Janela Aberta</p>
                                    <p className="text-3xl font-bold text-emerald-400">{conversations.open}</p>
                                </div>
                                <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                <div>
                                    <p className="text-xs text-red-400/70">Fora da Janela</p>
                                    <p className="text-3xl font-bold text-red-400">{conversations.closed}</p>
                                </div>
                                <div className="p-3 rounded-2xl bg-red-500/20 border border-red-500/30">
                                    <Clock className="w-6 h-6 text-red-400" />
                                </div>
                            </div>
                            {conversations.closed > 0 && (
                                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                    ⚠️ {conversations.closed} conversa(s) fora da janela de 24h. Use templates aprovados para reabrir.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        'APPROVED': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        'PENDING': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        'REJECTED': 'bg-red-500/10 text-red-400 border-red-500/20',
        'PAUSED': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    }
    const labels: Record<string, string> = {
        'APPROVED': 'Aprovado', 'PENDING': 'Pendente', 'REJECTED': 'Rejeitado', 'PAUSED': 'Pausado'
    }
    return (
        <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg border', map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
            {labels[status] || status}
        </span>
    )
}
