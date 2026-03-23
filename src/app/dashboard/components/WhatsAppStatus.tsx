import { Smartphone, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhatsAppInstance {
    id: string;
    display_name?: string;
    instance_name: string;
    phone_number?: string;
    status: string;
    messages_received: number;
    messages_sent: number;
}

interface WhatsAppStatusProps {
    instances: WhatsAppInstance[];
}

export function WhatsAppStatus({ instances }: WhatsAppStatusProps) {
    return (
        <div className="gradient-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Smartphone className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <h3 className="font-bold text-base text-foreground">WhatsApp Conectados</h3>
                </div>
                <a href="/dashboard/whatsapp" className="text-[10px] uppercase font-bold text-primary hover:underline tracking-wider flex items-center gap-1">
                    Gerenciar <Zap className="w-3 h-3" />
                </a>
            </div>

            {instances.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-secondary/30 flex items-center justify-center border border-dashed border-border">
                        <Smartphone className="w-7 h-7 text-muted-foreground opacity-40" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-semibold text-muted-foreground mb-1">Nenhuma instância conectada</p>
                        <p className="text-xs text-muted-foreground/60">Conecte seu WhatsApp para começar a atender</p>
                    </div>
                    <a href="/dashboard/whatsapp" className="gradient-primary text-black text-xs font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity inline-flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5" /> Conectar Agora
                    </a>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {instances.map((inst) => (
                        <div
                            key={inst.id}
                            className={cn(
                                "rounded-xl p-4 border transition-all hover:border-primary/30",
                                inst.status === 'connected'
                                    ? "bg-emerald-500/5 border-emerald-500/20"
                                    : "bg-secondary/20 border-border/30"
                            )}
                        >
                            {/* Top row */}
                            <div className="flex items-center gap-2.5 mb-3">
                                <div className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                                    inst.status === 'connected' ? "bg-emerald-500/15" : "bg-secondary/50"
                                )}>
                                    <Smartphone className={cn("w-4 h-4", inst.status === 'connected' ? 'text-emerald-400' : 'text-muted-foreground')} />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-foreground truncate leading-tight">
                                        {inst.display_name || inst.instance_name}
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full shrink-0",
                                            inst.status === 'connected' ? 'bg-emerald-400' :
                                            inst.status === 'qr_code' ? 'bg-yellow-400' : 'bg-zinc-600'
                                        )} />
                                        <span className={cn(
                                            "text-[10px] font-bold leading-none",
                                            inst.status === 'connected' ? 'text-emerald-400' :
                                            inst.status === 'qr_code' ? 'text-yellow-400' : 'text-muted-foreground'
                                        )}>
                                            {inst.status === 'connected' ? 'Online' : inst.status === 'qr_code' ? 'Aguardando QR' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-1.5">
                                <div className="bg-black/20 rounded-lg p-2">
                                    <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest leading-none mb-1">Recebidas</div>
                                    <div className="text-base font-black text-primary leading-none">{inst.messages_received}</div>
                                </div>
                                <div className="bg-black/20 rounded-lg p-2">
                                    <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest leading-none mb-1">Enviadas</div>
                                    <div className="text-base font-black text-emerald-400 leading-none">{inst.messages_sent}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
