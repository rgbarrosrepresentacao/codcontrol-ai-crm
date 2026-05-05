import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Importação dos novos serviços modulares
import { ProcessorService } from '@/services/whatsapp/processor';
import { GuardService } from '@/services/whatsapp/guard';
import { ContactService } from '@/services/whatsapp/logistics'; // Agrupado com logística por enquanto
import { CampaignService } from '@/services/whatsapp/campaigns';
import { FunnelService } from '@/services/whatsapp/funnels';
import { AIService } from '@/services/whatsapp/ai';
import { MessageService } from '@/services/whatsapp/messages';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const eventType = (body.event || body.eventType || '').toLowerCase();

        if (eventType !== 'messages.upsert' && eventType !== 'messages_upsert') {
            return NextResponse.json({ success: true, reason: 'ignored_event' });
        }

        // Processamento em background para liberar o WhatsApp rapidamente
        processWebhook(body).catch(err => console.error('❌ Erro no orquestrador:', err));

        return NextResponse.json({ success: true, status: 'processing' });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

async function processWebhook(body: any) {
    const messageData = body.data?.message;
    const key = body.data?.key;
    const instanceName = body.instance;

    if (!key || key.fromMe || !messageData) return;

    const remoteJid = key.remoteJid;
    if (remoteJid.endsWith('@g.us')) return; // Ignora grupos

    try {
        // 1. Identificar Instância e Usuário
        const { data: instance } = await supabase.from('whatsapp_instances')
            .select('id, user_id').eq('instance_name', instanceName).single();
        if (!instance) return;

        const { data: profile } = await supabase.from('profiles')
            .select('id, is_admin, stripe_subscription_status, trial_ends_at, openai_api_key')
            .eq('id', instance.user_id).single();
        if (!profile) return;

        // 2. Verificar Acesso (Guard)
        const access = GuardService.checkAccess(profile);
        if (!access.hasAccess) {
            console.log(`[Orchestrator] 🚫 Acesso negado para ${profile.id}: ${access.reason}`);
            return;
        }

        // 3. Extrair Conteúdo (Processor - Texto/Áudio/Visão)
        const textMessage = await ProcessorService.extractMessageContent(body, instanceName, profile.openai_api_key);
        if (!textMessage) return;

        // 4. Gestão de Contato e Conversa
        const phone = remoteJid.replace(/\D/g, '');
        const contact = await ContactService.upsert(profile.id, instance.id, remoteJid, phone, body.data?.pushName);
        if (!contact) return;

        const { data: conversation } = await supabase.from('conversations')
            .upsert({ user_id: profile.id, instance_id: instance.id, contact_id: contact.id, status: 'open' }, { onConflict: 'user_id,contact_id' })
            .select('id').single();
        if (!conversation) return;

        // 5. Salvar Mensagem de Entrada
        await MessageService.save({
            user_id: profile.id,
            conversation_id: conversation.id,
            instance_id: instance.id,
            contact_id: contact.id,
            message_id: key.id,
            from_me: false,
            content: textMessage,
            type: messageData.audioMessage ? 'audio' : 'text'
        });

        // 6. Detecção de Campanha
        const campaignId = await CampaignService.detect(profile.id, instance.id, textMessage);
        if (campaignId) {
            await supabase.from('contacts').update({ active_campaign_id: campaignId }).eq('id', contact.id);
        }

        // 7. Execução de Funis (Se houver algum ativo)
        const funnelStatus = contact.funnel_status || 'INATIVO';
        const funnelId = contact.current_funnel_id;

        if (funnelId && (funnelStatus === 'INICIADO' || funnelStatus === 'EM_ANDAMENTO')) {
            // Se o cliente respondeu no meio do funil, pausamos para a IA ou humano assumir
            await supabase.from('contacts').update({ funnel_status: 'PAUSADO' }).eq('id', contact.id);
        } else if (funnelStatus === 'INATIVO' && !funnelId) {
            // Tentar ativar funil padrão
            const { data: defFunnel } = await supabase.from('funnels').select('id').eq('user_id', profile.id).eq('is_default', true).maybeSingle();
            if (defFunnel) {
                const { data: startNode } = await supabase.from('funnel_steps').select('id').eq('funnel_id', defFunnel.id).eq('node_type', 'start').maybeSingle();
                if (startNode) {
                    await supabase.from('contacts').update({ current_funnel_id: defFunnel.id, is_funnel_active: true, funnel_status: 'INICIADO' }).eq('id', contact.id);
                    await FunnelService.execute(defFunnel.id, startNode.id, instanceName, remoteJid, contact.id);
                    return;
                }
            }
        }

        // 8. Resposta da IA (Se não estiver em handoff)
        if (!GuardService.shouldPauseAI(contact.ai_tag)) {
            const { data: aiConfig } = await supabase.from('ai_configurations').select('*').eq('user_id', profile.id).single();
            if (aiConfig) {
                console.log(`[Orchestrator] 🤖 IA processando resposta para ${phone}`);

                // Busca histórico das últimas 20 mensagens
                const { data: history } = await supabase
                    .from('messages')
                    .select('content, from_me')
                    .eq('conversation_id', conversation.id)
                    .order('created_at', { ascending: false })
                    .limit(20);

                const formattedHistory = (history || []).reverse().map(m => ({
                    role: m.from_me ? 'assistant' : 'user',
                    content: m.content
                }));

                const reply = await AIService.generateResponse(
                    formattedHistory,
                    aiConfig,
                    profile.openai_api_key!
                );

                if (reply) {
                    await new Promise(r => setTimeout(r, 2000)); // Delay humano
                    await MessageService.send(instanceName, remoteJid, reply);
                    
                    await MessageService.save({
                        user_id: profile.id,
                        conversation_id: conversation.id,
                        instance_id: instance.id,
                        contact_id: contact.id,
                        from_me: true,
                        content: reply,
                        type: 'text',
                        ai_generated: true
                    });

                    // 9. Classificação Automática (Opcional - em background)
                    AIService.classifyContact(formattedHistory, profile.openai_api_key!).then(tag => {
                        if (tag) supabase.from('contacts').update({ ai_tag: tag }).eq('id', contact.id);
                    }).catch(() => {});
                }
            }
        }

    } catch (err) {
        console.error('❌ Erro crítico no fluxo do webhook:', err);
    }
}
