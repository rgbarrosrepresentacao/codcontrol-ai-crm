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

export async function POST(req: NextRequest) {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { campaign_id, action } = body // action: 'start' | 'pause' | 'resume' | 'cancel'

    if (!campaign_id || !action) {
        return NextResponse.json({ error: 'campaign_id e action são obrigatórios' }, { status: 400 })
    }

    const { data: campaign } = await adminSupabase
        .from('blast_campaigns')
        .select('id, status, total_contacts')
        .eq('id', campaign_id)
        .eq('user_id', user.id)
        .single()

    if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })

    if (action === 'start' || action === 'resume') {
        if (campaign.status === 'completed' || campaign.status === 'cancelled') {
            return NextResponse.json({ error: 'Campanha já finalizada. Crie uma nova.' }, { status: 400 })
        }
        if (campaign.total_contacts === 0) {
            return NextResponse.json({ error: 'Importe os contatos antes de iniciar.' }, { status: 400 })
        }

        await adminSupabase
            .from('blast_campaigns')
            .update({
                status: 'running',
                started_at: campaign.status === 'draft' ? new Date().toISOString() : undefined,
            })
            .eq('id', campaign_id)

        return NextResponse.json({ success: true, status: 'running' })
    }

    if (action === 'pause') {
        if (campaign.status !== 'running') {
            return NextResponse.json({ error: 'Campanha não está em execução' }, { status: 400 })
        }
        await adminSupabase
            .from('blast_campaigns')
            .update({ status: 'paused' })
            .eq('id', campaign_id)

        return NextResponse.json({ success: true, status: 'paused' })
    }

    if (action === 'cancel') {
        await adminSupabase
            .from('blast_campaigns')
            .update({ status: 'cancelled', completed_at: new Date().toISOString() })
            .eq('id', campaign_id)

        // Cancela todos os pendings da fila
        await adminSupabase
            .from('blast_queue')
            .update({ status: 'skipped' })
            .eq('campaign_id', campaign_id)
            .eq('status', 'pending')

        return NextResponse.json({ success: true, status: 'cancelled' })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
