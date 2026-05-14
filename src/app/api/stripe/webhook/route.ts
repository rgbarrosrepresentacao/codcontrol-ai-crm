export const dynamic = 'force-dynamic'
/**
 * ROTA DESATIVADA — WEBHOOK STRIPE REMOVIDO
 *
 * Este sistema utiliza exclusivamente a Kiwify como plataforma de pagamento.
 * Todos os eventos de assinatura chegam pelo webhook em /api/kiwify/webhook.
 * Esta rota foi mantida apenas para retornar um erro claro.
 */
import { NextResponse } from 'next/server'

export async function POST() {
    console.warn('[STRIPE_WEBHOOK] ⚠️ Rota desativada — sistema utiliza Kiwify para pagamentos.')
    return NextResponse.json(
        { error: 'Esta rota foi desativada. O sistema utiliza Kiwify para pagamentos.' },
        { status: 410 } // 410 Gone — recurso removido intencionalmente
    )
}
