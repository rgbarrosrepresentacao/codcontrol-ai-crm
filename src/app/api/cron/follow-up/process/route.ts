import { NextRequest, NextResponse } from 'next/server';
import { FollowUpProcessor } from '@/services/follow-up/processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 1. Validar se o segredo do cron está configurado no servidor
    if (!cronSecret) {
        console.error('[FOLLOWUP_PROCESS_ERROR] CRON_SECRET não configurado nas variáveis de ambiente.');
        return NextResponse.json(
            { success: false, error: 'CRON_SECRET is not configured' },
            { status: 503 }
        );
    }

    // 2. Validar o token de autorização
    if (authHeader !== `Bearer ${cronSecret}`) {
        console.error('[FOLLOWUP_PROCESS_ERROR] 🚫 Acesso não autorizado negado ao processador de follow-up.');
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        // 3. Executar o processamento das tentativas pendentes
        const result = await FollowUpProcessor.processPendingAttempts();

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: 'Erro interno durante processamento das mensagens' },
                { status: 500 }
            );
        }

        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[FOLLOWUP_PROCESS_ERROR] Erro fatal na rota do processador:', err.message || err);
        return NextResponse.json(
            { success: false, error: err.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
