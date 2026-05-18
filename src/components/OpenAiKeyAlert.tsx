'use client'
import { useState } from 'react'
import { AlertCircle, ArrowRight, X } from 'lucide-react'
import Link from 'next/link'

interface OpenAiKeyAlertProps {
    openaiKeyStatus: string | null
    isAdmin?: boolean
}

export function OpenAiKeyAlert({ openaiKeyStatus, isAdmin }: OpenAiKeyAlertProps) {
    const [dismissed, setDismissed] = useState(false)

    if (dismissed) return null
    if (isAdmin) return null // Admins don't need to see key alerts for themselves

    const isQuotaExceeded = openaiKeyStatus === 'insufficient_quota'
    const isInvalidKey = openaiKeyStatus === 'invalid_key'

    if (!isQuotaExceeded && !isInvalidKey) return null

    const styles = {
        insufficient_quota: {
            wrapper: 'border-red-500/25 bg-red-500/8 text-red-200',
            badge: 'bg-red-500/15 text-red-400 border-red-500/25',
            title: 'Sua IA está pausada: Saldo esgotado na OpenAI!',
            desc: 'A chave de API configurada em seu perfil está sem saldo ou atingiu o limite mensal. Seus clientes não receberão respostas automáticas.',
            buttonText: 'Recarregar ou Trocar Chave',
        },
        invalid_key: {
            wrapper: 'border-amber-500/25 bg-amber-500/8 text-amber-200',
            badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
            title: 'Sua IA está pausada: Chave OpenAI Inválida!',
            desc: 'A chave de API configurada em seu perfil é inválida ou foi revogada. Seus clientes não receberão respostas automáticas.',
            buttonText: 'Configurar Nova Chave',
        }
    }[openaiKeyStatus as 'insufficient_quota' | 'invalid_key']

    return (
        <div
            role="alert"
            className={`
                mx-4 mt-4 rounded-xl border px-4 py-3
                flex items-center gap-3 flex-wrap sm:flex-nowrap
                transition-all duration-300 animate-in fade-in slide-in-from-top-1
                ${styles.wrapper}
            `}
        >
            {/* Badge urgência */}
            <span className={`
                flex-shrink-0 text-[11px] font-semibold tracking-wide
                px-2 py-0.5 rounded-full border ${styles.badge}
            `}>
                Atenção
            </span>

            {/* Ícone */}
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />

            {/* Texto */}
            <div className="text-sm flex-1 min-w-0">
                <p className="font-semibold text-foreground">{styles.title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{styles.desc}</p>
            </div>

            {/* Botão de ação */}
            <Link
                href="/dashboard/ia"
                className="
                    flex-shrink-0 flex items-center gap-1.5
                    text-xs font-semibold px-3 py-1.5 rounded-lg
                    bg-red-600 hover:bg-red-500 text-white
                    hover:opacity-90 active:scale-95
                    transition-all duration-150
                "
            >
                {styles.buttonText}
                <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            {/* Fechar */}
            <button
                onClick={() => setDismissed(true)}
                className="
                    flex-shrink-0 p-1 rounded-lg
                    text-muted-foreground hover:text-foreground
                    hover:bg-white/5 transition-colors
                "
                aria-label="Fechar aviso"
                title="Fechar por agora"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
