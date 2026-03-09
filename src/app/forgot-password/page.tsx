'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Bot, Mail, Loader2, ArrowLeft } from 'lucide-react'

const schema = z.object({
    email: z.string().email('Email inválido'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
    const [sent, setSent] = useState(false)
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) })

    const onSubmit = async (data: FormData) => {
        const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) { toast.error(error.message); return }
        setSent(true)
    }

    return (
        <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-slide-up">
                <div className="text-center mb-8">
                    <Link href="/" className="inline-flex items-center gap-2 mb-6">
                        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center"><Bot className="w-6 h-6 text-white" /></div>
                        <span className="font-bold text-xl text-foreground">CodControl AI CRM</span>
                    </Link>
                    <h1 className="text-2xl font-bold text-foreground mb-1">Esqueceu a senha?</h1>
                    <p className="text-muted-foreground text-sm">Enviaremos um link para redefinir sua senha</p>
                </div>
                <div className="gradient-card border border-border rounded-2xl p-8">
                    {sent ? (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                <Mail className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h2 className="text-lg font-semibold text-foreground mb-2">Email enviado!</h2>
                            <p className="text-muted-foreground text-sm mb-6">Verifique sua caixa de entrada e clique no link para redefinir sua senha.</p>
                            <Link href="/login" className="gradient-primary text-black font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 text-sm">Voltar ao login</Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input {...register('email')} type="email" placeholder="seu@email.com" className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm" />
                                </div>
                                {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full gradient-primary text-black font-semibold py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Enviar link
                            </button>
                            <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2">
                                <ArrowLeft className="w-4 h-4" />Voltar ao login
                            </Link>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
