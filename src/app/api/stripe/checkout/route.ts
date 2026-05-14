export const dynamic = 'force-dynamic'
/**
 * ROTA DESATIVADA — CHECKOUT VIA STRIPE REMOVIDO
 *
 * Este sistema utiliza exclusivamente a Kiwify como plataforma de pagamento.
 * Todos os checkouts são feitos diretamente pelo link da Kiwify (kiwify_checkout_url).
 * Esta rota foi mantida apenas para retornar um erro claro caso algum link antigo a acione.
 */
import { NextResponse } from 'next/server'

export async function POST() {
    console.warn('[STRIPE_CHECKOUT] ⚠️ Rota desativada — sistema utiliza Kiwify como plataforma de pagamento.')
    return NextResponse.json(
        { error: 'Esta rota foi desativada. O sistema utiliza Kiwify para pagamentos.' },
        { status: 410 } // 410 Gone — recurso removido intencionalmente
    )
}
