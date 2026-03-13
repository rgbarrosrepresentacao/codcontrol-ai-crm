'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

function ConversionTracking() {
    const searchParams = useSearchParams()
    const success = searchParams.get('success')

    useEffect(() => {
        if (success === 'true') {
            // Verifica se a tag global do Google já carregou
            if (typeof window !== 'undefined' && (window as any).gtag) {
                (window as any).gtag('event', 'conversion', {
                    'send_to': 'AW-17985947430', // Seu ID do Google Ads
                    'value': 1.0,               // Valor padrão (pode ser ajustado)
                    'currency': 'BRL'
                });
                console.log('🚀 Google Ads: Conversão de Venda enviada com sucesso!');
            }
        }
    }, [success])

    return null
}

export function GoogleAdsConversion() {
    return (
        <Suspense fallback={null}>
            <ConversionTracking />
        </Suspense>
    )
}
