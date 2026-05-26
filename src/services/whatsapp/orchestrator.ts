import { getSupabaseAdmin } from '@/lib/supabase-admin';
import crypto from 'crypto';
import { ProcessorService } from '@/services/whatsapp/processor';
import { GuardService } from '@/services/whatsapp/guard';
import { ContactService } from '@/services/whatsapp/logistics';
import { CampaignService } from '@/services/whatsapp/campaigns';
import { AIService } from '@/services/whatsapp/ai';
import { MessageService } from '@/services/whatsapp/messages';
import { KnowledgeService } from '@/services/whatsapp/knowledge';
import { NotificationService } from '@/services/whatsapp/notifications';
import { evolutionApi } from '@/lib/evolution';
import { generateSpeech } from '@/lib/openai-tts';

// ── Utilitário: limpa texto antes de converter em áudio ────────────────────
function cleanTextForAudio(text: string): string {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|app|bond|shop|top|site|online|me)[^\s]*)/gi;
    let clean = text.replace(urlRegex, '');

    // Normalização de Moeda para fala natural (ex: R$ 119,90 -> 119 reais e 90 centavos)
    clean = clean.replace(/R\$\s?(\d+),(\d{2})/g, (match, reais, centavos) => {
        const c = parseInt(centavos) > 0 ? ` e ${centavos} centavos` : '';
        return `${reais} reais${c}`;
    });

    clean = clean.replace(/[\u{1F300}-\u{1F9FF}]/gu, '');
    clean = clean.replace(/[*_~`#]/g, '');
    clean = clean.replace(/\s{2,}/g, ' ').trim();
    return clean || text;
}

export async function processWebhook(body: any, correlationId?: string) {
    const supabase = getSupabaseAdmin();
    const eventType = (body.event || body.eventType || '').toLowerCase();
    const instanceName = body.instance;
    const correlationIdFinal = correlationId || body.correlation_id || crypto.randomUUID();

    // --- TRATAMENTO DE ACKS (CONFIRMAÇÕES DE LEITURA/ENTREGA/ERRO) ---
    if (eventType === 'messages.update' || eventType === 'messages_update') {
        const updates = Array.isArray(body.data) ? body.data : [body.data];
        for (const item of updates) {
            if (!item || !item.key || !item.update) continue;
            const messageId = item.key.id;
            const statusNumber = item.update.status;
            
            let newStatus = '';
            if (statusNumber === 2) newStatus = 'sent';
            else if (statusNumber === 3) newStatus = 'delivered';
            else if (statusNumber === 4) newStatus = 'read';
            else if (item.update.status === 'ERROR' || item.update.status === 5) newStatus = 'failed';

            const errorCode = item.update.error?.code || item.update.errorCode || null;
            const errorMessage = item.update.error?.message || item.update.error || item.update.message || null;

            if (errorCode || errorMessage || newStatus === 'failed') {
                newStatus = 'failed';
                console.error(`[EVOLUTION_FATAL] [${correlationIdFinal}] Falha de entrega na Evolution API! MsgID: ${messageId} | Instância: ${instanceName} | Erro: ${errorMessage} (Código: ${errorCode})`);
            } else if (newStatus) {
                console.log(`[EVOLUTION_ACK] [${correlationIdFinal}] MsgID: ${messageId} atualizada para status: ${newStatus}`);
            }

            if (newStatus) {
                await supabase.from('messages')
                    .update({ 
                        status: newStatus, 
                        error_code: errorCode ? String(errorCode) : null,
                        error_message: errorMessage ? String(errorMessage) : null,
                        last_status_at: new Date().toISOString()
                    })
                    .eq('message_id', messageId);
            }
        }
        return { success: true };
    }
    // -----------------------------------------------------------------

    const messageData = body.data?.message;
    const key = body.data?.key;
    if (!key || key.fromMe || !messageData) return;

    const messageId = key.id;
    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid.endsWith('@g.us')) return;

    const rawText = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || '';
    
    // ── TRAVA DE DESDUPLICAÇÃO POR CONTEÚDO (HASH) ──
    const timeWindow = new Date().toISOString().slice(0, 16); // Ex: 2024-05-16T15:30
    const contentHash = crypto.createHash('md5').update(`${remoteJid}:${rawText.trim()}:${timeWindow}`).digest('hex');
    const dedupId = `HASH_${contentHash}`;

    // Tenta travar pelo ID original ou pelo Hash de conteúdo recente
    const { error: dedupError } = await supabase
        .from('webhook_deduplication')
        .insert([ 
            { message_id: messageId, instance_name: instanceName },
            { message_id: dedupId, instance_name: instanceName }
        ]);

    if (dedupError && (dedupError.code === '23505' || dedupError.message?.includes('duplicate key'))) {
        console.log(`[WEBHOOK_DEDUP] [${correlationIdFinal}] Mensagem ou Hash ${messageId} / ${dedupId} já processados. Abortando.`);
        return;
    }

    console.log(`[WEBHOOK_RECEIVED] [${correlationIdFinal}] Recebido de ${remoteJid}. Processando...`);

    await handleWebhookLogic(body, correlationIdFinal);

    return { success: true };
}

async function handleWebhookLogic(body: any, correlationId: string) {
    const supabase = getSupabaseAdmin();
    const messageData = body.data?.message;
    const key = body.data?.key!;
    const messageId = key.id;
    const instanceName = body.instance;
    const remoteJid = key.remoteJid!;
    const isAudioMessage = !!(messageData.audioMessage || messageData.pttMessage);
    const rawText = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || '';

    let instance: any = null;
    let profile: any = null;

    try {
        const { data: instData, error: instanceErr } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id, provider_type')
            .eq('instance_name', instanceName)
            .single();

        if (instanceErr || !instData) {
            console.log(`[Webhook Debug] Instance not found: ${instanceName}`);
            return;
        }
        instance = instData;

        const isMetaProvider = instance.provider_type === 'META';

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

        const { data: profData, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', instance.user_id)
            .single();

        if (profileErr || !profData) {
            console.log(`[Webhook Debug] Profile not found for userId: ${instance.user_id}`);
            return;
        }
        profile = profData;

        const access = GuardService.checkAccess(profile);
        if (!access.hasAccess) return;

        const result = await ProcessorService.extractMessageContent(body, instanceName, profile.openai_api_key);
        if (!result || (!result.text && !result.audioUrl)) return;
        const textMessage = result.text || '';

        const phone = remoteJid.replace(/\D/g, '');
        const contact = await ContactService.upsert(profile.id, instance.id, remoteJid, phone, body.data?.pushName);
        if (!contact) return;

        if ((contact as any).last_message_id === key.id) {
            console.log(`[WEBHOOK] ♻️ Mensagem ${key.id} já processada anteriormente para este contato. Ignorando.`);
            return;
        }
        await supabase.from('contacts').update({ last_message_id: key.id }).eq('id', contact.id);

        let wantsAudio = contact.wants_audio ?? false;
        if (isAudioMessage && !wantsAudio) {
            wantsAudio = true;
            await supabase.from('contacts').update({ wants_audio: true }).eq('id', contact.id);
        }

        const { data: aiConfig } = await supabase
            .from('ai_configurations')
            .select('*')
            .eq('user_id', profile.id)
            .or(`instance_id.eq.${instance.id},instance_id.is.null`)
            .order('instance_id', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!aiConfig || !aiConfig.is_active) {
            console.log('IA desativada ou não configurada para este usuário');
            return;
        }

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

        await MessageService.save({
            user_id: profile.id,
            conversation_id: conversationId,
            instance_id: instance.id,
            contact_id: contact.id,
            message_id: key.id,
            from_me: false,
            content: textMessage,
            type: isAudioMessage ? 'audio' : 'text',
            payload: result.audioUrl ? { audioUrl: result.audioUrl } : undefined
        });

        const FunnelService = (await import('@/services/whatsapp/funnels')).FunnelService;

        let campaignId = contact.active_campaign_id;
        let campaignPrompt = '';
        let catalogueContext = '';
        let intentResult = null;

        catalogueContext = await CampaignService.getCatalogueSummary(profile.id, instance.id);
        const isMultiProductMode = catalogueContext.length > 0;

        if (isMultiProductMode) {
            intentResult = await CampaignService.detectWithAI(profile.id, instance.id, textMessage, profile.openai_api_key, contact.origin);

            if (intentResult && intentResult.confidence_score >= 85 && intentResult.campaign_id) {
                const isDifferentCampaign = intentResult.campaign_id !== contact.active_campaign_id;
                campaignId = intentResult.campaign_id;

                if (isDifferentCampaign) {
                    console.log(`[MAESTRO] 🔄 Troca de Contexto Confirmada: ${contact.active_campaign_id} -> ${intentResult.campaign_id} (${intentResult.confidence_score}%)`);
                    await supabase.from('contacts').update({
                        active_campaign_id: campaignId,
                        campaign_lock: true
                    }).eq('id', contact.id);
                }

                await supabase.from('campaign_intelligence_logs').insert({
                    user_id: profile.id,
                    contact_id: contact.id,
                    message: textMessage,
                    detected_campaign_id: intentResult.campaign_id,
                    confidence_score: intentResult.confidence_score,
                    reason: intentResult.reason
                });
            }
            else if (intentResult && intentResult.confidence_score >= 60 && intentResult.campaign_id) {
                console.log(`[MAESTRO] ⚠️ Contexto temporário sugerido (${intentResult.confidence_score}%): ${intentResult.campaign_name}`);
                campaignId = intentResult.campaign_id;
            }
        }

        if (campaignId) {
            const { data: campData } = await supabase.from('campaigns').select('system_prompt').eq('id', campaignId).maybeSingle();
            if (campData) campaignPrompt = campData.system_prompt;
        }

        const funnelStatus = contact.funnel_status || 'INATIVO';
        const isFunnelActive = contact.is_funnel_active ?? false;

        if (isFunnelActive && funnelStatus === 'EM_ANDAMENTO') {
            console.log(`[WEBHOOK] 🛡️ Bloqueio de Concorrência: Motor em andamento para ${phone}. Ignorando entrada.`);
            return;
        }

        let funnelJustStarted = false;
        const funnelIsLocked = (funnelStatus === 'FINALIZADO' || funnelStatus === 'TRANSBORDADO');

        if (!funnelIsLocked && intentResult && intentResult.confidence_score >= 90 && (funnelStatus !== 'EM_ANDAMENTO' || intentResult.confidence_score >= 98)) {
            const { data: campaign } = await supabase
                .from('campaigns')
                .select('name')
                .eq('id', intentResult.campaign_id)
                .single();

            if (campaign) {
                let { data: targetFunnel } = await supabase
                    .from('funnels')
                    .select('*')
                    .eq('user_id', profile.id)
                    .ilike('name', campaign.name)
                    .eq('is_active', true)
                    .maybeSingle();

                if (!targetFunnel) {
                    targetFunnel = await supabase
                        .from('funnels')
                        .select('*')
                        .eq('user_id', profile.id)
                        .eq('is_default', true)
                        .eq('is_active', true)
                        .maybeSingle()
                        .then(res => res.data);
                }

                if (targetFunnel) {
                    const { data: startNode } = await supabase
                        .from('funnel_steps')
                        .select('id')
                        .eq('funnel_id', targetFunnel.id)
                        .eq('node_type', 'start')
                        .maybeSingle();

                    if (startNode) {
                        await supabase.from('contacts').update({
                            is_funnel_active: true,
                            funnel_status: 'EM_ANDAMENTO',
                            current_funnel_id: targetFunnel.id
                        }).eq('id', contact.id);

                        FunnelService.execute(targetFunnel.id, startNode.id, instance.id, remoteJid, contact.id, profile.id)
                            .catch(err => console.error('[WEBHOOK] Error executing funnel:', err));

                        funnelJustStarted = true;
                    }
                }
            }
        }

        if (funnelStatus === 'PAUSADO' && !funnelJustStarted) {
            const currentNodeId = contact.funnel_current_node_id;
            if (currentNodeId && contact.current_funnel_id) {
                const { data: pausedNode } = await supabase
                    .from('funnel_steps')
                    .select('*')
                    .eq('id', currentNodeId)
                    .single();

                if (pausedNode?.node_type === 'condition') {
                    let handle = 'default';
                    if (profile.openai_api_key) {
                        const conditionLabel = pausedNode.node_data?.condition_label || 'O cliente demonstrou interesse?';
                        const evaluation = await AIService.evaluateCondition(
                            [{ role: 'user', content: textMessage }],
                            conditionLabel,
                            profile.openai_api_key
                        );

                        // Auto-heal OpenAI Key status if successful
                        if (profile.openai_key_status !== 'active') {
                            await supabase.from('profiles').update({
                                openai_key_status: 'active',
                                openai_key_error_at: null
                            }).eq('id', profile.id);
                            console.log(`[AIService] ✨ Status da chave OpenAI do usuário ${profile.id} restaurado para: active (via funil)`);
                        }

                        try {
                            await supabase.from('funnel_execution_logs').insert({
                                user_id: profile.id,
                                contact_id: contact.id,
                                funnel_id: contact.current_funnel_id,
                                node_id: currentNodeId,
                                node_type: 'condition',
                                customer_response: textMessage,
                                ai_decision: evaluation
                            });
                        } catch (logErr) {}

                        if (evaluation.decision === 'human') {
                            await supabase.from('contacts').update({ funnel_status: 'TRANSBORDADO', is_funnel_active: false }).eq('id', contact.id);
                        } else if (evaluation.confidence >= 70 && (evaluation.decision === 'yes' || evaluation.decision === 'no')) {
                            handle = evaluation.decision;
                        } else {
                            const { count: ambiguousCount } = await supabase
                                .from('funnel_execution_logs')
                                .select('*', { count: 'exact', head: true })
                                .eq('contact_id', contact.id)
                                .eq('node_id', currentNodeId)
                                .eq('node_type', 'condition')
                                .not('customer_response', 'is', null);

                            if ((ambiguousCount || 0) >= 3) {
                                await supabase.from('contacts').update({
                                    funnel_status: 'FINALIZADO',
                                    is_funnel_active: false,
                                }).eq('id', contact.id);
                            }
                        }
                    }

                    if (handle === 'yes' || handle === 'no') {
                        FunnelService.execute(contact.current_funnel_id, currentNodeId, instance.id, remoteJid, contact.id, profile.id, handle)
                            .catch(err => console.error('[WEBHOOK] Erro ao retomar condição:', err));
                        return;
                    }

                } else {
                    const nextNodeId = await FunnelService.getNextNodeId(contact.current_funnel_id, currentNodeId);
                    if (nextNodeId) {
                        try {
                            await supabase.from('funnel_execution_logs').insert({
                                user_id: profile.id,
                                contact_id: contact.id,
                                funnel_id: contact.current_funnel_id,
                                node_id: currentNodeId,
                                node_type: pausedNode?.node_type || 'text',
                                customer_response: textMessage
                            });
                        } catch (logErr) {}

                        FunnelService.execute(contact.current_funnel_id, nextNodeId, instance.id, remoteJid, contact.id, profile.id)
                            .catch(err => console.error('[WEBHOOK] Erro ao avançar funil:', err));
                        return;
                    } else {
                        await supabase.from('contacts').update({
                            funnel_status: 'FINALIZADO',
                            is_funnel_active: false,
                        }).eq('id', contact.id);
                    }
                }
            }
        }

        const lastUpdate = new Date(contact.updated_at).getTime();
        const now = new Date().getTime();
        const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60);

        if (funnelStatus === 'EM_ANDAMENTO' && minutesSinceUpdate > 5 && !funnelJustStarted) {
            await supabase.from('contacts').update({
                funnel_status: 'FINALIZADO',
                is_funnel_active: false,
            }).eq('id', contact.id);
        }

        if (!funnelIsLocked && !isFunnelActive && (funnelStatus === 'INATIVO') && !funnelJustStarted) {
            const { data: defFunnel } = await supabase.from('funnels').select('*').eq('user_id', profile.id).eq('is_default', true).eq('is_active', true).maybeSingle();
            if (defFunnel) {
                const { data: startNode } = await supabase.from('funnel_steps').select('id').eq('funnel_id', defFunnel.id).eq('node_type', 'start').maybeSingle();
                if (startNode) {
                    await supabase.from('contacts').update({
                        is_funnel_active: true,
                        funnel_status: 'EM_ANDAMENTO',
                        current_funnel_id: defFunnel.id
                    }).eq('id', contact.id);

                    FunnelService.execute(defFunnel.id, startNode.id, instance.id, remoteJid, contact.id, profile.id)
                        .catch(err => console.error('[WEBHOOK] Error starting default funnel:', err));
                    funnelJustStarted = true;
                }
            }
        }

        if (funnelJustStarted) return;

        if (GuardService.shouldPauseAI(contact.ai_tag)) return;
        if (!profile.openai_api_key) return;
        if (!aiConfig) return;

        const waitTime = 500; // P1.1: Reduzido para 500ms para menor latência
        await new Promise(r => setTimeout(r, waitTime));

        const { data: lockResult, error: lockError } = await supabase
            .from('contacts')
            .update({ last_message_id: `HANDLED_${key.id}` })
            .eq('id', contact.id)
            .eq('last_message_id', key.id)
            .select('id')
            .single();

        if (lockError || !lockResult) {
            console.warn(`[ORCHESTRATOR] CAS lock falhou para ${key.id}. Possível duplicata ou race condition.`);
            return;
        }

        const { context: knowledgeContext, items: knowledgeItems } = await KnowledgeService.buildContext(profile.id, campaignId);
        const { data: history } = await supabase.from('messages').select('content, from_me').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(50);
        const formattedHistory = (history || []).reverse().map(m => ({ role: m.from_me ? 'assistant' : 'user', content: m.content }));

        const currentDate = new Date();
        const dateTimeContext = `\n[CONTEXTO TEMPORAL]\nData/Hora Atual: ${currentDate.toLocaleDateString('pt-BR')} ${currentDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\nDia da Semana: ${currentDate.toLocaleDateString('pt-BR', { weekday: 'long' })}\n`;

        let customLeadContext = dateTimeContext;
        if (intentResult && intentResult.confidence_score >= 60 && intentResult.confidence_score < 85) {
            customLeadContext += `\nIMPORTANTE: O cliente parece interessado no produto "${intentResult.campaign_name}", mas não temos certeza total (Score: ${intentResult.confidence_score}%). 
            Em vez de assumir que ele quer comprar, faça uma pergunta educada confirmando se ele gostaria de saber mais sobre o "${intentResult.campaign_name}".`;
        }

        let funnelSummary = '';
        if (contact.current_funnel_id) {
            funnelSummary = await FunnelService.getFunnelSummary(contact.current_funnel_id, contact.id) || '';
        }

        const startResponseGen = Date.now();
        let reply = await AIService.generateResponse(
            formattedHistory,
            aiConfig,
            profile.openai_api_key,
            knowledgeContext,
            customLeadContext,
            campaignPrompt,
            funnelSummary,
            catalogueContext,
            contact.lead_intelligence
        );
        const responseGenDuration = Date.now() - startResponseGen;
        console.log(`[AI_PERF] [OPENAI_LATENCY] [${correlationId}] generateResponse completou em ${responseGenDuration}ms`);
        if (!reply) return;

        // Auto-heal OpenAI Key status if successful
        if (profile.openai_key_status !== 'active') {
            await supabase.from('profiles').update({
                openai_key_status: 'active',
                openai_key_error_at: null
            }).eq('id', profile.id);
            console.log(`[AIService] ✨ Status da chave OpenAI do usuário ${profile.id} restaurado para: active`);
        }

        const { item: mediaItem, cleanReply } = KnowledgeService.detectMediaTrigger(reply, knowledgeItems);
        reply = cleanReply;

        const canSendAudio = !!(aiConfig.audio_enabled && wantsAudio);

        if (canSendAudio) {
            try {
                const typingTime = Math.min(Math.max(reply.length * 20, 1000), 4000); // Reduzido delay do áudio
                const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi.test(reply);
                if (hasLink) {
                    await MessageService.send(instance.id, remoteJid, reply);
                    await new Promise(r => setTimeout(r, 800)); // Reduzido delay pós link
                }
                if (!isMetaProvider) {
                    await evolutionApi.sendPresence(instanceName, remoteJid, 'recording');
                    await new Promise(r => setTimeout(r, Math.max(typingTime - 1000, 800)));
                } else {
                    await new Promise(r => setTimeout(r, Math.max(typingTime - 500, 1000)));
                }
                const audioFormat = isMetaProvider ? 'opus' : 'mp3';
                const audioExt = isMetaProvider ? 'ogg' : 'mp3';
                const audioContentType = isMetaProvider ? 'audio/ogg' : 'audio/mp3';

                const audioB64 = await generateSpeech(cleanTextForAudio(reply), aiConfig.voice_id || 'nova', profile.openai_api_key, audioFormat);

                // Upload para Supabase Storage
                const fileName = `sent-audios/${instance.id}/${crypto.randomUUID()}.${audioExt}`;
                const buffer = Buffer.from(audioB64, 'base64');
                const { error: uploadError } = await supabase.storage
                    .from('chat-media')
                    .upload(fileName, buffer, { contentType: audioContentType });

                let audioUrl = '';
                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('chat-media')
                        .getPublicUrl(fileName);
                    audioUrl = publicUrl;
                } else {
                    console.error('[orchestrator] Storage upload error:', uploadError);
                }

                // Envia a URL do áudio e o base64 para o provedor (Evolution usará Base64 MP3, Meta usará URL Ogg)
                const audioResult = await MessageService.sendAudio(instance.id, remoteJid, audioUrl || audioB64, audioB64);

                console.log(`[MESSAGE_PERSIST] Persistindo mensagem de Áudio da IA no DB. MessageID: ${audioResult?.messageId}`);
                const { error: insertError } = await supabase.from('messages').insert({
                    user_id: profile.id,
                    conversation_id: conversationId,
                    instance_id: instance.id,
                    contact_id: contact.id,
                    from_me: true,
                    content: reply,
                    type: 'audio',
                    status: 'sent',
                    ai_generated: true,
                    message_id: audioResult?.messageId,
                    payload: audioUrl ? { audioUrl } : undefined
                });
                
                if (insertError) throw insertError;
            } catch (err) {
                console.error('[WEBHOOK] Erro ao enviar áudio, fazendo fallback para texto:', err);
                const fallbackResult = await MessageService.send(instance.id, remoteJid, reply);
                const { error: fallbackError } = await supabase.from('messages').insert({ user_id: profile.id, conversation_id: conversationId, instance_id: instance.id, contact_id: contact.id, from_me: true, content: reply, type: 'text', status: 'sent', ai_generated: true, message_id: fallbackResult?.messageId });
                if (fallbackError) console.error('[WEBHOOK] Erro fatal no fallback de texto:', fallbackError);
            }
        } else {
            const messageBlocks = reply.split('\n\n').filter(block => block.trim().length > 0);
            for (const [index, block] of messageBlocks.entries()) {
                const chunkTypingTime = Math.min(Math.max(block.length * 20, 800), 3000); // P2.3: Reduzido delay de digitação
                if (!isMetaProvider) {
                    await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
                }
                await new Promise(r => setTimeout(r, chunkTypingTime));
                const txtResult = await MessageService.send(instance.id, remoteJid, block.trim());
                console.log(`[MESSAGE_PERSIST] Persistindo bloco de texto da IA no DB. MessageID: ${txtResult?.messageId}`);
                await supabase.from('messages').insert({
                    user_id: profile.id,
                    conversation_id: conversationId,
                    instance_id: instance.id,
                    contact_id: contact.id,
                    from_me: true,
                    content: block.trim(),
                    type: 'text',
                    status: 'sent',
                    ai_generated: true,
                    message_id: txtResult?.messageId
                });
                if (index < messageBlocks.length - 1) {
                    await new Promise(r => setTimeout(r, 400)); // P2.3: Reduzido delay entre blocos
                }
            }
        }

        if (mediaItem) {
            await KnowledgeService.sendMedia(instance.id, remoteJid, mediaItem, profile.id, conversationId, contact.id);
        }

        // ── BLOCO 4: Análise Secundária Inteligente e Paralela ──────────────────────────────────

        // ── Funções de Decisão (sem alterar generateResponse ou regras de venda) ──

        /**
         * Decide se deve pular a classificação do lead com base na tag atual e no histórico.
         * Não cria nenhuma coluna nova no banco. Usa somente o estado e o histórico já disponíveis.
         */
        const shouldSkipClassification = (currentTag: string | null | undefined, historyLength: number): { skip: boolean; reason: string } => {
            // Tags finais: reclassificar seria desperdício puro
            if (currentTag === 'COMPRADOR' || currentTag === 'FECHADO') {
                return { skip: true, reason: `tag já é final (${currentTag})` };
            }
            // Primeira interação do lead: classificar SEMPRE, independente do tamanho
            if (!currentTag || currentTag === 'NOVO_LEAD') {
                return { skip: false, reason: 'novo lead — classificação obrigatória' };
            }
            // Se o histórico tem poucas mensagens (conversa jovem), classificar sempre
            if (historyLength <= 4) {
                return { skip: false, reason: `histórico curto (${historyLength} msgs) — classificação necessária` };
            }
            // Para leads em andamento com histórico longo, classificar a cada 3 mensagens do cliente
            // Aproximação: mensagens do cliente = metade do histórico
            const clientMsgCount = Math.round(historyLength / 2);
            if (clientMsgCount % 3 !== 0) {
                return { skip: true, reason: `throttle — ${clientMsgCount} msgs do cliente desde a última classificação` };
            }
            return { skip: false, reason: 'intervalo de throttle atingido — reclassificando' };
        };

        /**
         * Decide se deve pular a análise de inteligência estratégica.
         * Preserva TODOS os sinais comerciais. Pula apenas ruído genuíno.
         */
        const shouldSkipIntelligence = (msg: string): { skip: boolean; reason: string; msgType: string } => {
            const trimmed = msg.trim().toLowerCase();

            // Palavras-chave comerciais: NUNCA pular, sempre geram inteligência
            const COMMERCIAL_SIGNALS = /(valor|preço|quanto|custo|frete|prazo|entrega|comprar|quero|link|pix|cartão|boleto|desconto|garantia|golpe|mentira|funciona|caro|barato|parcelar|parcela|visa|master|débito|crédito)/i;
            if (COMMERCIAL_SIGNALS.test(msg)) {
                return { skip: false, reason: 'sinal comercial detectado', msgType: 'comercial' };
            }

            // Mensagens irrelevantes: confirmações genéricas sem informação nova
            const IRRELEVANT_PATTERNS = [
                /^(ok|oks|okay|okey)$/i,
                /^(sim|s|ss|si|simm)$/i,
                /^(n[aã]o?|nn|n)$/i,
                /^(obrigad[ao]|obg|vlw|valeu|valew)$/i,
                /^(blz|beleza|bele|tá|ta|tá bom|ta bom|tudo bem|td bem|tdb)$/i,
                /^(oi|olá|ola|hey|eae|e aí|eai|ola|bom dia|boa tarde|boa noite)$/i,
                /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u,  // emoji isolado
                /^[👍👎❤️🙏😊😂🤣😍🥰😘🤔😅😁✅❌]+$/u,                           // emoji de reação
                /^(até logo|tchauu?|xau|tchau|flw|falou)$/i,
            ];
            const isIrrelevant = IRRELEVANT_PATTERNS.some(p => p.test(trimmed));
            if (isIrrelevant) {
                return { skip: true, reason: 'mensagem irrelevante — sem sinal comercial ou cognitivo', msgType: 'ruído' };
            }

            // Para qualquer outra mensagem (pergunta, objeção, dúvida, texto longo), analisar
            return { skip: false, reason: 'conteúdo com potencial informativo', msgType: 'geral' };
        };

        // ── Decisões de Skip ──
        const classifyDecision = shouldSkipClassification(contact.ai_tag, formattedHistory.length);
        const intelligenceDecision = shouldSkipIntelligence(textMessage);

        if (classifyDecision.skip) {
            console.log(`[AI_SKIP_CLASSIFICATION] [${correlationId}] Motivo: ${classifyDecision.reason} | tag atual: ${contact.ai_tag || 'none'}`);
        }
        if (intelligenceDecision.skip) {
            console.log(`[AI_SKIP_INTELLIGENCE] [${correlationId}] Motivo: ${intelligenceDecision.reason} | tipo: ${intelligenceDecision.msgType} | msg: "${textMessage.slice(0, 40)}"`);
        }

        // ── Execução Paralela das Análises Secundárias (Background - Fire-and-forget) ──
        // classifyContact, analyzeIntelligence e notificações de venda rodam em paralelo em background após resposta enviada
        const secondaryStart = Date.now();
        console.log(`[AI_SECONDARY_START] [${correlationId}] Iniciando análises secundárias em background | classify_skip=${classifyDecision.skip} | intelligence_skip=${intelligenceDecision.skip}`);

        const runSecondaryTasks = async () => {
            try {
                let newTag: string | null = null;

                // 1. Classificação de Contato (Background)
                if (!classifyDecision.skip) {
                    try {
                        const start = Date.now();
                        newTag = await AIService.classifyContact(formattedHistory, profile.openai_api_key);
                        const duration = Date.now() - start;
                        console.log(`[AI_PERF] [OPENAI_LATENCY] [${correlationId}] classifyContact completou em ${duration}ms`);
                        if (newTag) {
                            await supabase.from('contacts').update({ ai_tag: newTag }).eq('id', contact.id);
                        }
                    } catch (classifyErr: any) {
                        console.error(`[AI_SECONDARY_FAILED] [${correlationId}] classifyContact falhou:`, classifyErr.message || classifyErr);
                    }
                }

                // 2. Análise de Inteligência Estratégica (Background)
                if (!intelligenceDecision.skip) {
                    try {
                        const start = Date.now();
                        const intel = await AIService.analyzeIntelligence(
                            [...formattedHistory, { role: 'assistant', content: reply }],
                            profile.openai_api_key,
                            contact.lead_intelligence
                        );
                        const duration = Date.now() - start;
                        console.log(`[AI_PERF] [OPENAI_LATENCY] [${correlationId}] analyzeIntelligence completou em ${duration}ms`);
                        if (intel) {
                            await supabase.from('contacts').update({ lead_intelligence: intel }).eq('id', contact.id);
                        }
                    } catch (intelErr: any) {
                        console.error(`[AI_SECONDARY_FAILED] [${correlationId}] analyzeIntelligence falhou:`, intelErr.message || intelErr);
                    }
                }

                // 3. Notificação de Venda e Fechamento (Background)
                if ((newTag === 'COMPRADOR' || contact.ai_tag === 'COMPRADOR') && profile.sale_notifications_enabled && profile.notification_whatsapp) {
                    try {
                        const orderData = await AIService.extractOrderData([...formattedHistory, { role: 'assistant', content: reply }], profile.openai_api_key);
                        if (orderData) {
                            await NotificationService.sendSaleNotification(instanceName, orderData, phone, profile.notification_whatsapp);
                            const closingMsg = await AIService.generateClosingMessage(formattedHistory, aiConfig, profile.openai_api_key);
                            await MessageService.send(instance.id, remoteJid, closingMsg);
                        }
                    } catch (saleErr: any) {
                        console.error(`[AI_SECONDARY_FAILED] [${correlationId}] Processamento de venda/fechamento falhou:`, saleErr.message || saleErr);
                    }
                }
            } catch (err: any) {
                console.error(`[AI_SECONDARY_FAILED] [${correlationId}] Erro global na execução de background:`, err.message || err);
            }
        };

        // Dispara em background
        runSecondaryTasks().catch(err => {
            console.error(`[AI_SECONDARY_FAILED] [${correlationId}] Erro não tratado no runSecondaryTasks:`, err);
        });
    } catch (err: any) {
        console.error(`[WEBHOOK_JOB_FAILED] [${correlationId}] Erro no webhook:`, err);
        try {
            if (err?.message === 'OPENAI_QUOTA_EXCEEDED' || err?.message === 'OPENAI_INVALID_KEY') {
                const finalUserId = profile?.id || instance?.user_id;
                if (finalUserId) {
                    const status = err.message === 'OPENAI_QUOTA_EXCEEDED' ? 'insufficient_quota' : 'invalid_key';
                    await supabase.from('profiles').update({
                        openai_key_status: status,
                        openai_key_error_at: new Date().toISOString()
                    }).eq('id', finalUserId);
                    console.log(`[AIService] [${correlationId}] ⚠️ Status da chave OpenAI do usuário ${finalUserId} atualizado para: ${status}`);
                }
            }
        } catch (dbErr) {
            console.error(`[WEBHOOK_JOB_FAILED] [${correlationId}] Erro ao atualizar status da chave no perfil:`, dbErr);
        }
        throw err;
    }
}
