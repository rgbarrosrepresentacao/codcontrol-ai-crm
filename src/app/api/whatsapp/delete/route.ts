import { NextRequest, NextResponse } from 'next/server'
import { evolutionApi } from '@/lib/evolution'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(req: NextRequest) {
    const instance = req.nextUrl.searchParams.get('instance')
    if (!instance) return NextResponse.json({ error: 'Instance required' }, { status: 400 })
    
    // Usamos o Service Role para poder limpar os dados vinculados e a instância sem restrições de RLS/FK
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    try {
        // 1. Busca a instância para ter certeza que ela existe e pegar o ID interno
        const { data: instData } = await supabaseAdmin
            .from('whatsapp_instances')
            .select('id')
            .eq('instance_name', instance)
            .single()

        // 2. Tenta deletar na Evolution API primeiro
        try {
            await evolutionApi.deleteInstance(instance)
        } catch (err: any) {
            console.warn(`[Delete Instance] Erro na Evolution (pode ser que já tenha sido removida lá):`, err.message)
        }

        if (instData) {
            console.log(`[Delete Instance] Limpando dados da instância ${instData.id} no banco de dados...`)
            
            // 3. Limpa dados vinculados (Caso não tenha ON DELETE CASCADE no banco)
            // Deletamos mensagens, conversas e contatos vinculados a esta instância específica
            await supabaseAdmin.from('messages').delete().eq('instance_id', instData.id)
            await supabaseAdmin.from('conversations').delete().eq('instance_id', instData.id)
            await supabaseAdmin.from('contacts').delete().eq('instance_id', instData.id)
            
            // 4. Por fim, deleta a instância
            const { error: dbError } = await supabaseAdmin
                .from('whatsapp_instances')
                .delete()
                .eq('id', instData.id)

            if (dbError) throw dbError
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('[Delete Instance] Erro Crítico:', error)
        return NextResponse.json({ error: error.message || 'Erro interno ao remover instância' }, { status: 500 })
    }
}
