'use client'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight } from 'lucide-react'

export function TrialWall({
    children,
    isAdmin,
    trialEndsAt,
    subscriptionStatus,
    kiwifyStatus,
    isActiveAccount
}: {
    children: React.ReactNode,
    isAdmin: boolean,
    trialEndsAt: string | null,
    subscriptionStatus?: string | null,
    kiwifyStatus?: string | null,
    isActiveAccount?: boolean
}) {
    const pathname = usePathname()
    const router = useRouter()
    let isBlocked = false
    const isPlanPage = pathname === '/dashboard/planos'
    
    // Admin tem passe livre
    if (isAdmin) {
        return <>{children}</>
    }

    // Se a conta estiver bloqueada manualmente pelo Admin (botão vermelho), bloqueia TUDO
    if (isActiveAccount === false) {
        isBlocked = true
    } else {
        // 1. Checagem de Assinatura Ativa (Kiwify) - SOBERANA
        const kiwifyActive = kiwifyStatus === 'paid' || kiwifyStatus === 'active'
        
        if (kiwifyActive) {
            isBlocked = false
        } 
        // 2. Se não tem assinatura, checa se o Trial ainda está válido
        else if (trialEndsAt) {
            const ends = new Date(trialEndsAt)
            if (new Date() > ends) {
                isBlocked = true
            }
        } 
        // 3. Se não tem nada (nem assinatura nem trial válido), bloqueia
        else {
            isBlocked = true
        }
    }

    // Página de planos sempre liberada para pagamento, a menos que seja um BAN manual
    if (isPlanPage && isActiveAccount !== false) return <>{children}</>

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
                    <h2 className="text-2xl font-bold text-foreground mb-3">
                        {isActiveAccount === false ? 'Acesso Interrompido' : 'Sua conta precisa de ativação!'}
                    </h2>
                    <p className="text-muted-foreground mb-6">
                        {isActiveAccount === false 
                            ? 'O seu acesso foi temporariamente bloqueado pela administração da plataforma. Entre em contato com o suporte se precisar de ajuda.'
                            : 'Para liberar o seu painel de CRM e colocar suas vendedoras de IA no ar, é necessário ativar a sua assinatura.'
                        }
                        <br /><br />
                        {isActiveAccount !== false && 'Assim que o pagamento for confirmado pela Kiwify, seu acesso será liberado instantaneamente.'}
                    </p>
                    {isActiveAccount !== false && (
                        <button
                            onClick={() => {
                                router.push('/dashboard/planos')
                            }}
                            className="w-full gradient-primary text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-all flex justify-center items-center gap-2"
                        >
                            Ver planos e ativar sistema <ArrowRight className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
        )
    }

    return <>{children}</>
}
