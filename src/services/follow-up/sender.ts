import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { evolutionApi } from '@/lib/evolution';
import { MessageService } from '@/services/whatsapp/messages';

const MAX_ATTEMPTS_TO_SEND = 10;

interface SendStats {
    success: boolean;
    attempts_locked: number;
    sent: number;
    skipped: number;
    failed: number;
    duration_ms: number;
}

export class FollowUpSender {
    /**
     * Busca tentativas no status 'ready' e realiza o envio real via Evolution API
     */
    static async sendReadyAttempts(): Promise<SendStats> {
        const startTime = Date.now();
        console.log('[FOLLOWUP_SEND_START] Iniciando processamento de envios de follow-up...');

        const supabase = getSupabaseAdmin();
        const workerId = `worker-send-${Math.random().toString(36).substring(2, 15)}`;

        let attemptsLocked = 0;
        let sentCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        try {
            // 1. Chamar RPC para travar as tentativas 'ready' de forma atômica
            const { data: lockedAttempts, error: lockErr } = await supabase
                .rpc('lock_followup_ready_attempts', {
                    worker_id: workerId,
                    max_attempts_to_lock: MAX_ATTEMPTS_TO_SEND
                });

            if (lockErr) {
                throw new Error(`Erro ao travar tentativas ready via RPC: ${lockErr.message}`);
            }

            if (!lockedAttempts || lockedAttempts.length === 0) {
                console.log('[FOLLOWUP_SEND_DONE] Nenhuma tentativa ready para enviar.');
                return {
                    success: true,
                    attempts_locked: 0,
                    sent: 0,
                    skipped: 0,
                    failed: 0,
                    duration_ms: Date.now() - startTime
                };
            }

            attemptsLocked = lockedAttempts.length;
            console.log(`[FOLLOWUP_SEND_LOCKED] [${workerId}] ${attemptsLocked} tentativas ready travadas para envio.`);

            for (const attempt of lockedAttempts) {
                const correlationId = attempt.id;
                let skipReason = '';

                try {
                    // 2. Revalidar Configurações de Follow-up do Usuário
                    const { data: settings, error: settingsErr } = await supabase
                        .from('followup_settings')
                        .select('*')
                        .eq('user_id', attempt.user_id)
                        .single();

                    if (settingsErr || !settings) {
                        skipReason = 'Configurações de follow-up não encontradas.';
                    } else if (!settings.enabled) {
                        skipReason = 'Módulo de follow-up desativado pelo usuário.';
                    }

                    // 3. Revalidar Contato
                    const { data: contact, error: contactErr } = await supabase
                        .from('contacts')
                        .select('*')
                        .eq('id', attempt.contact_id)
                        .single();

                    if (contactErr || !contact) {
                        skipReason = 'Contato associado não encontrado.';
                    }

                    // 4. Revalidar Conversa
                    const { data: conversation, error: convErr } = await supabase
                        .from('conversations')
                        .select('*')
                        .eq('id', attempt.conversation_id)
                        .single();

                    if (convErr || !conversation) {
                        skipReason = 'Conversa associada não encontrada.';
                    } else if (conversation.status !== 'open') {
                        skipReason = `Conversa está fechada (status: ${conversation.status}).`;
                    }

                    // 5. Revalidar se a instância é EVOLUTION e está conectada
                    const { data: instance, error: instErr } = await supabase
                        .from('whatsapp_instances')
                        .select('*')
                        .eq('id', conversation?.instance_id)
                        .single();

                    if (instErr || !instance) {
                        skipReason = 'Instância do WhatsApp não encontrada.';
                    } else if (instance.provider_type !== 'EVOLUTION') {
                        skipReason = `Instância não é do tipo Evolution (provedor: ${instance.provider_type}).`;
                    } else if (instance.status !== 'connected') {
                        skipReason = `Instância do WhatsApp está desconectada (status: ${instance.status}).`;
                    }

                    // 6. Revalidar última mensagem e respostas desde a geração da mensagem da IA
                    const { data: lastMessages, error: msgErr } = await supabase
                        .from('messages')
                        .select('id, from_me, created_at')
                        .eq('conversation_id', attempt.conversation_id)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (msgErr || !lastMessages || lastMessages.length === 0) {
                        skipReason = 'Nenhuma mensagem encontrada na conversa.';
                    } else {
                        const lastMsg = lastMessages[0];
                        
                        // Validar se a última mensagem é nossa
                        if (lastMsg.from_me) {
                            skipReason = 'A última mensagem foi enviada pelo atendente ou IA.';
                        }

                        // Validar se o cliente respondeu depois do processamento (geração da IA)
                        if (attempt.processed_at) {
                            const lastMsgTime = new Date(lastMsg.created_at).getTime();
                            const attemptProcessedTime = new Date(attempt.processed_at).getTime();
                            if (lastMsgTime > attemptProcessedTime) {
                                skipReason = 'O cliente enviou uma nova mensagem após a geração do follow-up.';
                            }
                        }
                    }

                    // 7. Revalidar regras de negócio adicionais
                    if (!skipReason && contact && settings) {
                        const aiTag = contact.ai_tag || '';
                        
                        // Human Takeover
                        if (settings.stop_on_human_takeover && aiTag === 'HUMANO') {
                            skipReason = 'Atendimento assumido por humano (tag HUMANO).';
                        }

                        // Parar se houve venda (stop_on_sale)
                        const isClosedOrBuyer = ['COMPRADOR', 'FECHADO'].includes(aiTag);
                        if (settings.stop_on_sale && isClosedOrBuyer) {
                            skipReason = `Conversa concluída com venda/fechamento (tag ${aiTag}).`;
                        }

                        // Tags/status permitidos
                        if (settings.allowed_statuses.length > 0 && !settings.allowed_statuses.includes(aiTag)) {
                            skipReason = `Tag atual "${aiTag}" não está na lista de tags permitidas.`;
                        }

                        // Limite de tentativas
                        if (attempt.attempt_number > settings.max_attempts) {
                            skipReason = `Número da tentativa (${attempt.attempt_number}) excede o máximo configurado (${settings.max_attempts}).`;
                        }
                    }

                    // ── SE HOUVER MOTIVO PARA SKIP ──
                    if (skipReason) {
                        console.log(`[FOLLOWUP_SEND_SKIPPED] [${correlationId}] Envio cancelado. Motivo: ${skipReason}`);
                        
                        await supabase
                            .from('followup_attempts')
                            .update({
                                status: 'skipped',
                                reason: skipReason,
                                locked_at: null,
                                locked_by: null
                            })
                            .eq('id', attempt.id);

                        await supabase.from('followup_events').insert({
                            user_id: attempt.user_id,
                            contact_id: attempt.contact_id,
                            conversation_id: attempt.conversation_id,
                            attempt_id: attempt.id,
                            event_type: 'skipped',
                            metadata: {
                                attempt_number: attempt.attempt_number,
                                reason: skipReason,
                                phase: 'send'
                            }
                        });

                        skippedCount++;
                        continue;
                    }

                    // 8. Enviar mensagem de verdade via Evolution API
                    const targetJid = contact!.phone || contact!.whatsapp_id;
                    console.log(`[FOLLOWUP_SEND_ATTEMPT] [${correlationId}] Enviando tentativa #${attempt.attempt_number} para o contato ${targetJid}...`);
                    
                    const evoResult = await evolutionApi.sendTextMessage(
                        instance!.instance_name,
                        targetJid,
                        attempt.generated_message!
                    );

                    const messageId = evoResult?.key?.id || evoResult?.messageId || `msg-${Math.random().toString(36).substring(2, 15)}`;
                    console.log(`[FOLLOWUP_SEND_SUCCESS] [${correlationId}] Mensagem enviada com sucesso. ID no WhatsApp: ${messageId}`);

                    // 9. Registrar a mensagem no histórico de mensagens do CRM
                    await MessageService.save({
                        user_id: attempt.user_id,
                        conversation_id: attempt.conversation_id,
                        instance_id: instance!.id,
                        contact_id: attempt.contact_id,
                        message_id: messageId,
                        from_me: true,
                        content: attempt.generated_message!,
                        type: 'text',
                        ai_generated: true,
                        payload: {
                            source: 'follow_up',
                            attempt_id: attempt.id,
                            attempt_number: attempt.attempt_number
                        }
                    });

                    // 10. Atualizar tentativa para 'sent' no banco de dados
                    await supabase
                        .from('followup_attempts')
                        .update({
                            status: 'sent',
                            sent_at: new Date().toISOString(),
                            message_id: messageId,
                            locked_at: null,
                            locked_by: null
                        })
                        .eq('id', attempt.id);

                    // Registrar evento de envio concluído
                    await supabase.from('followup_events').insert({
                        user_id: attempt.user_id,
                        contact_id: attempt.contact_id,
                        conversation_id: attempt.conversation_id,
                        attempt_id: attempt.id,
                        event_type: 'sent',
                        metadata: {
                            message_id: messageId,
                            attempt_number: attempt.attempt_number,
                            provider: 'EVOLUTION'
                        }
                    });

                    sentCount++;

                } catch (err: any) {
                    console.error(`[FOLLOWUP_SEND_FAILED] [${correlationId}] Falha no envio da mensagem via Evolution:`, err.message || err);
                    
                    // Marcar tentativa como falha no envio
                    await supabase
                        .from('followup_attempts')
                        .update({
                            status: 'failed',
                            error_message: err.message || 'Erro no envio da mensagem via Evolution API',
                            locked_at: null,
                            locked_by: null
                        })
                        .eq('id', attempt.id);

                    await supabase.from('followup_events').insert({
                        user_id: attempt.user_id,
                        contact_id: attempt.contact_id,
                        conversation_id: attempt.conversation_id,
                        attempt_id: attempt.id,
                        event_type: 'failed',
                        metadata: {
                            attempt_number: attempt.attempt_number,
                            phase: 'send',
                            error: err.message || 'Erro de envio API'
                        }
                    });

                    failedCount++;
                }
            }

        } catch (err: any) {
            console.error('[FOLLOWUP_SEND_ERROR] Erro fatal no remetente de follow-up:', err.message || err);
        }

        const duration = Date.now() - startTime;
        console.log(`[FOLLOWUP_SEND_DONE] Processamento de envios concluído. Travados: ${attemptsLocked}, Enviados: ${sentCount}, Pulados: ${skippedCount}, Falhas: ${failedCount}. Duração: ${duration}ms`);

        return {
            success: true,
            attempts_locked: attemptsLocked,
            sent: sentCount,
            skipped: skippedCount,
            failed: failedCount,
            duration_ms: duration
        };
    }
}
