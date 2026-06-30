import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { FollowUpLearningService } from '@/services/follow-up/learning';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
    console.log('[FOLLOWUP_CRON_LEARN] Iniciando Cron de Aprendizado Contínuo...');
    
    // Validar token de autorização do Cron
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[FOLLOWUP_CRON_LEARN_ERROR] CRON_SECRET não configurado no ambiente.');
        return NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        console.warn('[FOLLOWUP_CRON_LEARN_WARNING] Token de autorização inválido ou ausente.');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = getSupabaseAdmin();

        // 1. Obter todos os usuários com configurações de follow-up ativas ou com tentativas registradas
        const { data: users, error: userErr } = await supabase
            .from('followup_settings')
            .select('user_id');

        if (userErr) throw userErr;

        if (!users || users.length === 0) {
            console.log('[FOLLOWUP_CRON_LEARN] Nenhum usuário com configurações de follow-up encontradas.');
            return NextResponse.json({ success: true, message: 'No users to learn.' });
        }

        const results = [];
        for (const u of users) {
            const success = await FollowUpLearningService.learnForUser(u.user_id);
            results.push({ user_id: u.user_id, success });
        }

        console.log('[FOLLOWUP_CRON_LEARN_SUCCESS] Ciclo de aprendizado concluído.');
        return NextResponse.json({
            success: true,
            processed_users: results.length,
            details: results
        });

    } catch (err: any) {
        console.error('[FOLLOWUP_CRON_LEARN_ERROR] Erro fatal no processamento:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
