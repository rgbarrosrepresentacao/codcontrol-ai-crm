import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { FollowUpLearningService } from '@/services/follow-up/learning';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
    console.log('[FOLLOWUP_LEARNING_RECALCULATE] Iniciando recálculo manual do perfil de aprendizado...');
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            console.error('[FOLLOWUP_LEARNING_RECALCULATE_ERROR] Usuário não autenticado.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rodar ciclo de aprendizado apenas para o usuário logado (seguro, tenant-isolated)
        const success = await FollowUpLearningService.learnForUser(user.id);

        if (!success) {
            return NextResponse.json({ error: 'Erro ao calcular aprendizado' }, { status: 500 });
        }

        const supabase = getSupabaseAdmin();
        const { data: profile } = await supabase
            .from('followup_learning_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

        return NextResponse.json({ success: true, profile: profile || null });

    } catch (err: any) {
        console.error('[FOLLOWUP_LEARNING_RECALCULATE_ERROR] Erro fatal no POST:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
