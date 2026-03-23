import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    color: string;
    textColor: string;
    trend?: number;
    description?: string;
    animationDelay?: string;
}

export function MetricCard({
    label,
    value,
    icon: Icon,
    color,
    textColor,
    trend,
    description,
    animationDelay = '0s',
}: MetricCardProps) {
    const isPositive = trend !== undefined && trend > 0;
    const isNegative = trend !== undefined && trend < 0;

    return (
        <div
            className="gradient-card border border-border rounded-2xl p-4 hover:border-primary/40 transition-all group animate-slide-up relative overflow-hidden"
            style={{ animationDelay }}
        >
            <div className="flex items-start justify-between mb-3">
                <div className={cn(
                    "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center transition-transform group-hover:scale-105 shrink-0",
                    color
                )}>
                    <Icon className={cn("w-5 h-5", textColor)} />
                </div>
                {trend !== undefined && (
                    <div className={cn(
                        "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                        isPositive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        isNegative ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                        "bg-zinc-800 text-muted-foreground border border-border"
                    )}>
                        {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : isNegative ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                        {Math.abs(trend)}%
                    </div>
                )}
            </div>

            <div className={cn("text-2xl font-black tracking-tight leading-none mb-1", textColor)}>
                {value}
            </div>
            <div className="text-foreground text-xs font-semibold leading-tight">{label}</div>
            {description && (
                <div className="text-muted-foreground text-[10px] mt-0.5 leading-none">{description}</div>
            )}
        </div>
    );
}
