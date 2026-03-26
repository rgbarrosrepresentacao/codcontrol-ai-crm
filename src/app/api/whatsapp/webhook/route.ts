import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'
import { generateSpeech } from '@/lib/openai-tts'
import { logzzApi } from '@/lib/logzz'

// Função para extrair dados do pedido da conversa usando IA
async function extractOrderData(messages: any[], openaiKey: string): Promise<any> {
    try {
        const conversationText = messages.map(m => `${m.role === 'assistant' ? 'IA' : 'Cliente'}: ${m.content}`).join('\n')
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { 
                        role: 'system', 
                        content: `Você é um extrator de dados de pedidos. Sua tarefa é extrair os dados do cliente para preencher um formulário de entrega.
                        
                        REGRAS:
                        - Extraia: Nome Completo, CPF, CEP, Rua, Número, Bairro, Cidade, Estado.
                        - Deduza o Estado (ex: SP) pela Cidade se necessário.
                        - Identifique qual Produto o cliente quer (se houver mais de um, use o contexto).
                        - Retorne APENAS um JSON puro, sem markdown, no formato:
                        {
                            "name": "...",
                            "cpf": "...", 
                            "zipcode": "...",
                            "address": "...",
                            "number": "...",
                            "district": "...",
                            "city": "...",
                            "state": "...",
                            "product_name": "...",
                            "quantity": 1
                        }`
                    },
                    { role: 'user', content: `Extraia os dados desta conversa:\n\n${conversationText}` }
                ],
                temperature: 0,
                response_format: { type: 'json_object' }
            })
        })
        const data = await response.json()
        return JSON.parse(data.choices[0].message.content)
    } catch (err) {
        console.error('Erro ao extrair dados do pedido:', err)
        return null
    }
}

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
CANCELADO - Cliente desistiu explicitamente ou pediu para parar de receber mensagens (ex: "não quero", "pare de mandar", "não tenho interesse", "favor remover"). Isso silenciará as automações.

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

// ─── Funnel Execution Engine (Graph-based) ────────────────────────────────────
async function executeFunnelGraph(
    funnelId: string,
    startNodeId: string,
    instanceName: string,
    remoteJid: string,
    contactId: string,
    useHandle: string = 'default'
): Promise<void> {
    let currentNodeId: string | null = startNodeId
    let handle = useHandle

    while (currentNodeId) {
        const { data: node } = await supabase
            .from('funnel_steps').select('*').eq('id', currentNodeId).single() as { data: any }
        if (!node) break

        // Update position in DB
        await supabase.from('contacts').update({ funnel_current_node_id: currentNodeId, funnel_status: 'EM_ANDAMENTO' }).eq('id', contactId)

        // Execute the node
        if (node.node_type === 'delay') {
            const secs = node.node_data?.delay_seconds || node.delay_seconds || 5
            await new Promise(r => setTimeout(r, secs * 1000))
        } else if (node.node_type === 'text') {
            if (node.delay_seconds > 0) await new Promise(r => setTimeout(r, node.delay_seconds * 1000))
            const content = node.content || node.node_data?.content || ''
            if (content) await evolutionApi.sendTextMessage(instanceName, remoteJid, content)
        } else if (node.node_type === 'audio') {
            const url = node.content || node.node_data?.content || ''
            if (url) await evolutionApi.sendMedia(instanceName, remoteJid, url, 'audio')
        } else if (node.node_type === 'image') {
            const url = node.content || node.node_data?.content || ''
            if (url) await evolutionApi.sendMedia(instanceName, remoteJid, url, 'image', node.node_data?.caption || '')
        } else if (node.node_type === 'video') {
            const url = node.content || node.node_data?.content || ''
            if (url) await evolutionApi.sendMedia(instanceName, remoteJid, url, 'video', node.node_data?.caption || '')
        } else if (node.node_type === 'action') {
            const url = node.content || node.node_data?.url || ''
            const caption = node.node_data?.caption || ''
            if (url) await evolutionApi.sendTextMessage(instanceName, remoteJid, caption ? `${caption}\n${url}` : url)
        } else if (node.node_type === 'end') {
            const msg = node.content || node.node_data?.content || ''
            if (msg) await evolutionApi.sendTextMessage(instanceName, remoteJid, msg)
            await supabase.from('contacts').update({ funnel_status: 'FINALIZADO', funnel_lock_until: null, is_funnel_active: false }).eq('id', contactId)
            return
        } else if (node.node_type === 'condition' || node.node_type === 'start') {
            // condition and start just route to next node; condition pauses for client response
            if (node.node_type === 'condition') {
                await supabase.from('contacts').update({ funnel_status: 'PAUSADO', funnel_lock_until: null }).eq('id', contactId)
                return
            }
        }

        // If wait_for_reply — pause here and wait for client
        if (node.wait_for_reply) {
            await supabase.from('contacts').update({ funnel_status: 'PAUSADO', funnel_lock_until: null }).eq('id', contactId)
            return
        }

        // Find next node via edges (new visual builder)
        const { data: edge } = await supabase
            .from('funnel_edges')
            .select('target_node_id')
            .eq('source_node_id', currentNodeId)
            .eq('source_handle', handle)
            .maybeSingle() as { data: { target_node_id: string } | null }

        handle = 'default' // reset handle after first hop

        if (edge?.target_node_id) {
            currentNodeId = edge.target_node_id
        } else {
            // Fallback: try linear order_index (old funnels without edges)
            const { data: nextStep } = await supabase
                .from('funnel_steps')
                .select('id')
                .eq('funnel_id', funnelId)
                .eq('order_index', (node.order_index || 0) + 1)
                .maybeSingle()
            currentNodeId = nextStep?.id || null
        }
    }

    // No more nodes — funnel is done
    await supabase.from('contacts').update({ funnel_status: 'FINALIZADO', funnel_lock_until: null, is_funnel_active: false }).eq('id', contactId)
}

