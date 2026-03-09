import { createSupabaseServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { CreditCard, CheckCircle2, ArrowRight, Zap, Star } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export default async function PlanosPage() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [plansRes, profileRes] = await Promise.all([
        supabase.from('plans').select('*').eq('is_active', true).order('price'),
        supabase.from('profiles').select('*, plans(slug)').eq('id', user.id).single(),
    ])

    const plans = plansRes.data || []
    const currentPlanSlug = (profileRes.data as any)?.plans?.slug || 'basico'

    return (
        <div className="p-6 md:p-8 space-y-8 animate-fade-in">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-foreground flex items-center justify-center gap-2 mb-2">
                    <CreditCard className="w-7 h-7 text-primary" />Planos e Assinatura
                </h1>
                <p className="text-muted-foreground">Escolha o plano ideal para o seu negócio</p>
            </div>

            {/* Current Plan Banner */}
            <div className="gradient-card border border-primary/30 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-foreground">Plano atual: <span className="text-primary">{plans.find(p => p.slug === currentPlanSlug)?.name || 'Básico'}</span></div>
                        <div className="text-xs text-muted-foreground">Gerencie sua assinatura abaixo</div>
                    </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>

            {/* Plans Grid */}
            <div className="grid md:grid-cols-3 gap-6">
                {plans.map((plan: any, i: number) => {
                    const isPopular = plan.slug === 'pro'
                    const isCurrent = plan.slug === currentPlanSlug
                    const features: string[] = plan.features || []
                    return (
                        <div
                            key={plan.id}
                            className={`relative rounded-2xl border p-8 transition-all ${isPopular ? 'border-primary glow-primary gradient-card scale-105' : 'border-border gradient-card'} ${isCurrent ? 'ring-2 ring-primary/50' : ''}`}
                        >
                            {isPopular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="gradient-primary text-black text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                                        <Star className="w-3 h-3 fill-current" />MAIS POPULAR
                                    </span>
                                </div>
                            )}
                            {isCurrent && (
                                <div className="absolute -top-3 right-4">
                                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">Seu plano</span>
                                </div>
                            )}
                            <div className="mb-6">
                                <h3 className="text-foreground font-bold text-xl mb-1">{plan.name}</h3>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-muted-foreground text-sm">R$</span>
                                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                                    <span className="text-muted-foreground text-sm">/mês</span>
                                </div>
                            </div>

                            {/* Key metrics */}
                            <div className="grid grid-cols-2 gap-2 mb-6">
                                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                                    <div className="text-lg font-bold text-primary">{plan.max_whatsapp}</div>
                                    <div className="text-xs text-muted-foreground">WhatsApps</div>
                                </div>
                                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                                    <div className="text-lg font-bold text-primary">{plan.max_messages === -1 ? '∞' : plan.max_messages.toLocaleString()}</div>
                                    <div className="text-xs text-muted-foreground">Msgs IA/mês</div>
                                </div>
                            </div>

                            <ul className="space-y-2.5 mb-8">
                                {features.map((f: string) => (
                                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            {isCurrent ? (
                                <div className="w-full text-center py-3 rounded-xl border border-emerald-500/30 text-emerald-400 text-sm font-semibold">
                                    ✓ Plano atual
                                </div>
                            ) : (
                                <button className={`w-full font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${isPopular ? 'gradient-primary text-black hover:opacity-90' : 'border border-border hover:bg-secondary text-foreground'}`}>
                                    {plan.slug === 'agencia' ? '🚀' : plan.price > (plans.find((p: any) => p.slug === currentPlanSlug)?.price || 0) ? '⬆️' : '⬇️'}
                                    {plan.price > (plans.find((p: any) => p.slug === currentPlanSlug)?.price || 0) ? 'Fazer upgrade' : 'Fazer downgrade'}
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Payment Note */}
            <div className="gradient-card border border-border rounded-xl p-6 text-center">
                <h3 className="font-semibold text-foreground mb-2">💳 Integração de Pagamento</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    Sistema preparado para integração com <strong className="text-foreground">Stripe</strong> ou <strong className="text-foreground">Mercado Pago</strong>.
                    Entre em contato para ativar a cobrança automática.
                </p>
                <div className="mt-4 flex gap-3 justify-center">
                    <div className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                        🔒 Pagamento seguro
                    </div>
                    <div className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                        📱 Pix disponível
                    </div>
                    <div className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground flex items-center gap-2">
                        💳 Cartão de crédito
                    </div>
                </div>
            </div>
        </div>
    )
}
