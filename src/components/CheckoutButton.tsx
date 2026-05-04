'use client'
import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

export function CheckoutButton({
    priceId,
    kiwifyUrl,
    isPopular,
    label
}: {
    priceId: string | null;
    kiwifyUrl?: string | null;
    isPopular: boolean;
    label: string;
}) {
    const [loading, setLoading] = useState(false)

    const handleCheckout = async () => {
        // Redireciona direto para o checkout da Kiwify
        if (kiwifyUrl) {
            setLoading(true)
            window.location.href = kiwifyUrl
            return
        }

        // Fallback: plano sem link configurado
        alert('Para assinar ou fazer upgrade, entre em contato com nosso suporte.')
    }

    return (
        <button
            onClick={handleCheckout}
            disabled={loading}
            className={`w-full font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 ${isPopular ? 'gradient-primary text-black hover:opacity-90' : 'border border-border hover:bg-secondary text-foreground'}`}
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {loading ? 'Redirecionando...' : label}
        </button>
    )
}
