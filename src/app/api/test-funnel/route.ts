import { NextRequest, NextResponse } from 'next/server';
import { FunnelService } from '@/services/whatsapp/funnels';
import { evolutionApi } from '@/lib/evolution';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Endpoint de diagnóstico local — NÃO USAR EM PRODUÇÃO
 * Acesse: GET /api/test-funnel?phone=SEU_NUMERO&action=video|funnel|reset
 * 
 * Exemplos:
 *   /api/test-funnel?action=video    → Testa sendMedia diretamente
 *   /api/test-funnel?action=funnel   → Dispara o funil padrão
 *   /api/test-funnel?action=reset    → Reseta estado do contato
 */
export async function GET(req: NextRequest) {
    // Segurança básica — só funciona em desenvolvimento
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'status';
    const phone = searchParams.get('phone'); // ex: 559885086010

    // ── Busca instância e perfil configurados ──────────────────────────────
    const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, user_id')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();

    if (!instance) {
        return NextResponse.json({ error: 'Nenhuma instância WhatsApp conectada encontrada.' });
    }

    const instanceName = instance.instance_name;
    const userId = instance.user_id;
    const targetPhone = phone || '559885086010'; // padrão: número de teste
    const remoteJid = targetPhone.includes('@') ? targetPhone : `${targetPhone}@s.whatsapp.net`;

    console.log(`[TEST] action=${action} | instance=${instanceName} | target=${remoteJid}`);

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: video — Testa o sendMedia diretamente
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'video') {
        // Pega a URL do nó de vídeo do funil padrão
        const { data: funnel } = await supabase
            .from('funnels')
            .select('id')
            .eq('user_id', userId)
            .eq('is_default', true)
            .maybeSingle();

        if (!funnel) {
            return NextResponse.json({ error: 'Funil padrão não encontrado.' });
        }

        const { data: videoNode } = await supabase
            .from('funnel_steps')
            .select('*')
            .eq('funnel_id', funnel.id)
            .eq('node_type', 'video')
            .maybeSingle();

        if (!videoNode) {
            return NextResponse.json({ error: 'Nó de vídeo não encontrado no funil padrão.' });
        }

        const videoUrl = videoNode.content || videoNode.node_data?.url || videoNode.node_data?.content || '';
        const caption = videoNode.caption || videoNode.node_data?.caption || '';

        if (!videoUrl) {
            return NextResponse.json({ error: 'Nó de vídeo não tem URL configurada.', node: videoNode });
        }

        console.log(`[TEST] Testando sendMedia para ${remoteJid}`);
        console.log(`[TEST] URL: ${videoUrl}`);

        const results: any = { videoUrl, remoteJid, instanceName, attempts: [] };

        // Tentativa 1: formato padrão
        try {
            const res1 = await fetch(`${process.env.EVOLUTION_API_URL}/message/sendMedia/${instanceName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.EVOLUTION_API_KEY || '',
                },
                body: JSON.stringify({
                    number: remoteJid,
                    media: videoUrl,
                    mediatype: 'video',
                    caption: caption,
                }),
            });
            const body1 = await res1.text();
            results.attempts.push({ format: 'v1_standard', status: res1.status, ok: res1.ok, body: body1.substring(0, 500) });
        } catch (e: any) {
            results.attempts.push({ format: 'v1_standard', error: e.message });
        }

        // Tentativa 2: formato mediaMessage (v2)
        try {
            const res2 = await fetch(`${process.env.EVOLUTION_API_URL}/message/sendMedia/${instanceName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': process.env.EVOLUTION_API_KEY || '',
                },
                body: JSON.stringify({
                    number: remoteJid,
                    mediaMessage: {
                        mediatype: 'video',
                        fileName: 'video.mp4',
                        caption: caption,
                        media: videoUrl,
                    },
                }),
            });
            const body2 = await res2.text();
            results.attempts.push({ format: 'v2_mediaMessage', status: res2.status, ok: res2.ok, body: body2.substring(0, 500) });
        } catch (e: any) {
            results.attempts.push({ format: 'v2_mediaMessage', error: e.message });
        }

        return NextResponse.json(results);
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: funnel — Dispara o funil padrão para o número informado
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'funnel') {
        // Busca ou cria contato de teste
        const { data: contact } = await supabase
            .from('contacts')
            .select('*')
            .eq('whatsapp_id', remoteJid)
            .eq('user_id', userId)
            .maybeSingle();

        if (!contact) {
            return NextResponse.json({ error: `Contato ${remoteJid} não encontrado. Envie uma mensagem primeiro para criar o contato.` });
        }

        // Reseta estado
        await supabase.from('contacts').update({
            is_funnel_active: false,
            funnel_status: 'INATIVO',
            funnel_current_node_id: null,
            current_funnel_id: null,
        }).eq('id', contact.id);

        // Busca funil padrão
        const { data: funnel } = await supabase
            .from('funnels')
            .select('*')
            .eq('user_id', userId)
            .eq('is_default', true)
            .eq('is_active', true)
            .maybeSingle();

        if (!funnel) {
            return NextResponse.json({ error: 'Funil padrão não encontrado.' });
        }

        const { data: startNode } = await supabase
            .from('funnel_steps')
            .select('id')
            .eq('funnel_id', funnel.id)
            .eq('node_type', 'start')
            .maybeSingle();

        if (!startNode) {
            return NextResponse.json({ error: 'Nó START não encontrado no funil.' });
        }

        // Atualiza estado e dispara
        await supabase.from('contacts').update({
            is_funnel_active: true,
            funnel_status: 'EM_ANDAMENTO',
            current_funnel_id: funnel.id,
        }).eq('id', contact.id);

        console.log(`[TEST] 🚀 Disparando funil "${funnel.name}" para ${remoteJid}`);

        // Executa SÍNCRONO para ver os logs em tempo real
        await FunnelService.execute(funnel.id, startNode.id, instanceName, remoteJid, contact.id, userId);

        return NextResponse.json({
            success: true,
            message: `Funil "${funnel.name}" executado para ${remoteJid}. Veja os logs do servidor.`,
            funnel: funnel.name,
            startNode: startNode.id,
        });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: reset — Reseta o estado do contato
    // ────────────────────────────────────────────────────────────────────────
    if (action === 'reset') {
        const result = await supabase
            .from('contacts')
            .update({
                is_funnel_active: false,
                funnel_status: 'INATIVO',
                funnel_current_node_id: null,
                current_funnel_id: null,
            })
            .eq('whatsapp_id', remoteJid)
            .eq('user_id', userId)
            .select('id, name, phone, funnel_status');

        return NextResponse.json({ success: true, updated: result.data });
    }

    // ────────────────────────────────────────────────────────────────────────
    // ACTION: status — Mostra estado atual
    // ────────────────────────────────────────────────────────────────────────
    const { data: contact } = await supabase
        .from('contacts')
        .select('id, name, phone, funnel_status, is_funnel_active, funnel_current_node_id, current_funnel_id')
        .eq('whatsapp_id', remoteJid)
        .eq('user_id', userId)
        .maybeSingle();

    const { data: funnel } = await supabase
        .from('funnels')
        .select('id, name, is_default, is_active')
        .eq('user_id', userId)
        .eq('is_default', true)
        .maybeSingle();

    return NextResponse.json({
        instance: instanceName,
        target: remoteJid,
        contact,
        defaultFunnel: funnel,
        actions: {
            test_video: `/api/test-funnel?action=video&phone=${targetPhone}`,
            fire_funnel: `/api/test-funnel?action=funnel&phone=${targetPhone}`,
            reset_contact: `/api/test-funnel?action=reset&phone=${targetPhone}`,
        }
    });
}
