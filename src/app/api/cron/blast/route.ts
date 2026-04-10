import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { evolutionApi } from '@/lib/evolution'

export const maxDuration = 300
export const revalidate = 0

// Máximo de mensagens por rodada do cron (5 min de execução)
// Com delay mínimo de 30s, cabe ~8 mensagens seguras por ciclo
const MAX_PER_RUN = 8

export async function GET(req: NextRequest) {
    console.log('[BLAST_CRON] 🚀 Iniciando processamento da fila de disparo...')

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
                campaign_id,
                contact_id,
                instance_id,
                resolved_message,
                media_url,
                media_type,
                media_caption,
                attempts,
                blast_campaigns!inner ( id, status, auto_pause_on_fail_rate, sent_count, failed_count, total_contacts, warming_enabled ),
                blast_contacts!inner ( id, phone, name, opted_out ),
                whatsapp_instances!inner ( id, instance_name, status )
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

        for (const item of queueItems) {
            const campaign = (item as any).blast_campaigns
            const contact = (item as any).blast_contacts
            const instance = (item as any).whatsapp_instances

            try {
                // ── Verificações de segurança ────────────────────────────────

                // Skip: contato optou por sair
                if (contact.opted_out) {
                    await supabase.from('blast_queue').update({ status: 'opted_out' }).eq('id', item.id)
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
                    }).eq('id', item.id)
                    continue
                }

                // Verifica taxa de falha da campanha → pausa automática
                const totalAttempted = (campaign.sent_count || 0) + (campaign.failed_count || 0)
                if (totalAttempted >= 10) { // só verifica após mínimo de 10 envios
                    const failRate = campaign.failed_count / totalAttempted
                    if (failRate >= campaign.auto_pause_on_fail_rate) {
                        console.error(`[BLAST_CRON] 🚨 Taxa de falha crítica (${(failRate * 100).toFixed(1)}%) na campanha ${campaign.id}. PAUSANDO AUTOMATICAMENTE.`)
                        await supabase.from('blast_campaigns').update({ status: 'paused' }).eq('id', campaign.id)
                        await supabase.from('blast_queue').update({ status: 'pending' }).eq('id', item.id) // re-fila
                        break
                    }
                }

                // ── Simulação de comportamento humano ANTES do envio ─────────

                // 1. Abre a conversa (presença available)
                await evolutionApi.sendPresence(instance.instance_name, contact.phone + '@s.whatsapp.net', 'available')
                await new Promise(r => setTimeout(r, 800 + Math.random() * 700)) // 0.8s ~ 1.5s

                // 2. Simula digitando (3 a 8 segundos proporcional ao tamanho da mensagem)
                const msgLength = item.resolved_message.length
                const typingTime = Math.min(Math.max(msgLength * 60, 3000), 8000) // 3s ~ 8s
                await evolutionApi.sendPresence(instance.instance_name, contact.phone + '@s.whatsapp.net', 'composing')
                await new Promise(r => setTimeout(r, typingTime))

                // ── Envio da mensagem ────────────────────────────────────────

                let whatsappMsgId: string | null = null

                if (item.media_url && item.media_type) {
                    // Envia mídia (com caption opcional)
                    if (item.media_type === 'audio') {
                        // Para áudio: simula "gravando..." antes
                        await evolutionApi.sendPresence(instance.instance_name, contact.phone + '@s.whatsapp.net', 'recording')
                        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000))
                    }
                    const mediaResult = await evolutionApi.sendMedia(
                        instance.instance_name,
                        contact.phone + '@s.whatsapp.net',
                        item.media_url,
                        item.media_type as 'image' | 'video' | 'audio' | 'document',
                        item.media_caption || item.resolved_message
                    )
                    whatsappMsgId = mediaResult?.key?.id || null

                    // Se tem mídia E texto, envia o texto também (separado)
                    if (item.media_caption && item.resolved_message) {
                        await new Promise(r => setTimeout(r, 1500))
                        await evolutionApi.sendPresence(instance.instance_name, contact.phone + '@s.whatsapp.net', 'composing')
                        await new Promise(r => setTimeout(r, 2500))
                        await evolutionApi.sendTextMessage(instance.instance_name, contact.phone + '@s.whatsapp.net', item.resolved_message)
                    }
                } else {
                    // Só texto
                    const textResult = await evolutionApi.sendTextMessage(
                        instance.instance_name,
                        contact.phone + '@s.whatsapp.net',
                        item.resolved_message
                    )
                    whatsappMsgId = textResult?.key?.id || null
                }

                // ── Sucesso: atualiza o item e a campanha ────────────────────

                await supabase.from('blast_queue').update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    whatsapp_message_id: whatsappMsgId,
                    attempts: item.attempts + 1,
                }).eq('id', item.id)

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

                // ── Anti-spam: delay entre envios (já definido no scheduled_at)
                // Mas adicionamos uma pausa mínima de 2s entre iterações do loop
                await new Promise(r => setTimeout(r, 2000))

            } catch (err: any) {
                console.error(`[BLAST_CRON] ❌ Erro ao enviar para ${contact.phone}:`, err.message)

                const newAttempts = item.attempts + 1
                const maxAttempts = 3

                if (newAttempts >= maxAttempts) {
                    // Esgotou tentativas → falha definitiva
                    await supabase.from('blast_queue').update({
                        status: 'failed',
                        attempts: newAttempts,
                        last_error: err.message,
                    }).eq('id', item.id)

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
                    }).eq('id', item.id)
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
