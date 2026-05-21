export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // Permite rodar por até 5 minutos no Vercel Pro se necessário

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { processWebhook } from '@/services/whatsapp/orchestrator';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        console.error('[WEBHOOK_JOBS_CRON] 🚫 Acesso não autorizado negado ou CRON_SECRET não configurado.');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workerId = `worker-${crypto.randomUUID()}`;
    const supabase = getSupabaseAdmin();

    console.log(`[WEBHOOK_JOBS_CRON] [${workerId}] Iniciando processamento da fila...`);

    try {
        // Chama a função atômica lock_webhook_jobs no PostgreSQL
        const { data: jobs, error: lockError } = await supabase.rpc('lock_webhook_jobs', {
            worker_id: workerId,
            max_jobs: 5
        });

        if (lockError) {
            console.error(`[WEBHOOK_JOBS_CRON] [${workerId}] Erro ao tentar adquirir lock de jobs:`, lockError);
            return NextResponse.json({ error: 'Database lock acquisition failed', details: lockError.message }, { status: 500 });
        }

        if (!jobs || jobs.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: 'No pending jobs found' });
        }

        console.log(`[WEBHOOK_JOBS_CRON] [${workerId}] Adquiridos ${jobs.length} jobs para processamento.`);

        const results = [];

        for (const job of jobs) {
            const startTime = Date.now();
            const correlationId = job.correlation_id;
            console.log(`[WEBHOOK_JOBS_CRON] [${workerId}] [${correlationId}] Processando job: ${job.id} | Provedor: ${job.provider} | Tentativa: ${job.attempts}`);

            try {
                // Executa a lógica da mensagem do webhook (inclui transcrição Whisper de áudio Meta, se aplicável, e IA)
                await processWebhook(job.payload, correlationId);

                // Marca como sucesso (done)
                const { error: doneError } = await supabase
                    .from('webhook_jobs')
                    .update({
                        status: 'done',
                        processed_at: new Date().toISOString(),
                        locked_at: null,
                        locked_by: null
                    })
                    .eq('id', job.id);

                if (doneError) {
                    console.error(`[WEBHOOK_JOBS_CRON] [${workerId}] [${correlationId}] Erro ao marcar job como concluído:`, doneError);
                }

                const duration = Date.now() - startTime;
                console.log(`[WEBHOOK_JOBS_CRON] [${workerId}] [${correlationId}] Job concluído com sucesso em ${duration}ms. MsgID: ${job.provider_event_id}`);
                results.push({ jobId: job.id, status: 'done', duration });

            } catch (err: any) {
                const duration = Date.now() - startTime;
                const errorMessage = err instanceof Error ? err.message : String(err);
                
                // Determina novo status com base nas tentativas restantes
                const nextStatus = job.attempts >= job.max_attempts ? 'failed' : 'pending';
                
                console.error(`[WEBHOOK_JOBS_CRON] [${workerId}] [${correlationId}] Erro no processamento do job ${job.id} após ${duration}ms:`, errorMessage);

                const { error: failError } = await supabase
                    .from('webhook_jobs')
                    .update({
                        status: nextStatus,
                        last_error: errorMessage,
                        locked_at: null,
                        locked_by: null
                    })
                    .eq('id', job.id);

                if (failError) {
                    console.error(`[WEBHOOK_JOBS_CRON] [${workerId}] [${correlationId}] Erro ao atualizar status de falha do job:`, failError);
                }

                results.push({ jobId: job.id, status: nextStatus, error: errorMessage, duration });
            }
        }

        return NextResponse.json({
            success: true,
            processed: jobs.length,
            results
        });

    } catch (globalError: any) {
        console.error(`[WEBHOOK_JOBS_CRON] [${workerId}] Erro global no cron de jobs:`, globalError);
        return NextResponse.json({ error: 'Global error in cron execution', message: globalError.message }, { status: 500 });
    }
}
