export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
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

    const adminSupabase = getSupabaseAdmin()

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
        message_variants = [],
        media_url,
        media_type,
        media_caption,
        instance_ids,
        delay_min = 30,
        delay_max = 90,
        warming_enabled = false,
        template_name,
        template_language = 'pt_BR',
        template_variable_mappings = []
    } = body

    if (!name) return NextResponse.json({ error: 'Nome da campanha obrigatório' }, { status: 400 })
    if (!instance_ids || instance_ids.length === 0) {
        return NextResponse.json({ error: 'Selecione pelo menos uma instância de WhatsApp' }, { status: 400 })
    }
    if (delay_min < 15 || delay_max < delay_min) {
        return NextResponse.json({ error: 'Delay mínimo: 15s. Delay máximo deve ser maior que o mínimo.' }, { status: 400 })
    }

    const adminSupabase = getSupabaseAdmin()

    // ── VALIDAÇÃO DE SEGURANÇA BACKEND: Provedor META e Status APPROVED ──
    const { data: instances, error: instError } = await adminSupabase
        .from('whatsapp_instances')
        .select('id, provider_type')
        .in('id', instance_ids)

    if (instError || !instances || instances.length === 0) {
        return NextResponse.json({ error: 'Erro ao validar instâncias ou instâncias não encontradas' }, { status: 400 })
    }

    const hasEvolution = instances.some((inst: any) => inst.provider_type !== 'META')
    if (hasEvolution) {
        return NextResponse.json({ error: 'Disparo em massa não é permitido para instâncias Evolution. Use somente instâncias Meta.' }, { status: 400 })
    }

    if (!template_name) {
        return NextResponse.json({ error: 'Campanhas via API Oficial da Meta exigem a seleção de um template aprovado.' }, { status: 400 })
    }

    // Valida se o template existe e está APPROVED
    const { data: template, error: tempError } = await adminSupabase
        .from('whatsapp_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('name', template_name)
        .single()

    if (tempError || !template) {
        return NextResponse.json({ error: `Template oficial '${template_name}' não encontrado no banco local. Sincronize seus templates primeiro.` }, { status: 404 })
    }

    if (template.status !== 'APPROVED') {
        return NextResponse.json({ error: `O template selecionado está com status '${template.status}'. Apenas templates APPROVED são permitidos para disparos.` }, { status: 400 })
    }

    // ── FIM DA VALIDAÇÃO ──

    const { data: campaign, error } = await adminSupabase
        .from('blast_campaigns')
        .insert({
            user_id: user.id,
            name,
            description,
            message_variants: message_variants || [],
            media_url: media_url || null,
            media_type: media_type || null,
            media_caption: media_caption || null,
            instance_ids,
            delay_min,
            delay_max,
            warming_enabled,
            status: 'draft',
            template_name,
            template_language,
            template_variable_mappings
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

    const adminSupabase = getSupabaseAdmin()

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
