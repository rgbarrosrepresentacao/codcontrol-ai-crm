'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Bell, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function AnnouncementBanner() {
    const [announcements, setAnnouncements] = useState<any[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [unread, setUnread] = useState(false)
    const popoverRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchAnnouncements = async () => {
            const { data } = await supabase
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
            
            if (data) {
                setAnnouncements(data)
                if (data.length > 0) setUnread(true)
            }
        }

        fetchAnnouncements()

        // Realtime updates
        const channel = supabase
            .channel('public:announcements')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
                fetchAnnouncements()
                setUnread(true)
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    // Fechar popover ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="fixed top-4 right-4 md:top-6 md:right-8 z-[100]" ref={popoverRef}>
            {/* Sininho Botão */}
            <button 
                onClick={() => {
                    setIsOpen(!isOpen)
                    if (!isOpen) setUnread(false) // marca como lido ao abrir
                }}
                className="relative p-2.5 bg-card border border-border rounded-full hover:bg-secondary transition-all shadow-sm"
            >
                <Bell className="w-5 h-5 text-foreground" />
                {unread && announcements.length > 0 && (
                    <span className="absolute top-1.5 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card animate-pulse" />
                )}
            </button>

            {/* Popover / Dropdown */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-3 w-[320px] md:w-[380px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-slide-up origin-top-right">
                    
                    {/* Header Verde do Popover */}
                    <div className="bg-[#10b981] p-4 flex items-center justify-between text-white">
                        <h3 className="font-bold flex items-center gap-2">
                            Últimas Atualizações 
                        </h3>
                        <ExternalLink className="w-4 h-4 opacity-70" />
                    </div>
                    
                    {/* Lista de Comunicados */}
                    <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                        {announcements.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground text-sm">
                                Nenhuma atualização no momento.
                            </div>
                        ) : (
                            announcements.map((item, i) => {
                                // Configuração de tags como no exemplo: NEW (Verde), FIX (Laranja), etc.
                                const tagConfig: any = {
                                    info: { label: 'NEW', color: 'bg-emerald-500 text-white' },
                                    warning: { label: 'FIX', color: 'bg-orange-500 text-white' },
                                    critical: { label: 'URGENT', color: 'bg-red-500 text-white' }
                                }
                                const tag = tagConfig[item.type] || tagConfig.info

                                let timeAgo = ''
                                try {
                                    timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })
                                } catch (e) {}

                                return (
                                    <div key={item.id || i} className="p-5 hover:bg-secondary/30 transition-colors">
                                        <div className="text-xs text-muted-foreground mb-2 font-medium">{timeAgo}</div>
                                        <h4 className="font-bold text-foreground text-[15px] leading-tight mb-2">
                                            {item.title}
                                        </h4>
                                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                            {item.content}
                                        </p>
                                        <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${tag.color}`}>
                                            {tag.label}
                                        </span>
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Footer Padrão */}
                    <div className="p-3 border-t border-border bg-secondary/30 text-center">
                        <span className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-2">
                            <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                            Powered by CodControl
                        </span>
                    </div>

                </div>
            )}
        </div>
    )
}
