import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'
import { generateSpeech } from '@/lib/openai-tts'

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
            return `[SISTEMA INTERNO: O cliente quer saber o PREÇO. Informe os valores conforme seu prompt e pergunte de qual LOCALIDADE ele é para você verificar a disponibilidade de entrega.]`
        }

        // --- 2. DETECÇÃO DE ONDE ATENDE ---
        const asksWhere = /\b(onde|quais|lista|cidades|regiões|regioes|atende|atendimento|entrega|locais|áreas|areas)\b/i.test(normalizedInput)
        if (asksWhere && normalizedInput.length < 50) {
            const areaNames = rules.map(r => r.name).join(', ')
            return `[SISTEMA INTERNO: O cliente quer saber as áreas atendidas. Seus locais cadastrados são: ${areaNames}. Informe e peça a LOCALIDADE para validar a rua dele especificamente.]`
        }

        // --- 3. VALIDAÇÃO REAL (CEP ou Cidade) ---
        const cleanInput = normalizedInput.replace(/[^a-z0-9]/g, '')
        const isPotentialZip = /^[0-9]{5,8}$/.test(cleanInput)

        for (const rule of rules) {
            if (rule.type === 'zipcode' && isPotentialZip) {
                const zips = rule.content.split(/[,\n]/).map((i: string) => i.toLowerCase().trim().replace(/[^a-z0-9]/g, ''))
                if (zips.some((zip: string) => cleanInput.includes(zip))) {
                    return `[SISTEMA: O CEP informado (${input}) é ATENDIDO. Confirme a entrega e peça o que faltar (Nome, CPF ou Endereço). Se já tiver tudo, apenas prossiga.]`
                }
            } else if (rule.type === 'city') {
                const cityItems = rule.content.split(/[,\n]/).map((i: string) => i.toLowerCase().trim())
                if (cityItems.some((city: string) => normalizedInput.includes(city))) {
                    return `[SISTEMA: A LOCALIDADE informada (${input}) é ATENDIDA. Informe sobre a entrega conforme seu prompt e peça o CEP para validar a rua específica se ainda não tiver.]`
                }
            }
        }

        // --- 4. TENTATIVA DE LOCALIZAÇÃO FORA DA LISTA ---
        const isLocationAttempt = isPotentialZip || /\b(moro em|sou de|meu cep|moro no|moro na)\b/i.test(normalizedInput)
        if (isLocationAttempt) {
            return `[SISTEMA: Essa localização informada NÃO está na lista de atendimento prioritário. Informe as opções de envio/venda disponíveis para essa região baseando-se estritamente no seu prompt principal.]`
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

PEDIDO_FECHADO - O cliente enviou ABSOLUTAMENTE TODOS os dados para o envio: 1) Nome Completo, 2) CPF (11 dígitos), 3) CEP e 4) Endereço Completo (Rua, Número, Bairro e Cidade). Se falta QUALQUER um desses itens, NÃO classifique como PEDIDO_FECHADO. Mantenha como INTERESSADO se ele estiver apenas tirando dúvidas ou POSSIVEL_COMPRADOR se ele estiver quase lá mas ainda não mandou os dados.
POSSIVEL_COMPRADOR - Cliente demonstrou forte interesse mas parou antes de mandar os dados, ou quer comprar depois.
INTERESSADO - Cliente apenas perguntou preço, frete, ou passou apenas o CEP para consulta. Ele ainda está na fase de negociação.
LEAD_FRIO - Cliente parou de responder ou não tem interesse real.
CANCELADO - Cliente desistiu explicitamente.

