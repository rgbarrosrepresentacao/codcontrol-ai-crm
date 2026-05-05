import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { ProcessorService } from '@/services/whatsapp/processor';
import { GuardService } from '@/services/whatsapp/guard';
import { ContactService } from '@/services/whatsapp/logistics';
import { CampaignService } from '@/services/whatsapp/campaigns';
import { FunnelService } from '@/services/whatsapp/funnels';
import { AIService } from '@/services/whatsapp/ai';
import { MessageService } from '@/services/whatsapp/messages';
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
    // Remove emojis e caracteres especiais que soam estranho em TTS
    clean = clean.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
    clean = clean.replace(/[*_~`#]/g, '');
    clean = clean.replace(/\s{2,}/g, ' ').trim();
    return clean || text; // Fallback para o original se ficou vazio
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const eventType = (body.event || body.eventType || '').toLowerCase();

        // Ignora eventos que não são mensagens
        if (eventType !== 'messages.upsert' && eventType !== 'messages_upsert') {
            return NextResponse.json({ success: true, reason: 'ignored_event' });
        }

        // Processamento em background para liberar o WhatsApp rapidamente
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

    // Ignora mensagens enviadas pelo bot ou sem conteúdo
    if (!key || key.fromMe || !messageData) return;

    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid.endsWith('@g.us')) return; // Ignora grupos

    // Detecta se é uma mensagem de áudio (para marcar preferência do contato)
    const isAudioMessage = !!(messageData.audioMessage || messageData.pttMessage);

    console.log(`[Webhook] 📩 Mensagem recebida de ${remoteJid} (${isAudioMessage ? '🎙️ áudio' : '💬 texto'}) na instância ${instanceName}`);

    try {
        // ── PASSO 1: Identificar Instância ──────────────────────────────
        const { data: instance, error: instanceErr } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id')
            .eq('instance_name', instanceName)
            .single();

        if (instanceErr || !instance) {
            console.error(`[Webhook] ❌ Instância não encontrada: ${instanceName}`, instanceErr?.message);
            return;
        }

        // ── PASSO 2: Carregar Perfil do Usuário ────────────────────────
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('id, is_admin, stripe_subscription_status, trial_ends_at, openai_api_key')
            .eq('id', instance.user_id)
            .single();

        if (profileErr || !profile) {
            console.error(`[Webhook] ❌ Perfil não encontrado para user_id: ${instance.user_id}`, profileErr?.message);
            return;
        }

        // ── PASSO 3: Verificar Acesso ──────────────────────────────────
        const access = GuardService.checkAccess(profile);
        if (!access.hasAccess) {
            console.log(`[Webhook] 🚫 Acesso negado (${access.reason}) para ${profile.id}`);
            return;
        }

        // ── PASSO 4: Extrair Texto da Mensagem ─────────────────────────
        const textMessage = await ProcessorService.extractMessageContent(body, instanceName, profile.openai_api_key);
        if (!textMessage) {
            console.log(`[Webhook] ⚠️ Mensagem sem conteúdo extraível. Ignorando.`);
            return;
        }

        console.log(`[Webhook] 💬 Texto extraído: "${textMessage.slice(0, 60)}..."`);

        // ── PASSO 5: Upsert do Contato ─────────────────────────────────
        const phone = remoteJid.replace(/\D/g, '');
        const contact = await ContactService.upsert(profile.id, instance.id, remoteJid, phone, body.data?.pushName);
        if (!contact) {
            console.error(`[Webhook] ❌ Falha ao criar/atualizar contato para ${remoteJid}`);
            return;
        }

        // ── PASSO 5.1: Detectar preferência de áudio ───────────────────
        // Se o cliente enviou áudio e ainda não tem preferência marcada, ativa
        let wantsAudio = contact.wants_audio ?? false;
        if (isAudioMessage && !wantsAudio) {
            wantsAudio = true;
            await supabase.from('contacts').update({ wants_audio: true }).eq('id', contact.id);
            console.log(`[Webhook] 🎙️ Preferência de áudio ativada para ${phone}`);
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
            await supabase.from('conversations')
                .update({ status: 'open', updated_at: new Date().toISOString() })
                .eq('id', conversationId);
        } else {
            const { data: newConv, error: convErr } = await supabase
                .from('conversations')
                .insert({ user_id: profile.id, instance_id: instance.id, contact_id: contact.id, status: 'open' })
                .select('id')
                .single();

            if (convErr || !newConv) {
                console.error(`[Webhook] ❌ Falha ao criar conversa:`, convErr?.message);
                return;
            }
            conversationId = newConv.id;
        }

        console.log(`[Webhook] ✅ Conversa: ${conversationId}`);

        // ── PASSO 7: Salvar Mensagem Recebida ──────────────────────────
        try {
            await supabase.from('messages').insert({
                user_id: profile.id,
                conversation_id: conversationId,
                instance_id: instance.id,
                contact_id: contact.id,
                message_id: key.id,
                from_me: false,
                content: textMessage,
                type: isAudioMessage ? 'audio' : 'text',
                status: 'delivered'
            });

            await supabase.from('conversations').update({
                last_message: textMessage,
                last_message_at: new Date().toISOString()
            }).eq('id', conversationId);
        } catch (msgSaveErr) {
            console.error(`[Webhook] ⚠️ Erro ao salvar mensagem (não fatal):`, msgSaveErr);
        }

        // ── PASSO 8: Detecção de Campanha ──────────────────────────────
        try {
            const campaignId = await CampaignService.detect(profile.id, instance.id, textMessage);
            if (campaignId) {
                await supabase.from('contacts').update({ active_campaign_id: campaignId }).eq('id', contact.id);
            }
        } catch {
            // Não é crítico
        }

        // ── PASSO 9: Verificação de Funil ──────────────────────────────
        const funnelStatus = contact.funnel_status || 'INATIVO';
        const funnelId = contact.current_funnel_id;

        if (funnelId && (funnelStatus === 'INICIADO' || funnelStatus === 'EM_ANDAMENTO')) {
            await supabase.from('contacts').update({ funnel_status: 'PAUSADO' }).eq('id', contact.id);
        } else if (funnelStatus === 'INATIVO' && !funnelId) {
            try {
                const { data: defFunnel } = await supabase
                    .from('funnels').select('id')
                    .eq('user_id', profile.id).eq('is_default', true)
                    .maybeSingle();

                if (defFunnel) {
                    const { data: startNode } = await supabase
                        .from('funnel_steps').select('id')
                        .eq('funnel_id', defFunnel.id).eq('node_type', 'start')
                        .maybeSingle();

                    if (startNode) {
                        await supabase.from('contacts').update({
                            current_funnel_id: defFunnel.id,
                            is_funnel_active: true,
                            funnel_status: 'INICIADO'
                        }).eq('id', contact.id);
                        await FunnelService.execute(defFunnel.id, startNode.id, instanceName, remoteJid, contact.id);
                        return; // Funil assumiu o controle
                    }
                }
            } catch {
                // Sem funil padrão — IA assume
            }
        }

        // ── PASSO 10: Resposta da IA ────────────────────────────────────
        if (GuardService.shouldPauseAI(contact.ai_tag)) {
            console.log(`[Webhook] 🤝 Handoff ativo para ${phone}. IA pausada.`);
            return;
        }

        if (!profile.openai_api_key) {
            console.warn(`[Webhook] ⚠️ Sem openai_api_key para o usuário ${profile.id}. IA não pode responder.`);
            return;
        }

        const { data: aiConfig, error: aiErr } = await supabase
            .from('ai_configurations')
            .select('*')
            .eq('user_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (aiErr || !aiConfig) {
            console.warn(`[Webhook] ⚠️ Sem configuração de IA para ${profile.id}`);
            return;
        }

        console.log(`[Webhook] 🤖 IA gerando resposta para ${phone}...`);

        // Busca histórico das últimas 20 mensagens
        const { data: history } = await supabase
            .from('messages')
            .select('content, from_me')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(20);

        const formattedHistory = (history || []).reverse().map(m => ({
            role: m.from_me ? 'assistant' : 'user',
            content: m.content
        }));

        const reply = await AIService.generateResponse(
            formattedHistory,
            aiConfig,
            profile.openai_api_key
        );

        if (!reply) {
            console.error(`[Webhook] ❌ IA não retornou resposta para ${phone}`);
            return;
        }

        console.log(`[Webhook] ✅ IA respondeu: "${reply.slice(0, 60)}..."`);

        // ── PASSO 11: Envio Humanizado (Áudio ou Texto) ─────────────────
        // Delay proporcional ao tamanho da resposta (mín 2s, máx 10s)
        const typingTime = Math.min(Math.max(reply.length * 50, 2000), 10000);
        const canSendAudio = !!(aiConfig.audio_enabled && wantsAudio);
        let finalType = 'text';

        if (canSendAudio) {
            console.log(`[Webhook] 🎙️ Enviando resposta em ÁUDIO para ${phone}...`);
            try {
                // Verifica se tem link no texto — se sim, manda texto primeiro
                const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
                const hasLink = urlRegex.test(reply);
                if (hasLink) {
                    await MessageService.send(instanceName, remoteJid, reply);
                    await new Promise(r => setTimeout(r, 1500));
                }

                // Mostra indicador "gravando áudio..."
                await evolutionApi.sendPresence(instanceName, remoteJid, 'recording');
                await new Promise(r => setTimeout(r, Math.max(typingTime - 3000, 1500)));

                // Gera e envia o áudio via TTS
                const audioText = cleanTextForAudio(reply);
                const audioB64 = await generateSpeech(audioText, aiConfig.voice_id || 'nova', profile.openai_api_key);
                await evolutionApi.sendWhatsAppAudio(instanceName, remoteJid, audioB64);
                finalType = 'audio';
                console.log(`[Webhook] ✅ Áudio enviado para ${phone}`);
            } catch (audioErr: any) {
                // Áudio falhou — envia texto como fallback
                console.error(`[Webhook] ⚠️ TTS falhou, enviando texto como fallback:`, audioErr?.message);
                await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
                await new Promise(r => setTimeout(r, 2000));
                await MessageService.send(instanceName, remoteJid, reply);
            }
        } else {
            // Modo texto padrão com delay proporcional
            console.log(`[Webhook] 💬 Enviando resposta em TEXTO para ${phone} (delay: ${Math.round(typingTime / 1000)}s)`);
            await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
            await new Promise(r => setTimeout(r, typingTime));
            await MessageService.send(instanceName, remoteJid, reply);
        }

        // ── PASSO 12: Salvar Resposta no Banco ─────────────────────────
        await supabase.from('messages').insert({
            user_id: profile.id,
            conversation_id: conversationId,
            instance_id: instance.id,
            contact_id: contact.id,
            from_me: true,
            content: reply,
            type: finalType,
            status: 'sent',
            ai_generated: true
        });

        await supabase.from('conversations').update({
            last_message: reply,
            last_message_at: new Date().toISOString()
        }).eq('id', conversationId);

        // ── PASSO 13: Classificação Assíncrona (não bloqueia) ──────────
        AIService.classifyContact(formattedHistory, profile.openai_api_key).then(tag => {
            if (tag) supabase.from('contacts').update({ ai_tag: tag }).eq('id', contact.id);
        }).catch(() => {});

    } catch (err: any) {
        console.error('❌ Erro crítico no processamento do webhook:', err?.message || err);
    }
}
