export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

async function requireAdmin() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) return null
    return user
}

function resolveVariables(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] || variables[key.toLowerCase()] || `{{${key}}}`
    })
}

function pickVariant(variants: { text: string }[]): string {
    if (!variants || variants.length === 0) return ''
    return variants[Math.floor(Math.random() * variants.length)].text
}

// ─── Importa contatos via array (parsed do CSV no frontend) ──────────────────

export async function POST(req: NextRequest) {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { campaign_id, contacts } = body
    // contacts: [{ phone, name, variables: {} }]

    if (!campaign_id) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 })
    if (!contacts || contacts.length === 0) return NextResponse.json({ error: 'Lista de contatos vazia' }, { status: 400 })

    const adminSupabase = getSupabaseAdmin()

    // Verifica que a campanha pertence ao admin
    const supabase = await createSupabaseServerClient()
    const { data: campaign, error: campaignError } = await supabase
        .from('blast_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .eq('user_id', user.id)
        .single()

    if (campaignError || !campaign) {
        console.error('Error finding campaign:', campaignError || 'Not found', { campaign_id, user_id: user.id })
        return NextResponse.json({ 
            error: 'Campanha não encontrada ou você não tem permissão',
            details: campaignError?.message 
        }, { status: 404 })
    }
    if (campaign.status === 'running') return NextResponse.json({ error: 'Não é possível importar contatos com campanha em execução' }, { status: 400 })

    // Normaliza e valida números
    const normalized = contacts.map((c: any) => {
        let phone = String(c.phone || '').replace(/\D/g, '')
        // Garante formato brasileiro com código do país
        if (phone.length === 11 && !phone.startsWith('55')) phone = '55' + phone
        if (phone.length === 10 && !phone.startsWith('55')) phone = '55' + phone
        return { ...c, phone }
    }).filter((c: any) => c.phone.length >= 12) // filtra inválidos

    if (normalized.length === 0) return NextResponse.json({ error: 'Nenhum número válido encontrado' }, { status: 400 })

    // Insere todos os contatos em lote
    const contactInserts = normalized.map((c: any) => ({
        campaign_id,
        user_id: user.id,
        phone: c.phone,
        name: c.name || null,
        variables: c.variables || {},
        opted_in: true,
        opted_out: false,
    }))

    const { data: insertedContacts, error: contactError } = await adminSupabase
        .from('blast_contacts')
        .insert(contactInserts)
        .select('id, phone, name, variables')

    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })

    // Monta a fila de envio para cada contato com rotação de instâncias e delays escalonados
    const instanceIds: string[] = campaign.instance_ids

    // Busca infos das instâncias para validar se estão conectadas
    const { data: instances } = await adminSupabase
        .from('whatsapp_instances')
        .select('id, instance_name, status, provider_type')
        .in('id', instanceIds)
        .eq('status', 'connected')

    if (!instances || instances.length === 0) {
        return NextResponse.json({ error: 'Nenhuma instância conectada encontrada' }, { status: 400 })
    }

    // Backend validation: enforce META only
    const hasEvolution = instances.some((inst: any) => inst.provider_type !== 'META')
    if (hasEvolution) {
        return NextResponse.json({ error: 'Disparo em massa não é permitido para instâncias Evolution. Use somente instâncias Meta.' }, { status: 400 })
    }

    // Enforces approved template Meta validation
    if (!campaign.template_name) {
        return NextResponse.json({ error: 'Campanhas Meta exigem a seleção de um template aprovado.' }, { status: 400 })
    }

    const { data: template } = await adminSupabase
        .from('whatsapp_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('name', campaign.template_name)
        .single()

    if (!template) {
        return NextResponse.json({ error: `Template oficial '${campaign.template_name}' não encontrado no banco local.` }, { status: 404 })
    }

    if (template.status !== 'APPROVED') {
        return NextResponse.json({ error: `O template selecionado está com status '${template.status}'. Apenas templates APPROVED são permitidos.` }, { status: 400 })
    }

    // Parse template components to count required body variables
    const bodyComponent = template.components?.find((c: any) => c.type === 'BODY')
    const bodyText = bodyComponent?.text || ''
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || []
    const requiredCount = matches.length

    // Limite de aquecimento (se habilitado)
    const warmingLimit = campaign.warming_enabled ? campaign.warming_limit : Infinity
    const contactsToQueue = insertedContacts!.slice(0, warmingLimit)

    // Cria itens da fila com delay escalonado para cada contato
    let cumulativeDelaySec = 5 // começa com 5s de graça para o primeiro
    const queueItems = contactsToQueue.map((contact: any, idx: number) => {
        const instanceIdx = idx % instances.length
        const instance = instances[instanceIdx]
        
        const variables = {
            nome: contact.name || 'amigo',
            ...contact.variables,
        }

        // Resolvendo as variáveis sequenciais do template oficiais
        const variableMappings = campaign.template_variable_mappings || []
        const contactVars: string[] = []
        let hasMissingVar = false
        
        for (let i = 1; i <= requiredCount; i++) {
            const mapping = variableMappings.find((m: any) => m.paramIndex === i)
            const csvCol = mapping?.csvColumn
            
            // Check if contact has the value
            let val = ''
            if (csvCol) {
                val = contact.variables?.[csvCol] || contact.variables?.[csvCol.toLowerCase()] || ''
            }
            if (!val && csvCol?.toLowerCase() === 'nome') {
                val = contact.name || ''
            }
            const finalVal = String(val || '').trim()
            
            if (!finalVal) {
                hasMissingVar = true
            }
            contactVars.push(finalVal)
        }

        // Format resolved message for local preview/log
        let resolvedMessage = bodyText
        contactVars.forEach((v, index) => {
            resolvedMessage = resolvedMessage.replace(`{{${index + 1}}}`, v)
        })

        const resolvedCaption = campaign.media_caption
            ? resolveVariables(campaign.media_caption, variables)
            : null

        const scheduledAt = new Date(Date.now() + cumulativeDelaySec * 1000).toISOString()

        // Próximo delay aleatório entre min e max
        const thisDelay = Math.floor(Math.random() * (campaign.delay_max - campaign.delay_min + 1)) + campaign.delay_min
        cumulativeDelaySec += thisDelay

        return {
            campaign_id,
            contact_id: contact.id,
            user_id: user.id,
            instance_id: instance.id,
            resolved_message: resolvedMessage,
            media_url: campaign.media_url || null,
            media_type: campaign.media_type || null,
            media_caption: resolvedCaption,
            status: hasMissingVar ? 'failed' : 'pending',
            attempts: hasMissingVar ? 1 : 0,
            last_error: hasMissingVar ? 'Variável obrigatória ausente no CSV' : null,
            scheduled_at: scheduledAt,
            template_name: campaign.template_name,
            template_language: campaign.template_language || 'pt_BR',
            template_variables: contactVars,
        }
    })

    const { error: queueError } = await adminSupabase
        .from('blast_queue')
        .insert(queueItems)

    if (queueError) return NextResponse.json({ error: queueError.message }, { status: 500 })

    // Atualiza total de contatos na campanha e falhas imediatas se houver
    const immediateFailedCount = queueItems.filter(q => q.status === 'failed').length
    await adminSupabase
        .from('blast_campaigns')
        .update({ 
            total_contacts: insertedContacts!.length,
            failed_count: immediateFailedCount
        })
        .eq('id', campaign_id)

    const estimatedMinutes = Math.round(cumulativeDelaySec / 60)

    return NextResponse.json({
        success: true,
        imported: insertedContacts!.length,
        queued: queueItems.length,
        skipped_warming: insertedContacts!.length - queueItems.length,
        estimated_completion_minutes: estimatedMinutes,
    })
}

// ─── GET: Lista contatos de uma campanha ─────────────────────────────────────

export async function GET(req: NextRequest) {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const campaign_id = searchParams.get('campaign_id')
    if (!campaign_id) return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 })

    const adminSupabase = getSupabaseAdmin()

    const { data: contacts, error } = await adminSupabase
        .from('blast_contacts')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ contacts })
}
