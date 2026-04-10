import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as adminSupabase } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

async function requireAdmin() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return null
    return user
}

export async function GET(req: NextRequest) {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const campaign_id = searchParams.get('campaign_id')
    if (!campaign_id) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 })

    const { data: campaign } = await adminSupabase
        .from('blast_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .eq('user_id', user.id)
        .single()

    if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })

    // Conta itens pendentes e em processamento
    const { count: pendingCount } = await adminSupabase
        .from('blast_queue')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign_id)
        .eq('status', 'pending')

    // Busca os últimos 10 itens da fila (log ao vivo)
    const { data: recentQueue } = await adminSupabase
        .from('blast_queue')
        .select('id, status, resolved_message, sent_at, last_error, blast_contacts(phone, name)')
        .eq('campaign_id', campaign_id)
        .order('created_at', { ascending: false })
        .limit(15)

    // Calcula taxa de falha
    const total = (campaign.sent_count || 0) + (campaign.failed_count || 0)
    const failRate = total > 0 ? (campaign.failed_count / total) : 0

    return NextResponse.json({
        campaign,
        pending_count: pendingCount || 0,
        fail_rate: failRate,
        recent_queue: recentQueue || [],
    })
}
