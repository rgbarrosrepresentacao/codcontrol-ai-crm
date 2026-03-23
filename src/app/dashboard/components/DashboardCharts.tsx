'use client';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from 'recharts';

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(222 47% 8%)',
    borderColor: 'hsl(217 33% 14%)',
    borderRadius: '12px',
    color: 'hsl(210 40% 98%)',
    fontSize: '12px',
  },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};

const axisStyle = {
  axisLine: false as const,
  tickLine: false as const,
  tick: { fill: 'hsl(215 20% 45%)', fontSize: 11 },
};

// ─── Chart 1: Volume de Mensagens (area) ────────────────────────────────────
export function MessageVolumeChart({ data }: { data: { hour: string; count: number }[] }) {
  return (
    <div className="gradient-card border border-border rounded-2xl p-5 flex flex-col">
      <div className="mb-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Hoje</p>
        <h3 className="font-bold text-base text-foreground">Volume de Mensagens</h3>
        <p className="text-xs text-muted-foreground">por hora do dia</p>
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradMsg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="hour" {...axisStyle} interval={3} />
            <YAxis {...axisStyle} />
            <Tooltip {...tooltipStyle} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#gradMsg)"
              activeDot={{ r: 5, stroke: '#10b981', strokeWidth: 2, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Chart 2: Conversas ao Longo do Dia (bar) ───────────────────────────────
export function ConversationsChart({ data }: { data: { hour: string; count: number }[] }) {
  return (
    <div className="gradient-card border border-border rounded-2xl p-5 flex flex-col">
      <div className="mb-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Hoje</p>
        <h3 className="font-bold text-base text-foreground">Conversas Abertas</h3>
        <p className="text-xs text-muted-foreground">ao longo do dia</p>
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="hour" {...axisStyle} interval={3} />
            <YAxis {...axisStyle} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Chart 3: Recebidas vs Enviadas (bar comparison) ────────────────────────
export function ComparisonChart({
  data,
}: {
  data: { name: string; received: number; sent: number }[];
}) {
  return (
    <div className="gradient-card border border-border rounded-2xl p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Comparativo</p>
          <h3 className="font-bold text-base text-foreground">Recebidas vs Enviadas</h3>
          <p className="text-xs text-muted-foreground">hoje e ontem</p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary" /> Recebidas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Enviadas
          </span>
        </div>
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="name" {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="received" fill="hsl(168 84% 49%)" radius={[4, 4, 0, 0]} barSize={28} />
            <Bar dataKey="sent" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
