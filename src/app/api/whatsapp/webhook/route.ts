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
    messages: { role: 'assistant' | 'user', content: string }[],
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

PEDIDO_FECHADO - Cliente confirmou a compra OU enviou dados pessoais para entrega (nome completo, endereço, CEP, CPF, telefone)
POSSIVEL_COMPRADOR - Cliente demonstrou interesse mas quer comprar depois, em outro dia ou pediu para entrar em contato mais tarde
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
    messages: { role: 'assistant' | 'user', content: string }[],
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

Escreva UMA mensagem curta (2-4 linhas) que:
1. Agradeça o cliente pelo pedido
2. Confirme que o pedido foi anotado
3. Informe que em breve a equipe entrará em contato com mais detalhes
4. Use emojis discretos para soar mais pessoal
5. Seja caloroso mas profissional

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
            }, {
                onConflict: 'user_id,whatsapp_id',
                ignoreDuplicates: false
            })
            .select('id, ai_tag')
            .single()

        const contactId = contact?.id || null
        const currentAiTag = contact?.ai_tag as AiTag | null

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
                role: m.role ? 'assistant' : 'user' as 'assistant' | 'user',
                content: m.content || ''
            }))

        // ====================================================
        // BLOCO DE HANDOFF: Se o contato já foi fechado anteriormente, IA não responde mais
        // ====================================================
        if (currentAiTag === 'PEDIDO_FECHADO') {
            console.log(`[HANDOFF] Contato ${contactId} está com tag PEDIDO_FECHADO. IA silenciada — aguardando humano.`)
            return
        }

        const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

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
                    {
                        role: 'system',
                        content: `[DATA E HORA ATUAL DO SISTEMA: ${currentDate}]\n\n${aiConfig.system_prompt}\n\nAja no tom de conversa: ${aiConfig.tone}.\nResponda em: ${aiConfig.language}. Você é o assistente ${aiConfig.bot_name}.\n\nREGRA ABSOLUTA DE COMPORTAMENTO HUMANO: Seja extremamente humano, direto e informal. Não envie mensagens robóticas, não use listas exageradas e não escreva textos muito longos (máximo 2-3 frases curtas por mensagem). Aja como uma pessoa comum digitando no WhatsApp de forma rápida e casual.`
                    },
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

            await evolutionApi.sendPresence(instanceName, remoteJid, 'composing')
            await new Promise(resolve => setTimeout(resolve, 2000))
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

        // 8. Enviar a resposta normal via Evolution API
        await evolutionApi.sendPresence(instanceName, remoteJid, 'composing')
        await new Promise(resolve => setTimeout(resolve, 3000))
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
