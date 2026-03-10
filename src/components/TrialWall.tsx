'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'

export function TrialWall({
    children,
    isAdmin,
    trialEndsAt,
    subscriptionStatus
}: {
    children: React.ReactNode,
    isAdmin: boolean,
    trialEndsAt: string | null,
    subscriptionStatus: string | null
}) {
    const pathname = usePathname()
    const router = useRouter()
    const [isBlocked, setIsBlocked] = useState(false)

    useEffect(() => {
        if (isAdmin || subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
            setIsBlocked(false)
            return
        }

        if (trialEndsAt) {
            const ends = new Date(trialEndsAt)
            if (new Date() > ends) {
                // Se a URL nao for planos (o cliente precisa assinar), entao bloqueia tudo
                if (pathname !== '/dashboard/planos') {
                    setIsBlocked(true)
                } else {
                    setIsBlocked(false) // Deixa ele ver os planos para poder pagar
                }
            }
        }
    }, [isAdmin, trialEndsAt, subscriptionStatus, pathname])

    if (isBlocked) {
        return (
            <div className="absolute inset-x-0 top-0 bottom-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur shadow-2xl overflow-hidden p-6">
                <div className="bg-secondary/40 border border-border p-8 rounded-2xl max-w-lg text-center gradient-card shadow-2xl relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-t-2xl opacity-50"></div>
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">Seu período de teste acabou!</h2>
                    <p className="text-muted-foreground mb-6">
                        Você chegou ao fim dos seus 7 dias de acesso gratuito. O seu painel e automações de IA estão pausados no momento.
                        <br /><br />
                        Para que o seu CRM e seus atendimentos voltem a funcionar instantaneamente, ative a sua assinatura.
                    </p>
                    <button
                        onClick={() => {
                            setIsBlocked(false)
                            router.push('/dashboard/planos')
                        }}
                        className="w-full gradient-primary text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-all flex justify-center items-center gap-2"
                    >
                        Ver planos e ativar sistema <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
