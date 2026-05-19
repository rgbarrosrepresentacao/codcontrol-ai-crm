import { NextRequest, NextResponse } from 'next/server';
import { processWebhook } from '@/services/whatsapp/orchestrator';

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const eventType = (body.event || body.eventType || '').toLowerCase();

        if (!['messages.upsert', 'messages_upsert', 'messages.update', 'messages_update'].includes(eventType)) {
            return NextResponse.json({ success: true, reason: 'ignored_event' });
        }

        // Delegamos todo o processamento pesado para o orquestrador (serviço)
        // Isso evita que o Next.js avalie lógicas complexas durante o build
        processWebhook(body).catch(err => console.error('❌ Erro fatal no orquestrador:', err));

        return NextResponse.json({ success: true, status: 'processing' });
    } catch (e: any) {
        console.error('❌ Erro ao parsear body:', e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
