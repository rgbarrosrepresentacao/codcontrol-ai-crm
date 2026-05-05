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

// Removido cache em memória instável, agora usamos last_message_id no banco para persistência total

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
    if (!key || key.fromMe || !messageData) return;

    const remoteJid = key.remoteJid;
    if (!remoteJid || remoteJid.endsWith('@g.us')) return;

    const isAudioMessage = !!(messageData.audioMessage || messageData.pttMessage);
    const rawText = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || '';
    const instanceName = body.instance;

    console.log(`[Webhook] 📩 Mensagem de ${remoteJid} na instância ${instanceName}`);

    try {
        // ── PASSO 1: Identificar Instância ──────────────────────────────
        const { data: instance, error: instanceErr } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id')
            .eq('instance_name', instanceName)
            .single();

        if (instanceErr || !instance) {
            console.log(`[Webhook Debug] Instance not found: ${instanceName}`);
            return;
        }

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

        if (profileErr || !profile) {
            console.log(`[Webhook Debug] Profile not found for userId: ${instance.user_id}`);
            return;
        }

        // ── PASSO 3: Verificar Acesso ──────────────────────────────────
        const access = GuardService.checkAccess(profile);
        if (!access.hasAccess) return;

        // ── PASSO 4: Extrair Texto da Mensagem ─────────────────────────
        const textMessage = await ProcessorService.extractMessageContent(body, instanceName, profile.openai_api_key);
        if (!textMessage) return;

        const phone = remoteJid.replace(/\D/g, '');
        const contact = await ContactService.upsert(profile.id, instance.id, remoteJid, phone, body.data?.pushName);
        if (!contact) return;

        // DEDUPLICAÇÃO PERSISTENTE (BANCO)
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
                console.log(`[Engine V2] ⚠️ Score ambíguo (${intentResult.confidence_score}). Mantendo neutro.`);
            }
        }

        // ── PASSO 8.1: Carregar Persona da Campanha (Fase 1) ────────────
        if (campaignId) {
            const { data: campData } = await supabase.from('campaigns').select('system_prompt').eq('id', campaignId).maybeSingle();
            if (campData) campaignPrompt = campData.system_prompt;
        }

        // ── PASSO 9: Orquestração de Funil ─────────────────────────────
        const funnelStatus = contact.funnel_status || 'INATIVO';
        const isFunnelActive = contact.is_funnel_active ?? false;

        console.log(`[WEBHOOK] Orchestrating funnel. Current status: ${funnelStatus}, Active: ${isFunnelActive}`);

        // ── REGRA DE OURO: PROTEÇÃO DE CONCORRÊNCIA ──────────────────────────
        // Se o motor está ativamente processando (EM_ANDAMENTO), ignoramos novas mensagens
        // para não interromper o fluxo automatizado ou causar race conditions.
        // Se estiver PAUSADO ou INATIVO, permitimos a passagem para retomada ou IA.
        if (isFunnelActive && funnelStatus === 'EM_ANDAMENTO') {
            console.log(`[WEBHOOK] 🛡️ Bloqueio de Concorrência: Motor em andamento para ${phone}. Ignorando entrada.`);
            return NextResponse.json({ success: true, status: 'processing_active_funnel' });
        }

        console.log(`[WEBHOOK] 🚥 Fluxo Liberado | Status: ${funnelStatus} | Active: ${isFunnelActive} | Contato: ${phone}`);

        let funnelJustStarted = false;

        // ── REGRA CENTRAL DE PROTEÇÃO ──────────────────────────────────────
        // Se o funil já foi FINALIZADO ou TRANSBORDADO, a IA assume o controle.
        // Nenhum bloco abaixo pode disparar novo funil automaticamente.
        const funnelIsLocked = (funnelStatus === 'FINALIZADO' || funnelStatus === 'TRANSBORDADO');
        if (funnelIsLocked) {
            console.log(`[WEBHOOK] 🔒 Funil bloqueado (status: ${funnelStatus}). IA assumirá a conversa com memória do funil.`);
        }

        // 1. Gatilho de Reinício via Campanha (Engine V2)
        // Se detectamos um produto com alta confiança, forçamos o reinício do funil específico ou default
        // PROTEÇÃO: Nunca reinicia se o funil já foi finalizado
        if (!funnelIsLocked && intentResult && intentResult.confidence_score >= 90 && (funnelStatus !== 'EM_ANDAMENTO' || intentResult.confidence_score >= 98)) {
            console.log(`[WEBHOOK] 🎯 Campanha detectada: "${intentResult.campaign_id}". Tentando iniciar funil correspondente.`);
            
            // Busca a campanha para pegar o nome
            const { data: campaign } = await supabase
                .from('campaigns')
                .select('name')
                .eq('id', intentResult.campaign_id)
                .single();

            if (campaign) {
                // Tenta encontrar um funil com o MESMO NOME da campanha
                let { data: targetFunnel } = await supabase
                    .from('funnels')
                    .select('*')
                    .eq('user_id', profile.id)
                    .ilike('name', campaign.name) // Case-insensitive match
                    .eq('is_active', true)
                    .maybeSingle();

                // Se não achou por nome, busca o default
                if (!targetFunnel) {
                    console.log(`[WEBHOOK] ⚠️ Nenhum funil encontrado com nome "${campaign.name}". Usando default.`);
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
                        console.log(`[WEBHOOK] 🔥 Disparando Funil: ${targetFunnel.name} (${targetFunnel.id})`);
                        await supabase.from('contacts').update({ 
                            is_funnel_active: true,
                            funnel_status: 'EM_ANDAMENTO',
                            current_funnel_id: targetFunnel.id
                        }).eq('id', contact.id);

                        // Inicia o funil em segundo plano para não travar o webhook
                        FunnelService.execute(targetFunnel.id, startNode.id, instanceName, remoteJid, contact.id, profile.id)
                            .catch(err => console.error('[WEBHOOK] Error executing funnel:', err));
                        
                        funnelJustStarted = true;
                    }
                }
            }
        }

        // 2. Fluxo de Retomada (Lead Respondeu uma Pergunta)
        if (funnelStatus === 'PAUSADO' && !funnelJustStarted) {
            console.log(`[WEBHOOK] 🔄 Retomando funil para ${phone}. Nó pausado: ${contact.funnel_current_node_id}`);
            
            const currentNodeId = contact.funnel_current_node_id;
            if (currentNodeId && contact.current_funnel_id) {
                const { data: pausedNode } = await supabase
                    .from('funnel_steps')
                    .select('*')
                    .eq('id', currentNodeId)
                    .single();

                if (pausedNode?.node_type === 'condition') {
                    // ANTES: passava textMessage bruto como handle (nunca batia com 'yes'/'no')
                    // AGORA: usa IA para converter a resposta do usuário em 'yes', 'no' ou 'unclear'
                    console.log(`[WEBHOOK] 🤖 Nó CONDITION pausado. Avaliando resposta com IA...`);
                    
                    let handle = 'default';
                    
                    if (profile.openai_api_key) {
                        const conditionLabel = pausedNode.node_data?.condition_label || 'O cliente demonstrou interesse?';
                        const evaluation = await AIService.evaluateCondition(
                            [{ role: 'user', content: textMessage }],
                            conditionLabel,
                            profile.openai_api_key
                        );

                        console.log(`[WEBHOOK] 🤖 Avaliação da condição: decision="${evaluation.decision}" confidence=${evaluation.confidence}% reason="${evaluation.reason}"`);

                        // Grava a resposta e decisão no log
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
                        } catch (logErr) {
                            console.error('[WEBHOOK] Error recording condition log:', logErr);
                        }

                        if (evaluation.decision === 'human') {
                            // Transborda para humano — não continua no funil
                            await supabase.from('contacts').update({ funnel_status: 'TRANSBORDADO', is_funnel_active: false }).eq('id', contact.id);
                            console.log(`[WEBHOOK] 🆘 Cliente pediu humano. Funil TRANSBORDADO.`);
                            // Cai no bloco da IA abaixo para responder normalmente
                        } else if (evaluation.confidence >= 70 && (evaluation.decision === 'yes' || evaluation.decision === 'no')) {
                            // Confiança suficiente — usa o handle 'yes' ou 'no' para seguir o caminho correto
                            handle = evaluation.decision;
                        } else {
                            // Resposta ambígua — verifica quantas vezes consecutivas isso aconteceu
                            console.log(`[WEBHOOK] ⚠️ Resposta ambígua (${evaluation.decision} / ${evaluation.confidence}%). Deixando IA responder.`);
                            
                            // CORREÇÃO BUG #2: Conta tentativas ambíguas consecutivas no log
                            const { count: ambiguousCount } = await supabase
                                .from('funnel_execution_logs')
                                .select('*', { count: 'exact', head: true })
                                .eq('contact_id', contact.id)
                                .eq('node_id', currentNodeId)
                                .eq('node_type', 'condition')
                                .not('customer_response', 'is', null);

                            if ((ambiguousCount || 0) >= 3) {
                                // Após 3 tentativas sem resposta clara, finaliza o funil e deixa a IA assumir
                                console.log(`[WEBHOOK] 🔒 3 tentativas ambíguas consecutivas. Finalizando funil e liberando IA.`);
                                await supabase.from('contacts').update({
                                    funnel_status: 'FINALIZADO',
                                    is_funnel_active: false,
                                }).eq('id', contact.id);
                                // Cai para a IA responder abaixo
                            }
                            // handle permanece 'default' — a IA responde abaixo
                        }
                    }

                    if (handle === 'yes' || handle === 'no') {
                        // Avança pelo caminho correto da condição
                        FunnelService.execute(contact.current_funnel_id, currentNodeId, instanceName, remoteJid, contact.id, profile.id, handle)
                            .catch(err => console.error('[WEBHOOK] Erro ao retomar condição:', err));
                        return NextResponse.json({ received: true, funnel: 'resumed_condition', handle });
                    }
                    // Se handle ainda for 'default' (ambíguo ou transbordado), cai para a IA responder

                } else {
                    // Nó era 'text' com wait_for_reply=true — usuário respondeu, avançamos para o PRÓXIMO nó
                    const nextNodeId = await FunnelService.getNextNodeId(contact.current_funnel_id, currentNodeId);
                    console.log(`[WEBHOOK] ▶️ Avançando do nó "${pausedNode?.node_type}" para: ${nextNodeId || 'FIM'}`);
                    
                    if (nextNodeId) {
                        // Grava log de avanço simples
                        try {
                            await supabase.from('funnel_execution_logs').insert({
                                user_id: profile.id,
                                contact_id: contact.id,
                                funnel_id: contact.current_funnel_id,
                                node_id: currentNodeId,
                                node_type: pausedNode?.node_type || 'text',
                                customer_response: textMessage
                            });
                        } catch (logErr) {
                            console.error('[WEBHOOK] Error recording advance log:', logErr);
                        }

                        FunnelService.execute(contact.current_funnel_id, nextNodeId, instanceName, remoteJid, contact.id, profile.id)
                            .catch(err => console.error('[WEBHOOK] Erro ao avançar funil:', err));
                        return NextResponse.json({ received: true, funnel: 'advanced_next' });
                    } else {
                        // Não há próximo nó — funil chegou ao fim
                        await supabase.from('contacts').update({
                            funnel_status: 'FINALIZADO',
                            is_funnel_active: false,
                        }).eq('id', contact.id);
                        console.log(`[WEBHOOK] 🏁 Não há próximo nó após wait_for_reply. Funil FINALIZADO.`);
                        // Cai para a IA responder abaixo
                    }
                }
            }
        }

        // CORREÇÃO BUG #3: Detectar funil travado em EM_ANDAMENTO (erro fatal anterior)
        // Só atua se o contato estiver em EM_ANDAMENTO há mais de 5 minutos (timeout)
        const lastUpdate = new Date(contact.updated_at).getTime();
        const now = new Date().getTime();
        const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60);

        if (funnelStatus === 'EM_ANDAMENTO' && minutesSinceUpdate > 5 && !funnelJustStarted) {
            console.log(`[WEBHOOK] 🚨 Funil travado em EM_ANDAMENTO detectado (>5min). Finalizando para liberar IA.`);
            await supabase.from('contacts').update({
                funnel_status: 'FINALIZADO',
                is_funnel_active: false,
            }).eq('id', contact.id);
        }

        // 3. Início de Funil Padrão (Novos Contatos / Contatos Inativos)
        // PROTEÇÃO: Nunca inicia se o funil já foi finalizado
        if (!funnelIsLocked && !isFunnelActive && (funnelStatus === 'INATIVO') && !funnelJustStarted) {
            const { data: defFunnel } = await supabase.from('funnels').select('*').eq('user_id', profile.id).eq('is_default', true).eq('is_active', true).maybeSingle();
            
            if (defFunnel) {
                const { data: startNode } = await supabase.from('funnel_steps').select('id').eq('funnel_id', defFunnel.id).eq('node_type', 'start').maybeSingle();
                
                if (startNode) {
                    console.log(`[WEBHOOK] 🚀 Iniciando Funil Default para novo contato: ${phone}`);
                    await supabase.from('contacts').update({ 
                        is_funnel_active: true,
                        funnel_status: 'EM_ANDAMENTO',
                        current_funnel_id: defFunnel.id
                    }).eq('id', contact.id);

                    FunnelService.execute(defFunnel.id, startNode.id, instanceName, remoteJid, contact.id, profile.id)
                        .catch(err => console.error('[WEBHOOK] Error starting default funnel:', err));
                    
                    funnelJustStarted = true;
                }
            }
        }

        // Se o funil acabou de começar, encerramos o processamento deste webhook aqui
        if (funnelJustStarted) {
            return NextResponse.json({ success: true, funnel: 'initiated' });
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

        // ── PASSO 10.2: Memória do Funil (NOVO) ──────────────────────
        let funnelSummary = '';
        if (contact.current_funnel_id) {
            funnelSummary = await FunnelService.getFunnelSummary(contact.current_funnel_id, contact.id) || '';
        }

        let reply = await AIService.generateResponse(formattedHistory, aiConfig, profile.openai_api_key, knowledgeContext, customLeadContext, campaignPrompt, funnelSummary);
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
