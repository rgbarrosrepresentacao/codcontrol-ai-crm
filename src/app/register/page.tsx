'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Bot, Mail, Lock, User, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'

const schema = z.object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

function RegisterForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const plan = searchParams.get('plan')
    const [showPassword, setShowPassword] = useState(false)
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
    })

    const onSubmit = async (data: FormData) => {
        const { error } = await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
                data: { name: data.name },
            },
        })
        if (error) {
            toast.error(error.message)
            return
        }
        
        // Meta Pixel: Track Complete Registration
        if (typeof window !== 'undefined' && (window as any).fbq) {
            (window as any).fbq('track', 'CompleteRegistration')
        }

        toast.success('Conta criada! Redirecionando para o pagamento...')
        
        // Mapeamento dos links de checkout da Kiwify
        const kiwifyLinks: Record<string, string> = {
            'basico': 'https://pay.kiwify.com.br/N6zbMjk',
            'pro': 'https://pay.kiwify.com.br/220188P'
        }

        // Se houver plano, redireciona para a Kiwify. Caso contrário, para o dashboard (onde será bloqueado se não pagar)
        const checkoutUrl = plan ? kiwifyLinks[plan] : null
        
        if (checkoutUrl) {
            // Meta Pixel: Track Initiate Checkout
            if (typeof window !== 'undefined' && (window as any).fbq) {
                (window as any).fbq('track', 'InitiateCheckout', {
                    content_name: plan,
                    currency: 'BRL',
                    value: plan === 'basico' ? 10.0 : 497.0
                })
            }
            window.location.href = checkoutUrl
        } else {
            router.push('/dashboard')
        }
        router.refresh()
    }

    return (
        <div className="w-full max-w-md animate-slide-up">
            <div className="text-center mb-8">
                <Link href="/" className="inline-flex items-center gap-2 mb-6">
                    <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center glow-primary">
                        <Bot className="w-6 h-6 text-white" />
                    </div>
                    <span className="font-bold text-xl text-foreground">CodControl AI CRM</span>
                </Link>
                <h1 className="text-2xl font-bold text-foreground mb-1">
                    {plan ? `Assinar Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}` : 'Crie sua conta'}
                </h1>
                <p className="text-muted-foreground text-sm">
                    {plan ? 'Garanta sua vaga agora mesmo' : 'Experimente 30 dias por apenas R$ 10'}
                </p>
            </div>

            {/* Benefits */}
            <div className="flex justify-center gap-4 mb-6">
                {['Setup em 2 min', 'Interface Intuitiva', 'Cancele quando quiser'].map(b => (
                    <div key={b} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 text-primary" />{b}
                    </div>
                ))}
            </div>

            <div className="gradient-card border border-border rounded-2xl p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Nome completo</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...register('name')} placeholder="Seu nome" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                        </div>
                        {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...register('email')} type="email" placeholder="seu@email.com" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                        </div>
                        {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...register('password')} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="w-full bg-input border border-border rounded-lg pl-10 pr-10 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...register('confirmPassword')} type="password" placeholder="••••••••" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                        </div>
                        {errors.confirmPassword && <p className="text-destructive text-xs mt-1">{errors.confirmPassword.message}</p>}
                    </div>

                    <button type="submit" disabled={isSubmitting} className="w-full gradient-primary text-black font-semibold py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2">
                        {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isSubmitting ? 'Criando conta...' : plan ? 'Prosseguir para Assinatura' : 'Criar minha conta'}
                    </button>

                    <p className="text-xs text-muted-foreground text-center">
                        Ao criar uma conta, você concorda com nossos <span className="text-primary">Termos de Uso</span>.
                    </p>
                </form>

                <div className="mt-4 text-center text-sm text-muted-foreground">
                    Já tem conta?{' '}
                    <Link href="/login" className="text-primary hover:underline font-medium">Entrar</Link>
                </div>
            </div>
        </div>
    )
}

export default function RegisterPage() {
    return (
        <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
            <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-primary" />}>
                <RegisterForm />
            </Suspense>
        </div>
    )
}
