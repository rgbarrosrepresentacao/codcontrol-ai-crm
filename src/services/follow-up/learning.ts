import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface LearningProfileData {
    best_strategy: string | null;
    best_objective: string | null;
    best_hour: number | null;
    best_day: number | null;
    best_attempt_number: number | null;
    dominant_silence_reason: string | null;
    average_reply_rate: number;
    total_sent: number;
    total_replied: number;
    total_sales_recovered: number;
    confidence_score: number;
    learning_summary: string;
    recommendations: Array<{
        title: string;
        impact: 'alto' | 'médio' | 'baixo';
        description: string;
    }>;
}

const SILENCE_REASONS: Record<string, string> = {
    preco: 'Preço',
    esquecimento: 'Esquecimento',
    ocupado: 'Ocupado',
    perdeu_interesse: 'Perdeu interesse',
    pensando: 'Pensando',
    falta_confianca: 'Falta de confiança',
    precisa_falar_com_alguem: 'Falar com parceiro/sócio',
    aguardando_pagamento: 'Aguardando pagamento',
    duvida_nao_respondida: 'Dúvida não respondida',
    outro: 'Outro'
};

const STRATEGIES: Record<string, string> = {
    muito_leve: 'Muito leve',
    leve: 'Leve',
    consultivo: 'Consultivo',
    persuasivo: 'Persuasivo'
};

export class FollowUpLearningService {
    /**
     * Gera um hash SHA-256 normalizado e estável da mensagem
     */
    static getMessageHash(msg: string): string {
        const normalized = msg.toLowerCase().trim().replace(/\s+/g, ' ');
        return createHash('sha256').update(normalized).digest('hex');
    }

