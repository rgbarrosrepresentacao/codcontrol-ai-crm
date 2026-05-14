import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { conversationId } = await req.json()
        if (!conversationId) return NextResponse.json({ error: 'conversationId obrigatório' }, { status: 400 })

        await supabaseAdmin
            .from('conversations')
            .update({ unread_count: 0 })
            .eq('id', conversationId)
            .eq('user_id', session.user.id)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[mark-read]', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
