'use client'
import { DollarSign, TrendingUp, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Tabela de preços estimados por categoria (USD → BRL aproximado)
const COST_TABLE = {
    marketing: 0.125,
    utility: 0.040,
    authentication: 0.035,
    service: 0.015,
}
const USD_TO_BRL = 5.0

export function TabCustos({ conversations, templates }: any) {
    const convList: any[] = conversations?.conversations || []

    // Calcular estimativas por categoria
    const byCategory = {
        marketing: convList.filter(c => c.pricing_category === 'marketing').length,
        utility: convList.filter(c => c.pricing_category === 'utility').length,
        authentication: convList.filter(c => c.pricing_category === 'authentication').length,
        service: convList.filter(c => c.pricing_category === 'service' || !c.pricing_category).length,
    }

    const totalUSD = Object.entries(byCategory).reduce((acc, [cat, count]) => {
        return acc + (count * (COST_TABLE[cat as keyof typeof COST_TABLE] || 0))
    }, 0)

    const totalBRL = totalUSD * USD_TO_BRL

    // Volume de templates
    const templatesSent = templates.filter((t: any) => t.status === 'APPROVED').length
    const conversasAbertas = conversations?.open ?? 0
    const conversasFechadas = conversations?.closed ?? 0

    const metrics = [
        { label: 'Conversas Iniciadas', value: convList.length, color: 'blue' },
        { label: 'Conversas Abertas', value: conversasAbertas, color: 'emerald' },
        { label: 'Conversas Fora da Janela', value: conversasFechadas, color: 'amber' },
        { label: 'Templates Aprovados', value: templatesSent, color: 'purple' },
    ]

    const distribution = [
        { label: 'Marketing', count: byCategory.marketing, cost: byCategory.marketing * COST_TABLE.marketing * USD_TO_BRL, color: 'purple', pct: COST_TABLE.marketing },
        { label: 'Utilidade', count: byCategory.utility, cost: byCategory.utility * COST_TABLE.utility * USD_TO_BRL, color: 'blue', pct: COST_TABLE.utility },
        { label: 'Autenticação', count: byCategory.authentication, cost: byCategory.authentication * COST_TABLE.authentication * USD_TO_BRL, color: 'orange', pct: COST_TABLE.authentication },
        { label: 'Serviço', count: byCategory.service, cost: byCategory.service * COST_TABLE.service * USD_TO_BRL, color: 'gray', pct: COST_TABLE.service },
    ]

    return (
        <div className="space-y-6">
            {/* Aviso de estimativa */}
            <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-300">
                    <strong>Custo estimado</strong> — Os valores são aproximações baseadas nas taxas públicas da Meta para o Brasil.
                    Para valores exatos, consulte o <a href="https://business.facebook.com/billing" target="_blank" rel="noreferrer" className="underline hover:text-blue-200">Gerenciador de Negócios da Meta</a>.
                    Taxa de câmbio utilizada: R$ {USD_TO_BRL.toFixed(2)}/USD.
                </p>
            </div>

            {/* Custo total em destaque */}
            <div className="p-6 bg-gradient-to-br from-purple-500/20 to-blue-500/10 border border-purple-500/20 rounded-3xl flex items-center justify-between">
                <div>
                    <p className="text-sm text-purple-300/70 font-medium">Custo Estimado do Mês</p>
                    <h2 className="text-4xl font-bold text-white mt-1">
                        R$ {totalBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">≈ USD {totalUSD.toFixed(2)} (estimado)</p>
                </div>
                <div className="p-4 rounded-3xl bg-purple-500/20 border border-purple-500/30">
                    <DollarSign className="w-10 h-10 text-purple-400" />
                </div>
            </div>

            {/* Métricas rápidas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map(m => (
                    <div key={m.label} className="p-4 bg-white/5 border border-white/10 rounded-2xl">
                        <p className="text-xs text-gray-400">{m.label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
                    </div>
                ))}
            </div>

            {/* Distribuição por categoria */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <h3 className="font-semibold text-white">Distribuição por Categoria</h3>
                </div>
                <div className="space-y-3">
                    {distribution.map(d => (
                        <div key={d.label} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        'w-2 h-2 rounded-full',
                                        d.color === 'purple' && 'bg-purple-400',
                                        d.color === 'blue' && 'bg-blue-400',
                                        d.color === 'orange' && 'bg-orange-400',
                                        d.color === 'gray' && 'bg-gray-400',
                                    )} />
                                    <span className="text-sm text-gray-300">{d.label}</span>
                                    <span className="text-xs text-gray-500">({d.count} conv.)</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-sm font-medium text-white">
                                        R$ {d.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-2">
                                        @ R${(d.pct * USD_TO_BRL).toFixed(3)}/conv
                                    </span>
                                </div>
                            </div>
                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all',
                                        d.color === 'purple' && 'bg-purple-400',
                                        d.color === 'blue' && 'bg-blue-400',
                                        d.color === 'orange' && 'bg-orange-400',
                                        d.color === 'gray' && 'bg-gray-400',
                                    )}
                                    style={{ width: `${convList.length > 0 ? (d.count / convList.length) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
