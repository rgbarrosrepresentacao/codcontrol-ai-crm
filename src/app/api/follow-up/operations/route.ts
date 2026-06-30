import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { FollowUpOperationsService } from '@/services/follow-up/operations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
    console.log('[FOLLOWUP_OPERATIONS_REFRESH] Solicitando atualização dos dados da Central de Operações...');
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            console.error('[FOLLOWUP_OPERATIONS_ERROR] Usuário não autenticado.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const data = await FollowUpOperationsService.getOperationsData(user.id);

        if (!data.success) {
            return NextResponse.json({ error: 'Erro ao processar dados operacionais' }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (err: any) {
        console.error('[FOLLOWUP_OPERATIONS_ERROR] Erro fatal no GET:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
