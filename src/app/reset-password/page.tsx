'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Bot, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'

const schema = z.object({
    password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [success, setSuccess] = useState(false)

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
    })

    const onSubmit = async (data: FormData) => {
        const { error } = await supabase.auth.updateUser({
            password: data.password,
        })

        if (error) {
            toast.error('Erro ao atualizar senha: ' + error.message)
            return
        }

        setSuccess(true)
        toast.success('Senha atualizada com sucesso!')
        setTimeout(() => router.push('/login'), 3000)
    }

    return (
        <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-slide-up">
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center gap-2 mb-6">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center glow-primary">
                            <Bot className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-bold text-xl text-foreground">CodControl AI CRM</span>
                    </Link>
                    <h1 className="text-2xl font-bold text-foreground mb-1">Redefinir senha</h1>
                    <p className="text-muted-foreground text-sm">Digite sua nova senha de acesso abaixo</p>
                </div>

                <div className="gradient-card border border-border rounded-2xl p-8 shadow-2xl">
                    {success ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground mb-2">Senha alterada!</h2>
                            <p className="text-muted-foreground text-sm">Sua senha foi atualizada. Redirecionando para o login...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Nova Senha</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        {...register('password')}
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        className="w-full bg-input border border-border rounded-lg pl-10 pr-10 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar Nova Senha</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        {...register('confirmPassword')}
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        className="w-full bg-input border border-border rounded-lg pl-10 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                                    />
                                </div>
                                {errors.confirmPassword && <p className="text-destructive text-xs mt-1">{errors.confirmPassword.message}</p>}
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full gradient-primary text-black font-semibold py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-primary/20 mt-2"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Confirmar Nova Senha
                            </button>

                            <Link href="/login" className="flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors mt-2">
                                Voltar ao login
                            </Link>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
