export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { evolutionApi } from '@/lib/evolution'
import { MetaProvider } from '@/services/whatsapp/MetaProvider'
import { GuardService } from '@/services/whatsapp/guard'

export const maxDuration = 300
export const revalidate = 0

// Máximo de mensagens por rodada do cron (5 min de execução)
// Com delay mínimo de 30s, cabe ~8 mensagens seguras por ciclo
const MAX_PER_RUN = 8

const CATEGORY_COSTS: Record<string, number> = {
    'marketing': 0.27,
    'utility': 0.09,
    'authentication': 0.09
}

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        console.error('[BLAST_CRON] 🚫 Acesso não autorizado negado ou CRON_SECRET não configurado.');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[BLAST_CRON] 🚀 Iniciando processamento da fila de disparo...')

    const supabase = getSupabaseAdmin()

    try {
        // 1. Busca itens prontos para envio de campanhas ATIVAS
        //    - status = 'pending'
        //    - scheduled_at <= agora (delay já passou)
        //    - campanha em status 'running'
        const now = new Date().toISOString()

        const { data: queueItems, error: queueError } = await supabase
            .from('blast_queue')
            .select(`
                id,
                user_id,
                campaign_id,
                contact_id,
                instance_id,
                resolved_message,
                media_url,
                media_type,
                media_caption,
                attempts,
                template_name,
                template_language,
                template_variables,
                blast_campaigns!inner ( * ),
                blast_contacts!inner ( * ),
                whatsapp_instances!inner ( * )
            `)
            .eq('status', 'pending')
            .lte('scheduled_at', now)
            .eq('blast_campaigns.status', 'running')
            .order('scheduled_at', { ascending: true })
            .limit(MAX_PER_RUN)

        if (queueError) {
            console.error('[BLAST_CRON] Erro ao buscar fila:', queueError.message)
            return NextResponse.json({ error: queueError.message }, { status: 500 })
        }

        if (!queueItems || queueItems.length === 0) {
            console.log('[BLAST_CRON] ✅ Nenhuma mensagem pendente no momento.')
            return NextResponse.json({ success: true, processed: 0 })
        }

        console.log(`[BLAST_CRON] 📋 ${queueItems.length} mensagens prontas para envio.`)

        // 2. Lock imediato: marca todos como 'processing' para evitar race condition
        const itemIds = queueItems.map(q => q.id)
        await supabase
            .from('blast_queue')
            .update({ status: 'processing' })
            .in('id', itemIds)

        let processedCount = 0
        const profilesCache: Record<string, any> = {}

        for (const item of queueItems) {
            const campaign = (item as any).blast_campaigns
            const contact = (item as any).blast_contacts
            const instance = (item as any).whatsapp_instances

            try {
                // ── Verificações de segurança ────────────────────────────────

                // 1. Verifica acesso via GuardService (fonte única de verdade)
                let profile = profilesCache[item.user_id]
                if (!profile) {
                    const { data: p } = await supabase.from('profiles').select('*').eq('id', item.user_id).single()
                    if (p) {
                        profile = p
                        profilesCache[item.user_id] = p
                    }
                }

                if (!profile) {
                    console.error(`[BLAST_CRON] ❌ Perfil não encontrado para o usuário ${item.user_id}. Pulando item ${item.id}.`)
                    continue
                }

                // GuardService.checkAccess garante que assinantes pagos nunca são bloqueados
                // por datas de trial históricas — elimina a cópia duplicada do bug anterior.
                const { hasAccess, reason: accessReason } = GuardService.checkAccess(profile)

                if (!hasAccess) {
                    console.warn(`[BLAST_CRON] 🚫 Disparo bloqueado para o usuário ${item.user_id}: ${accessReason}. Status: ${profile.stripe_subscription_status}`)
                    // Pausa a campanha se o dono estiver inadimplente para evitar processamento inútil
                    await supabase.from('blast_campaigns').update({ status: 'paused' }).eq('id', campaign.id)
                    continue
                }

                // Skip: contato optou por sair
                if (contact.opted_out) {
                    await supabase.from('blast_queue').update({ status: 'opted_out' }).eq('id', item.id).eq('user_id', item.user_id)
                    console.log(`[BLAST_CRON] ⛔ Contato ${contact.phone} optou por sair. Pulando.`)
                    continue
                }

                // Skip: instância desconectada
                if (instance.status !== 'connected') {
                    console.warn(`[BLAST_CRON] ⚠️ Instância ${instance.instance_name} desconectada. Reagendando.`)
                    await supabase.from('blast_queue').update({
                        status: 'pending',
                        scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // tenta de novo em 5min
                        last_error: 'Instância desconectada',
                    }).eq('id', item.id).eq('user_id', item.user_id)
                    continue
                }

                // Verifica taxa de falha da campanha → pausa automática
                const totalAttempted = (campaign.sent_count || 0) + (campaign.failed_count || 0)
                if (totalAttempted >= 10) { // só verifica após mínimo de 10 envios
                    const failRate = campaign.failed_count / totalAttempted
                    if (failRate >= campaign.auto_pause_on_fail_rate) {
                        console.error(`[BLAST_CRON] 🚨 Taxa de falha crítica (${(failRate * 100).toFixed(1)}%) na campanha ${campaign.id}. PAUSANDO AUTOMATICAMENTE.`)
                        await supabase.from('blast_campaigns').update({ status: 'paused' }).eq('id', campaign.id)
                        await supabase.from('blast_queue').update({ status: 'pending' }).eq('id', item.id).eq('user_id', item.user_id) // re-fila
                        break
                    }
                }

                // ── BLOQUEIO DE SEGURANÇA: Evolution API impedida de fazer disparos em massa ──
                if (instance.provider_type !== 'META') {
                    console.error(`[BLAST_CRON] 🚫 Instância Evolution (${instance.instance_name}) bloqueada para disparo em massa.`)
                    await supabase.from('blast_queue').update({
                        status: 'failed',
                        last_error: 'Disparo em massa bloqueado para instâncias Evolution. Use somente instâncias oficiais da Meta.',
                        attempts: item.attempts + 1,
                    }).eq('id', item.id).eq('user_id', item.user_id)

                    await supabase.from('blast_campaigns').update({
                        failed_count: (campaign.failed_count || 0) + 1,
                    }).eq('id', campaign.id)
                    continue
                }

                // ── Validação do Template para disparo via Meta API ──
                if (!item.template_name) {
                    console.error(`[BLAST_CRON] ❌ Item ${item.id} não possui template_name configurado.`)
                    await supabase.from('blast_queue').update({
                        status: 'failed',
                        last_error: 'Campanha Meta exige a definição de um template oficial.',
                        attempts: item.attempts + 1,
                    }).eq('id', item.id).eq('user_id', item.user_id)

                    await supabase.from('blast_campaigns').update({
                        failed_count: (campaign.failed_count || 0) + 1,
                    }).eq('id', campaign.id)
                    continue
                }

                if (!instance.meta_access_token_encrypted || !instance.meta_config) {
                    throw new Error('Meta API não configurada corretamente na instância. Token ou Configuração ausente.')
                }

                // ── Envio via Meta API Oficial ──
                const provider = new MetaProvider(
                    instance.meta_config as any,
                    instance.meta_access_token_encrypted
                )

                const components: any[] = []
                const variables = (item as any).template_variables || []
                if (variables && variables.length > 0) {
                    components.push({
                        type: 'body',
                        parameters: variables.map((v: string) => ({
                            type: 'text',
                            text: String(v || '').trim().slice(0, 1024)
                        }))
                    })
                }

                console.log(`[BLAST_CRON] Enviando template '${item.template_name}' para ${contact.phone} via Meta API...`)

                const result = await provider.sendTemplate(
                    contact.phone,
                    item.template_name,
                    item.template_language || 'pt_BR',
                    components
                )

                if (!result.success) {
                    throw new Error(result.error || 'Erro desconhecido ao enviar template da Meta')
                }

                const whatsappMsgId = result.message_id || null

                // Estimação do custo para log
                let category = 'utility'
                const { data: temp } = await supabase
                    .from('whatsapp_templates')
                    .select('category')
                    .eq('user_id', item.user_id)
                    .eq('name', item.template_name)
                    .maybeSingle()
                
                if (temp?.category) {
                    category = temp.category
                }

                const cost = CATEGORY_COSTS[category.toLowerCase()] || 0.09

                await supabase.from('meta_message_logs').insert({
                    user_id: item.user_id,
                    conversation_id: null,
                    template_name: item.template_name,
                    category: category,
                    recipient_phone: contact.phone,
                    message_id: whatsappMsgId || null,
                    status: 'sent',
                    error_code: null,
                    error_message: null,
                    cost_estimated: cost
                })

                // ── Sucesso: atualiza o item e a campanha ────────────────────

                await supabase.from('blast_queue').update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    whatsapp_message_id: whatsappMsgId,
                    attempts: item.attempts + 1,
                }).eq('id', item.id).eq('user_id', item.user_id)

                await supabase.from('blast_campaigns').update({
                    sent_count: (campaign.sent_count || 0) + 1,
                }).eq('id', campaign.id)

                console.log(`[BLAST_CRON] ✅ Enviado para ${contact.phone} | Campanha: ${campaign.id}`)
                processedCount++

                // ── Verifica se a campanha foi concluída ─────────────────────
                const newSentCount = (campaign.sent_count || 0) + 1
                if (newSentCount >= campaign.total_contacts) {
                    await supabase.from('blast_campaigns').update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                    }).eq('id', campaign.id)
                    console.log(`[BLAST_CRON] 🎉 Campanha ${campaign.id} CONCLUÍDA!`)
                }

                // ── Anti-spam / Limite de vazão de API
                await new Promise(r => setTimeout(r, 1000))

            } catch (err: any) {
                console.error(`[BLAST_CRON] ❌ Erro ao enviar para ${contact.phone}:`, err.message)

                // Loga a falha do envio via Meta se for o caso
                if (instance.provider_type === 'META') {
                    let category = 'utility'
                    const { data: temp } = await supabase
                        .from('whatsapp_templates')
                        .select('category')
                        .eq('user_id', item.user_id)
                        .eq('name', item.template_name || '')
                        .maybeSingle()
                    if (temp?.category) {
                        category = temp.category
                    }
                    await supabase.from('meta_message_logs').insert({
                        user_id: item.user_id,
                        conversation_id: null,
                        template_name: item.template_name || null,
                        category: category,
                        recipient_phone: contact.phone,
                        message_id: null,
                        status: 'failed',
                        error_code: 'META_ERROR',
                        error_message: err.message || 'Erro desconhecido',
                        cost_estimated: 0
                    })
                }

                const newAttempts = item.attempts + 1
                const maxAttempts = 3

                if (newAttempts >= maxAttempts) {
                    // Esgotou tentativas → falha definitiva
                    await supabase.from('blast_queue').update({
                        status: 'failed',
                        attempts: newAttempts,
                        last_error: err.message,
                    }).eq('id', item.id).eq('user_id', item.user_id)

                    await supabase.from('blast_campaigns').update({
                        failed_count: (campaign.failed_count || 0) + 1,
                    }).eq('id', campaign.id)
                } else {
                    // Reagenda para tentar novamente em 3 minutos
                    await supabase.from('blast_queue').update({
                        status: 'pending',
                        attempts: newAttempts,
                        last_error: err.message,
                        scheduled_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
                    }).eq('id', item.id).eq('user_id', item.user_id)
                }
            }
        }

        console.log(`[BLAST_CRON] ✅ Ciclo finalizado. Processados: ${processedCount}`)
        return NextResponse.json({ success: true, processed: processedCount })

    } catch (err: any) {
        console.error('[BLAST_CRON] 💥 Erro fatal:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
