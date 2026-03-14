import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'

// Usamos um cliente do Supabase com Service Role Key para ignorar RLS nesta rota de background e poder buscar os dados do usuário
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Etiquetas disponíveis para classificação de contatos
const AI_TAGS = ['PEDIDO_FECHADO', 'POSSIVEL_COMPRADOR', 'INTERESSADO', 'LEAD_FRIO', 'CANCELADO'] as const
type AiTag = typeof AI_TAGS[number]

// Função para checar logística (CEP ou Cidade)
async function checkLogistics(userId: string, input: string): Promise<string | null> {
    try {
        // Busca as regras de logística do usuário
        const { data: rules } = await supabase
            .from('logistics_rules')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)

        if (!rules || rules.length === 0) return null

        const normalizedInput = input.toLowerCase().trim()
        
        // --- 1. DETECÇÃO DE PREÇO/VALOR (Prioridade) ---
        // Se o cliente quer saber o valor, não deixamos a IA achar que "valor" é uma cidade
        const isAskingPrice = /\b(valor|preço|preco|quanto|custo|preçinho|precinho|promoção|promocao|kit|kits|pagar|pagamento)\b/i.test(normalizedInput)
        if (isAskingPrice && !/[0-9]/.test(normalizedInput)) {
            return `[SISTEMA INTERNO: O cliente quer saber o PREÇO. Informe os valores conforme seu prompt e pergunte de qual CIDADE ele é para você verificar se o motoboy consegue levar na porta.]`
        }

        // --- 2. DETECÇÃO DE ONDE ATENDE ---
        const asksWhere = /\b(onde|quais|lista|cidades|regiões|regioes|atende|atendimento|entrega|locais|áreas|areas)\b/i.test(normalizedInput)
        if (asksWhere && normalizedInput.length < 50) {
            const areaNames = rules.map(r => r.name).join(', ')
            return `[SISTEMA INTERNO: O cliente quer saber as áreas atendidas. Seus locais cadastrados são: ${areaNames}. Informe e peça a CIDADE para validar o CEP da rua dele especificamente.]`
        }

        // --- 3. VALIDAÇÃO REAL (CEP ou Cidade) ---
        const cleanInput = normalizedInput.replace(/[^a-z0-9]/g, '')
        const isPotentialZip = /^[0-9]{5,8}$/.test(cleanInput)

        for (const rule of rules) {
            if (rule.type === 'zipcode' && isPotentialZip) {
                const zips = rule.content.split(/[,\n]/).map((i: string) => i.toLowerCase().trim().replace(/[^a-z0-9]/g, ''))
                if (zips.some((zip: string) => cleanInput.includes(zip))) {
                    return `[SISTEMA: O CEP informado ESTÁ na lista. CONFIRME que o entregador leva na casa dela e ela paga apenas na porta! Peça o endereço completo.]`
                }
            } else if (rule.type === 'city') {
                const cityItems = rule.content.split(/[,\n]/).map((i: string) => i.toLowerCase().trim())
                // Checa se o nome de alguma cidade cadastrada está na mensagem do cliente
                if (cityItems.some((city: string) => normalizedInput.includes(city))) {
                    return `[SISTEMA: A CIDADE informada (${input}) ESTÁ na lista. Avise que o motoboy entrega na porta e ela paga ao receber. Peça o CEP para finalizar!]`
                }
            }
        }

        // --- 4. TENTATIVA DE LOCALIZAÇÃO FORA DA LISTA ---
        const isLocationAttempt = isPotentialZip || /\b(moro em|sou de|meu cep|moro no|moro na)\b/i.test(normalizedInput)
        if (isLocationAttempt) {
            return `[SISTEMA: Essa localização informada NÃO está na lista de motoboy próprio. Diga educadamente que para essa região o pagamento na entrega não está disponível, mas que você pode enviar via Correios com pagamento antecipado.]`
        }

        // Se não for nada relacionado ao fluxo de logística, retornamos null para a Camila seguir o prompt normal (preço, dúvidas, etc)
        return null
    } catch (err) {
        console.error('Erro ao checar logística:', err)
        return null
    }
}