async function processWebhookInBackground(body: any) {
    try {
        // Ignora qualquer webhook que não seja recebimento/edição direta de mgs
        if (body.event && body.event !== 'messages.upsert') return

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
            last_message_at: new Date().toISOString(),
            // Reset follow-up stage every time the client responds so the rescue cycle
            // restarts from the beginning if they go silent again after engaging.
            followup_stage: 0
        }, { onConflict: 'user_id,whatsapp_id' })
        .select('id, ai_tag, current_funnel_id, funnel_step_order, is_funnel_active, wants_audio, active_campaign_id')
        .single()

        if (!contact) return
        const contactId = contact.id
        const currentAiTag = contact.ai_tag as AiTag | null
        let wantsAudio = contact.wants_audio
        let activeCampaignId = (contact as any).active_campaign_id

        // 4b. Detecção de Campanha (Multi-Produto)
        const { data: campaigns } = await supabase
            .from('campaigns')
            .select('*')
            .eq('user_id', userId)
            .eq('instance_id', instanceId)
            .eq('is_active', true)

        if (campaigns && campaigns.length > 0) {
            const matchedCampaign = campaigns.find(c => 
                textMessage.toLowerCase().includes(c.trigger_phrase.toLowerCase())
            )
            if (matchedCampaign) {
                console.log(`[Campaign] 🎯 Gatilho detectado: ${matchedCampaign.name} para o contato ${contactId}`)
                activeCampaignId = matchedCampaign.id
                await supabase.from('contacts').update({ active_campaign_id: activeCampaignId }).eq('id', contactId)
            }
        }

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

        // 8. FUNIL — State Machine com Anti-Duplicação e Execução por Grafo
        const funnelStatus = (contact as any).funnel_status || 'INATIVO'
        const currentNodeId = (contact as any).funnel_current_node_id as string | null
        const funnelLockUntil = (contact as any).funnel_lock_until as string | null
        const funnelId = contact.current_funnel_id

        // 8a. LOCK anti-duplicação: se outra thread já está executando, ignora
        if (funnelLockUntil && new Date(funnelLockUntil) > new Date()) {
            console.log(`[Funnel] Lock ativo até ${funnelLockUntil} — ignorando execução duplicada`)
            // Cai para IA responder normalmente
        }
        // 8b. Funil ativo e cliente respondeu → PAUSAR automaticamente, IA assume
        else if ((funnelStatus === 'EM_ANDAMENTO' || funnelStatus === 'INICIADO') && funnelId) {
            console.log(`[Funnel] Cliente respondeu enquanto funil estava ${funnelStatus}. Pausando.`)
            await supabase.from('contacts').update({ funnel_status: 'PAUSADO' }).eq('id', contactId)
            // Cai para IA com contexto do funil (ver seção 9)
        }
        // 8c. Funil pausado em nó de CONDIÇÃO → determinar caminho (sim/não) baseado em ai_tag
        else if (funnelStatus === 'PAUSADO' && currentNodeId && funnelId) {
            const { data: pausedNode } = await supabase.from('funnel_steps').select('node_type').eq('id', currentNodeId).maybeSingle()
            if (pausedNode?.node_type === 'condition') {
                // Detectar intenção do cliente para escolher caminho SIM ou NÃO
                const isPositive = /\b(sim|quero|pode|ok|vamos|vai|interesse|comprar|quero sim|aceito|combinado|topo)\b/i.test(textMessage) || (currentAiTag === 'POSSIVEL_COMPRADOR' || currentAiTag === 'INTERESSADO')
                const handle = isPositive ? 'yes' : 'no'
                console.log(`[Funnel] Condição respondida com handle: ${handle}`)
                const lock = new Date(Date.now() + 30000).toISOString()
                await supabase.from('contacts').update({ funnel_status: 'INICIADO', funnel_lock_until: lock }).eq('id', contactId)
                executeFunnelGraph(funnelId, currentNodeId, instanceName, remoteJid, contactId, handle).catch(console.error)
                return
            }
            // Funil pausado em wait_for_reply → retomar a partir do próximo nó
            if (funnelId && currentNodeId) {
                const lock = new Date(Date.now() + 30000).toISOString()
                await supabase.from('contacts').update({ funnel_status: 'INICIADO', funnel_lock_until: lock }).eq('id', contactId)
                // Find next node via edges
                const { data: nextEdge } = await supabase.from('funnel_edges').select('target_node_id').eq('source_node_id', currentNodeId).eq('source_handle', 'default').maybeSingle()
                if (nextEdge?.target_node_id) {
                    executeFunnelGraph(funnelId, nextEdge.target_node_id, instanceName, remoteJid, contactId).catch(console.error)
                    return
                }
                // Fallback linear: find next by order_index
                const { data: curNode } = await supabase.from('funnel_steps').select('order_index').eq('id', currentNodeId).maybeSingle()
                const { data: nextStep } = await supabase.from('funnel_steps').select('id').eq('funnel_id', funnelId).eq('order_index', (curNode?.order_index || 0) + 1).maybeSingle()
                if (nextStep?.id) {
                    executeFunnelGraph(funnelId, nextStep.id, instanceName, remoteJid, contactId).catch(console.error)
                    return
                }
            }
        }
        // 8d. Sem funil ativo → tentar ativar funil padrão (primeiro contato)
        else if (funnelStatus === 'INATIVO' && !funnelId) {
            const { data: defaultFunnel } = await supabase
                .from('funnels').select('id')
                .eq('user_id', userId).eq('is_active', true).eq('is_default', true).maybeSingle()

            if (defaultFunnel) {
                // Find START node
                const { data: startNode } = await supabase
                    .from('funnel_steps').select('id')
                    .eq('funnel_id', defaultFunnel.id).eq('node_type', 'start').maybeSingle()
                
                // Fallback: first step by order_index if no start node
                const { data: firstStep } = !startNode ? await supabase
                    .from('funnel_steps').select('id')
                    .eq('funnel_id', defaultFunnel.id).order('order_index', { ascending: true }).limit(1).maybeSingle() : { data: null }

                const firstNodeId = startNode?.id || firstStep?.id
                if (firstNodeId) {
                    const lock = new Date(Date.now() + 30000).toISOString()
                    await supabase.from('contacts').update({
                        current_funnel_id: defaultFunnel.id,
                        funnel_status: 'INICIADO',
                        funnel_current_node_id: firstNodeId,
                        funnel_lock_until: lock,
                        is_funnel_active: true,
                        funnel_step_order: 0,
                    }).eq('id', contactId)
                    executeFunnelGraph(defaultFunnel.id, firstNodeId, instanceName, remoteJid, contactId).catch(console.error)
                    return // IA não responde na primeira mensagem se funil ativado
                }
            }
        }
        // 8e. Funil FINALIZADO → apenas a IA responde (não toca no funil)


        // 9. Configuração de IA - Bloqueio de segurança (Apenas assinantes ou trial ativo)
        if (profile && !profile.is_admin && profile.stripe_subscription_status !== 'active' && profile.stripe_subscription_status !== 'trialing') {
            const hasTrialActive = profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()
            if (!hasTrialActive) {
                console.log(`[Webhook] 🚫 IA BLOQUEADA para o usuário ${userId}: Sem assinatura ativa e sem trial vigente.`)
                return
            }
        }

        let { data: aiConfigs } = await supabase.from('ai_configurations').select('*').eq('user_id', userId).eq('instance_id', instanceId).eq('is_active', true).limit(1)
        let aiConfig = aiConfigs?.[0]
        if (!aiConfig) {
            const { data: glob } = await supabase.from('ai_configurations').select('*').eq('user_id', userId).is('instance_id', null).eq('is_active', true).limit(1)
            aiConfig = glob?.[0]
        }
        if (!aiConfig || !profile?.openai_api_key) return

        // 9a. Sobrescrever Prompt se houver campanha ativa
        if (activeCampaignId && campaigns) {
            const currentCampaign = campaigns.find(c => c.id === activeCampaignId)
            if (currentCampaign) {
                console.log(`[Campaign] 🗣️ Usando prompt da campanha: ${currentCampaign.name}`)
                aiConfig.system_prompt = currentCampaign.system_prompt
                aiConfig.bot_name = currentCampaign.name // Opcional: assume o nome da campanha se desejar
            }
        }

        // ─── Knowledge Base: busca mídias cadastradas e filtra por campanha ──────
        let knowledgeQuery = supabase
            .from('ai_knowledge')
            .select('id, name, description, media_url, media_type, campaign_id')
            .eq('user_id', userId)

        // Se houver campanha ativa, busca itens daquela campanha OU itens gerais (campaign_id is null)
        if (activeCampaignId) {
            knowledgeQuery = knowledgeQuery.or(`campaign_id.eq.${activeCampaignId},campaign_id.is.null`)
        } else {
            knowledgeQuery = knowledgeQuery.is('campaign_id', null)
        }

        const { data: knowledgeItems } = await knowledgeQuery

        // Monta o bloco de contexto de conhecimento para o prompt
        let knowledgeContext = ''
        if (knowledgeItems && knowledgeItems.length > 0) {
            const list = knowledgeItems.map(k =>
                `  - ID:${k.id} | Tipo:${k.media_type} | Nome:"${k.name}" | Quando enviar: "${k.description}"`
            ).join('\n')
            knowledgeContext = `

── MÍDIAS DISPONÍVEIS (USE COM SABEDORIA) ──
Você tem acesso às seguintes mídias para enviar ao cliente:
${list}

REGRAS DE USO:
- Inclua o código [SEND_MEDIA:ID_AQUI] no FINAL da sua resposta SOMENTE se o momento for propício baseado na descrição da mídia.
- Use APENAS UM envio por resposta, no máximo.
- NÃO force o envio desnecessariamente. Só envie se o cliente pedir para ver o produto, demonstrar interesse genuíno ou se a descrição da mídia se encaixar naturalmente no momento da conversa.
- O código [SEND_MEDIA:ID] será removido automaticamente da mensagem. O cliente NÃO verá isso.
- NUNCA mencione o código em voz alta ou explique que vai enviar um arquivo antes — apenas envie de forma natural.`
        }

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
        // Funnel context for IA — lets the AI know the current funnel state
        const curFunnelStatus = (contact as any).funnel_status || 'INATIVO'
        const curNodeId = (contact as any).funnel_current_node_id as string | null
        let funnelContext = ''
        if (curFunnelStatus === 'PAUSADO' && curNodeId) {
            const { data: curNode } = await supabase.from('funnel_steps').select('node_type, content, order_index').eq('id', curNodeId).maybeSingle()
            if (curNode) {
                funnelContext = `\n\n[CONTEXTO DO FUNIL: O cliente está em um fluxo de vendas automatizado. Última etapa enviada: tipo=${curNode.node_type}, conteúdo="${(curNode.content || '').slice(0, 80)}". O funil está PAUSADO aguardando a resposta dele. Continue a conversa naturalmente com base no funil, sem repetir o que já foi enviado. Se ele demonstrar forte interesse, conduza para o fechamento.]`
            }
        } else if (curFunnelStatus === 'FINALIZADO') {
            funnelContext = '\n\n[CONTEXTO: O funil automático já foi concluído. Continue a conversa normalmente e conduza para o fechamento se houver interesse.]'
        }
        // Build humanity guard block — prevents bot-like responses
        const canSendAudio = aiConfig.audio_enabled && wantsAudio
        const audioCapabilityNote = canSendAudio
            ? '- Você TEM a capacidade de enviar mensagens de voz/áudio. Se o cliente pedir um áudio, confirme que vai mandar e prossiga normalmente.'
            : '- Você só envia mensagens de texto nesta conversa.'

        const humanityRules = `

── REGRAS ABSOLUTAS DE IDENTIDADE (NUNCA VIOLE) ──
- Você é ${aiConfig.bot_name}, uma pessoa real da equipe de vendas. NUNCA diga que é uma "IA", "inteligência artificial", "bot", "robô", "assistente virtual" ou qualquer variação disso.
- Se o cliente perguntar se você é humano ou robô, responda de forma natural como uma vendedora real faria (ex: "Sou humana sim! Tô aqui pra te ajudar 😊").
- NUNCA use frases robóticas como: "Em que posso ajudá-lo hoje?", "Posso ajudá-lo com mais alguma coisa?", "Processando sua solicitação", "Como posso ser útil?", "Entendo sua preocupação".
- Seja espontânea, informal e humana. Use contrações, emojis e um tom de conversa real.
${audioCapabilityNote}`

        const systemMessage = {
            role: 'system' as const,
            content: `[DATA E HORA: ${currentDate}]\n\n${aiConfig.system_prompt}\n\nTom: ${aiConfig.tone}.${logisticsHint || ''}${funnelContext}${knowledgeContext}${humanityRules}`
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
        let botReply: string = gptData.choices[0].message.content

        // ─── Smart Media: detecta e processa [SEND_MEDIA:ID] ──────────────────────
        let mediaTriggerItem: typeof knowledgeItems extends (infer T)[] | null ? T | null : null = null
        if (knowledgeItems && knowledgeItems.length > 0) {
            const mediaTagMatch = botReply.match(/\[SEND_MEDIA:([a-zA-Z0-9\-]+)\]/)
            if (mediaTagMatch) {
                const mediaId = mediaTagMatch[1].trim()
                mediaTriggerItem = knowledgeItems.find(k => k.id === mediaId) || null
                // Remove o código invisível da mensagem ANTES de enviar ao cliente
                botReply = botReply.replace(/\s*\[SEND_MEDIA:[a-zA-Z0-9\-]+\]/g, '').trim()
                console.log(`[Knowledge] 🎯 Mídia detectada: ID=${mediaId} | Encontrada: ${!!mediaTriggerItem}`)
            }
        }

        // Classificação
        const newAiTag = await classifyContact([...chatMessages, { role: 'assistant', content: botReply }], profile.openai_api_key)
        if (newAiTag) await supabase.from('contacts').update({ ai_tag: newAiTag }).eq('id', contactId)

        // 1. Tentar criar pedido na Logzz se configurado
        const shouldTryLogzz = newAiTag === 'PEDIDO_FECHADO' || botReply.toLowerCase().includes('pedido') || botReply.toLowerCase().includes('concluido')

        if (shouldTryLogzz) {
            try {
                const { data: logzzConfig } = await supabase.from('logzz_configurations').select('*').eq('user_id', userId).eq('is_active', true).single()
                
                if (logzzConfig?.api_key) {
                    console.log('[Logzz] 🔍 Detectado possível fechamento. Iniciando extração de dados...')
                    const orderData = await extractOrderData([...chatMessages, { role: 'assistant', content: botReply }], profile.openai_api_key)
                    
                    if (orderData) {
                        console.log(`[Logzz] 🧠 Dados extraídos: Nome=${orderData.name}, CPF=${orderData.cpf}, CEP=${orderData.zipcode}`)
                        
                        const { data: mappings } = await supabase.from('logzz_products').select('*').eq('user_id', userId)
                        
                        // Busca mapeamento exato
                        let mapping = mappings?.find(m => 
                            orderData.product_name?.toLowerCase().includes(m.product_name_crm?.toLowerCase()) ||
                            m.product_name_crm?.toLowerCase().includes(orderData.product_name?.toLowerCase())
                        )

                        // Se não achar mapeamento, mas o usuário tiver apenas UM produto cadastrado, usa ele como fallback
                        if (!mapping && mappings && mappings.length === 1) {
                            console.log(`[Logzz] 🏷️ Mapeamento exato não encontrado, usando fallback do único produto cadastrado: ${mappings[0].product_name_crm}`)
                            mapping = mappings[0]
                        }

                        if (mapping && orderData.name && orderData.cpf && orderData.zipcode) {
                            try {
                                await logzzApi.createOrder(logzzConfig.api_key, {
                                    name: orderData.name,
                                    email: orderData.email || 'nao@informado.com',
                                    cpf_cnpj: (orderData.cpf || '').replace(/[^0-9]/g, ''),
                                    phone: phone.replace(/[^0-9]/g, ''),
                                    zip_code: (orderData.zipcode || '').replace(/[^0-9]/g, ''),
                                    address: orderData.address || '',
                                    number: orderData.number || 'S/N',
                                    neighborhood: orderData.district || '',
                                    city: orderData.city || '',
                                    state: orderData.state || '',
                                    payment_method: 'delivery_payment',
                                    items: [{
                                        product_id: mapping.logzz_product_code,
                                        quantity: Number(orderData.quantity) || 1,
                                        price: mapping.price || undefined
                                    }]
                                })
                                console.log(`[Logzz] ✅ SUCESSO! Pedido gerado para ${orderData.name}`)
                            } catch (apiErr: any) {
                                console.error('[Logzz] ❌ Erro na API (External Sales):', apiErr.message)
                            }
                        } else {
                            console.warn('[Logzz] ⚠️ Dados insuficientes:', { 
                                hasMapping: !!mapping, 
                                hasName: !!orderData.name, 
                                hasCPF: !!orderData.cpf, 
                                hasCEP: !!orderData.zipcode 
                            })
                        }
                    }
                }
            } catch (err) {
                console.error('[Logzz] Erro no fluxo automático:', err)
            }
        }

        // Se for fechamento, manda a mensagem de despedida e encerra o webhook aqui
        if (newAiTag === 'PEDIDO_FECHADO') {
            const closeMsg = await generateClosingMessage(chatMessages, aiConfig, profile.openai_api_key)
            await evolutionApi.sendTextMessage(instanceName, remoteJid, closeMsg)
            return
        }

        // Resposta Padrão (Voz ou Texto) se não for fechamento
        const typingTime = Math.min(Math.max(botReply.length * 50, 2000), 10000)
        if (botReply) { // Só entra se houver texto após o processamento das tags
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
        }

        // ─── Smart Media: envia a mídia após a mensagem de texto ─────────────────
        if (mediaTriggerItem) {
            try {
                // Aguarda 1.5s para parecer que a vendedora está buscando o arquivo
                await new Promise(r => setTimeout(r, 1500))
                const mType = mediaTriggerItem.media_type as 'image' | 'video' | 'document'
                await evolutionApi.sendMedia(instanceName, remoteJid, mediaTriggerItem.media_url, mType)
                console.log(`[Knowledge] ✅ Mídia enviada: ${mediaTriggerItem.name}`)
            } catch (mediaErr: any) {
                // Erro na mídia nunca deve quebrar a conversa principal
                console.error('[Knowledge] ❌ Erro ao enviar mídia:', mediaErr.message)
            }
        }

        // Salvar Resposta no Banco
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
