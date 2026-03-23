import { TrendingUp, Clock, MessageSquare, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PerformanceScoreProps {
    score: number;
    responseTime: string;
    answeredRate: number;
    activityScore: number;
}

export function PerformanceScore({ score, responseTime, answeredRate, activityScore }: PerformanceScoreProps) {
    const getColor = (val: number) => {
        if (val >= 80) return { text: 'text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Excelente' };
        if (val >= 50) return { text: 'text-yellow-400', bar: 'bg-yellow-500', badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', label: 'Regular' };
        return { text: 'text-rose-400', bar: 'bg-rose-500', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', label: 'Baixo' };
    };

    const c = getColor(score);

    return (
        <div className="gradient-card border border-border rounded-2xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Score</p>
                    <h3 className="font-bold text-base text-foreground">Performance</h3>
                </div>
                <div className={cn("px-2.5 py-1 rounded-full text-xs font-bold border", c.badge)}>
                    {c.label}
                </div>
            </div>

            {/* Score Circle */}
            <div className="flex items-center gap-4 mb-5">
                <div className={cn("text-5xl font-black tabular-nums leading-none", c.text)}>
                    {score}
                </div>
                <div className="flex flex-col gap-1 flex-1">
                    <div className="text-xs text-muted-foreground font-semibold">/ 100 pontos</div>
                    <div className="h-2.5 w-full bg-secondary/50 rounded-full overflow-hidden border border-border/40">
                        <div
                            className={cn("h-full rounded-full transition-all duration-1000", c.bar)}
                            style={{ width: `${score}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Metrics */}
            <div className="space-y-3 border-t border-border/30 pt-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <Clock className="w-3.5 h-3.5 text-orange-400" />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">Tempo Médio</span>
                    </div>
                    <span className="text-sm font-black text-foreground">{responseTime}</span>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">Taxa de Resposta</span>
                    </div>
                    <span className="text-sm font-black text-foreground">{answeredRate}%</span>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5 text-purple-400" />
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">Atividade do Sistema</span>
                    </div>
                    <span className="text-sm font-black text-foreground">{activityScore}%</span>
                </div>
            </div>
        </div>
    );
}
