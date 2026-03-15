'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
    Bot, LayoutDashboard, Smartphone, Brain, Users,
    Settings, LogOut, ChevronRight, Shield, X, Menu, CreditCard, MessageCircle, MessageSquare,
    Filter, Truck, PlayCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: Smartphone },
    { href: '/dashboard/ia', label: 'Inteligência Artificial', icon: Brain },
    { href: '/dashboard/crm', label: 'CRM', icon: Users },
    { href: '/dashboard/chat', label: 'Chat ao Vivo', icon: MessageSquare },
    { href: '/dashboard/funis', label: 'Funis de Venda', icon: Filter },
    { href: '/dashboard/logistica', label: 'Logística', icon: Truck },
    { href: '/dashboard/planos', label: 'Planos', icon: CreditCard },
    { href: '/dashboard/tutoriais', label: 'Área de Membros', icon: PlayCircle },
    { href: '/dashboard/configuracoes', label: 'Configurações', icon: Settings },
]

const adminItems = [
    { href: '/dashboard/admin', label: 'Painel Admin', icon: Shield },
]

interface SidebarProps {
    isAdmin?: boolean
    userName?: string
    userEmail?: string
    planName?: string
    trialEndsAt?: string | null
    subscriptionStatus?: string | null
}

export function Sidebar({ isAdmin, userName, userEmail, planName, trialEndsAt, subscriptionStatus }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const [mobileOpen, setMobileOpen] = useState(false)

    const handleLogout = async () => {
        await supabase.auth.signOut()
        toast.success('Até logo!')
        router.push('/login')
        router.refresh()
    }

    const SidebarContent = () => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6 border-b border-sidebar-border">
                <Link href="/dashboard" className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center glow-primary">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <div className="font-bold text-sm text-foreground leading-tight">CodControl</div>
                            <span className="text-[10px] bg-primary/20 text-primary font-black px-1 rounded-md border border-primary/30 uppercase tracking-tighter">BETA</span>
                        </div>
                        <div className="text-xs text-primary leading-tight font-medium">AI CRM</div>
                    </div>
                </Link>
            </div>

            {/* User Info */}
            <div className="p-4 border-b border-sidebar-border">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-black font-bold text-sm">
                        {userName?.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{userName || 'Usuário'}</div>
                        <div className="text-xs text-muted-foreground truncate">{userEmail || ''}</div>
                    </div>
                </div>
                {planName && (
                    <div className="mt-3 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg">
                        {(!isAdmin && subscriptionStatus !== 'active' && trialEndsAt) ? (
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs text-orange-400 font-bold">Modo Teste (7 Dias)</span>
                                <span className="text-[10px] text-muted-foreground">Expira em: {new Date(trialEndsAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                        ) : (
                            <span className="text-xs text-primary font-medium">Plano {planName}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 px-2">Menu</div>
                {navItems.map((item) => {
                    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                                'sidebar-link flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all',
                                active ? 'active text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <item.icon className="w-4 h-4 flex-shrink-0" />
                            <span>{item.label}</span>
                            {active && <ChevronRight className="w-3 h-3 ml-auto" />}
                        </Link>
                    )
                })}

                {/* Suporte WhatsApp */}
                <div className="mt-3 pt-3 border-t border-sidebar-border">
                    <a
                        href="https://wa.me/5598985086010?text=Ol%C3%A1!%20Preciso%20de%20suporte%20com%20o%20CodControl%20AI%20CRM."
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-all"
                    >
                        <MessageCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Suporte</span>
                    </a>
                </div>

                {isAdmin && (
                    <>
                        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-4 mb-2 px-2">Admin</div>
                        {adminItems.map((item) => {
                            const active = pathname.startsWith(item.href)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                        'sidebar-link flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all',
                                        active ? 'active text-primary' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <item.icon className="w-4 h-4 flex-shrink-0" />
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                    </>
                )}
            </nav>

            {/* Logout */}
            <div className="p-4 border-t border-sidebar-border">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                >
                    <LogOut className="w-4 h-4" />
                    <span>Sair</span>
                </button>
                <div className="mt-4 px-3 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span>Versão</span>
                    <span className="text-primary/70">v1.4.1</span>
                </div>
            </div>
        </div>
    )

    return (
        <>
            {/* Mobile toggle */}
            <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden fixed top-4 left-4 z-50 p-2 bg-card border border-border rounded-lg"
            >
                <Menu className="w-5 h-5" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
                    <div className="relative w-72 bg-sidebar border-r border-sidebar-border h-full">
                        <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                            <X className="w-5 h-5" />
                        </button>
                        <SidebarContent />
                    </div>
                </div>
            )}

            {/* Desktop sidebar */}
            <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 flex-shrink-0">
                <SidebarContent />
            </aside>
        </>
    )
}
