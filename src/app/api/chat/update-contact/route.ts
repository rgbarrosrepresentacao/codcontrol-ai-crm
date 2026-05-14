import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { contactId, name, notes, status } = await req.json()

        if (!contactId) {
            return NextResponse.json({ error: 'ID do contato obrigatório' }, { status: 400 })
        }

        const { error } = await supabase
            .from('contacts')
            .update({
                name,
                notes,
                status,
                updated_at: new Date().toISOString()
            })
            .eq('id', contactId)
            .eq('user_id', session.user.id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('[update-contact] Error:', error)
        return NextResponse.json({ error: error.message || 'Erro ao atualizar contato' }, { status: 500 })
    }
}
