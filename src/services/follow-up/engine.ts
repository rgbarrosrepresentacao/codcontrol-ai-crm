import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Configurações e limites da Engine
const MAX_CONVERSATIONS_PER_USER = 50;
const MAX_ATTEMPTS_TOTAL_PER_EXECUTION = 500;

interface ProcessResult {
    success: boolean;
    users_processed: number;
    conversations_checked: number;
    attempts_scheduled: number;
    skipped: number;
    duration_ms: number;
}

export class FollowUpEngine {
    /**
     * Executa a engine de elegibilidade do Follow-up
     */
    static async run(): Promise<ProcessResult> {
        const startTime = Date.now();
        console.log('[FOLLOWUP_ENGINE_START] Iniciando processamento da engine de follow-up...');

        const supabase = getSupabaseAdmin();
        let usersProcessed = 0;
        let conversationsChecked = 0;
        let attemptsScheduled = 0;
        let skippedCount = 0;

        try {
            // 1. Buscar todos os usuários com follow-up ativado
            const { data: activeSettings, error: settingsErr } = await supabase
                .from('followup_settings')
                .select('*')
                .eq('enabled', true);

            if (settingsErr) {
                throw new Error(`Erro ao buscar configurações de follow-up: ${settingsErr.message}`);
            }

            if (!activeSettings || activeSettings.length === 0) {
                console.log('[FOLLOWUP_ENGINE_DONE] Nenhum usuário com follow-up ativado encontrado.');
                return {
                    success: true,
                    users_processed: 0,
                    conversations_checked: 0,
                    attempts_scheduled: 0,
                    skipped: 0,
                    duration_ms: Date.now() - startTime
                };
            }

            // Obter data/hora atual no fuso horário de Brasília (America/Sao_Paulo)
            const nowBr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            const currentHourMin = nowBr.toTimeString().slice(0, 5); // Ex: "14:30"
            const currentDay = nowBr.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

            for (const settings of activeSettings) {
                const userId = settings.user_id;
                console.log(`[FOLLOWUP_ENGINE_USER] Processando regras para o usuário: ${userId}`);

                // Limite global de agendamentos por execução
                if (attemptsScheduled >= MAX_ATTEMPTS_TOTAL_PER_EXECUTION) {
                    console.log(`[FOLLOWUP_ENGINE_LIMIT] Limite máximo de ${MAX_ATTEMPTS_TOTAL_PER_EXECUTION} agendamentos atingido.`);
                    break;
                }

                // 2. Validar janela de dias permitidos
                if (!settings.allowed_days.includes(currentDay)) {
                    console.log(`[FOLLOWUP_ENGINE_SKIPPED] Usuário ${userId} fora dos dias permitidos. Dia atual: ${currentDay}`);
                    skippedCount++;
                    continue;
                }

                // 3. Validar janela de horários permitidos
                const start = settings.allowed_start_time.slice(0, 5);
                const end = settings.allowed_end_time.slice(0, 5);
                if (currentHourMin < start || currentHourMin > end) {
                    console.log(`[FOLLOWUP_ENGINE_SKIPPED] Usuário ${userId} fora do horário permitido. Atual: ${currentHourMin}, Janela: ${start} às ${end}`);
                    skippedCount++;
                    continue;
                }

                // 4. Buscar instâncias ativas do tipo EVOLUTION do usuário (Regra do Áudio: Somente Evolution)
                const { data: instances, error: instErr } = await supabase
                    .from('whatsapp_instances')
                    .select('id, instance_name')
                    .eq('user_id', userId)
                    .eq('provider_type', 'EVOLUTION')
                    .eq('status', 'connected');

                if (instErr) {
                    console.error(`[FOLLOWUP_ENGINE_ERROR] Erro ao buscar instâncias do usuário ${userId}:`, instErr.message);
                    continue;
                }

                if (!instances || instances.length === 0) {
                    console.log(`[FOLLOWUP_ENGINE_SKIPPED] Usuário ${userId} não possui instâncias Evolution conectadas.`);
                    continue;
                }

                const instanceIds = instances.map(i => i.id);

                // 5. Buscar conversas abertas e paradas (delay_minutes)
                const cutoffTime = new Date(Date.now() - settings.delay_minutes * 60 * 1000).toISOString();
                const { data: conversations, error: convsErr } = await supabase
                    .from('conversations')
                    .select('id, contact_id, instance_id, last_message_at')
                    .eq('user_id', userId)
                    .eq('status', 'open')
                    .in('instance_id', instanceIds)
                    .lt('last_message_at', cutoffTime)
                    .order('last_message_at', { ascending: true }) // Mais antigas primeiro
                    .limit(MAX_CONVERSATIONS_PER_USER);

                if (convsErr) {
                    console.error(`[FOLLOWUP_ENGINE_ERROR] Erro ao buscar conversas do usuário ${userId}:`, convsErr.message);
                    continue;
                }

                if (!conversations || conversations.length === 0) {
                    console.log(`[FOLLOWUP_ENGINE_USER] Nenhuma conversa parada encontrada para o usuário ${userId}.`);
                    continue;
                }

                usersProcessed++;

                for (const conv of conversations) {
                    conversationsChecked++;

                    // A. Verificar se já existe uma tentativa ativa (pending ou processing) para evitar duplicatas
                    const { data: activeAttempt, error: activeErr } = await supabase
                        .from('followup_attempts')
                        .select('id')
                        .eq('conversation_id', conv.id)
                        .in('status', ['pending', 'processing'])
                        .limit(1)
                        .maybeSingle();

                    if (activeErr) {
                        console.error(`[FOLLOWUP_ENGINE_ERROR] Erro ao verificar tentativa ativa da conversa ${conv.id}:`, activeErr.message);
                        continue;
                    }

                    if (activeAttempt) {
                        // Já existe tentativa ativa, pula
                        continue;
                    }

                    // B. Buscar o contato associado para validar tags e status humano
                    const { data: contact, error: contactErr } = await supabase
                        .from('contacts')
                        .select('id, ai_tag, name')
                        .eq('id', conv.contact_id)
                        .single();

                    if (contactErr || !contact) {
                        console.error(`[FOLLOWUP_ENGINE_ERROR] Contato ${conv.contact_id} não encontrado ou erro:`, contactErr?.message);
                        continue;
                    }

                    // C. Validar Human Takeover (se stop_on_human_takeover for true e a tag for HUMANO)
                    if (settings.stop_on_human_takeover && contact.ai_tag === 'HUMANO') {
                        console.log(`[FOLLOWUP_ENGINE_SKIPPED] Conversa ${conv.id} ignorada. Atendimento assumido por humano.`);
                        continue;
                    }

                    // D. Validar status do CRM (ai_tag)
                    const aiTag = contact.ai_tag || '';
                    const isClosedOrBuyer = ['COMPRADOR', 'FECHADO'].includes(aiTag);

                    if (settings.allowed_statuses.length > 0) {
                        // Se houver lista de permitidos, a tag do contato DEVE estar nela
                        if (!settings.allowed_statuses.includes(aiTag)) {
                            console.log(`[FOLLOWUP_ENGINE_SKIPPED] Conversa ${conv.id} ignorada. Tag "${aiTag}" não está na lista de permitidos.`);
                            continue;
                        }
                    } else {
                        // Se não houver lista, bloquear compradores/fechados por padrão para evitar spam
                        if (isClosedOrBuyer) {
                            console.log(`[FOLLOWUP_ENGINE_SKIPPED] Conversa ${conv.id} ignorada por padrão. Contato marcado como ${aiTag}.`);
                            continue;
                        }
                    }

                    // E. Consultar a última mensagem para garantir que foi enviada pelo cliente (não por nós)
                    const { data: lastMessages, error: msgErr } = await supabase
                        .from('messages')
                        .select('id, from_me, created_at')
                        .eq('conversation_id', conv.id)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (msgErr) {
                        console.error(`[FOLLOWUP_ENGINE_ERROR] Erro ao buscar última mensagem da conversa ${conv.id}:`, msgErr.message);
                        continue;
                    }

                    if (!lastMessages || lastMessages.length === 0) {
                        // Sem mensagens na conversa
                        continue;
                    }

                    const lastMsg = lastMessages[0];
                    if (lastMsg.from_me) {
                        // A última mensagem foi enviada pelo atendente/IA. Pula pois o cliente é quem precisa responder.
                        continue;
                    }

                    // F. Contar tentativas anteriores da conversa
                    const { count: attemptsCount, error: countErr } = await supabase
                        .from('followup_attempts')
                        .select('*', { count: 'exact', head: true })
                        .eq('conversation_id', conv.id)
                        .in('status', ['sent', 'pending', 'processing', 'failed']);

                    if (countErr) {
                        console.error(`[FOLLOWUP_ENGINE_ERROR] Erro ao contar tentativas da conversa ${conv.id}:`, countErr.message);
                        continue;
                    }

                    const currentAttempts = attemptsCount || 0;
                    if (currentAttempts >= settings.max_attempts) {
                        console.log(`[FOLLOWUP_ENGINE_SKIPPED] Conversa ${conv.id} atingiu o limite de ${settings.max_attempts} tentativas.`);
                        continue;
                    }

                    // G. Criar novo registro de tentativa pendente (idempotência garantida pelo índice único parcial)
                    const attemptNumber = currentAttempts + 1;
                    const reason = `Inatividade de ${settings.delay_minutes} minutos. Última mensagem do cliente.`;

                    try {
                        const { data: newAttempt, error: createErr } = await supabase
                            .from('followup_attempts')
                            .insert({
                                user_id: userId,
                                contact_id: conv.contact_id,
                                conversation_id: conv.id,
                                attempt_number: attemptNumber,
                                status: 'pending',
                                scheduled_for: new Date().toISOString(),
                                reason
                            })
                            .select('id')
                            .single();

                        if (createErr) {
                            // Trata erro 23505 (violamento de índice único) silenciosamente como dedup concorrente
                            if (createErr.code === '23505') {
                                console.log(`[FOLLOWUP_ENGINE_DEDUP] Tentativa concorrente ignorada para a conversa ${conv.id}`);
                                continue;
                            }
                            throw createErr;
                        }

                        attemptsScheduled++;
                        console.log(`[FOLLOWUP_ENGINE_SCHEDULED] Tentativa #${attemptNumber} agendada para conversa ${conv.id} (Contato: ${contact.name})`);

                        // H. Registrar evento de agendamento
                        await supabase.from('followup_events').insert({
                            user_id: userId,
                            contact_id: conv.contact_id,
                            conversation_id: conv.id,
                            attempt_id: newAttempt.id,
                            event_type: 'scheduled',
                            metadata: {
                                attempt_number: attemptNumber,
                                delay_minutes: settings.delay_minutes,
                                reason
                            }
                        });

                    } catch (err: any) {
                        console.error(`[FOLLOWUP_ENGINE_ERROR] Falha ao criar tentativa para conversa ${conv.id}:`, err.message || err);
                    }
                }
            }

            const duration = Date.now() - startTime;
            console.log(`[FOLLOWUP_ENGINE_DONE] Engine finalizada. Processados: ${usersProcessed} usuários, ${conversationsChecked} conversas analisadas, ${attemptsScheduled} agendadas. Duração: ${duration}ms`);

            return {
                success: true,
                users_processed: usersProcessed,
                conversations_checked: conversationsChecked,
                attempts_scheduled: attemptsScheduled,
                skipped: skippedCount,
                duration_ms: duration
            };

        } catch (err: any) {
            console.error('[FOLLOWUP_ENGINE_ERROR] Erro fatal na execução da engine:', err.message || err);
            return {
                success: false,
                users_processed: usersProcessed,
                conversations_checked: conversationsChecked,
                attempts_scheduled: attemptsScheduled,
                skipped: skippedCount,
                duration_ms: Date.now() - startTime
            };
        }
    }
}
