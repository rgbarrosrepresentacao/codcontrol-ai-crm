import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max execution time
export const revalidate = 0 // Disable cache

export async function GET(req: NextRequest) {
    console.log('[FOLLOWUP_DISABLED] Follow-up automático antigo está desativado.');
    return NextResponse.json({
        disabled: true,
        message: "Follow-up automático antigo desativado. Novo módulo configurável será implementado futuramente."
    }, { status: 200 });
}
