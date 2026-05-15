import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getAuthUser(req: NextRequest) {
    const cookieStore = await cookies()
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Cookie: cookieStore.toString() } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function GET(req: NextRequest) {
    const supabase = getSupabaseAdmin()
    try {
        const user = await getAuthUser(req)
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
