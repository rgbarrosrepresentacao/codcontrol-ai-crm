import { Lightbulb, TrendingUp, Clock, Zap, CheckCircle2, Activity } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Insight {
    id: string;
    text: string;
    type: 'success' | 'warning' | 'info';
    icon: LucideIcon;
}

interface DashboardInsightsProps {
    insights: Insight[];
}

export function DashboardInsights({ insights }: DashboardInsightsProps) {
    return (
        <div className="gradient-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <h3 className="font-bold text-base text-foreground">Smart Insights</h3>
            </div>

            <div className="space-y-2.5">
                {insights.map((insight) => (
                    <div
                        key={insight.id}
                        className={cn(
                            "p-3 rounded-xl flex items-start gap-3",
                            insight.type === 'success' ? "bg-emerald-500/8 border border-emerald-500/15" :
                            insight.type === 'warning' ? "bg-amber-500/8 border border-amber-500/15" :
                            "bg-blue-500/8 border border-blue-500/15"
                        )}
                    >
                        <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            insight.type === 'success' ? "bg-emerald-500/15 text-emerald-400" :
                            insight.type === 'warning' ? "bg-amber-500/15 text-amber-400" :
                            "bg-blue-500/15 text-blue-400"
                        )}>
                            <insight.icon className="w-3.5 h-3.5" />
                        </div>
                        <span className={cn(
                            "text-xs font-semibold leading-relaxed",
                            insight.type === 'success' ? "text-emerald-300" :
                            insight.type === 'warning' ? "text-amber-300" :
                            "text-blue-300"
                        )}>
                            {insight.text}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border/30">
                <div className="p-3 bg-zinc-900/80 rounded-xl border border-border/30 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-primary uppercase tracking-tighter leading-none">Pro Dica</div>
                        <div className="text-xs font-semibold text-muted-foreground mt-0.5 leading-relaxed">
                            Otimize funis no horário de pico (15h–17h).
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Daily Summary ───────────────────────────────────────────────────────────
export function DailySummary({
    newServices,
    finishedConversations,
    avgResponseTime,
    peakTime,
}: {
    newServices: number;
    finishedConversations: number;
    avgResponseTime: string;
    peakTime: string;
}) {
    const items = [
        { label: 'Novos Leads', value: newServices, growth: '+12% vs ontem', color: 'text-emerald-400', growthColor: 'text-emerald-400' },
        { label: 'Conversas Finalizadas', value: finishedConversations, growth: '+5% vs ontem', color: 'text-blue-400', growthColor: 'text-emerald-400' },
        { label: 'Tempo Médio de Resposta', value: avgResponseTime, growth: '-2min vs ontem', color: 'text-foreground', growthColor: 'text-emerald-400' },
        { label: 'Horário de Pico', value: peakTime, growth: 'Estável hoje', color: 'text-foreground', growthColor: 'text-muted-foreground' },
    ];

    return (
        <div className="gradient-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <h3 className="font-bold text-base text-foreground">Resumo do Dia</h3>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {items.map((item) => (
                    <div key={item.label} className="bg-secondary/20 rounded-xl p-3.5 border border-border/30 hover:bg-secondary/30 transition-colors">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 leading-tight">{item.label}</div>
                        <div className={cn("text-xl font-black leading-none mb-1.5", item.color)}>{item.value}</div>
                        <div className={cn("text-[10px] font-bold flex items-center gap-1", item.growthColor)}>
                            <TrendingUp className="w-2.5 h-2.5" />
                            {item.growth}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
