import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { ProcessorService } from '@/services/whatsapp/processor';
import { GuardService } from '@/services/whatsapp/guard';
import { ContactService } from '@/services/whatsapp/logistics';
import { CampaignService } from '@/services/whatsapp/campaigns';
import { FunnelService } from '@/services/whatsapp/funnels';
import { AIService } from '@/services/whatsapp/ai';
import { MessageService } from '@/services/whatsapp/messages';
import { KnowledgeService } from '@/services/whatsapp/knowledge';
import { NotificationService } from '@/services/whatsapp/notifications';
import { evolutionApi } from '@/lib/evolution';
import { generateSpeech } from '@/lib/openai-tts';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ── Utilitário: limpa texto antes de converter em áudio ────────────────────
function cleanTextForAudio(text: string): string {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|app|bond|shop|top|site|online|me)[^\s]*)/gi;
    let clean = text.replace(urlRegex, '');
    clean = clean.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
    clean = clean.replace(/[*_~`#]/g, '');
    clean = clean.replace(/\s{2,}/g, ' ').trim();
    return clean || text;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const eventType = (body.event || body.eventType || '').toLowerCase();

        if (eventType !== 'messages.upsert' && eventType !== 'messages_upsert') {
            return NextResponse.json({ success: true, reason: 'ignored_event' });
        }

        processWebhook(body).catch(err => console.error('❌ Erro fatal no orquestrador:', err));

        return NextResponse.json({ success: true, status: 'processing' });
    } catch (e: any) {
        console.error('❌ Erro ao parsear body:', e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

async function processWebhook(body: any) {
    const messageData = body.data?.message;
    const key = body.data?.key;
    const instanceName = body.instance;

    if (!key || key.fromMe || !messageData) return;

    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid.endsWith('@g.us')) return;

    const isAudioMessage = !!(messageData.audioMessage || messageData.pttMessage);
    const rawText = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || '';

    console.log(`[Webhook] 📩 Mensagem de ${remoteJid} na instância ${instanceName}`);

    try {
        // ── PASSO 1: Identificar Instância ──────────────────────────────
        const { data: instance, error: instanceErr } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id')
            .eq('instance_name', instanceName)
            .single();

        if (instanceErr || !instance) return;

        // ── PASSO 1.1: Blast Opt-Out (NOVO) ───────────────────────────
        const OPT_OUT_REGEX = /^(sair|parar|stop|cancelar|nao quero|não quero|descadastrar|remover|bloquear|chega|para|pare)\s*[!.]*$/i;
        if (OPT_OUT_REGEX.test(rawText.trim())) {
            const phone = remoteJid.replace(/\D/g, '');
            const normalizedPhone = phone.startsWith('55') ? phone : '55' + phone;
            
            await supabase
                .from('blast_contacts')
                .update({ opted_out: true, opted_out_at: new Date().toISOString() })
                .eq('phone', normalizedPhone)
                .eq('opted_out', false);

            console.log(`[BLAST OPT-OUT] ⛔ ${phone} pediu para sair.`);
        }

        // ── PASSO 2: Carregar Perfil do Usuário ────────────────────────
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*') // Pega tudo para ver notificações
            .eq('id', instance.user_id)
            .single();

        if (profileErr || !profile) return;

        // ── PASSO 3: Verificar Acesso ──────────────────────────────────
        const access = GuardService.checkAccess(profile);
        if (!access.hasAccess) return;

        // ── PASSO 4: Extrair Texto da Mensagem ─────────────────────────
        const textMessage = await ProcessorService.extractMessageContent(body, instanceName, profile.openai_api_key);
        if (!textMessage) return;

        // ── PASSO 5: Upsert do Contato ─────────────────────────────────
        const phone = remoteJid.replace(/\D/g, '');
        const contact = await ContactService.upsert(profile.id, instance.id, remoteJid, phone, body.data?.pushName);
        if (!contact) return;

        let wantsAudio = contact.wants_audio ?? false;
        if (isAudioMessage && !wantsAudio) {
            wantsAudio = true;
            await supabase.from('contacts').update({ wants_audio: true }).eq('id', contact.id);
        }

        // ── PASSO 6: Upsert da Conversa ────────────────────────────────
        let conversationId: string | null = null;
        const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', profile.id)
            .eq('contact_id', contact.id)
            .maybeSingle();

        if (existingConv) {
            conversationId = existingConv.id;
            await supabase.from('conversations').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', conversationId);
        } else {
            const { data: newConv } = await supabase
                .from('conversations')
                .insert({ user_id: profile.id, instance_id: instance.id, contact_id: contact.id, status: 'open' })
                .select('id')
                .single();
            conversationId = newConv?.id || null;
        }
        if (!conversationId) return;

        // ── PASSO 7: Salvar Mensagem Recebida ──────────────────────────
        await supabase.from('messages').insert({
            user_id: profile.id, conversation_id: conversationId, instance_id: instance.id, contact_id: contact.id,
            message_id: key.id, from_me: false, content: textMessage, type: isAudioMessage ? 'audio' : 'text', status: 'delivered'
        });

        // ── PASSO 8: Product Intent Engine V2 (Detecção e Trava) ────────
        const isLocked = contact.campaign_lock ?? false;
        let campaignId = contact.active_campaign_id;
        let campaignPrompt = '';
        let intentResult = null;

        // Só tenta detectar nova campanha se não estiver travado OU se for uma troca explícita
        if (!isLocked) {
            intentResult = await CampaignService.detectWithAI(
                profile.id, 
                instance.id, 
                textMessage, 
                profile.openai_api_key, 
                contact.origin_source || ''
            );

            // 1. Log da decisão (Fase 1)
            await supabase.from('campaign_intelligence_logs').insert({
                user_id: profile.id,
                contact_id: contact.id,
                message: textMessage,
                detected_campaign_id: intentResult.campaign_id,
                confidence_score: intentResult.confidence_score,
                reason: intentResult.reason,
                origin_source: contact.origin_source
            });

            // 2. Regra de Decisão Baseada em Score
            if (intentResult.confidence_score >= 85 && intentResult.campaign_id) {
                // Ativação Automática e Trava
                campaignId = intentResult.campaign_id;
                await supabase.from('contacts').update({ 
                    active_campaign_id: campaignId,
                    campaign_lock: true // Trava o contexto para evitar trocas erradas
                }).eq('id', contact.id);
            } else if (intentResult.confidence_score >= 60 && intentResult.confidence_score < 85 && intentResult.campaign_id) {
                // Ambiguidade: Não troca a persona, mas a IA deve perguntar se é sobre esse produto
                // (Opcional: injetar uma instrução para a IA confirmar o produto)
                console.log(`[Engine V2] ⚠️ Score ambíguo (${intentResult.confidence_score}). Mantendo neutro.`);
            }
        }

        // ── PASSO 8.1: Carregar Persona da Campanha (Fase 1) ────────────
        if (campaignId) {
            const { data: campData } = await supabase.from('campaigns').select('system_prompt').eq('id', campaignId).maybeSingle();
            if (campData) campaignPrompt = campData.system_prompt;
        }

        // ── PASSO 9: Verificação de Funil ──────────────────────────────
        const funnelStatus = contact.funnel_status || 'INATIVO';
        if (contact.current_funnel_id && (funnelStatus === 'INICIADO' || funnelStatus === 'EM_ANDAMENTO')) {
            await supabase.from('contacts').update({ funnel_status: 'PAUSADO' }).eq('id', contact.id);
        } else if (funnelStatus === 'INATIVO' && !contact.current_funnel_id) {
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

        // ── PASSO 10: Resposta da IA ────────────────────────────────────
        if (GuardService.shouldPauseAI(contact.ai_tag)) return;
        if (!profile.openai_api_key) return;

        const { data: aiConfig } = await supabase.from('ai_configurations').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!aiConfig) return;

        // ── PASSO 10.1: Knowledge Base (Filtro por Produto) ────────────
        const { context: knowledgeContext, items: knowledgeItems } = await KnowledgeService.buildContext(profile.id, campaignId);

        const { data: history } = await supabase.from('messages').select('content, from_me').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20);
        const formattedHistory = (history || []).reverse().map(m => ({ role: m.from_me ? 'assistant' : 'user', content: m.content }));

        // Se o score for ambíguo (60-85), injetamos uma regra de confirmação
        let customLeadContext = '';
        if (intentResult && intentResult.confidence_score >= 60 && intentResult.confidence_score < 85) {
            customLeadContext = `IMPORTANTE: O cliente parece interessado no produto "${intentResult.campaign_name}", mas não temos certeza total (Score: ${intentResult.confidence_score}%). 
            Em vez de assumir que ele quer comprar, faça uma pergunta educada confirmando se ele gostaria de saber mais sobre o "${intentResult.campaign_name}".`;
        }

        let reply = await AIService.generateResponse(formattedHistory, aiConfig, profile.openai_api_key, knowledgeContext, customLeadContext, campaignPrompt);
        if (!reply) return;

        // ── PASSO 10.2: Processar Gatilhos de Mídia (NOVO) ────────────
        const { item: mediaItem, cleanReply } = KnowledgeService.detectMediaTrigger(reply, knowledgeItems);
        reply = cleanReply;

        // ── PASSO 11: Envio Humanizado ─────────────────────────────────
        const typingTime = Math.min(Math.max(reply.length * 50, 2000), 10000);
        const canSendAudio = !!(aiConfig.audio_enabled && wantsAudio);
        let finalType = 'text';

        if (canSendAudio) {
            try {
                const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi.test(reply);
                if (hasLink) {
                    await MessageService.send(instanceName, remoteJid, reply);
                    await new Promise(r => setTimeout(r, 1500));
                }
                await evolutionApi.sendPresence(instanceName, remoteJid, 'recording');
                await new Promise(r => setTimeout(r, Math.max(typingTime - 3000, 1500)));
                const audioB64 = await generateSpeech(cleanTextForAudio(reply), aiConfig.voice_id || 'nova', profile.openai_api_key);
                await evolutionApi.sendWhatsAppAudio(instanceName, remoteJid, audioB64);
                finalType = 'audio';
            } catch {
                await MessageService.send(instanceName, remoteJid, reply);
            }
        } else {
            await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
            await new Promise(r => setTimeout(r, typingTime));
            await MessageService.send(instanceName, remoteJid, reply);
        }

        // ── PASSO 11.1: Enviar Mídia se detectado (NOVO) ──────────────
        if (mediaItem) {
            await KnowledgeService.sendMedia(instanceName, remoteJid, mediaItem, profile.id, instance.id, conversationId, contact.id);
        }

        // ── PASSO 12: Salvar e Classificar ─────────────────────────────
        await supabase.from('messages').insert({ user_id: profile.id, conversation_id: conversationId, instance_id: instance.id, contact_id: contact.id, from_me: true, content: reply, type: finalType, status: 'sent', ai_generated: true });
        
        const newTag = await AIService.classifyContact(formattedHistory, profile.openai_api_key);
        if (newTag) {
            await supabase.from('contacts').update({ ai_tag: newTag }).eq('id', contact.id);

            // ── PASSO 12.1: Notificação de Venda (NOVO) ─────────────────
            if (newTag === 'FECHADO' && profile.sale_notifications_enabled && profile.notification_whatsapp) {
                const orderData = await AIService.extractOrderData([...formattedHistory, { role: 'assistant', content: reply }], profile.openai_api_key);
                if (orderData) {
                    await NotificationService.sendSaleNotification(instanceName, orderData, phone, profile.notification_whatsapp);
                    
                    const closingMsg = await AIService.generateClosingMessage(formattedHistory, aiConfig, profile.openai_api_key);
                    await MessageService.send(instanceName, remoteJid, closingMsg);
                }
            }
        }

    } catch (err: any) {
        console.error('❌ Erro no webhook:', err);
    }
}