CRÍTICO: Nunca classifique como PEDIDO_FECHADO se o cliente mandou apenas o CEP. Ele PRECISA dos 4 itens acima (Nome, CPF, CEP, Endereço).

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
1. Agradeça o cliente pelo pedido e por confirmar os dados
2. Confirme o método de pagamento e entrega seguindo estritamente as instruções de: ${aiConfig.system_prompt}
3. Informe que em breve nossa equipe entrará em contato para os próximos passos
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

        if (!key || key.fromMe || !messageData) return

        const remoteJid = key.remoteJid
        if (remoteJid.endsWith('@g.us')) return

        const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '')
        const pushName = body.data?.pushName || null

        // 1. Instância e Usuário
        const { data: instanceRecord } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id')
            .eq('instance_name', instanceName.trim())
            .single()

        if (!instanceRecord) return
        const userId = instanceRecord.user_id
        const instanceId = instanceRecord.id

        // 2. Chave OpenAI e Perfil
        const { data: profile } = await supabase.from('profiles').select('openai_api_key, is_admin, trial_ends_at, stripe_subscription_status').eq('id', userId).single()
        
        // 3. Extração de Conteúdo (Texto, Transcrição ou Vision)
        let textMessage = messageData.conversation || messageData.extendedTextMessage?.text || messageData.imageMessage?.caption

        if (!textMessage && messageData.audioMessage && profile?.openai_api_key) {
            try {
                const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond'
                const mediaRes = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY || '' },
                    body: JSON.stringify({ message: body.data, convertToMp4: false })
                })
                if (mediaRes.ok) {
                    const mediaData = await mediaRes.json()
                    const base64Audio = mediaData.base64 || mediaData.base64Data || mediaData.data
                    if (base64Audio) {
                        const audioBuffer = Buffer.from(base64Audio, 'base64')
                        const formData = new FormData()
                        formData.append('file', new File([audioBuffer as any], 'audio.ogg', { type: 'audio/ogg' }))
                        formData.append('model', 'whisper-1')
                        formData.append('language', 'pt')
                        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${profile.openai_api_key}` },
                            body: formData
                        })
                        if (whisperRes.ok) {
                            const whisperData = await whisperRes.json()
                            textMessage = whisperData.text
                        }
                    }
                }
            } catch (err) { console.error('Audio extraction error:', err) }
        }

        if (!textMessage && messageData.imageMessage && profile?.openai_api_key) {
             try {
                const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.codcontrolpro.bond'
                const mediaRes = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY || '' },
                    body: JSON.stringify({ message: body.data, convertToMp4: false })
                })
                if (mediaRes.ok) {
                    const mediaData = await mediaRes.json()
                    const base64Image = mediaData.base64 || mediaData.base64Data || mediaData.data
                    if (base64Image) {
                        const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${profile.openai_api_key}` },
                            body: JSON.stringify({
                                model: 'gpt-4o-mini',
                                messages: [
                                    { role: 'system', content: 'Você é um assistente de extração de dados. Extraia: Nome, CPF, Endereço e CEP.' },
                                    { role: 'user', content: [{ type: 'text', text: 'Extraia os dados:' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }] }
                                ],
                                max_tokens: 300
                            })
                        })
                        if (visionResponse.ok) {
                            const visionData = await visionResponse.json()
                            textMessage = `[VISION: ${visionData.choices[0].message.content}]`
                        }
                    }
                }
            } catch (err) { console.error('Vision extraction error:', err) }
        }

        if (!textMessage) return

        // 4. Salvar Contato no CRM
        const { data: contact } = await supabase.from('contacts').upsert({
            user_id: userId,
            instance_id: instanceId,
            whatsapp_id: remoteJid,
            phone: phone,
            push_name: pushName,
            name: pushName || phone,
            status: 'active',
            last_message_at: new Date().toISOString()
        }, { onConflict: 'user_id,whatsapp_id' })
        .select('id, ai_tag, current_funnel_id, funnel_step_order, is_funnel_active, wants_audio')
        .single()

        if (!contact) return
        const contactId = contact.id
        const currentAiTag = contact.ai_tag as AiTag | null
        let wantsAudio = contact.wants_audio

        const { data: conversation } = await supabase.from('conversations').upsert({
            user_id: userId,
            instance_id: instanceId,
            contact_id: contactId,
            status: 'open',
            last_message_at: new Date().toISOString()
        }, { onConflict: 'user_id,contact_id' })
        .select('id').single()

        const conversationId = conversation?.id || null

        // Incrementa contador de recebidas
        await supabase.rpc('increment_messages_received', { instance_id_param: instanceId })

        // 5. Salvar Mensagem
        if (conversationId) {
            await supabase.from('messages').insert({
                user_id: userId,
                conversation_id: conversationId,
                instance_id: instanceId,
                contact_id: contactId,
                message_id: key.id,
                from_me: false,
                content: textMessage,
                type: messageData.audioMessage ? 'audio' : 'text',
                status: 'delivered'
            })
            await supabase.from('conversations').update({ last_message: textMessage }).eq('id', conversationId)
        }

        // 6. Preferência de Áudio
        const audioKeywords = /\b(manda (á|a)udio|pode falar|prefiro (á|a)udio|n(ã|a)o sei ler|manda voz)\b/i
        if (messageData.audioMessage || (textMessage && audioKeywords.test(textMessage))) {
            if (!wantsAudio) {
                wantsAudio = true
                await supabase.from('contacts').update({ wants_audio: true }).eq('id', contactId)
            }
        }

        // 7. Verificação de Handoff (Pausa IA e Funil)
        if (currentAiTag && HANDOFF_TAGS.includes(currentAiTag)) return

        // 8. Funil de Vendas Automático
        let isInFunnel = contact.is_funnel_active === true
        let funnelId = contact.current_funnel_id
        let stepOrder = contact.funnel_step_order || 0

        // Ativa o funil padrão se o contato nunca entrou em nenhum
        if (!funnelId && !isInFunnel) {
            const { data: defaultFunnel } = await supabase
                .from('funnels')
                .select('id')
                .eq('user_id', userId)
                .eq('is_active', true)
                .eq('is_default', true)
                .maybeSingle()

            if (defaultFunnel) {
                isInFunnel = true
                funnelId = defaultFunnel.id
                stepOrder = 0
                await supabase.from('contacts').update({
                    is_funnel_active: true,
                    current_funnel_id: funnelId,
                    funnel_step_order: 0
                }).eq('id', contactId)
            }
        }

        if (isInFunnel && funnelId) {
            const { data: steps } = await supabase
                .from('funnel_steps')
                .select('*')
                .eq('funnel_id', funnelId)
                .order('order_index', { ascending: true })

            if (steps && steps.length > 0) {
                const pendingSteps = steps.filter(s => s.order_index >= stepOrder)
                
                for (const step of pendingSteps) {
                    // Delay antes de enviar cada passo
                    if (step.delay_seconds > 0) {
                        await new Promise(r => setTimeout(r, step.delay_seconds * 1000))
                    }

                    if (step.type === 'text') {
                        await evolutionApi.sendTextMessage(instanceName, remoteJid, step.content)
                    } else {
                        await evolutionApi.sendMedia(instanceName, remoteJid, step.content, step.type)
                    }

                    stepOrder = step.order_index + 1
                    
                    if (step.wait_for_reply) {
                        await supabase.from('contacts').update({ funnel_step_order: stepOrder }).eq('id', contactId)
                        return // Interrompe e aguarda a próxima resposta do cliente
                    }
                }
                
                // Se percorreu todos os passos, encerra o funil
                await supabase.from('contacts').update({ 
                    is_funnel_active: false,
                    funnel_step_order: stepOrder
                }).eq('id', contactId)
                return // A IA assumirá no próximo contato
            }
        }

        // 9. Configuração de IA
        if (profile && !profile.is_admin && profile.stripe_subscription_status !== 'active' && profile.stripe_subscription_status !== 'trialing') {
            if (profile.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) return
        }

        let { data: aiConfigs } = await supabase.from('ai_configurations').select('*').eq('user_id', userId).eq('instance_id', instanceId).eq('is_active', true).limit(1)
        let aiConfig = aiConfigs?.[0]
        if (!aiConfig) {
            const { data: glob } = await supabase.from('ai_configurations').select('*').eq('user_id', userId).is('instance_id', null).eq('is_active', true).limit(1)
            aiConfig = glob?.[0]
        }
        if (!aiConfig || !profile?.openai_api_key) return

        // Anti-atropelamento
        await new Promise(r => setTimeout(r, 7000))
        if (conversationId) {
            const { data: latest } = await supabase.from('messages').select('message_id').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(1).single()
            if (latest && latest.message_id !== key.id) return
        }

        // Prompt e IA
        const logisticsHint = await checkLogistics(userId, textMessage)
        const { data: history } = await supabase.from('messages').select('from_me, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20)
        const chatMessages = (history || []).reverse().map(m => ({
            role: (m.from_me ? 'assistant' : 'user') as any,
            content: m.content || ''
        }))

        const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        const systemMessage = {
            role: 'system' as const,
            content: `[DATA E HORA: ${currentDate}]\n\n${aiConfig.system_prompt}\n\nAja no tom: ${aiConfig.tone}.\nVocê é ${aiConfig.bot_name}.\n${logisticsHint || ''}`
        }

        const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${profile.openai_api_key}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [systemMessage, ...chatMessages],
                temperature: 0.8,
                max_tokens: 400
            })
        })

        if (!gptRes.ok) return
        const gptData = await gptRes.json()
        const botReply = gptData.choices[0].message.content

        // Classificação
        const newAiTag = await classifyContact([...chatMessages, { role: 'assistant', content: botReply }], profile.openai_api_key)
        if (newAiTag) await supabase.from('contacts').update({ ai_tag: newAiTag }).eq('id', contactId)

        if (newAiTag === 'PEDIDO_FECHADO') {
            const closeMsg = await generateClosingMessage(chatMessages, aiConfig, profile.openai_api_key)
            await evolutionApi.sendTextMessage(instanceName, remoteJid, closeMsg)
            return
        }

        // Resposta (Voz ou Texto)
        const typingTime = Math.min(Math.max(botReply.length * 50, 2000), 10000)
        if (aiConfig.audio_enabled && wantsAudio) {
            try {
                await evolutionApi.sendPresence(instanceName, remoteJid, 'recording')
                const audioB64 = await generateSpeech(botReply, aiConfig.voice_id || 'nova', profile.openai_api_key)
                await new Promise(r => setTimeout(r, Math.max(typingTime - 2000, 1000)))
                await evolutionApi.sendWhatsAppAudio(instanceName, remoteJid, audioB64)
            } catch (err) {
                await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply)
            }
        } else {
            await evolutionApi.sendPresence(instanceName, remoteJid, 'composing')
            await new Promise(resolve => setTimeout(resolve, typingTime))
            await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply)
        }

        // Salvar Resposta
        if (conversationId) {
            await supabase.from('messages').insert({
                user_id: userId, conversation_id: conversationId, instance_id: instanceId, contact_id: contactId,
                from_me: true, content: botReply, type: (aiConfig.audio_enabled && wantsAudio) ? 'audio' : 'text', ai_generated: true, status: 'sent'
            })
            await supabase.rpc('increment_messages_sent', { instance_id_param: instanceId })
        }

    } catch (error) {
        console.error('Webhook Error:', error)
    }
}
