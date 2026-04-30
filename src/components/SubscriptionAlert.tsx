'use client'
import { useState } from 'react'
import { Clock, RefreshCw, X } from 'lucide-react'

// ─── Links de renovação por plano ────────────────────────────────────────────
const RENEWAL_LINKS: Record<string, string> = {
    agencia: 'https://pay.kiwify.com.br/oq7PYnd',
    pro:     'https://pay.kiwify.com.br/ZuTZPsY',
    basico:  'https://pay.kiwify.com.br/3TM6aEC',
}

function getRenewalLink(planName: string, affiliateId?: string | null): string {
    const lower = planName.toLowerCase()
    let link = RENEWAL_LINKS.basico
    if (lower.includes('agênci') || lower.includes('agenci') || lower.includes('agency')) {
        link = RENEWAL_LINKS.agencia
    } else if (lower.includes('pro')) {
        link = RENEWAL_LINKS.pro
    }
    return affiliateId ? `${link}?afid=${affiliateId}` : link
}

interface SubscriptionAlertProps {
    trialEndsAt:        string | null
    subscriptionStatus: string | null
    planName:           string
    isAdmin?:           boolean
    affiliateId?:       string | null
}

export function SubscriptionAlert({
    trialEndsAt,
    subscriptionStatus,
    planName,
    isAdmin,
    affiliateId,
}: SubscriptionAlertProps) {
    const [dismissed, setDismissed] = useState(false)

    // ─── Guardas de saída ─────────────────────────────────────────────────────
    if (dismissed)  return null  // Usuário fechou o alerta
    if (isAdmin)    return null  // Admin não precisa ver aviso de vencimento
    if (!trialEndsAt) return null // Sem data de vencimento (legado) → sem alerta

    // Só mostra para usuários pagantes ativos
    const isPaidStatus = ['paid', 'active', 'aprovado', 'approved'].includes(subscriptionStatus || '')
    if (!isPaidStatus) return null // Trial é tratado pelo TrialWall

    // ─── Calcular dias restantes ──────────────────────────────────────────────
    const now       = new Date()
    const expiresAt = new Date(trialEndsAt)
    const msLeft    = expiresAt.getTime() - now.getTime()
    const daysLeft  = Math.ceil(msLeft / (1000 * 60 * 60 * 24))

    // Mostrar apenas quando faltam 7 dias ou menos
    // (não mostrar se ainda tem mais de 7 dias, e não mostrar dentro da carência negativa)
    if (daysLeft > 7)  return null
    if (daysLeft < -2) return null // Já passou da carência → TrialWall cuida

    // ─── Nível de urgência ────────────────────────────────────────────────────
    type Urgency = 'info' | 'warning' | 'danger'

    const urgency: Urgency =
        daysLeft <= 1 ? 'danger' :
        daysLeft <= 3 ? 'warning' : 'info'

    const styles = {
        info: {
            wrapper: 'border-yellow-500/20 bg-yellow-500/5',
            badge:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/25',
            icon:    'text-yellow-400',
            label:   'Atenção',
        },
        warning: {
            wrapper: 'border-orange-500/25 bg-orange-500/8',
            badge:   'bg-orange-500/10 text-orange-400 border-orange-500/25',
            icon:    'text-orange-400',
            label:   'Urgente',
        },
        danger: {
            wrapper: 'border-red-500/25 bg-red-500/8',
            badge:   'bg-red-500/10 text-red-400 border-red-500/25',
            icon:    'text-red-400',
            label:   'Crítico',
        },
    }[urgency]

    // ─── Mensagem dinâmica ────────────────────────────────────────────────────
    const mainMessage =
        daysLeft <= 0  ? 'Sua mensalidade venceu.' :
        daysLeft === 1 ? 'Sua mensalidade vence hoje!' :
                         `Sua mensalidade vence em ${daysLeft} dias.`

    const renewalLink = getRenewalLink(planName, affiliateId)

    // ─── Render ───────────────────────────────────────────────────────────────
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
                {styles.label}
            </span>

            {/* Ícone */}
            <Clock className={`w-4 h-4 flex-shrink-0 ${styles.icon}`} />

            {/* Texto */}
            <p className="text-sm text-foreground flex-1 min-w-0">
                <span className="font-medium">{mainMessage}</span>{' '}
                <span className="text-muted-foreground text-xs">
                    Renove para continuar usando o CodControl AI CRM sem interrupções.
                </span>
            </p>

            {/* Botão renovar */}
            <a
                href={renewalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="
                    flex-shrink-0 flex items-center gap-1.5
                    text-xs font-semibold px-3 py-1.5 rounded-lg
                    bg-primary text-primary-foreground
                    hover:opacity-85 active:scale-95
                    transition-all duration-150
                "
            >
                <RefreshCw className="w-3 h-3" />
                Renovar agora
            </a>

            {/* Fechar (sessão) */}
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
