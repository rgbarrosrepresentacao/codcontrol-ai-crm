import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .single()

        // Admin vê todas. Usuário normal vê só as suas.
        let query = adminSupabase
            .from('whatsapp_instances')
            .select('id, instance_name, status, phone_number, user_id')
            .order('created_at', { ascending: false })

        if (!profile?.is_admin) {
            query = query.eq('user_id', user.id)
        }

        const { data: instances, error } = await query

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ instances: instances || [] })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
