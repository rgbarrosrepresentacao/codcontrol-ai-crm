import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface OperationsData {
    success: boolean;
    queue: {
        pending: number;
        processing: number;
        ready: number;
        sent: number;
        failed: number;
        cancelled: number;
        skipped: number;
    };
    workers: {
        scheduler: { status: 'idle' | 'running' | 'offline'; last_run: string | null; avg_time_ms: number; items_processed: number };
        processor: { status: 'idle' | 'running' | 'offline'; last_run: string | null; avg_time_ms: number; items_processed: number };
        sender: { status: 'idle' | 'running' | 'offline'; last_run: string | null; avg_time_ms: number; items_processed: number };
    };
    latencies: {
        scheduler_ms: number;
        ia_ms: number;
        sender_ms: number;
        total_ms: number;
    };
    health_score: {
        score: number;
        rating: 'Excelente' | 'Bom' | 'Regular' | 'Crítico';
    };
    alerts: Array<{
        type: 'queue' | 'worker' | 'system' | 'api';
        severity: 'baixo' | 'médio' | 'alto';
        description: string;
        action_recommended: string;
    }>;
    live: Array<{
        id: string;
        contact_name: string;
        phone: string;
        attempt_number: number;
        status: string;
        horario: string;
        silence_reason: string | null;
        worker: 'scheduler' | 'processor' | 'sender';
        tempo_gasto: string;
        mensagem_resumida: string | null;
        conversation_id: string;
        error_message: string | null;
    }>;
}

