import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const supabaseAdmin = getSupabaseAdmin()
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { contactId, action } = await req.json() as { contactId: string; action: 'take' | 'return' }

        if (!contactId || !['take', 'return'].includes(action)) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
        }

        if (action === 'take') {
            // Operador assume: pausa IA, marca como HUMANO
            const { error } = await supabaseAdmin
                .from('contacts')
                .update({
                    ai_tag: 'HUMANO',
                    followup_stage: 0,
                })
                .eq('id', contactId)
                .eq('user_id', session.user.id)

            if (error) throw error
            return NextResponse.json({ success: true, mode: 'human' })
        } else {
            // Devolve para IA: limpa ai_tag, IA volta a atender
            const { error } = await supabaseAdmin
                .from('contacts')
                .update({
                    ai_tag: null,
                })
                .eq('id', contactId)
                .eq('user_id', session.user.id)

            if (error) throw error
            return NextResponse.json({ success: true, mode: 'ai' })
        }
    } catch (error) {
        console.error('[takeover]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
