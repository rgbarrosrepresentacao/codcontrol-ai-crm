'use client'
import { useState, useEffect, useCallback } from 'react'
import { Building2, RefreshCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabVisaoGeral } from './components/TabVisaoGeral'
import { TabTemplates } from './components/TabTemplates'
import { TabJanela24h } from './components/TabJanela24h'
import { TabCustos } from './components/TabCustos'

const TABS = [
    { id: 'visao-geral', label: 'Visão Geral' },
    { id: 'templates', label: 'Templates' },
    { id: 'janela-24h', label: 'Janela 24h' },
    { id: 'custos', label: 'Custos' },
]

export default function CentralMetaPage() {
    const [activeTab, setActiveTab] = useState('visao-geral')
    const [templates, setTemplates] = useState<any[]>([])
    const [conversations, setConversations] = useState<any>(null)
    const [logs, setLogs] = useState<any[]>([])
    const [loadingTemplates, setLoadingTemplates] = useState(false)
    const [loadingConversations, setLoadingConversations] = useState(false)
    const [loadingLogs, setLoadingLogs] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [lastSync, setLastSync] = useState<string | null>(null)

    const fetchTemplates = useCallback(async () => {
        setLoadingTemplates(true)
        try {
            const res = await fetch('/api/meta/templates')
            const data = await res.json()
            if (data.templates) setTemplates(data.templates)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingTemplates(false)
        }
    }, [])

    const fetchConversations = useCallback(async () => {
        setLoadingConversations(true)
        try {
            const res = await fetch('/api/meta/conversations')
            const data = await res.json()
            if (!data.error) setConversations(data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingConversations(false)
        }
    }, [])

    const fetchLogs = useCallback(async () => {
        setLoadingLogs(true)
        try {
            const res = await fetch('/api/meta/logs')
            const data = await res.json()
            if (data.logs) setLogs(data.logs)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingLogs(false)
        }
    }, [])

    const syncTemplates = async () => {
        setSyncing(true)
        try {
            const res = await fetch('/api/meta/templates', { method: 'POST' })
            const data = await res.json()
            if (data.templates) {
                setTemplates(data.templates)
                setLastSync(new Date().toLocaleTimeString('pt-BR'))
            }
        } catch (e) {
            console.error(e)
        } finally {
            setSyncing(false)
        }
    }

    useEffect(() => {
        fetchTemplates()
        fetchConversations()
        fetchLogs()
    }, [fetchTemplates, fetchConversations, fetchLogs])

    const approved = templates.filter(t => t.status === 'APPROVED')
    const pending = templates.filter(t => t.status === 'PENDING')
    const rejected = templates.filter(t => t.status === 'REJECTED')

    const stats = {
        conversasAbertas: conversations?.open ?? 0,
        foraJanela: conversations?.closed ?? 0,
        templates: templates.length,
        templatesAprovados: approved.length,
    }

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30">
                            <Building2 className="w-5 h-5 text-purple-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Central Meta</h1>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">PRO</span>
                    </div>
                    <p className="text-gray-400 text-sm mt-1 ml-11">Gerencie sua conta da API Oficial do WhatsApp Business</p>
                </div>
                <div className="flex items-center gap-3">
                    {lastSync && <span className="text-xs text-gray-500">Última sync: {lastSync}</span>}
                    <button
                        onClick={syncTemplates}
                        disabled={syncing}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/20"
                    >
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                        Sincronizar dados
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit overflow-x-auto">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                            activeTab === tab.id
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        )}
                    >
                        {tab.label}
                        {tab.id === 'janela-24h' && conversations?.closed > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">
                                {conversations.closed}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            {activeTab === 'visao-geral' && <TabVisaoGeral stats={stats} templates={templates} conversations={conversations} />}
            {activeTab === 'templates' && <TabTemplates templates={templates} loading={loadingTemplates} onSync={syncTemplates} syncing={syncing} />}
            {activeTab === 'janela-24h' && <TabJanela24h data={conversations} loading={loadingConversations} approvedTemplates={approved} />}
            {activeTab === 'custos' && <TabCustos conversations={conversations} templates={templates} logs={logs} loading={loadingLogs} />}
        </div>
    )
}
