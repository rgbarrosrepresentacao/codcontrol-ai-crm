import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as adminSupabase } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Verifica se o usuário logado é admin */
async function requireAdmin() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return null
    return user
}

/** Substitui variáveis na mensagem: {{nome}}, {{empresa}}, etc. */
function resolveVariables(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] || variables[key.toLowerCase()] || `{{${key}}}`
    })
}

/** Escolhe uma variante de mensagem aleatoriamente (Anti-repetição) */
function pickVariant(variants: { text: string }[]): string {
    if (!variants || variants.length === 0) return ''
    const idx = Math.floor(Math.random() * variants.length)
    return variants[idx].text
}

// ─── GET: Lista campanhas do admin ───────────────────────────────────────────

export async function GET(req: NextRequest) {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const { data: campaigns, error } = await adminSupabase
        .from('blast_campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ campaigns })
}

// ─── POST: Cria nova campanha ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const {
        name,
        description,
        message_variants,
        media_url,
        media_type,
        media_caption,
        instance_ids,
        delay_min = 30,
        delay_max = 90,
        warming_enabled = false,
    } = body

    if (!name) return NextResponse.json({ error: 'Nome da campanha obrigatório' }, { status: 400 })
    if (!message_variants || message_variants.length === 0) {
        return NextResponse.json({ error: 'Pelo menos uma variante de mensagem é obrigatória' }, { status: 400 })
    }
    if (!instance_ids || instance_ids.length === 0) {
        return NextResponse.json({ error: 'Selecione pelo menos uma instância de WhatsApp' }, { status: 400 })
    }
    if (delay_min < 15 || delay_max < delay_min) {
        return NextResponse.json({ error: 'Delay mínimo: 15s. Delay máximo deve ser maior que o mínimo.' }, { status: 400 })
    }

    const { data: campaign, error } = await adminSupabase
        .from('blast_campaigns')
        .insert({
            user_id: user.id,
            name,
            description,
            message_variants,
            media_url: media_url || null,
            media_type: media_type || null,
            media_caption: media_caption || null,
            instance_ids,
            delay_min,
            delay_max,
            warming_enabled,
            status: 'draft',
        })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ campaign }, { status: 201 })
}

// ─── DELETE: Remove campanha (somente draft) ──────────────────────────────────

export async function DELETE(req: NextRequest) {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

    // Só permite deletar drafts ou campanhas concluídas
    const { data: campaign } = await adminSupabase
        .from('blast_campaigns')
        .select('status')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

    if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    if (campaign.status === 'running') {
        return NextResponse.json({ error: 'Pause a campanha antes de deletar' }, { status: 400 })
    }

    const { error } = await adminSupabase
        .from('blast_campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
}
