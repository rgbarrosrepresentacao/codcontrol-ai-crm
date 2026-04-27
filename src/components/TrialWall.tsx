'use client'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Clock, Zap, Building2, Sparkles } from 'lucide-react'

interface Plan {
    name: string
    price: string
    description: string
    link: string
    icon: any
    highlighted?: boolean
}

export function TrialWall({
    children,
    isAdmin,
    trialEndsAt,
    subscriptionStatus,
    isActiveAccount,
    affiliateId
}: {
    children: React.ReactNode,
    isAdmin: boolean,
    trialEndsAt: string | null,
    subscriptionStatus?: string | null,
    isActiveAccount?: boolean,
    affiliateId?: string | null
}) {
    const pathname = usePathname()
    const router = useRouter()
    const isPlanPage = pathname === '/dashboard/planos'

    // Admin tem passe livre
    if (isAdmin) return <>{children}</>

    // Conta bloqueada manualmente pelo Admin
    if (isActiveAccount === false) {
        return (
            <div className="absolute inset-x-0 top-0 bottom-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur shadow-2xl overflow-hidden p-6">
                <div className="bg-secondary/40 border border-border p-8 rounded-2xl max-w-lg text-center gradient-card shadow-2xl relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-t-2xl opacity-50"></div>
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-3">Acesso Interrompido</h2>
                    <p className="text-muted-foreground mb-6">
                        O seu acesso foi temporariamente bloqueado pela administração da plataforma. Entre em contato com o suporte se precisar de ajuda.
                    </p>
                </div>
            </div>
        )
    }

    // ─── LÓGICA DE ACESSO ─────────────────────────────────────────────────────
    const status = subscriptionStatus || ''

    // Usuários pagantes (Kiwify ou Stripe)
    const isPaid = ['paid', 'active', 'aprovado', 'approved'].includes(status)
    if (isPaid) return <>{children}</>

    // Usuários em período de trial
    if (status === 'trialing' && trialEndsAt) {
        const expiresAt = new Date(trialEndsAt)
        const now = new Date()

        // Grace period de 48h após expiração
        const graceEnd = new Date(expiresAt.getTime() + 48 * 60 * 60 * 1000)

        if (now <= graceEnd) {
            // Ainda dentro do trial (ou carência)
            return <>{children}</>
        }
        // Trial expirado — cai no TrialWall
    }

    // Página de planos sempre liberada (exceto ban)
    if (isPlanPage) return <>{children}</>

    // ─── MONTAR LINKS COM AFILIADO ────────────────────────────────────────────
    const afSuffix = affiliateId ? `?afid=${affiliateId}` : ''
    const plans: Plan[] = [
        {
            name: 'Básico',
            price: 'R$ 97/mês',
            description: '1 WhatsApp · IA completa · CRM · Suporte',
            link: `https://pay.kiwify.com.br/T2S4A1W${afSuffix}`,
            icon: Zap,
        },
        {
            name: 'Pro',
            price: 'R$ 297/mês',
            description: '3 WhatsApps · Tudo do Básico + Relatórios avançados',
            link: `https://pay.kiwify.com.br/K8U3L9P${afSuffix}`,
            icon: Sparkles,
            highlighted: true,
        },
        {
            name: 'Agência',
            price: 'R$ 1.000/mês',
            description: '10 WhatsApps · Multi-tenant · White label · API',
            link: `https://pay.kiwify.com.br/U5M2Q1L${afSuffix}`,
            icon: Building2,
        },
    ]

    // ─── TELA DE TRIAL EXPIRADO ───────────────────────────────────────────────
    return (
        <div className="absolute inset-x-0 top-0 bottom-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur shadow-2xl overflow-hidden p-6 overflow-y-auto">
            <div className="w-full max-w-2xl text-center py-8">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Clock className="w-8 h-8 text-primary" />
                    </div>
                </div>

                <h2 className="text-3xl font-bold text-foreground mb-3">
                    Seu período de teste encerrou
                </h2>
                <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                    Esperamos que tenha gostado do <strong>CodControl AI CRM</strong>! Escolha um plano abaixo para continuar vendendo com sua IA e não perder nenhum cliente.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {plans.map((plan) => {
                        const Icon = plan.icon
                        return (
                            <div
                                key={plan.name}
                                className={`relative gradient-card border rounded-2xl p-6 text-left transition-all hover:scale-105 ${plan.highlighted ? 'border-primary shadow-lg shadow-primary/20' : 'border-border'}`}
                            >
                                {plan.highlighted && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-black text-xs font-bold px-3 py-1 rounded-full">
                                        MAIS POPULAR
                                    </div>
                                )}
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                    <Icon className="w-5 h-5 text-primary" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
                                <p className="text-2xl font-bold text-primary mb-2">{plan.price}</p>
                                <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>
                                <a
                                    href={plan.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all ${plan.highlighted ? 'gradient-primary text-black hover:opacity-90' : 'bg-secondary text-foreground hover:bg-secondary/80 border border-border'}`}
                                >
                                    Assinar agora <ArrowRight className="w-4 h-4" />
                                </a>
                            </div>
                        )
                    })}
                </div>

                <p className="text-xs text-muted-foreground">
                    Assim que o pagamento for confirmado, seu acesso será liberado automaticamente. ⚡
                </p>
            </div>
        </div>
    )
}
