'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Info, X, Zap } from 'lucide-react'

export function AnnouncementBanner() {
    const [announcements, setAnnouncements] = useState<any[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isVisible, setIsVisible] = useState(true)

    useEffect(() => {
        const fetchAnnouncements = async () => {
            const { data } = await supabase
                .from('announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
            
            if (data) setAnnouncements(data)
        }

        fetchAnnouncements()

        // Realtime updates
        const channel = supabase
            .channel('public:announcements')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, fetchAnnouncements)
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    if (!isVisible || announcements.length === 0) return null

    const current = announcements[currentIndex]

    const typeStyles: any = {
        info: 'bg-primary text-black border-primary/20',
        warning: 'bg-orange-500 text-white border-orange-400/20',
        critical: 'bg-red-500 text-white border-red-400/20'
    }

    const icons: any = {
        info: <Info className="w-4 h-4" />,
        warning: <AlertTriangle className="w-4 h-4" />,
        critical: <Zap className="w-4 h-4 animate-pulse" />
    }

    return (
        <div className={`relative px-4 py-2 flex items-center justify-center gap-3 transition-all duration-500 ${typeStyles[current.type] || typeStyles.info} border-b shadow-lg z-[100]`}>
            <div className="flex items-center gap-2 max-w-4xl mx-auto overflow-hidden">
                <div className="flex-shrink-0">{icons[current.type]}</div>
                <div className="text-xs md:text-sm font-bold truncate">
                    <span className="uppercase tracking-tighter opacity-80 mr-2">[{current.title}]</span>
                    {current.content}
                </div>
            </div>
            <div className="flex items-center gap-2">
                {announcements.length > 1 && (
                    <div className="flex gap-1 mr-2">
                        {announcements.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentIndex(i)}
                                className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-white' : 'bg-white/40'}`}
                            />
                        ))}
                    </div>
                )}
                <button 
                    onClick={() => setIsVisible(false)}
                    className="hover:scale-110 transition-transform p-1 rounded-full hover:bg-black/10"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
