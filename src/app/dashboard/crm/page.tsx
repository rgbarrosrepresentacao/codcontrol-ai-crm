'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Users, 
  Search, 
  MessageSquare, 
  TrendingUp, 
  Filter, 
  MoreVertical, 
  UserPlus, 
  Download, 
  Calendar, 
  Clock,
  LayoutGrid,
  List as ListIcon,
  RefreshCcw,
  Sparkles,
  Zap,
  Target,
  BrainCircuit,
  Settings2,
  Lock,
  MessageCircle,
  Eye,
  Trash2,
  ChevronRight,
  ShieldAlert,
  Bot,
  User,
  Pause,
  Play
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import KanbanView from './KanbanView'

interface Lead {
  id: string
  name: string
  whatsapp_id: string
  ai_tag: string
  last_message: string
  last_message_at: string
  status: string
  temperature?: 'hot' | 'warm' | 'cold'
  intent?: string
  confidence?: number
  last_interaction?: string
  funnel_stage?: string
}

export default function CRMPage() {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban')
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTag, setFilterTag] = useState('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  
  const supabase = createClient()

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Obter perfil para checar admin
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      setProfile(prof)

      // Se não for admin, a visualização Kanban é permitida (trava removida para v1.6.0)
      // setViewMode('list') // Removido: Kanban agora é o padrão para todos

      const { data: contacts, error } = await supabase
        .from('contacts')
        .select(`
          id,
          name,
          whatsapp_id,
          ai_tag,
          conversations (
            last_message,
            last_message_at,
            status
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedLeads: Lead[] = contacts.map((c: any) => ({
        id: c.id,
        name: c.name || 'Sem Nome',
        whatsapp_id: c.whatsapp_id,
        ai_tag: c.ai_tag || 'NOVO',
        last_message: c.conversations?.[0]?.last_message || 'Nenhuma mensagem',
        last_message_at: c.conversations?.[0]?.last_message_at || '',
        status: c.conversations?.[0]?.status || 'open'
      }))

      setLeads(formattedLeads)
    } catch (error: any) {
      toast.error('Erro ao carregar leads: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const analyzeLeads = async () => {
    try {
      setIsRefreshing(true)
      const res = await fetch('/api/crm/analyze', { method: 'POST' })
      const data = await res.json()
      
      if (data.success) {
        toast.success(`Análise concluída: ${data.processed} leads atualizados`)
        fetchLeads()
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast.error('Erro na análise: ' + error.message)
    } finally {
      setIsRefreshing(false)
    }
  }

  const exportLeads = () => {
    const csv = [
      ['Nome', 'WhatsApp', 'Tag', 'Última Mensagem', 'Data'].join(','),
      ...leads.map(l => [
        l.name,
        l.whatsapp_id,
        l.ai_tag,
        `"${l.last_message.replace(/"/g, '""')}"`,
        l.last_message_at
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-crm-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchesSearch = lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          lead.whatsapp_id.includes(searchQuery)
      const matchesTag = filterTag === 'all' || lead.ai_tag === filterTag
      return matchesSearch && matchesTag
    })
  }, [leads, searchQuery, filterTag])

  const stats = useMemo(() => ({
    total: leads.length,
    hot: leads.filter(l => l.ai_tag === 'QUENTE').length,
    converted: leads.filter(l => l.ai_tag === 'CONVERTIDO' || l.ai_tag === 'FECHADO').length,
    waiting: leads.filter(l => l.ai_tag === 'AGUARDANDO_RESPOSTA').length
  }), [leads])

  return (
    <div className="p-4 sm:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header com Stats Pro */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent flex items-center gap-3">
            <Target className="w-8 h-8 text-blue-500" />
            CRM Inteligente
          </h1>
          <p className="text-gray-400 max-w-lg">
            Gestão avançada de leads com análise preditiva por IA e fluxos de automação.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={analyzeLeads}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-900/20 active:scale-95"
          >
            {isRefreshing ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Escanear com IA
          </button>
          
          <button
            onClick={exportLeads}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-all border border-gray-700 active:scale-95"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label="Total de Leads" 
          value={stats.total} 
          icon={<Users className="w-5 h-5 text-blue-400" />}
          color="blue"
        />
        <MetricCard 
          label="Leads Quentes" 
          value={stats.hot} 
          icon={<Zap className="w-5 h-5 text-orange-400" />}
          color="orange"
        />
        <MetricCard 
          label="Aguardando Resposta" 
          value={stats.waiting} 
          icon={<Clock className="w-5 h-5 text-purple-400" />}
          color="purple"
        />
        <MetricCard 
          label="Conversões" 
          value={stats.converted} 
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
          color="emerald"
        />
      </div>

      {/* Toolbar de Filtros */}
      <div className="bg-gray-900/50 border border-gray-800 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-950 border border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder:text-gray-600 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center bg-gray-950 p-1 rounded-xl border border-gray-800">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'kanban' 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'list' 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
              }`}
            >
              <ListIcon className="w-4 h-4" />
              Lista
            </button>
          </div>

          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="px-4 py-2 bg-gray-950 border border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none transition-all text-sm appearance-none cursor-pointer"
          >
            <option value="all">Todas as Tags</option>
            <option value="NOVO">Novo</option>
            <option value="AGUARDANDO_RESPOSTA">Aguardando Resposta</option>
            <option value="INTERESSADO">Interessado</option>
            <option value="QUENTE">Quente</option>
            <option value="CONVERTIDO">Convertido</option>
            <option value="PERDIDO">Perdido</option>
            <option value="LEAD_FRIO">Lead Frio</option>
            <option value="HUMANO">Humano</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-gray-400 animate-pulse">Sincronizando seus leads...</p>
            </div>
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanView leads={filteredLeads} onRefresh={fetchLeads} />
        ) : (
          <div className="bg-gray-900/30 border border-gray-800 rounded-2xl overflow-hidden overflow-x-auto shadow-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-900/50 border-b border-gray-800">
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Lead</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status/Tag</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Última Mensagem</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Data</th>
                  <th className="p-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-800/40 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-gray-700 flex items-center justify-center group-hover:border-blue-500/30 transition-all">
                          <User className="w-5 h-5 text-gray-400 group-hover:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white group-hover:text-blue-400 transition-colors">{lead.name}</p>
                          <p className="text-xs text-gray-500">{lead.whatsapp_id.replace('@s.whatsapp.net', '')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <TagBadge tag={lead.ai_tag} />
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-gray-300 truncate max-w-[200px]" title={lead.last_message}>
                        {lead.last_message}
                      </p>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-0.5">
                        <p className="text-xs text-gray-300">
                          {lead.last_message_at ? new Date(lead.last_message_at).toLocaleDateString('pt-BR') : '-'}
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase">
                          {lead.last_message_at ? new Date(lead.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button className="p-2 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-white transition-all" title="Ver Conversa">
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={async () => {
                            const newTag = lead.ai_tag === 'HUMANO' ? 'INTERESSADO' : 'HUMANO'
                            const { error } = await supabase.from('contacts').update({ ai_tag: newTag }).eq('id', lead.id)
                            if (!error) {
                              toast.success(newTag === 'HUMANO' ? 'Atendimento Humano Ativado' : 'IA Assumiu o controle')
                              fetchLeads()
                            }
                          }}
                          className={`p-2 rounded-lg transition-all ${
                            lead.ai_tag === 'HUMANO' 
                            ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30' 
                            : 'hover:bg-gray-700/50 text-gray-400 hover:text-white'
                          }`}
                          title={lead.ai_tag === 'HUMANO' ? 'Devolver para IA' : 'Assumir Atendimento'}
                        >
                          {lead.ai_tag === 'HUMANO' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredLeads.length === 0 && (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700">
                  <Search className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-gray-400">Nenhum lead encontrado com os filtros atuais.</p>
              </div>
            )}
          </div>
        )}
      </div>

       {/* Banner de Feedback IA */}
       <div className="bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-blue-900/20 border border-blue-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <BrainCircuit className="w-24 h-24 text-blue-400" />
        </div>
        
        <div className="bg-blue-600/20 p-4 rounded-full border border-blue-500/30">
          <Sparkles className="w-8 h-8 text-blue-400" />
        </div>

        <div className="flex-1 space-y-2 text-center md:text-left">
          <h3 className="text-lg font-semibold text-white">Análise Preditiva v1.6.0</h3>
          <p className="text-sm text-gray-400 max-w-2xl">
            Nossa IA classifica automaticamente seus leads baseada na intenção das mensagens. 
            Isso permite que você foque onde há maior probabilidade de fechamento.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Processamento Ativo
          </div>
          <div className="text-gray-700">|</div>
          <div>Precisão: 94%</div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon, color }: { label: string, value: number, icon: React.ReactNode, color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/20',
    orange: 'bg-orange-500/10 border-orange-500/20',
    purple: 'bg-purple-500/10 border-purple-500/20',
    emerald: 'bg-emerald-500/10 border-emerald-500/20'
  }

  return (
    <div className={`p-6 rounded-2xl border ${colors[color]} backdrop-blur-sm hover:scale-[1.02] transition-all duration-300 relative overflow-hidden group`}>
      <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
        {icon}
      </div>
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <span className="text-sm font-medium text-gray-400">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
    </div>
  )
}

function TagBadge({ tag }: { tag: string }) {
  const configs: Record<string, { label: string, color: string }> = {
    'NOVO': { label: 'Novo', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    'QUENTE': { label: 'Quente', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    'INTERESSADO': { label: 'Interessado', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    'CONVERTIDO': { label: 'Convertido', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    'FECHADO': { label: 'Fechado', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    'AGUARDANDO_RESPOSTA': { label: 'Aguardando', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    'LEAD_FRIO': { label: 'Lead Frio', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
    'PERDIDO': { label: 'Perdido', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
    'HUMANO': { label: 'Humano', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' }
  }

  const config = configs[tag] || configs['NOVO']

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.color}`}>
      {config.label}
    </span>
  )
}
