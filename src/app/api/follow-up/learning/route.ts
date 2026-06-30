import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const supabaseAuth = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = getSupabaseAdmin();

        const { data: profile, error } = await supabase
            .from('followup_learning_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = No rows returned
            console.error('[FOLLOWUP_LEARNING_GET_ERROR]', error.message);
            return NextResponse.json({ error: 'Erro ao buscar perfil de aprendizado' }, { status: 500 });
        }

        return NextResponse.json({ success: true, profile: profile || null });

    } catch (err: any) {
        console.error('[FOLLOWUP_LEARNING_GET_ERROR] Erro fatal:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
