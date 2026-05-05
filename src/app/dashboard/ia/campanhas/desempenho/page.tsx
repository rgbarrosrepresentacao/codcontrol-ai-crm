'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
    Target, Brain, Zap, AlertTriangle, TrendingUp, Search, 
    ArrowLeft, Calendar, Info, CheckCircle2, XCircle, HelpCircle 
} from 'lucide-react';
import Link from 'next/link';

export default function CampaignPerformancePage() {
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<any[]>([]);
    const [stats, setStats] = useState({
        total: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        successRate: 0
    });
    const [campaignDistribution, setCampaignDistribution] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Busca logs dos últimos 7 dias
            const { data: logsData } = await supabase
                .from('campaign_intelligence_logs')
                .select(`
                    *,
                    campaigns (name)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(500);

            if (logsData) {
                setLogs(logsData);
                calculateStats(logsData);
            }
        } catch (error) {
            console.error('Error fetching performance data:', error);
        } finally {
            setLoading(false);
        }
    }

    function calculateStats(data: any[]) {
        const total = data.length;
        if (total === 0) return;

        const high = data.filter(l => l.confidence_score >= 85).length;
        const medium = data.filter(l => l.confidence_score >= 60 && l.confidence_score < 85).length;
        const low = data.filter(l => l.confidence_score < 60).length;

        setStats({
            total,
            highConfidence: high,
            mediumConfidence: medium,
            lowConfidence: low,
            successRate: Math.round((high / total) * 100)
        });

        // Agrupa por campanha
        const distribution: any = {};
        data.forEach(l => {
            const name = l.campaigns?.name || 'Não Identificado';
            distribution[name] = (distribution[name] || 0) + 1;
        });

        setCampaignDistribution(Object.keys(distribution).map(name => ({
            name,
            value: distribution[name]
        })));
    }

    const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <Link href="/dashboard/ia/campanhas" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors w-fit">
                    <ArrowLeft size={16} />
                    <span>Voltar para Campanhas</span>
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Desempenho da Inteligência</h1>
                        <p className="text-zinc-400">Analise como o Motor de Intenção V2 está classificando seus leads.</p>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 p-2 rounded-lg flex items-center gap-2">
                        <Calendar size={18} className="text-zinc-500" />
                        <span className="text-sm font-medium">Últimos 7 dias</span>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <Target size={20} className="text-emerald-500" />
                        </div>
                        <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            Precisão: {stats.successRate}%
                        </span>
                    </div>
                    <p className="text-zinc-400 text-sm font-medium">Total de Classificações</p>
                    <h3 className="text-2xl font-bold text-white">{stats.total}</h3>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Zap size={20} className="text-blue-500" />
                        </div>
                    </div>
                    <p className="text-zinc-400 text-sm font-medium">Confiança Alta (&gt;85%)</p>
                    <h3 className="text-2xl font-bold text-white">{stats.highConfidence}</h3>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                            <AlertTriangle size={20} className="text-amber-500" />
                        </div>
                    </div>
                    <p className="text-zinc-400 text-sm font-medium">Ambíguos (60-85%)</p>
                    <h3 className="text-2xl font-bold text-white">{stats.mediumConfidence}</h3>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-zinc-500/10 rounded-lg">
                            <TrendingUp size={20} className="text-zinc-400" />
                        </div>
                    </div>
                    <p className="text-zinc-400 text-sm font-medium">Lead Origem Detectada</p>
                    <h3 className="text-2xl font-bold text-white">
                        {logs.filter(l => l.origin_source).length}
                    </h3>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Brain size={20} className="text-emerald-500" />
                        Distribuição por Produto
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={campaignDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {campaignDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-4 justify-center">
                        {campaignDistribution.map((entry, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                <span className="text-xs text-zinc-400">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Info size={20} className="text-blue-500" />
                        Motivos de Classificação
                    </h3>
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                        {logs.slice(0, 10).map((log, index) => (
                            <div key={index} className="p-3 bg-zinc-950/50 border border-zinc-800 rounded-xl">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-emerald-500">{log.campaigns?.name || 'N/A'}</span>
                                    <span className="text-[10px] text-zinc-500">{new Date(log.created_at).toLocaleTimeString()}</span>
                                </div>
                                <p className="text-xs text-zinc-300 italic">"{log.message}"</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-emerald-500 rounded-full" 
                                            style={{ width: `${log.confidence_score}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-zinc-400">{log.confidence_score}%</span>
                                </div>
                                <p className="mt-1 text-[10px] text-zinc-500">{log.reason}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-zinc-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Search size={20} className="text-zinc-400" />
                        Log de Decisões Cirúrgico
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-zinc-950/30 text-zinc-500 text-xs font-bold uppercase tracking-wider">
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Mensagem</th>
                                <th className="px-6 py-4">Campanha</th>
                                <th className="px-6 py-4">Score</th>
                                <th className="px-6 py-4">Origem</th>
                                <th className="px-6 py-4">Data/Hora</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {logs.slice(0, 20).map((log, index) => (
                                <tr key={index} className="hover:bg-zinc-900/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        {log.confidence_score >= 85 ? (
                                            <div className="flex items-center gap-1.5 text-emerald-500">
                                                <CheckCircle2 size={14} />
                                                <span className="text-[10px] font-bold">ATIVA</span>
                                            </div>
                                        ) : log.confidence_score >= 60 ? (
                                            <div className="flex items-center gap-1.5 text-amber-500">
                                                <HelpCircle size={14} />
                                                <span className="text-[10px] font-bold">CONFIRMAR</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-zinc-500">
                                                <XCircle size={14} />
                                                <span className="text-[10px] font-bold">NEUTRO</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm text-zinc-300 max-w-[300px] truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:max-w-none transition-all">
                                            {log.message}
                                        </p>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-white font-medium">
                                        {log.campaigns?.name || '---'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-sm font-bold ${
                                            log.confidence_score >= 85 ? 'text-emerald-500' : 
                                            log.confidence_score >= 60 ? 'text-amber-500' : 'text-zinc-500'
                                        }`}>
                                            {log.confidence_score}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded">
                                            {log.origin_source || 'Direto'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-zinc-500">
                                        {new Date(log.created_at).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
