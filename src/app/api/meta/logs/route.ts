import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'


export async function GET(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        const supabaseAuth = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Buscar logs do último mês
        const oneMonthAgo = new Date()
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

        const { data: logs, error } = await supabase
            .from('meta_message_logs')
            .select('*')
            .eq('user_id', user.id)
            .gte('created_at', oneMonthAgo.toISOString())
            .order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json({ logs })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
