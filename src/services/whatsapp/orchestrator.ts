import { getSupabaseAdmin } from '@/lib/supabase-admin';
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

export async function processWebhook(body: any) {
    const supabase = getSupabaseAdmin();
    const messageData = body.data?.message;
    const key = body.data?.key;
    if (!key || key.fromMe || !messageData) return;

    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid.endsWith('@g.us')) return;

    const isAudioMessage = !!(messageData.audioMessage || messageData.pttMessage);
    const rawText = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || '';
    const instanceName = body.instance;

    console.log(`[Webhook] 📩 Mensagem de ${remoteJid} na instância ${instanceName}`);

    try {
        const { data: instance, error: instanceErr } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id, provider_type')
            .eq('instance_name', instanceName)
            .single();

        const isMetaProvider = instance?.provider_type === 'META';

        if (instanceErr || !instance) {
            console.log(`[Webhook Debug] Instance not found: ${instanceName}`);
            return;
        }

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

        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', instance.user_id)
            .single();

        if (profileErr || !profile) {
            console.log(`[Webhook Debug] Profile not found for userId: ${instance.user_id}`);
            return;
        }

        const access = GuardService.checkAccess(profile);
        if (!access.hasAccess) return;

        const textMessage = await ProcessorService.extractMessageContent(body, instanceName, profile.openai_api_key);
        if (!textMessage) return;

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
            type: isAudioMessage ? 'audio' : 'text'
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

        const waitTime = 12000;
        await new Promise(r => setTimeout(r, waitTime));

        const { data: lockResult, error: lockError } = await supabase
            .from('contacts')
            .update({ last_message_id: `HANDLED_${key.id}` })
            .eq('id', contact.id)
            .eq('last_message_id', key.id)
            .select('id')
            .single();

        if (lockError || !lockResult) return;

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
        if (!reply) return;

        const { item: mediaItem, cleanReply } = KnowledgeService.detectMediaTrigger(reply, knowledgeItems);
        reply = cleanReply;

        const canSendAudio = !!(aiConfig.audio_enabled && wantsAudio);

        if (canSendAudio) {
            try {
                const typingTime = Math.min(Math.max(reply.length * 50, 2000), 10000);
                const hasLink = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi.test(reply);
                if (hasLink) {
                    await MessageService.send(instance.id, remoteJid, reply);
                    await new Promise(r => setTimeout(r, 1500));
                }
                if (!isMetaProvider) {
                    await evolutionApi.sendPresence(instanceName, remoteJid, 'recording');
                    await new Promise(r => setTimeout(r, Math.max(typingTime - 3000, 1500)));
                } else {
                    await new Promise(r => setTimeout(r, Math.max(typingTime - 1000, 2000)));
                }
                const audioB64 = await generateSpeech(cleanTextForAudio(reply), aiConfig.voice_id || 'nova', profile.openai_api_key);
                await MessageService.sendAudio(instance.id, remoteJid, audioB64);

                await supabase.from('messages').insert({
                    user_id: profile.id,
                    conversation_id: conversationId,
                    instance_id: instance.id,
                    contact_id: contact.id,
                    from_me: true,
                    content: reply,
                    type: 'audio',
                    status: 'sent',
                    ai_generated: true
                });
            } catch (err) {
                await MessageService.send(instance.id, remoteJid, reply);
                await supabase.from('messages').insert({ user_id: profile.id, conversation_id: conversationId, instance_id: instance.id, contact_id: contact.id, from_me: true, content: reply, type: 'text', status: 'sent', ai_generated: true });
            }
        } else {
            const messageBlocks = reply.split('\n\n').filter(block => block.trim().length > 0);
            for (const [index, block] of messageBlocks.entries()) {
                const chunkTypingTime = Math.min(Math.max(block.length * 40, 1500), 6000);
                if (!isMetaProvider) {
                    await evolutionApi.sendPresence(instanceName, remoteJid, 'composing');
                }
                await new Promise(r => setTimeout(r, chunkTypingTime));
                await MessageService.send(instance.id, remoteJid, block.trim());
                await supabase.from('messages').insert({
                    user_id: profile.id,
                    conversation_id: conversationId,
                    instance_id: instance.id,
                    contact_id: contact.id,
                    from_me: true,
                    content: block.trim(),
                    type: 'text',
                    status: 'sent',
                    ai_generated: true
                });
                if (index < messageBlocks.length - 1) {
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        }

        if (mediaItem) {
            await KnowledgeService.sendMedia(instance.id, remoteJid, mediaItem, profile.id, conversationId, contact.id);
        }

        const newTag = await AIService.classifyContact(formattedHistory, profile.openai_api_key);
        if (newTag) {
            await supabase.from('contacts').update({ ai_tag: newTag }).eq('id', contact.id);
            const RELEVANCE_REGEX = /(valor|preço|quanto|custo|frete|prazo|entrega|comprar|link|pix|cartão|boleto|caro|desconto|garantia|golpe|mentira|funciona)/i;
            if (RELEVANCE_REGEX.test(textMessage) || RELEVANCE_REGEX.test(reply)) {
                const updatedIntelligence = await AIService.analyzeIntelligence(
                    [...formattedHistory, { role: 'assistant', content: reply }],
                    profile.openai_api_key,
                    contact.lead_intelligence
                );
                if (updatedIntelligence) {
                    await supabase.from('contacts').update({ lead_intelligence: updatedIntelligence }).eq('id', contact.id);
                }
            }

            if (newTag === 'COMPRADOR' && profile.sale_notifications_enabled && profile.notification_whatsapp) {
                const orderData = await AIService.extractOrderData([...formattedHistory, { role: 'assistant', content: reply }], profile.openai_api_key);
                if (orderData) {
                    await NotificationService.sendSaleNotification(instanceName, orderData, phone, profile.notification_whatsapp);
                    const closingMsg = await AIService.generateClosingMessage(formattedHistory, aiConfig, profile.openai_api_key);
                    await MessageService.send(instance.id, remoteJid, closingMsg);
                }
            }
        }
    } catch (err: any) {
        console.error('❌ Erro no webhook:', err);
    }
}
