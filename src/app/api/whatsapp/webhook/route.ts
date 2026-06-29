import { NextRequest, NextResponse } from 'next/server';
import { processWebhook } from '@/services/whatsapp/orchestrator';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const correlationId = crypto.randomUUID();
    let eventType = '';
    let providerEventId = '';
    let instanceName = '';

    try {
        const body = await req.json();
        eventType = (body.event || body.eventType || '').toLowerCase();
        instanceName = body.instance || '';

        if (!['messages.upsert', 'messages_upsert', 'messages.update', 'messages_update'].includes(eventType)) {
            return NextResponse.json({ success: true, reason: 'ignored_event' });
        }

        const supabase = getSupabaseAdmin();

        // ─── TRATAMENTO DE ACKS (messages.update) ───
        // ACKs são processamentos rápidos de atualização de status, mantemos síncronos
        if (eventType === 'messages.update' || eventType === 'messages_update') {
            console.log(`[EVOLUTION_ACK] [${correlationId}] Recebido ACK para instância ${instanceName}`);
            await processWebhook(body);
            return NextResponse.json({ success: true, status: 'ack_processed' });
        }

        // ─── TRATAMENTO DE MENSAGENS RECEBIDAS (messages.upsert) ───
        providerEventId = body.data?.key?.id;
        if (!providerEventId) {
            const remoteJid = body.data?.key?.remoteJid || '';
            const timestamp = String(Date.now());
            const payloadString = JSON.stringify(body);
            const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');
            
            const rawString = `evolution:${instanceName}:${eventType}:${remoteJid}:${timestamp}:${payloadHash}`;
            providerEventId = `FALLBACK_${crypto.createHash('sha256').update(rawString).digest('hex')}`;
            console.log(`[WEBHOOK_RECEIVED] [${correlationId}] provider_event_id ausente. Gerado hash de fallback: ${providerEventId}`);
        }

        console.log(`[WEBHOOK_RECEIVED] [${correlationId}] Recebido ${eventType} de Evolution. MsgID: ${providerEventId}`);

        // Insere o job na fila para processamento em background (idempotência garantida via unique index)
        const { error: insertError } = await supabase
            .from('webhook_jobs')
            .insert({
                correlation_id: correlationId,
                provider: 'evolution',
                instance_name: instanceName,
                event_type: eventType,
                provider_event_id: providerEventId,
                payload: body,
                status: 'pending'
            });

        if (insertError) {
            if (insertError.code === '23505') {
                console.log(`[WEBHOOK_DEDUP] [${correlationId}] Evento duplicado ignorado. MsgID: ${providerEventId}`);
                return NextResponse.json({ success: true, status: 'ignored_duplicate' });
            }
            console.error(`[WEBHOOK_JOB_FAILED_CREATE] [${correlationId}] Erro ao criar job no DB:`, insertError);
            return NextResponse.json({ error: 'Database error creating job' }, { status: 500 });
        }

        console.log(`[WEBHOOK_JOB_CREATED] [${correlationId}] Job registrado com sucesso. MsgID: ${providerEventId}`);

        // Trigger cron queue worker immediately in background (event-driven queue draining)
        const origin = req.nextUrl.origin;
        fetch(`${origin}/api/cron/webhook-jobs`, {
            headers: {
                'Authorization': `Bearer ${process.env.CRON_SECRET}`
            }
        }).catch(err => {
            console.error('[WEBHOOK_TRIGGER_CRON_FAILED] Failed to trigger cron in background:', err.message);
        });

        return NextResponse.json({ success: true, status: 'queued', correlationId });

    } catch (e: any) {
        console.error(`[WEBHOOK_ERROR] [${correlationId}] Erro ao processar webhook:`, e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

