import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { FollowUpAIService } from './ai';

const MAX_ATTEMPTS_TO_PROCESS = 10;

interface ProcessStats {
    success: boolean;
    attempts_locked: number;
    generated: number;
    skipped: number;
    failed: number;
    duration_ms: number;
}

export class FollowUpProcessor {
    /**
     * Processa as tentativas agendadas como 'pending', gerando as mensagens com IA
     */
    static async processPendingAttempts(): Promise<ProcessStats> {
        const startTime = Date.now();
        console.log('[FOLLOWUP_PROCESS_START] Iniciando processamento de tentativas pendentes...');

        const supabase = getSupabaseAdmin();
        const workerId = `worker-process-${Math.random().toString(36).substring(2, 15)}`;

        let attemptsLocked = 0;
        let generatedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        try {
            // 1. Chamar RPC para travar as tentativas de forma atômica (SKIP LOCKED)
            const { data: lockedAttempts, error: lockErr } = await supabase
                .rpc('lock_followup_attempts', {
                    worker_id: workerId,
                    max_attempts_to_lock: MAX_ATTEMPTS_TO_PROCESS
                });

            if (lockErr) {
                throw new Error(`Erro ao travar tentativas via RPC: ${lockErr.message}`);
            }

            if (!lockedAttempts || lockedAttempts.length === 0) {
                console.log('[FOLLOWUP_PROCESS_DONE] Nenhuma tentativa pendente para processar.');
                return {
                    success: true,
                    attempts_locked: 0,
                    generated: 0,
                    skipped: 0,
                    failed: 0,
                    duration_ms: Date.now() - startTime
                };
            }

            attemptsLocked = lockedAttempts.length;
            console.log(`[FOLLOWUP_PROCESS_LOCKED] ${attemptsLocked} tentativas travadas para processamento.`);

            for (const attempt of lockedAttempts) {
                const correlationId = attempt.id;
                let skipReason = '';

                try {
                    // 2. Carregar configurações de follow-up do usuário
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

                    // 3. Carregar perfil do usuário para obter a chave da OpenAI
                    const { data: profile, error: profileErr } = await supabase
                        .from('profiles')
                        .select('openai_api_key')
                        .eq('id', attempt.user_id)
                        .single();

                    if (profileErr || !profile) {
                        skipReason = 'Perfil do usuário não encontrado.';
                    } else if (!profile.openai_api_key) {
                        skipReason = 'Chave da OpenAI (openai_api_key) não configurada no perfil.';
                    }

                    // 4. Carregar contato e validar status / Human Takeover
                    const { data: contact, error: contactErr } = await supabase
                        .from('contacts')
                        .select('*')
                        .eq('id', attempt.contact_id)
                        .single();

                    if (contactErr || !contact) {
                        skipReason = 'Contato associado não encontrado.';
                    }

                    // 5. Carregar conversa e validar status
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

                    // 6. Carregar a instância e validar se é EVOLUTION
                    const { data: instance, error: instErr } = await supabase
                        .from('whatsapp_instances')
                        .select('*')
                        .eq('id', conversation?.instance_id)
                        .single();

                    if (instErr || !instance) {
                        skipReason = 'Instância do WhatsApp não encontrada.';
                    } else if (instance.provider_type !== 'EVOLUTION') {
                        skipReason = `Instância não é do tipo Evolution (provedor: ${instance.provider_type}).`;
                    }

                    // 7. Obter a última mensagem para validações finais
                    const { data: lastMessages, error: msgErr } = await supabase
                        .from('messages')
                        .select('id, from_me, created_at, content')
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

                        // Validar se o cliente respondeu depois do agendamento desta tentativa
                        const lastMsgTime = new Date(lastMsg.created_at).getTime();
                        const attemptCreatedAt = new Date(attempt.created_at).getTime();
                        if (lastMsgTime > attemptCreatedAt) {
                            skipReason = 'O cliente enviou uma nova mensagem após o agendamento.';
                        }
                    }

                    // 8. Validar regras de negócio adicionais com base nos dados carregados
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
                        console.log(`[FOLLOWUP_PROCESS_SKIPPED] [${correlationId}] Tentativa pulada. Motivo: ${skipReason}`);
                        
                        await supabase
                            .from('followup_attempts')
                            .update({
                                status: 'skipped',
                                reason: skipReason,
                                processed_at: new Date().toISOString(),
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
                                reason: skipReason
                            }
                        });

                        skippedCount++;
                        continue;
                    }

                    // 9. Buscar as últimas 20 mensagens da conversa para dar contexto à IA
                    const { data: historyMsgs, error: histErr } = await supabase
                        .from('messages')
                        .select('from_me, content, created_at')
                        .eq('conversation_id', attempt.conversation_id)
                        .order('created_at', { ascending: true }) // Antigas para novas
                        .limit(20);

                    if (histErr) {
                        throw new Error(`Erro ao buscar histórico de mensagens: ${histErr.message}`);
                    }

                    const formattedHistory = (historyMsgs || []).map(m => ({
                        role: m.from_me ? 'assistant' as const : 'user' as const,
                        content: m.content || ''
                    }));

                    // 10. Carregar configuração de IA do usuário (para obter bot_name, system_prompt, tone)
                    const { data: aiConfig } = await supabase
                        .from('ai_configurations')
                        .select('*')
                        .eq('user_id', attempt.user_id)
                        .or(`instance_id.eq.${instance.id},instance_id.is.null`)
                        .order('instance_id', { ascending: false, nullsFirst: false })
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const botName = aiConfig?.bot_name || 'Assistente';
                    const systemPrompt = aiConfig?.system_prompt || '';
                    const tone = aiConfig?.tone || 'professional';

                    // 11. Chamar a IA para gerar a mensagem de follow-up
                    console.log(`[FOLLOWUP_AI_START] [${correlationId}] Gerando mensagem de follow-up via OpenAI...`);
                    
                    const aiResult = await FollowUpAIService.generateFollowUpMessage({
                        openaiKey: profile!.openai_api_key!,
                        contactName: contact!.name || 'Cliente',
                        contactTag: contact!.ai_tag || 'Sem Tag',
                        contactNotes: contact!.notes || undefined,
                        history: formattedHistory,
                        botName,
                        systemPrompt,
                        tone,
                        strategy: settings!.strategy,
                        objective: settings!.objective,
                        attemptNumber: attempt.attempt_number,
                        maxAttempts: settings!.max_attempts,
                        customPrompt: settings!.custom_prompt || undefined
                    });

                    if (!aiResult) {
                        throw new Error('A OpenAI retornou uma resposta nula ou inválida.');
                    }

                    console.log(`[FOLLOWUP_AI_DONE] [${correlationId}] Mensagem gerada com sucesso. Motivo do silêncio: ${aiResult.silence_reason}`);

                    // 12. Salvar o resultado com status 'ready'
                    await supabase
                        .from('followup_attempts')
                        .update({
                            status: 'ready',
                            generated_message: aiResult.message,
                            silence_reason: aiResult.silence_reason,
                            processed_at: new Date().toISOString(),
                            locked_at: null,
                            locked_by: null
                        })
                        .eq('id', attempt.id);

                    // Registrar eventos
                    await supabase.from('followup_events').insert([
                        {
                            user_id: attempt.user_id,
                            contact_id: attempt.contact_id,
                            conversation_id: attempt.conversation_id,
                            attempt_id: attempt.id,
                            event_type: 'ai_generated',
                            metadata: {
                                attempt_number: attempt.attempt_number,
                                silence_reason: aiResult.silence_reason,
                                message_length: aiResult.message.length
                            }
                        },
                        {
                            user_id: attempt.user_id,
                            contact_id: attempt.contact_id,
                            conversation_id: attempt.conversation_id,
                            attempt_id: attempt.id,
                            event_type: 'ready',
                            metadata: {
                                attempt_number: attempt.attempt_number
                            }
                        }
                    ]);

                    generatedCount++;

                } catch (err: any) {
                    console.error(`[FOLLOWUP_AI_FAILED] [${correlationId}] Falha no processamento da IA:`, err.message || err);
                    
                    // Marcar tentativa como falha
                    await supabase
                        .from('followup_attempts')
                        .update({
                            status: 'failed',
                            error_message: err.message || 'Erro desconhecido durante processamento com IA',
                            processed_at: new Date().toISOString(),
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
                            error: err.message || 'Erro na geração de IA'
                        }
                    });

                    failedCount++;
                }
            }

        } catch (err: any) {
            console.error('[FOLLOWUP_PROCESS_ERROR] Erro fatal no processador de follow-up:', err.message || err);
        }

        const duration = Date.now() - startTime;
        console.log(`[FOLLOWUP_PROCESS_DONE] Processamento concluído. Travados: ${attemptsLocked}, Gerados: ${generatedCount}, Pulados: ${skippedCount}, Falhas: ${failedCount}. Duração: ${duration}ms`);

        return {
            success: true,
            attempts_locked: attemptsLocked,
            generated: generatedCount,
            skipped: skippedCount,
            failed: failedCount,
            duration_ms: duration
        };
    }
}