export class FollowUpOperationsService {
    /**
     * Coleta e calcula todas as métricas em tempo real para a Central de Operações (tenant-safe)
     */
    static async getOperationsData(userId: string): Promise<OperationsData> {
        console.log(`[FOLLOWUP_OPERATIONS_LOAD] Carregando dados operacionais para o usuário: ${userId}`);
        const supabase = getSupabaseAdmin();

        try {
            // 1. Buscar todas as tentativas recentes (últimas 500) para calcular fila e estados
            const { data: attempts, error: attErr } = await supabase
                .from('followup_attempts')
                .select('*, contacts(name, phone, ai_tag)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(500);

            if (attErr) throw attErr;

            // 2. Buscar eventos do usuário nas últimas 24 horas para deduzir status dos workers e latências
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: events, error: evErr } = await supabase
                .from('followup_events')
                .select('*')
                .eq('user_id', userId)
                .gte('created_at', oneDayAgo)
                .order('created_at', { ascending: false });

            if (evErr) throw evErr;

            // 3. Buscar instâncias do WhatsApp do usuário para alertar sobre desconexões
            const { data: instances } = await supabase
                .from('whatsapp_instances')
                .select('instance_name, status, provider_type')
                .eq('user_id', userId);

            // --- CÁLCULO DA FILA (QUEUE) ---
            const queue = {
                pending: 0,
                processing: 0,
                ready: 0,
                sent: 0,
                failed: 0,
                cancelled: 0,
                skipped: 0
            };

            attempts?.forEach(a => {
                if (a.status in queue) {
                    queue[a.status as keyof typeof queue]++;
                }
            });

            // --- DEDUÇÃO DOS WORKERS ---
            const now = Date.now();
            const fiveMinutesAgo = now - 5 * 60 * 1000;
            const fifteenMinutesAgo = now - 15 * 60 * 1000;

            // Auxiliares de eventos por fase
            const scheduleEvents = events?.filter(e => e.event_type === 'created' || e.metadata?.phase === 'schedule') || [];
            const processEvents = events?.filter(e => e.event_type === 'ready' || e.metadata?.phase === 'process') || [];
            const sendEvents = events?.filter(e => e.event_type === 'sent' || e.metadata?.phase === 'send') || [];

            // Deduzir status do Scheduler
            let schedulerStatus: 'idle' | 'running' | 'offline' = 'idle';
            const lastScheduleTime = scheduleEvents[0] ? new Date(scheduleEvents[0].created_at).getTime() : null;
            if (!lastScheduleTime || lastScheduleTime < fifteenMinutesAgo) {
                schedulerStatus = 'offline';
            }

            // Deduzir status do Processor
            let processorStatus: 'idle' | 'running' | 'offline' = 'idle';
            const lastProcessTime = processEvents[0] ? new Date(processEvents[0].created_at).getTime() : null;
            const hasActiveProcessing = attempts?.some(a => a.status === 'processing' && a.locked_at && new Date(a.locked_at).getTime() > fiveMinutesAgo);
            if (hasActiveProcessing) {
                processorStatus = 'running';
            } else if (!lastProcessTime || lastProcessTime < fifteenMinutesAgo) {
                processorStatus = 'offline';
            }

            // Deduzir status do Sender
            let senderStatus: 'idle' | 'running' | 'offline' = 'idle';
            const lastSendTime = sendEvents[0] ? new Date(sendEvents[0].created_at).getTime() : null;
            const hasActiveSending = attempts?.some(a => a.status === 'processing' && a.locked_at && new Date(a.locked_at).getTime() > fiveMinutesAgo && a.generated_message);
            if (hasActiveSending) {
                senderStatus = 'running';
            } else if (!lastSendTime || lastSendTime < fifteenMinutesAgo) {
                senderStatus = 'offline';
            }

            const workers = {
                scheduler: {
                    status: schedulerStatus,
                    last_run: scheduleEvents[0]?.created_at || null,
                    avg_time_ms: 320, // Tempo de execução da consulta local
                    items_processed: scheduleEvents.length
                },
                processor: {
                    status: processorStatus,
                    last_run: processEvents[0]?.created_at || null,
                    avg_time_ms: 2100, // Média aproximada de chamada OpenAI
                    items_processed: processEvents.length
                },
                sender: {
                    status: senderStatus,
                    last_run: sendEvents[0]?.created_at || null,
                    avg_time_ms: 480, // Média aproximada de envio Evolution
                    items_processed: sendEvents.length
                }
            };

            // --- LATÊNCIAS ---
            let iaLatencySum = 0;
            let iaLatencyCount = 0;
            let sendLatencySum = 0;
            let sendLatencyCount = 0;

            attempts?.forEach(a => {
                if (a.status === 'sent' && a.sent_at && a.processed_at) {
                    const sendDiff = new Date(a.sent_at).getTime() - new Date(a.processed_at).getTime();
                    if (sendDiff > 0 && sendDiff < 300000) { // Menor que 5 min para ignorar crons espaçados
                        sendLatencySum += sendDiff;
                        sendLatencyCount++;
                    }
                }
                if (a.processed_at && a.created_at) {
                    const iaDiff = new Date(a.processed_at).getTime() - new Date(a.created_at).getTime();
                    if (iaDiff > 0 && iaDiff < 300000) {
                        iaLatencySum += iaDiff;
                        iaLatencyCount++;
                    }
                }
            });

            const iaMs = iaLatencyCount > 0 ? Math.round(iaLatencySum / iaLatencyCount) : 2100;
            const senderMs = sendLatencyCount > 0 ? Math.round(sendLatencySum / sendLatencyCount) : 480;
            const schedulerMs = 320;

            // --- HEALTH SCORE ---
            let score = 100;
            const recentFailures = queue.failed;
            
            // Penalizar por falhas recentes
            score -= Math.min(30, recentFailures * 3);
            
            // Penalizar por workers offline
            if (workers.scheduler.status === 'offline') score -= 15;
            if (workers.processor.status === 'offline') score -= 15;
            if (workers.sender.status === 'offline') score -= 15;

            // Penalizar por fila acumulada
            if (queue.pending > 30) score -= 10;

            score = Math.max(0, Math.min(100, score));

            let rating: 'Excelente' | 'Bom' | 'Regular' | 'Crítico' = 'Excelente';
            if (score < 50) rating = 'Crítico';
            else if (score < 75) rating = 'Regular';
            else if (score < 90) rating = 'Bom';

            // --- ALERTAS ---
            const alerts: OperationsData['alerts'] = [];

            if (queue.pending > 20) {
                alerts.push({
                    type: 'queue',
                    severity: 'médio',
                    description: `Fila acumulando com ${queue.pending} mensagens aguardando processamento.`,
                    action_recommended: 'Monitore se o cron de processamento está rodando adequadamente ou aumente a frequência.'
                });
            }

            if (queue.failed > 20) {
                alerts.push({
                    type: 'system',
                    severity: 'alto',
                    description: `Detectamos um volume alto de falhas (${queue.failed}) nas tentativas de follow-up.`,
                    action_recommended: 'Verifique a aba de Histórico para ler os logs de erro da OpenAI ou do WhatsApp.'
                });
            }

            if (workers.scheduler.status === 'offline' || workers.processor.status === 'offline' || workers.sender.status === 'offline') {
                alerts.push({
                    type: 'worker',
                    severity: 'alto',
                    description: 'Um ou mais Workers de automação de follow-up estão offline.',
                    action_recommended: 'Verifique se o agendador do cron local ou o script cron.mjs no servidor está em execução.'
                });
            }

            // Alerta de instâncias desconectadas
            const disconnectedInstances = instances?.filter(i => i.status !== 'connected') || [];
            if (disconnectedInstances.length > 0) {
                alerts.push({
                    type: 'api',
                    severity: 'alto',
                    description: `Sua instância do WhatsApp "${disconnectedInstances[0].instance_name}" está desconectada.`,
                    action_recommended: 'Acesse a aba WhatsApp, reconecte o QR Code ou reinicie a instância.'
                });
            }

            // --- LIVE FEED (ÚLTIMOS 100 REGISTROS) ---
            const liveFeed: OperationsData['live'] = (attempts || []).slice(0, 100).map(a => {
                const contact = a.contacts || {};
                
                // Estimar tempo gasto na fase
                let durationStr = '---';
                if (a.status === 'sent' && a.sent_at && a.processed_at) {
                    const ms = new Date(a.sent_at).getTime() - new Date(a.processed_at).getTime();
                    durationStr = ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
                } else if (a.status === 'ready' && a.processed_at && a.created_at) {
                    const ms = new Date(a.processed_at).getTime() - new Date(a.created_at).getTime();
                    durationStr = ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
                }

                // Deduzir qual worker atuou por último
                let worker: 'scheduler' | 'processor' | 'sender' = 'scheduler';
                if (a.status === 'sent' || a.status === 'failed') worker = 'sender';
                else if (a.status === 'ready' || a.status === 'processing') worker = 'processor';

                return {
                    id: a.id,
                    contact_name: contact.name || 'Sem Nome',
                    phone: contact.phone || 'Sem Telefone',
                    attempt_number: a.attempt_number,
                    status: a.status,
                    horario: a.created_at,
                    silence_reason: a.silence_reason,
                    worker,
                    tempo_gasto: durationStr,
                    mensagem_resumida: a.generated_message ? a.generated_message.slice(0, 80) + '...' : null,
                    conversation_id: a.conversation_id,
                    error_message: a.error_message
                };
            });

            return {
                success: true,
                queue,
                workers,
                latencies: {
                    scheduler_ms: schedulerMs,
                    ia_ms: iaMs,
                    sender_ms: senderMs,
                    total_ms: schedulerMs + iaMs + senderMs
                },
                health_score: {
                    score,
                    rating
                },
                alerts,
                live: liveFeed
            };

        } catch (err: any) {
            console.error('[FOLLOWUP_OPERATIONS_ERROR] Falha ao processar dados operacionais:', err.message || err);
            return {
                success: false,
                queue: { pending: 0, processing: 0, ready: 0, sent: 0, failed: 0, cancelled: 0, skipped: 0 },
                workers: {
                    scheduler: { status: 'offline', last_run: null, avg_time_ms: 0, items_processed: 0 },
                    processor: { status: 'offline', last_run: null, avg_time_ms: 0, items_processed: 0 },
                    sender: { status: 'offline', last_run: null, avg_time_ms: 0, items_processed: 0 }
                },
                latencies: { scheduler_ms: 0, ia_ms: 0, sender_ms: 0, total_ms: 0 },
                health_score: { score: 0, rating: 'Crítico' },
                alerts: [{ type: 'system', severity: 'alto', description: 'Erro de conexão com o banco de dados.', action_recommended: 'Contate o suporte.' }],
                live: []
            };
        }
    }
}
