'use client'
import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

export function CheckoutButton({
    priceId,
    isPopular,
    label
}: {
    priceId: string | null;
    isPopular: boolean;
    label: string;
}) {
    const [loading, setLoading] = useState(false)

    const handleCheckout = async () => {
        if (!priceId) return alert('Plano indísponível para assinatura online.')
        setLoading(true)
        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priceId })
            })
            const data = await res.json()
            if (data.url) {
                window.location.href = data.url
            } else {
                alert(data.error || 'Erro ao iniciar checkout')
            }
        } catch (err) {
            console.error('Checkout error:', err)
            alert('Erro ao iniciar checkout')
        } finally {
            setLoading(false)
        }
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