// Tags que pausam a IA e transferem para atendimento humano
const HANDOFF_TAGS = ['PEDIDO_FECHADO', 'HUMANO']

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const eventType = (body.event || body.eventType || '').toLowerCase()
        console.log(`[Webhook] Event: ${eventType} | Instance: ${body.instance}`)

        // Validar se é uma mensagem nova (suporta messages.upsert e MESSAGES_UPSERT)
        if (eventType !== 'messages.upsert' && eventType !== 'messages_upsert') {
            return NextResponse.json({ success: true, reason: 'ignored_event', event: eventType })
        }

        // Inicia processamento em background (Assíncrono) para liberar a Evolution API e evitar repetições
        processWebhookInBackground(body).catch(err => {
            console.error('Erro CRÍTICO no processamento do webhook:', err)
        })

        // Retorna status 200 IMEDIATAMENTE (Nenhuma mensagem em loop mais)
        return NextResponse.json({ success: true, status: 'processing_background' })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// Classifica o contato com base no histórico de conversa usando a IA
async function classifyContact(
    messages: { role: 'assistant' | 'user' | 'system', content: string }[],
    openaiKey: string
): Promise<AiTag | null> {
    try {
        const conversationText = messages
            .slice(-20) // Últimas 20 mensagens para classificar
            .map(m => `${m.role === 'user' ? 'Cliente' : 'IA'}: ${m.content}`)
            .join('\n')

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um classificador de leads de vendas. Analise a conversa e classifique o cliente em UMA das categorias abaixo. Responda APENAS com a etiqueta, nada mais.

PEDIDO_FECHADO - Cliente JÁ ENVIOU TODOS OS DADOS COMPLETOS (nome da rua, número, bairro, cidade, CEP, etc) e FINALIZOU a compra. ATENÇÃO MÁXIMA: Se o cliente apenas informou o CEP perguntando se tem entrega ou valor de frete, ele AINDA NÃO é pedido fechado (mantenha como INTERESSADO). O pedido só é fechado quando o cliente aceita e passa os dados reais de entrega da casa dele.
POSSIVEL_COMPRADOR - Cliente demonstrou forte interesse mas quer comprar depois, em outro dia ou pediu para entrar em contato mais tarde
INTERESSADO - Cliente apenas perguntou preço, como funciona, tirou dúvidas, sem confirmar compra e sem dados de entrega
LEAD_FRIO - Cliente parou de responder, não demonstrou interesse real ou encerrou a conversa sem avançar
CANCELADO - Cliente desistiu da compra, cancelou pedido ou pediu para não ser mais contatado

Responda APENAS com uma dessas palavras: PEDIDO_FECHADO, POSSIVEL_COMPRADOR, INTERESSADO, LEAD_FRIO ou CANCELADO`
                    },
                    {
                        role: 'user',
                        content: `Classifique esta conversa:\n\n${conversationText}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 20
            })
        })

        if (!response.ok) return null
        const data = await response.json()
        const tag = data.choices[0].message.content.trim().toUpperCase() as AiTag
        return AI_TAGS.includes(tag) ? tag : null
    } catch {
        return null
    }
}

