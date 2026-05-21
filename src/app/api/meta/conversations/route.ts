import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'


/** GET /api/meta/conversations — Lista conversas com estado da janela 24h */
export async function GET(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        const supabaseAuth = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin, plans(slug)')
            .eq('id', user.id)
            .single()

        const profileData = profile as any
        const isAllowed = profileData?.is_admin || ['pro', 'agencia'].includes(profileData?.plans?.slug || '')
        if (!isAllowed) return NextResponse.json({ error: 'Plan upgrade required' }, { status: 403 })

        // Buscar conversas ativas com status da janela de 24h
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select(`
                id,
                contact_id,
                last_message_at,
                status,
                contacts (
                    id,
                    name,
                    phone
                )
            `)
            .eq('user_id', user.id)
            .order('last_message_at', { ascending: false })
            .limit(100)

        if (error) throw error

        // Calcular estado da janela de 24h para cada conversa
        const enriched = (conversations || []).map((conv: any) => {
            const lastMsg = conv.last_message_at ? new Date(conv.last_message_at) : null
            const now = new Date()
            const diffMs = lastMsg ? now.getTime() - lastMsg.getTime() : Infinity
            const diffHours = diffMs / (1000 * 60 * 60)
            const windowOpen = diffHours < 24
            const minutesLeft = Math.max(0, Math.round((24 * 60) - (diffMs / (1000 * 60))))

            return {
                id: conv.id,
                contact: conv.contacts,
                last_message_at: conv.last_message_at,
                status: conv.status,
                window_open: windowOpen,
                window_expires_in_minutes: windowOpen ? minutesLeft : 0,
                hours_since_last_message: Math.round(diffHours * 10) / 10
            }
        })

        const open = enriched.filter(c => c.window_open)
        const closed = enriched.filter(c => !c.window_open)

        return NextResponse.json({
            total: enriched.length,
            open: open.length,
            closed: closed.length,
            conversations: enriched
        })

    } catch (err: any) {
        console.error('[META_CONVERSATIONS] Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
