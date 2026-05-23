export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
        }

        const { data, error } = await supabase
            .from('conversion_events')
            .select('*, contacts(name, push_name, phone)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) throw error

        return NextResponse.json({
            success: true,
            events: data || []
        })
    } catch (error: any) {
        console.error('[pixel-events-get] Error:', error)
        return NextResponse.json({ error: error.message || 'Erro ao carregar eventos' }, { status: 500 })
    }
}
