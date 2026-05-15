'use client'
import { RefreshCcw, Loader2, Search, Eye, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { StatusBadge } from './TabVisaoGeral'

export function TabTemplates({ templates, loading, onSync, syncing }: any) {
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState('all')
    const [preview, setPreview] = useState<any | null>(null)

    const filtered = templates.filter((t: any) => {
        const matchSearch = t.name?.toLowerCase().includes(search.toLowerCase())
        const matchStatus = filterStatus === 'all' || t.status === filterStatus
        return matchSearch && matchStatus
    })

    const statusFilters = [
        { value: 'all', label: 'Todos' },
        { value: 'APPROVED', label: 'Aprovados' },
        { value: 'PENDING', label: 'Pendentes' },
        { value: 'REJECTED', label: 'Rejeitados' },
        { value: 'PAUSED', label: 'Pausados' },
    ]

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Buscar template..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 outline-none focus:border-purple-500/50"
                    />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {statusFilters.map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFilterStatus(f.value)}
                            className={cn(
                                'px-3 py-1.5 rounded-xl text-xs font-medium transition-all border',
                                filterStatus === f.value
                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                    : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={onSync}
                    disabled={syncing}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all whitespace-nowrap"
                >
                    {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                    Sincronizar
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 border-dashed rounded-3xl">
                    <AlertTriangle className="w-10 h-10 text-gray-600 mb-3" />
                    <p className="text-white font-medium">Nenhum template encontrado</p>
                    <p className="text-gray-400 text-sm mt-1">
                        {templates.length === 0
                            ? 'Clique em "Sincronizar" para buscar seus templates da Meta.'
                            : 'Tente ajustar os filtros.'}
                    </p>
                </div>
            ) : (
                <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left p-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Template</th>
                                    <th className="text-left p-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Categoria</th>
                                    <th className="text-left p-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Idioma</th>
                                    <th className="text-left p-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Status</th>
                                    <th className="text-left p-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filtered.map((t: any) => (
                                    <tr key={t.id} className="hover:bg-white/5 transition-colors">
                                        <td className="p-4">
                                            <p className="text-sm font-medium text-white">{t.name}</p>
                                            {t.rejection_reason && (
                                                <p className="text-xs text-red-400 mt-0.5">⚠ {t.rejection_reason}</p>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className={cn(
                                                'text-[10px] font-bold px-2 py-1 rounded-lg border',
                                                t.category === 'marketing' && 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                                                t.category === 'utility' && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                                                t.category === 'authentication' && 'bg-orange-500/10 text-orange-400 border-orange-500/20',
                                                !['marketing','utility','authentication'].includes(t.category) && 'bg-gray-500/10 text-gray-400 border-gray-500/20',
                                            )}>
                                                {t.category?.toUpperCase() || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm text-gray-300">{t.language || 'pt_BR'}</span>
                                        </td>
                                        <td className="p-4">
                                            <StatusBadge status={t.status} />
                                        </td>
                                        <td className="p-4">
                                            {t.components && (
                                                <button
                                                    onClick={() => setPreview(preview?.id === t.id ? null : t)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs text-gray-300 transition-all"
                                                >
                                                    <Eye className="w-3 h-3" />
                                                    Preview
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Preview Panel */}
                    {preview && (
                        <div className="border-t border-white/10 p-5 bg-white/3">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm font-semibold text-white">Preview — {preview.name}</p>
                                <button onClick={() => setPreview(null)} className="text-xs text-gray-500 hover:text-white">Fechar</button>
                            </div>
                            <div className="max-w-sm bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-2">
                                {Array.isArray(preview.components) && preview.components.map((comp: any, i: number) => (
                                    <div key={i}>
                                        {comp.type === 'HEADER' && comp.format === 'TEXT' && (
                                            <p className="text-sm font-bold text-white">{comp.text}</p>
                                        )}
                                        {comp.type === 'BODY' && (
                                            <p className="text-sm text-gray-300 whitespace-pre-wrap">{comp.text}</p>
                                        )}
                                        {comp.type === 'FOOTER' && (
                                            <p className="text-xs text-gray-500 mt-2">{comp.text}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
