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

        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';

        const supabase = getSupabaseAdmin();

        // Buscar conversas ativas vinculadas aos contatos do usuário
        let query = supabase
            .from('conversations')
            .select(`
                id, 
                status, 
                last_message, 
                last_message_at, 
                contact_id,
                contacts!inner(name, phone, ai_tag, notes)
            `)
            .eq('user_id', user.id)
            .order('last_message_at', { ascending: false })
            .limit(50);

        if (search) {
            // Filtrar pelo nome do contato na tabela interna
            query = query.ilike('contacts.name', `%${search}%`);
        }

        const { data: conversations, error } = await query;

        if (error) {
            console.error('[FOLLOWUP_SIMULATOR_CONVS_ERROR]', error.message);
            return NextResponse.json({ error: 'Erro ao buscar conversas' }, { status: 500 });
        }

        return NextResponse.json({ success: true, conversations });

    } catch (err: any) {
        console.error('[FOLLOWUP_SIMULATOR_CONVS_ERROR] Erro fatal:', err.message || err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
