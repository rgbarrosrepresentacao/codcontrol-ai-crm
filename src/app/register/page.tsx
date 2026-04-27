'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Bot, Mail, Lock, User, Eye, EyeOff, Loader2, CheckCircle2, Smartphone, ShieldCheck, ArrowRight, RotateCcw } from 'lucide-react'

// ─── SCHEMAS ─────────────────────────────────────────────────────────────────
const registerSchema = z.object({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    email: z.string().email('Email inválido'),
    whatsapp: z.string().min(10, 'WhatsApp inválido').max(15, 'WhatsApp inválido'),
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
})

const codeSchema = z.object({
    code: z.string().length(6, 'O código deve ter 6 dígitos').regex(/^\d+$/, 'Apenas números'),
})

type RegisterData = z.infer<typeof registerSchema>
type CodeData = z.infer<typeof codeSchema>

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
function RegisterForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const affiliateId = searchParams.get('ref') || searchParams.get('afid') || null

    const [step, setStep] = useState<'register' | 'verify'>('register')
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState<RegisterData | null>(null)
    const [resendCooldown, setResendCooldown] = useState(0)

    // Salvar affiliate_id no localStorage ao carregar
    if (typeof window !== 'undefined' && affiliateId) {
        localStorage.setItem('affiliate_id', affiliateId)
    }

    const getAffiliateId = () => {
        return affiliateId || (typeof window !== 'undefined' ? localStorage.getItem('affiliate_id') : null)
    }

    // Form de Cadastro
    const {
        register: regField,
        handleSubmit: handleRegister,
        formState: { errors: regErrors, isSubmitting: isRegistering }
    } = useForm<RegisterData>({ resolver: zodResolver(registerSchema) })

    // Form de Verificação
    const {
        register: codeField,
        handleSubmit: handleVerify,
        formState: { errors: codeErrors, isSubmitting: isVerifying },
        setError: setCodeError
    } = useForm<CodeData>({ resolver: zodResolver(codeSchema) })

    // ─── PASSO 1: Enviar código ───────────────────────────────────────────────
    const onRegisterSubmit = async (data: RegisterData) => {
        const res = await fetch('/api/auth/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                whatsapp: data.whatsapp,
                email: data.email,
                name: data.name
            })
        })

        const result = await res.json()

        if (!res.ok) {
            toast.error(result.error || 'Erro ao enviar código.')
            return
        }

        setFormData(data)
        setStep('verify')
        startCooldown()
        toast.success('Código enviado! Verifique seu WhatsApp.')
    }

    // ─── PASSO 2: Verificar código e ativar trial ─────────────────────────────
    const onVerifySubmit = async (data: CodeData) => {
        if (!formData) return

        const res = await fetch('/api/auth/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                whatsapp: formData.whatsapp,
                code: data.code,
                email: formData.email,
                name: formData.name,
                password: formData.password,
                affiliate_id: getAffiliateId()
            })
        })

        const result = await res.json()

        if (!res.ok) {
            setCodeError('code', { message: result.error || 'Código inválido.' })
            return
        }

        // Login automático após criação
        const { error: loginError } = await supabase.auth.signInWithPassword({
            email: formData.email,
            password: formData.password
        })

        if (loginError) {
            toast.success('Conta criada! Faça login para continuar.')
            router.push('/login')
            return
        }

        // Meta Pixel
        if (typeof window !== 'undefined' && (window as any).fbq) {
            (window as any).fbq('track', 'CompleteRegistration')
        }

        toast.success('🎉 Seu teste de 7 dias foi ativado!')
        router.push('/dashboard')
        router.refresh()
    }

    // ─── REENVIAR CÓDIGO ──────────────────────────────────────────────────────
    const startCooldown = () => {
        setResendCooldown(60)
        const interval = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) { clearInterval(interval); return 0 }
                return prev - 1
            })
        }, 1000)
    }

    const handleResend = async () => {
        if (!formData || resendCooldown > 0) return
        await onRegisterSubmit(formData)
    }

    // ─── TELA DE VERIFICAÇÃO ──────────────────────────────────────────────────
    if (step === 'verify') {
        return (
            <div className="w-full max-w-md animate-slide-up">
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center gap-2 mb-6">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center glow-primary">
                            <Bot className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-bold text-xl text-foreground">CodControl AI CRM</span>
                    </Link>
                    <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground mb-2">Verifique seu WhatsApp</h1>
                    <p className="text-muted-foreground text-sm">
                        Enviamos um código de 6 dígitos para<br />
                        <span className="text-foreground font-medium">{formData?.whatsapp}</span>
                    </p>
                </div>

                <div className="gradient-card border border-border rounded-2xl p-8">
                    <form onSubmit={handleVerify(onVerifySubmit)} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5 text-center">
                                Digite o código de 6 dígitos
                            </label>
                            <input
                                {...codeField('code')}
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="000000"
                                className="w-full bg-input border border-border rounded-lg px-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-3xl font-bold text-center tracking-widest"
                            />
                            {codeErrors.code && <p className="text-destructive text-xs mt-1 text-center">{codeErrors.code.message}</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={isVerifying}
                            className="w-full gradient-primary text-black font-semibold py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isVerifying ? 'Verificando...' : 'Ativar meus 7 dias grátis'} <ArrowRight className="w-4 h-4" />
                        </button>

                        <div className="text-center">
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={resendCooldown > 0}
                                className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <RotateCcw className="w-3 h-3" />
                                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setStep('register')}
                            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            ← Voltar e corrigir WhatsApp
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    // ─── TELA DE CADASTRO ─────────────────────────────────────────────────────
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
                    Teste grátis por 7 dias
                </h1>
                <p className="text-muted-foreground text-sm">
                    Sem cartão de crédito. Acesso completo ao plano Básico.
                </p>
            </div>

            <div className="flex justify-center gap-4 mb-6">
                {['7 dias grátis', 'Acesso total', 'Cancele quando quiser'].map(b => (
                    <div key={b} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 text-primary" />{b}
                    </div>
                ))}
            </div>

            <div className="gradient-card border border-border rounded-2xl p-8">
                <form onSubmit={handleRegister(onRegisterSubmit)} className="space-y-4">
                    {/* Nome */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Nome completo</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...regField('name')} placeholder="Seu nome" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                        </div>
                        {regErrors.name && <p className="text-destructive text-xs mt-1">{regErrors.name.message}</p>}
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...regField('email')} type="email" placeholder="seu@email.com" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                        </div>
                        {regErrors.email && <p className="text-destructive text-xs mt-1">{regErrors.email.message}</p>}
                    </div>

                    {/* WhatsApp */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                            WhatsApp <span className="text-primary text-xs">(para verificação)</span>
                        </label>
                        <div className="relative">
                            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...regField('whatsapp')} type="tel" placeholder="(11) 99999-9999" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                        </div>
                        {regErrors.whatsapp && <p className="text-destructive text-xs mt-1">{regErrors.whatsapp.message}</p>}
                    </div>

                    {/* Senha */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...regField('password')} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="w-full bg-input border border-border rounded-lg pl-10 pr-10 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {regErrors.password && <p className="text-destructive text-xs mt-1">{regErrors.password.message}</p>}
                    </div>

                    {/* Confirmar Senha */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input {...regField('confirmPassword')} type="password" placeholder="••••••••" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                        </div>
                        {regErrors.confirmPassword && <p className="text-destructive text-xs mt-1">{regErrors.confirmPassword.message}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={isRegistering}
                        className="w-full gradient-primary text-black font-semibold py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                    >
                        {isRegistering && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isRegistering ? 'Enviando código...' : 'Receber código no WhatsApp'}
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
