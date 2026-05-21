export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { evolutionApi } from '@/lib/evolution'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    const isAdmin = profile?.is_admin || false

    const instance = req.nextUrl.searchParams.get('instance')
    if (!instance) return NextResponse.json({ error: 'Instance required' }, { status: 400 })

    const { data: instData } = await supabase
        .from('whatsapp_instances')
        .select('user_id')
        .eq('instance_name', instance)
        .single()

    if (!instData) {
        return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })
    }

    if (instData.user_id !== user.id && !isAdmin) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    try {
        const data = await evolutionApi.getQrCode(instance)
        const qrCode = data?.base64 || data?.qrcode?.base64 || data?.code
        return NextResponse.json({ qrCode })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