    /**
     * Executa o sincronismo de performance e recálculo do perfil de aprendizado de um usuário
     */
    static async learnForUser(userId: string): Promise<boolean> {
        console.log(`[FOLLOWUP_LEARNING] Iniciando ciclo de aprendizado para o usuário: ${userId}`);
        const supabase = getSupabaseAdmin();

        try {
            // 1. Buscar tentativas "sent" do usuário
            const { data: sentAttempts, error: attErr } = await supabase
                .from('followup_attempts')
                .select('id, contact_id, conversation_id, attempt_number, silence_reason, strategy, objective, generated_message, sent_at')
                .eq('user_id', userId)
                .eq('status', 'sent');

            if (attErr) throw attErr;
            if (!sentAttempts || sentAttempts.length === 0) {
                console.log(`[FOLLOWUP_LEARNING] Nenhum envio realizado para o usuário ${userId}. Pulando.`);
                return true;
            }

            // 2. Buscar registros já existentes na tabela de performance
            const { data: existingPerfs, error: perfErr } = await supabase
                .from('followup_message_performance')
                .select('attempt_id')
                .eq('user_id', userId);

            if (perfErr) throw perfErr;
            const existingAttemptIds = new Set(existingPerfs?.map(p => p.attempt_id) || []);

            // 3. Inserir novos registros de performance
            const newPerfs = sentAttempts.filter(a => !existingAttemptIds.has(a.id));
            if (newPerfs.length > 0) {
                const insertData = newPerfs.map(a => ({
                    user_id: userId,
                    attempt_id: a.id,
                    conversation_id: a.conversation_id,
                    contact_id: a.contact_id,
                    attempt_number: a.attempt_number,
                    silence_reason: a.silence_reason,
                    strategy: a.strategy,
                    objective: a.objective,
                    message_hash: this.getMessageHash(a.generated_message || ''),
                    message_length: (a.generated_message || '').length,
                    sent_at: a.sent_at,
                    replied: false,
                    converted: false
                }));

                const { error: insErr } = await supabase
                    .from('followup_message_performance')
                    .insert(insertData);

                if (insErr) throw insErr;
                console.log(`[FOLLOWUP_LEARNING] Inseridos ${newPerfs.length} novos registros de performance.`);
            }

            // 4. Atualizar respostas pendentes (replied = false)
            const { data: pendingReplies, error: pendErr } = await supabase
                .from('followup_message_performance')
                .select('id, conversation_id, sent_at')
                .eq('user_id', userId)
                .eq('replied', false);

            if (pendErr) throw pendErr;

            if (pendingReplies && pendingReplies.length > 0) {
                for (const perf of pendingReplies) {
                    const { data: clientMessages } = await supabase
                        .from('messages')
                        .select('created_at')
                        .eq('conversation_id', perf.conversation_id)
                        .eq('from_me', false)
                        .gt('created_at', perf.sent_at)
                        .order('created_at', { ascending: true })
                        .limit(1);

                    if (clientMessages && clientMessages.length > 0) {
                        const replyAt = clientMessages[0].created_at;
                        const replyTimeMinutes = Math.round(
                            (new Date(replyAt).getTime() - new Date(perf.sent_at).getTime()) / (1000 * 60)
                        );

                        await supabase
                            .from('followup_message_performance')
                            .update({
                                replied: true,
                                reply_at: replyAt,
                                reply_time_minutes: replyTimeMinutes
                            })
                            .eq('id', perf.id);
                    }
                }
            }

            // 5. Atualizar conversões pendentes (converted = false)
            const { data: pendingConversions, error: convErr } = await supabase
                .from('followup_message_performance')
                .select('id, contact_id, sent_at')
                .eq('user_id', userId)
                .eq('converted', false);

            if (convErr) throw convErr;

            if (pendingConversions && pendingConversions.length > 0) {
                for (const perf of pendingConversions) {
                    const { data: contact } = await supabase
                        .from('contacts')
                        .select('ai_tag')
                        .eq('id', perf.contact_id)
                        .single();

                    if (contact && ['COMPRADOR', 'FECHADO'].includes(contact.ai_tag || '')) {
                        await supabase
                            .from('followup_message_performance')
                            .update({
                                converted: true,
                                converted_at: new Date().toISOString()
                            })
                            .eq('id', perf.id);
                    }
                }
            }

            // 6. Recarregar todos os registros de performance para calcular o perfil
            const { data: allPerfs, error: allPerfErr } = await supabase
                .from('followup_message_performance')
                .select('*')
                .eq('user_id', userId);

            if (allPerfErr) throw allPerfErr;
            if (!allPerfs || allPerfs.length === 0) return true;

            const total_sent = allPerfs.length;
            const total_replied = allPerfs.filter(p => p.replied).length;
            const total_sales_recovered = allPerfs.filter(p => p.converted).length;
            const average_reply_rate = total_sent > 0 ? Number(((total_replied / total_sent) * 100).toFixed(2)) : 0;

            // Auxiliares de agrupamento para melhores métricas
            const strategyMap = new Map<string, { sent: number; replied: number }>();
            const hourMap = new Map<number, { sent: number; replied: number }>();
            const dayMap = new Map<number, { sent: number; replied: number }>();
            const attemptMap = new Map<number, { sent: number; replied: number }>();
            const silenceMap = new Map<string, number>();

            allPerfs.forEach(p => {
                // Estratégia
                if (p.strategy) {
                    const sData = strategyMap.get(p.strategy) || { sent: 0, replied: 0 };
                    sData.sent++;
                    if (p.replied) sData.replied++;
                    strategyMap.set(p.strategy, sData);
                }

                // Hora do dia (Local ou UTC)
                if (p.sent_at) {
                    const hour = new Date(p.sent_at).getHours();
                    const hData = hourMap.get(hour) || { sent: 0, replied: 0 };
                    hData.sent++;
                    if (p.replied) hData.replied++;
                    hourMap.set(hour, hData);

                    const day = new Date(p.sent_at).getDay();
                    const dData = dayMap.get(day) || { sent: 0, replied: 0 };
                    dData.sent++;
                    if (p.replied) dData.replied++;
                    dayMap.set(day, dData);
                }

                // Tentativa
                if (p.attempt_number) {
                    const aData = attemptMap.get(p.attempt_number) || { sent: 0, replied: 0 };
                    aData.sent++;
                    if (p.replied) aData.replied++;
                    attemptMap.set(p.attempt_number, aData);
                }

                // Motivo do silêncio
                if (p.silence_reason) {
                    silenceMap.set(p.silence_reason, (silenceMap.get(p.silence_reason) || 0) + 1);
                }
            });

            // Determinar melhores valores baseando-se em taxa de resposta com amostra mínima (>= 5 envios)
            let best_strategy: string | null = null;
            let maxStrategyRate = -1;
            strategyMap.forEach((v, k) => {
                if (v.sent >= 5) {
                    const rate = v.replied / v.sent;
                    if (rate > maxStrategyRate) {
                        maxStrategyRate = rate;
                        best_strategy = k;
                    }
                }
            });

            let best_hour: number | null = null;
            let maxHourRate = -1;
            hourMap.forEach((v, k) => {
                if (v.sent >= 5) {
                    const rate = v.replied / v.sent;
                    if (rate > maxHourRate) {
                        maxHourRate = rate;
                        best_hour = k;
                    }
                }
            });

            let best_day: number | null = null;
            let maxDayRate = -1;
            dayMap.forEach((v, k) => {
                if (v.sent >= 5) {
                    const rate = v.replied / v.sent;
                    if (rate > maxDayRate) {
                        maxDayRate = rate;
                        best_day = k;
                    }
                }
            });

            let best_attempt_number: number | null = null;
            let maxAttemptRate = -1;
            attemptMap.forEach((v, k) => {
                const rate = v.replied / v.sent;
                if (rate > maxAttemptRate) {
                    maxAttemptRate = rate;
                    best_attempt_number = k;
                }
            });

            let dominant_silence_reason: string | null = null;
            let maxSilenceCount = -1;
            silenceMap.forEach((v, k) => {
                if (v > maxSilenceCount) {
                    maxSilenceCount = v;
                    dominant_silence_reason = k;
                }
            });

            // Calcular score de confiança (0 a 100)
            let confidence_score = 0;
            if (total_sent >= 20) confidence_score += 20;
            if (total_replied >= 5) confidence_score += 20;
            if (best_strategy) confidence_score += 20;
            if (best_hour !== null) confidence_score += 20;
            if (best_attempt_number) confidence_score += 20;

            // Gerar resumo textual determinístico
            const bestStrategyLabel = best_strategy ? STRATEGIES[best_strategy] || best_strategy : 'não identificada';
            const bestHourLabel = best_hour !== null ? `${best_hour}h` : 'não identificado';
            const dominantSilenceLabel = dominant_silence_reason ? SILENCE_REASONS[dominant_silence_reason] || dominant_silence_reason : 'não identificado';
            
            const learning_summary = `Nos últimos dados analisados, sua melhor performance veio de abordagens da estratégia "${bestStrategyLabel}" enviadas por volta das ${bestHourLabel}. O motivo de silêncio mais frequente entre os clientes foi "${dominantSilenceLabel}", e a tentativa #${best_attempt_number || 1} apresentou a maior taxa de retorno.`;

            // Gerar Recomendações
            const recommendations: LearningProfileData['recommendations'] = [];

            if (best_strategy) {
                recommendations.push({
                    title: 'Estratégia Recomendada',
                    impact: 'alto',
                    description: `Suas abordagens com o tom "${bestStrategyLabel}" possuem a melhor conversão histórica. Considere manter ou priorizar esse tom nos próximos envios.`
                });
            }

            if (best_hour !== null) {
                recommendations.push({
                    title: 'Janela de Envio Ideal',
                    impact: 'médio',
                    description: `Seus clientes demonstram maior propensão a responder por volta das ${bestHourLabel}. Se possível, configure o horário permitido de envio para cobrir esse período.`
                });
            }

            const attempt3 = attemptMap.get(3);
            if (attempt3 && attempt3.sent >= 5 && (attempt3.replied / attempt3.sent) < 0.1) {
                recommendations.push({
                    title: 'Ajuste de Tentativas',
                    impact: 'médio',
                    description: 'A terceira tentativa de follow-up apresenta baixo retorno (menos de 10%). Considere suavizar o tom ou reduzir o limite máximo para 2 tentativas.'
                });
            }

            if (dominant_silence_reason === 'preco') {
                recommendations.push({
                    title: 'Contorno de Objeção: Preço',
                    impact: 'alto',
                    description: 'Preço é a objeção dominante detectada. Considere adicionar foco em valor, flexibilização de pagamento ou bônus exclusivos nas suas diretrizes de prompt.'
                });
            }

            if (average_reply_rate < 15 && total_sent >= 10) {
                recommendations.push({
                    title: 'Suavizar Abordagem',
                    impact: 'alto',
                    description: 'Sua taxa geral de resposta está abaixo de 15%. Recomendamos testar mensagens mais curtas, objetivas e de menor pressão de vendas.'
                });
            }

            // 7. Salvar ou atualizar perfil de aprendizado do usuário
            const { error: upsertErr } = await supabase
                .from('followup_learning_profiles')
                .upsert({
                    user_id: userId,
                    best_strategy,
                    best_objective: null,
                    best_hour,
                    best_day,
                    best_attempt_number,
                    dominant_silence_reason,
                    average_reply_rate,
                    total_sent,
                    total_replied,
                    total_sales_recovered,
                    confidence_score,
                    learning_summary,
                    recommendations,
                    message_patterns: {},
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (upsertErr) throw upsertErr;
            console.log(`[FOLLOWUP_LEARNING] Perfil de aprendizado atualizado com sucesso para o usuário: ${userId}`);
            return true;

        } catch (err: any) {
            console.error(`[FOLLOWUP_LEARNING_ERROR] Falha no aprendizado do usuário ${userId}:`, err.message || err);
            return false;
        }
    }
}