// Gera mensagem de agradecimento/encerramento profissional ao fechar pedido
async function generateClosingMessage(
    messages: { role: 'assistant' | 'user' | 'system', content: string }[],
    aiConfig: any,
    openaiKey: string
): Promise<string> {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Você é ${aiConfig.bot_name}. ${aiConfig.system_prompt}

TAREFA: O cliente acabou de confirmar o pedido e agora você vai encerrar o atendimento de forma calorosa e profissional.

Escreva UMA mensagem curta (2-4 linhas) que pareça muito natural:
1. Agradeça o cliente pelo pedido e confirmar os dados
2. Confirme que o pagamento só será feito na entrega do produto ao entregador
3. Informe que em breve nossa equipe humana entrará em contato via WhatsApp com o dia certinho de quem fará a entrega
4. Use emojis discretos para soar amigável e caloroso
5. Não faça perguntas, apenas encerre o assunto com excelência

NÃO faça perguntas. NÃO peça mais informações. Esta é a mensagem FINAL da IA.`
                    },
                    ...messages.slice(-10)
                ],
                temperature: 0.7,
                max_tokens: 200
            })
        })

        if (!response.ok) {
            return 'Obrigada pelo seu pedido! 🎉 Recebemos todas as informações e em breve nossa equipe entrará em contato com você. Qualquer dúvida, estamos à disposição! 💛'
        }
        const data = await response.json()
        return data.choices[0].message.content
    } catch {
        return 'Obrigada pelo seu pedido! 🎉 Recebemos todas as informações e em breve nossa equipe entrará em contato com você. Qualquer dúvida, estamos à disposição! 💛'
    }
}

async function processWebhookInBackground(body: any) {
    try {
        const messageData = body.data?.message
        const key = body.data?.key
        const instanceName = body.instance

        // Ignora mensagens enviadas pelo próprio robô (evitar loop infinito)
        if (!key || key.fromMe || !messageData) {
            return
        }

        const remoteJid = key.remoteJid // Número do cliente final

        // Ignora mensagens de grupos
        if (remoteJid.endsWith('@g.us')) {
            return
        }

        // Extrai número de telefone limpo
        const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '')
        const pushName = body.data?.pushName || null

        const { data: instanceRecord, error: instanceError } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id')
            .eq('instance_name', instanceName.trim())
            .single()

        if (instanceError || !instanceRecord) {
            console.error(`[Webhook] Instância não encontrada ou erro RLS: ${instanceName}`, instanceError)
            return
        }

        const userId = instanceRecord.user_id
        const instanceId = instanceRecord.id

        // 2. Salvar/Atualizar contato no CRM (buscando também ai_tag atual)
        const { data: contact } = await supabase
            .from('contacts')
            .upsert({
                user_id: userId,
                instance_id: instanceId,
                whatsapp_id: remoteJid,
                phone: phone,
                push_name: pushName,
                name: pushName,
                status: 'active',
                last_message_at: new Date().toISOString(),
                followup_stage: 0,
            }, {
                onConflict: 'user_id,whatsapp_id',
                ignoreDuplicates: false
            })
            .select('id, ai_tag, current_funnel_id, funnel_step_order, is_funnel_active')
            .single()

        const contactId = contact?.id || null
        const currentAiTag = contact?.ai_tag as AiTag | null
        let currentFunnelId = contact?.current_funnel_id
        let funnelStepOrder = contact?.funnel_step_order || 0
        let isFunnelActive = contact?.is_funnel_active || false

        // ── AUTO-ATIVAR FUNIL PADRÃO ──────────────────────────────────────
        // Se o contato não tem funil ativo, tentamos ativar o funil "Padrão"
        if (!isFunnelActive) {
            const { data: defaultFunnel } = await supabase
                .from('funnels')
                .select('id')
                .eq('user_id', userId)
                .eq('is_default', true)
                .eq('is_active', true)
                .single()
            
            if (defaultFunnel) {
                // Se já tinha um funil mas ele acabou, não reiniciamos automaticamente
                // para não prender o cliente num loop infinito.
                // Só ativamos se for a primeira vez nesse funil ou se as tags permitirem.
                if (currentFunnelId !== defaultFunnel.id) {
                    console.log(`[FUNIL] Ativando funil padrão ${defaultFunnel.id} para lead ${remoteJid}`)
                    currentFunnelId = defaultFunnel.id
                    funnelStepOrder = 0
                    isFunnelActive = true

                    await supabase.from('contacts').update({
                        current_funnel_id: currentFunnelId,
                        funnel_step_order: 0,
                        is_funnel_active: true
                    }).eq('id', contactId)
                }
            }
        }
        // ──────────────────────────────────────────────────────────────────

        // 3. Atualizar/Criar conversa no CRM
        let conversationId: string | null = null
        if (contactId) {
            const { data: conversation } = await supabase
                .from('conversations')
                .upsert({
                    user_id: userId,
                    instance_id: instanceId,
                    contact_id: contactId,
                    status: 'open',
                    last_message_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id,contact_id',
                    ignoreDuplicates: false
                })
                .select('id')
                .single()
            conversationId = conversation?.id || null
        }

        // 4. Buscar Configuração de IA e Dados do Trial
        const { data: profile } = await supabase.from('profiles').select('openai_api_key, is_admin, trial_ends_at, stripe_subscription_status').eq('id', userId).single()

        // Verifica o trial antes de permitir rodar a IA
        if (profile && !profile.is_admin && profile.stripe_subscription_status !== 'active' && profile.stripe_subscription_status !== 'trialing') {
            if (profile.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) {
                console.log(`[BLOQUEIO] Usuário ${userId} está com o Trial Vencido. IA não irá responder.`)
                return
            }
        }

        // Tenta buscar config específica desta instância
        let { data: aiConfigs } = await supabase
            .from('ai_configurations')
            .select('*')
            .eq('user_id', userId)
            .eq('instance_id', instanceId)
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(1)

        let aiConfig = aiConfigs && aiConfigs.length > 0 ? aiConfigs[0] : null

        // Se não achar específica, tenta a global
        if (!aiConfig) {
            const { data: globalConfigs } = await supabase
                .from('ai_configurations')
                .select('*')
                .eq('user_id', userId)
                .is('instance_id', null)
                .eq('is_active', true)
                .order('updated_at', { ascending: false })
                .limit(1)
            aiConfig = globalConfigs && globalConfigs.length > 0 ? globalConfigs[0] : null
        }

        if (!aiConfig || !profile?.openai_api_key) {
            return
        }

        // (Lógica de funil movida para após o anti-atropelamento para evitar duplicações)
        // ───────────────────────────────────────────────────────────────────────

        // 5. Extrai o texto da mensagem ou Transcreve áudio
        let textMessage =
            messageData.conversation ||
            messageData.extendedTextMessage?.text ||
            messageData.imageMessage?.caption

        // Se for áudio, vamos transcrever usando a Evolution API para descriptografar
        if (!textMessage && messageData.audioMessage) {
            console.log('Detectado mensagem de áudio, baixando via Evolution API...')
            try {
                const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond'
                const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''

                const mediaRes = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': EVOLUTION_KEY
                    },
                    body: JSON.stringify({ message: body.data, convertToMp4: false })
                })

                if (!mediaRes.ok) {
                    const err = await mediaRes.text()
                    console.error('Erro ao buscar mídia na Evolution:', err)
                } else {
                    const mediaData = await mediaRes.json()
                    const base64Audio = mediaData.base64 || mediaData.base64Data || mediaData.data

                    if (base64Audio) {
                        const audioBuffer = Buffer.from(base64Audio, 'base64')
                        const formData = new FormData()
                        const file = new File([audioBuffer as any], 'audio.ogg', { type: 'audio/ogg' })
                        formData.append('file', file)
                        formData.append('model', 'whisper-1')
                        formData.append('language', 'pt')

                        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${profile.openai_api_key}` },
                            body: formData
                        })

                        if (whisperResponse.ok) {
                            const whisperData = await whisperResponse.json()
                            textMessage = whisperData.text
                            console.log('Transcrição concluída:', textMessage)
                        } else {
                            const errorData = await whisperResponse.json()
                            console.error('Erro na transcrição Whisper:', errorData)
                        }
                    } else {
                        console.error('Base64 não encontrado na resposta da Evolution:', mediaData)
                    }
                }
            } catch (err) {
                console.error('Falha ao processar áudio:', err)
            }
        }

        if (!textMessage) {
            if (contactId && conversationId) {
                const msgType = messageData.audioMessage ? 'audio' : messageData.imageMessage ? 'image' : messageData.documentMessage ? 'document' : 'text'
                await supabase.from('messages').insert({
                    user_id: userId,
                    conversation_id: conversationId,
                    instance_id: instanceId,
                    contact_id: contactId,
                    message_id: key.id,
                    from_me: false,
                    content: '[mídia]',
                    type: msgType,
                    ai_generated: false,
                    status: 'delivered',
                })
                await supabase.rpc('increment_messages_received', { instance_id_param: instanceId })
            }
            return
        }

        // Salvar a mensagem recebida do cliente no CRM
        if (contactId && conversationId) {
            const msgType = messageData.audioMessage ? 'audio' : 'text'
            await supabase.from('messages').insert({
                user_id: userId,
                conversation_id: conversationId,
                instance_id: instanceId,
                contact_id: contactId,
                message_id: key.id,
                from_me: false,
                content: textMessage,
                type: msgType,
                ai_generated: false,
                status: 'delivered',
            })
            await supabase.from('conversations').update({
                last_message: textMessage,
                last_message_at: new Date().toISOString(),
            }).eq('id', conversationId)
            await supabase.rpc('increment_messages_received', { instance_id_param: instanceId })
        }

        // ====================================================
        // GAVETA DE ESPERA (ANTI-ATROPELAMENTO)
        // Aguarda 7 segundos para ver se o cliente vai enviar outra mensagem
        // ====================================================
        await new Promise(resolve => setTimeout(resolve, 7000))

        if (conversationId) {
            // Olha no banco se chegou alguma mensagem "mais nova"
            const { data: latestMessage } = await supabase
                .from('messages')
                .select('message_id')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            // Se a última mensagem não for esta (key.id), o cliente mandou mais coisa. Aborta esta resposta!
            if (latestMessage && latestMessage.message_id !== key.id) {
                console.log(`[ANTI-ATROPELAMENTO] Cliente enviou outra mensagem rápida (${phone}). Descartando resposta obsoleta.`)
                return
            }

            // ── LÓGICA DE FUNIL DE VENDAS (POS-VALIDAÇÃO) ──────────────────────
            // Agora que sabemos que esta é a mensagem mais recente, rodamos o funil
            if (isFunnelActive && currentFunnelId) {
                let currentOrder = funnelStepOrder
                let moreSteps = true

                while (moreSteps) {
                    const { data: step } = await supabase
                        .from('funnel_steps')
                        .select('*')
                        .eq('funnel_id', currentFunnelId)
                        .eq('order_index', currentOrder)
                        .single()

                    if (step) {
                        console.log(`[FUNIL] Enviando passo ${currentOrder} para ${remoteJid}`)
                        
                        if (step.type === 'text') {
                            await evolutionApi.sendTextMessage(instanceName, remoteJid, step.content)
                        } else {
                            await evolutionApi.sendMedia(instanceName, remoteJid, step.content, step.type)
                        }

                        currentOrder++

                        // Verifica o próximo passo
                        const { data: next } = await supabase
                            .from('funnel_steps')
                            .select('id, delay_seconds, wait_for_reply')
                            .eq('funnel_id', currentFunnelId)
                            .eq('order_index', currentOrder)
                            .single()
                        
                        if (!next) {
                            moreSteps = false
                            await supabase.from('contacts').update({ is_funnel_active: false }).eq('id', contactId)
                        } else if (next.wait_for_reply) {
                            moreSteps = false
                            await supabase.from('contacts').update({
                                funnel_step_order: currentOrder,
                                is_funnel_active: true,
                                ai_tag: null
                            }).eq('id', contactId)
                        } else if (next.delay_seconds > 0) {
                            await supabase.from('contacts').update({
                                funnel_step_order: currentOrder,
                                is_funnel_active: true
                            }).eq('id', contactId)
                            
                            console.log(`[FUNIL] Aguardando ${next.delay_seconds} segundos...`)
                            await new Promise(r => setTimeout(r, next.delay_seconds * 1000))

                            // TRAVA DE SEGURANÇA: Se durante o delay o cliente mandou mensagem nova, abortamos este loop antigo!
                            const { data: reCheck } = await supabase
                                .from('messages')
                                .select('message_id')
                                .eq('conversation_id', conversationId)
                                .order('created_at', { ascending: false })
                                .limit(1)
                                .single()

                            if (reCheck && reCheck.message_id !== key.id) {
                                console.log(`[FUNIL] Cliente interagiu durante o delay. Abortando fluxo antigo para priorizar o novo.`)
                                return
                            }
                        } else {
                            await supabase.from('contacts').update({
                                funnel_step_order: currentOrder,
                                is_funnel_active: true
                            }).eq('id', contactId)
                            await new Promise(r => setTimeout(r, 1500))
                        }
                    } else {
                        moreSteps = false
                        await supabase.from('contacts').update({ is_funnel_active: false }).eq('id', contactId)
                    }
                }
                return // Fim do funil, não roda a IA
            }
            // ──────────────────────────────────────────────────────────────────
        }

        // 6. Buscar histórico da conversa para dar memória à IA (Últimas 20 mensagens)
        const { data: history } = await supabase
            .from('messages')
            .select('role:from_me, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(20)

        const chatMessages = (history || [])
            .reverse()
            .map(m => ({
                role: (m.role ? 'assistant' : 'user') as 'assistant' | 'user' | 'system',
                content: m.content || ''
            }))

        // ====================================================
        // BLOCO DE HANDOFF: Se já está em modo humano (seja por qual motivo), IA não responde
        // ====================================================
        if (currentAiTag && HANDOFF_TAGS.includes(currentAiTag)) {
            console.log(`[HANDOFF] Contato ${contactId} está com tag ${currentAiTag}. IA silenciada — aguardando humano.`)
            return
        }

        const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

        // 6.5 Checar Logística Inteligente
        const logisticsHint = await checkLogistics(userId, textMessage)
        const systemMessage = {
            role: 'system' as const,
            content: `[DATA E HORA ATUAL DO SISTEMA: ${currentDate}]\n\n${aiConfig.system_prompt}\n\nAja no tom de conversa: ${aiConfig.tone}.\nResponda em: ${aiConfig.language}. Você é o assistente ${aiConfig.bot_name}.\n\nREGRA DE OURO LOGÍSTICA: Você SEMPRE deve pedir o CEP ou Cidade antes de prometer entrega programada ou pagamento na entrega. Se o sistema não te der um aviso de [ATENDIDO] ou [NÃO ATENDIDO] para a localização ATUAL, você NÃO sabe se atende. Nunca chute.\n\nREGRA ABSOLUTA DE COMPORTAMENTO HUMANO: Seja extremamente humano, direto e informal.`
        }

        if (logisticsHint) {
            // Injeta a dica de logística como uma instrução de SISTEMA para não confundir a IA como se fosse fala do cliente
            chatMessages.push({ role: 'system', content: logisticsHint })
        }

        // 7. Chamar a OpenAI para gerar a resposta da IA
        const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${profile.openai_api_key}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    systemMessage,
                    ...chatMessages
                ],
                temperature: 0.8,
                max_tokens: 400
            })
        })

        if (!openAiResponse.ok) {
            const gptError = await openAiResponse.json()
            console.error('Falha na OpenAI:', gptError)
            return
        }

        const gptData = await openAiResponse.json()
        const botReply = gptData.choices[0].message.content

        // ====================================================
        // CLASSIFICAÇÃO AUTOMÁTICA POR IA após gerar a resposta
        // ====================================================
        const allMessagesForClassification = [
            ...chatMessages,
            { role: 'user' as const, content: textMessage },
            { role: 'assistant' as const, content: botReply }
        ]

        const newAiTag = await classifyContact(allMessagesForClassification, profile.openai_api_key)
        console.log(`[TAG] Contato ${contactId} | Etiqueta: ${newAiTag}`)

        // Salva a nova etiqueta no banco de dados
        if (newAiTag && contactId) {
            await supabase.from('contacts').update({ ai_tag: newAiTag }).eq('id', contactId)
        }

        // ====================================================
        // SE O PEDIDO FOI FECHADO AGORA: Envia mensagem de agradecimento e para a IA
        // ====================================================
        if (newAiTag === 'PEDIDO_FECHADO') {
            console.log(`[PEDIDO_FECHADO] Gerando mensagem de encerramento para ${phone}`)

            const closingMessage = await generateClosingMessage(allMessagesForClassification, aiConfig, profile.openai_api_key)

            // Tempo de digitação dinâmico: 50ms por caractere (Min: 2s | Máx: 10s)
            const typingTimeMs = Math.min(Math.max(closingMessage.length * 50, 2000), 10000)

            await evolutionApi.sendPresence(instanceName, remoteJid, 'composing')
            await new Promise(resolve => setTimeout(resolve, typingTimeMs))
            await evolutionApi.sendTextMessage(instanceName, remoteJid, closingMessage)

            if (contactId && conversationId) {
                await supabase.from('messages').insert({
                    user_id: userId,
                    conversation_id: conversationId,
                    instance_id: instanceId,
                    contact_id: contactId,
                    from_me: true,
                    content: closingMessage,
                    type: 'text',
                    ai_generated: true,
                    status: 'sent',
                })
                await supabase.from('conversations').update({
                    last_message: closingMessage,
                    last_message_at: new Date().toISOString(),
                    status: 'closed', // Fecha a conversa no CRM
                }).eq('id', conversationId)
                await supabase.rpc('increment_messages_sent', { instance_id_param: instanceId })
            }

            console.log(`[HANDOFF] Conversa ${conversationId} encerrada pela IA. Aguardando atendimento humano.`)
            return
        }

        // 8. Enviar a resposta normal via Evolution API (com delay dinâmico)
        const typingTimeMs = Math.min(Math.max(botReply.length * 50, 2000), 12000) // Calcula entre 2 a 12 segundos

        await evolutionApi.sendPresence(instanceName, remoteJid, 'composing')
        await new Promise(resolve => setTimeout(resolve, typingTimeMs))
        await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply)

        // 9. Salvar a resposta da IA no CRM
        if (contactId && conversationId) {
            await supabase.from('messages').insert({
                user_id: userId,
                conversation_id: conversationId,
                instance_id: instanceId,
                contact_id: contactId,
                from_me: true,
                content: botReply,
                type: 'text',
                ai_generated: true,
                status: 'sent',
            })
            await supabase.from('conversations').update({
                last_message: botReply,
                last_message_at: new Date().toISOString(),
            }).eq('id', conversationId)
            await supabase.rpc('increment_messages_sent', { instance_id_param: instanceId })
        }

    } catch (error: any) {
        console.error('Webhook Error:', error)
    }
}
