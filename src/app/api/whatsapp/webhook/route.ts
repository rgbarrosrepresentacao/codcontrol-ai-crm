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
        const content = data.choices?.[0]?.message?.content
        if (!content) throw new Error('Resposta vazia da OpenAI')
        
        // Remove markdown se houver
        const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim()
        return JSON.parse(cleanContent)
    } catch (err: any) {
        console.error('[extractOrderData] ❌ Erro ao extrair dados:', err.message)
        return null
    }
}

// Envia alerta de venda fechada para o WhatsApp pessoal do dono da loja
async function sendSaleNotification(
    instanceName: string,
    orderData: any,
    phone: string,
    notifPhone: string
): Promise<void> {
    try {
        // Formata o número de destino para o padrão do Evolution API
        // Regra robusta: se tiver 10 ou 11 dígitos, adiciona 55 (Brasil)
        let digits = notifPhone.replace(/\D/g, '')
        if (digits.length === 10 || digits.length === 11) {
            digits = '55' + digits
        }
        const destination = `${digits}@s.whatsapp.net`
        console.log(`[SaleNotification] 🔍 Phone raw: ${notifPhone} | Digits: ${digits} | Destination: ${destination}`)

        // Monta a mensagem de alerta formatada
        const deliveryDate = orderData?.delivery_date ? `\n📅 *ENTREGA PARA:* ${orderData.delivery_date}` : ''
        const lines = [
            `🔔 *PEDIDO CONFIRMADO NO CHAT!*`,
            ``,
            deliveryDate,
            `👤 *CLIENTE:* ${orderData?.name || 'Não informado'}`,
            `📱 *TELEFONE:* ${phone}`,
            `📦 *PEDIDO:* ${orderData?.quantity || 1}x ${orderData?.product_name || 'Não identificado'}`,
            orderData?.address ? `📍 *ENDEREÇO:* ${orderData.address}${orderData?.number ? ', ' + orderData.number : ''}` : '',
            orderData?.district ? `🏘️ *BAIRRO:* ${orderData.district}` : '',
            orderData?.city ? `🏙️ *CIDADE:* ${orderData.city}${orderData?.state ? ' - ' + orderData.state : ''}` : '',
            orderData?.zipcode ? `📮 *CEP:* ${orderData.zipcode}` : '',
            orderData?.cpf ? `🪪 *CPF:* ${orderData.cpf}` : '',
        ].filter(Boolean)

        const message = lines.join('\n')
        console.log(`[SaleNotification] 📤 Tentando enviar para ${destination}...`)
        await evolutionApi.sendTextMessage(instanceName, destination, message)
        console.log(`[SaleNotification] ✅ Alerta enviado com sucesso para ${notifPhone}`)
    } catch (err: any) {
        // Nunca deixar um erro de notificação quebrar o fluxo principal
        console.error('[SaleNotification] ❌ Erro ao enviar alerta:', err.message)
    }
}

// Função para limpar o texto que vai para o áudio, evitando que a IA leia links estranhos
function cleanTextForAudio(text: string): string {
    // Regex para capturar URLs (http, https, www e domínios comuns como .com, .top, .bond, etc)
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|app|bond|shop|top|site|online|me|app)[^\s]*)/gi;
    
    // Se encontrar um link, substitui por uma frase amigável para o áudio
    return text.replace(urlRegex, 'o link que te mandei aqui no texto');
}

// Usamos um cliente do Supabase com Service Role Key para ignorar RLS nesta rota de background e poder buscar os dados do usuário
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Etiquetas Premium para o Funil de 8 Etapas
const AI_TAGS = ['NOVO_LEAD', 'EM_ATENDIMENTO', 'QUALIFICADO', 'INTERESSADO', 'PROPOSTA_ENVIADA', 'AGUARDANDO_RESPOSTA', 'FECHADO', 'PERDIDO'] as const
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

// Tags que pausam a IA e transferem para atendimento humano (ou encerram o ciclo)
const HANDOFF_TAGS = ['PEDIDO_FECHADO', 'FECHADO', 'PERDIDO', 'HUMANO']


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
                        content: `Você é um classificador de leads de vendas. Analise a conversa e classifique o cliente:
FECHADO - O cliente confirmou a compra e enviou ABSOLUTAMENTE TODOS os dados para o envio: 1) Nome Completo, 2) CPF, 3) CEP e 4) Endereço. Se falta QUALQUER dado, por menor que seja, NÃO marque como FECHADO ainda.
PROPOSTA_ENVIADA - Você (IA) acabou de enviar um link de pagamento, valores de kits ou uma oferta final para fechamento. 
INTERESSADO - O cliente demonstrou intenção CLARA de compra. Perguntou: "Como eu pago?", "Tem desconto?", "Aceita cartão?". Ele quer comprar, mas ainda não recebeu a oferta final ou link.
QUALIFICADO - O cliente entendeu como funciona, tirou as principais dúvidas e mostrou que tem o "problema" que o produto resolve. Perguntou sobre detalhes técnicos profundos.
EM_ATENDIMENTO - Conversa normal fluindo. Você está explicando o básico ou tirando dúvidas.
NOVO_LEAD - É a primeira interação do cliente.
AGUARDANDO_RESPOSTA - O cliente parou de responder após você fazer uma pergunta crucial ou disse que "vai ver depois".
PERDIDO - O cliente recusou o produto explicitamente ("não quero", "tá caro", "não tenho interesse"), pediu para não receber mais mensagens ou se tornou agressivo/rude.

Responda APENAS com uma dessas palavras: NOVO_LEAD, EM_ATENDIMENTO, QUALIFICADO, INTERESSADO, PROPOSTA_ENVIADA, AGUARDANDO_RESPOSTA, FECHADO, PERDIDO`
                    },
                    {
                        role: 'user',
                        content: `Classifique esta conversa considerando que a IA será BLOQUEADA permanentemente se você escolher FECHADO ou PERDIDO:\n\n${conversationText}`
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
        // Anti-stalling: check if contact is still in "EM_ANDAMENTO" or if a human paused it
        const { data: latestContact } = await supabase.from('contacts').select('funnel_status, is_funnel_active').eq('id', contactId).single()
        
        // Se o status for PAUSADO mas tivermos um handle, significa que estamos retomando de uma condição
        // Caso contrário, se estiver pausado externamente, interrompemos.
        if (latestContact?.funnel_status === 'PAUSADO' && handle === 'default') {
            console.log(`[Funnel] Execução interrompida: status=PAUSADO`)
            return
        }

        if (latestContact?.is_funnel_active === false) {
            console.log(`[Funnel] Execução interrompida: funil desativado`)
            return
        }

        const { data: node } = await supabase
            .from('funnel_steps').select('*').eq('id', currentNodeId).single() as { data: any }
        if (!node) break

        console.log(`[Funnel] Executando nó: ${node.node_type} (${currentNodeId})`)

        // Update position in DB
        await supabase.from('contacts').update({ funnel_current_node_id: currentNodeId, funnel_status: 'EM_ANDAMENTO' }).eq('id', contactId)

        // Execute the node with presence indicators and error safety
        try {
            if (node.node_type === 'delay') {
                const secs = node.node_data?.delay_seconds || node.delay_seconds || 5
                console.log(`[Funnel] Aguardando ${secs}s...`)
                await new Promise(r => setTimeout(r, secs * 1000))
            } else if (node.node_type === 'text') {
                await evolutionApi.sendPresence(instanceName, remoteJid, 'composing')
                const typingSecs = Math.min(Math.max((node.content?.length || 20) * 0.05, 2), 5)
                await new Promise(r => setTimeout(r, typingSecs * 1000))
                
                const content = node.content || node.node_data?.content || ''
                if (content) await evolutionApi.sendTextMessage(instanceName, remoteJid, content)
            } else if (node.node_type === 'audio') {
                await evolutionApi.sendPresence(instanceName, remoteJid, 'recording')
                // Realismo: espera o tempo de "gravação" proporcional ou fixo
                const recordingSecs = Math.min(Math.max((node.content?.length || 100) * 0.02, 3), 10)
                await new Promise(r => setTimeout(r, recordingSecs * 1000))
                
                const url = node.content || node.node_data?.content || ''
                if (url) {
                    try {
                        const mediaRes = await fetch(url)
                        if (mediaRes.ok) {
                            const buffer = await mediaRes.arrayBuffer()
                            const base64 = Buffer.from(buffer).toString('base64')
                            await evolutionApi.sendWhatsAppAudio(instanceName, remoteJid, base64)
                        } else {
                            await evolutionApi.sendMedia(instanceName, remoteJid, url, 'audio')
                        }
                    } catch (audioErr) {
                        console.error('[Funnel] Erro no áudio, tentando fallback:', audioErr)
                        await evolutionApi.sendMedia(instanceName, remoteJid, url, 'audio')
                    }
                }
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
                if (node.node_type === 'condition') {
                    // Se estivermos executando com 'default', precisamos parar e esperar o cliente responder.
                    // Se tivermos um 'handle' (yes/no), pulamos a execução e vamos direto para o próximo nó.
                    if (handle === 'default') {
                        console.log(`[Funnel] Nó de condição atingido. Pausando e aguardando resposta do cliente.`)
                        await supabase.from('contacts').update({ funnel_status: 'PAUSADO', funnel_lock_until: null }).eq('id', contactId)
                        return
                    } else {
                        console.log(`[Funnel] Processando handle '${handle}' para o nó de condição.`)
                    }
                }
            }

            // Intervalo de segurança entre blocos para evitar bloqueios/atropelamento
            await new Promise(r => setTimeout(r, 1500))

        } catch (execErr) {
            console.error(`[Funnel] Erro ao executar nó ${node.node_type}:`, execErr)
            // Não paramos o loop aqui para tentar o próximo nó se possível
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

        // ── BLAST OPT-OUT: Detecta pedidos de saída de disparos em massa ──────
        const rawText = body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || ''
        const OPT_OUT_REGEX = /^(sair|parar|stop|cancelar|nao quero|não quero|descadastrar|remover|bloquear|chega|para|pare)\s*[!.]*$/i
        if (OPT_OUT_REGEX.test(rawText.trim())) {
            const normalizedPhone = phone.replace(/\D/g, '')
            // Marca todos os contatos pendentes deste número como opted_out
            await supabase
                .from('blast_contacts')
                .update({ opted_out: true, opted_out_at: new Date().toISOString() })
                .eq('phone', normalizedPhone.startsWith('55') ? normalizedPhone : '55' + normalizedPhone)
                .eq('opted_out', false)

            console.log(`[BLAST OPT-OUT] ⛔ ${phone} pediu para sair. Marcado como opted_out.`)
            // Não interrompemos o fluxo — deixamos a IA responder normalmente se quiser
        }
        // ─────────────────────────────────────────────────────────────────────

        // 1. Instância e Usuário
        const { data: instanceRecord } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id')
            .eq('instance_name', instanceName)
            .single()

        if (!instanceRecord) return
        const userId = instanceRecord.user_id
        const instanceId = instanceRecord.id

        // 2. Busca o Perfil e Status de Assinatura
        const { data: profile } = await supabase.from('profiles')
            .select('openai_api_key, is_admin, stripe_subscription_status, trial_ends_at')
            .eq('id', userId)
            .single()
        
        console.log(`[Webhook] 📋 Perfil carregado para userId ${userId}: stripe_status=${profile?.stripe_subscription_status}, trial_ends_at=${profile?.trial_ends_at}, is_admin=${profile?.is_admin}`)
        
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

        // 3d. Fallbacks de conteúdo para disparar funis mesmo sem transcrição (p/ quem não usa IA ou IA falhou)
        if (!textMessage) {
            if (messageData.audioMessage) textMessage = '[Áudio]'
            else if (messageData.imageMessage) textMessage = '[Imagem]'
            else if (messageData.videoMessage) textMessage = '[Vídeo]'
            else if (messageData.stickerMessage) textMessage = '[Figurinha]'
            else if (messageData.documentMessage) textMessage = '[Documento]'
            else if (messageData.contactMessage || messageData.contactsArrayMessage) textMessage = '[Contato]'
            else if (messageData.locationMessage) textMessage = '[Localização]'
        }

        if (!textMessage) {
            console.log(`[Webhook] Mensagem ignorada: Tipo não suportado ou sem conteúdo para a instância ${instanceName}`)
            return
        }

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
        .select('id, ai_tag, current_funnel_id, funnel_step_order, is_funnel_active, wants_audio, active_campaign_id, funnel_status, funnel_current_node_id, funnel_lock_until')
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
            const normalize = (txt: string) => txt?.toLowerCase()?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()!]/g,"")?.replace(/\s{2,}/g," ")?.trim() || "";
            const normalizedMessage = normalize(textMessage);

            const scoredCampaigns = campaigns.map(c => {
                const normalizedTrigger = normalize(c.trigger_phrase);
                const normalizedName = normalize(c.name);
                let score = 0;

                // 1. Correspondência exata (Gatilho) — Pontuação Máxima
                if (normalizedMessage === normalizedTrigger) score += 1000;

                // 2. Mensagem contém o nome do produto/campanha — Alta Prioridade
                if (normalizedName.length > 3 && normalizedMessage.includes(normalizedName)) {
                    score += (normalizedName.length * 10);
                }

                // 3. Mensagem contém a frase de gatilho
                if (normalizedTrigger.length > 3 && normalizedMessage.includes(normalizedTrigger)) {
                    score += normalizedTrigger.length;
                }

                // 4. Sobreposição de palavras (Match Inteligente)
                const triggerWords = normalizedTrigger.split(' ').filter(w => w.length > 3);
                if (triggerWords.length > 0) {
                    const matchedWords = triggerWords.filter(word => normalizedMessage.includes(word));
                    const matchRatio = matchedWords.length / triggerWords.length;
                    if (matchRatio >= 0.7) {
                        score += (matchRatio * 50);
                    }
                }

                return { ...c, score };
            });

            // Ordena pelo melhor score (mais específico primeiro)
            const sortedCampaigns = scoredCampaigns
                .filter(c => c.score > 0)
                .sort((a, b) => b.score - a.score);

            const matchedCampaign = sortedCampaigns[0];

            if (matchedCampaign) {
                console.log(`[Campaign Match] 🎯 Melhor correspondência: "${matchedCampaign.name}" | Score: ${matchedCampaign.score}`)
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
            console.log(`[Funnel] Lock ativo até ${funnelLockUntil} — Abortando para evitar duplicidade`)
            return
        }
        // 8b. Funil ativo e cliente respondeu → PAUSAR automaticamente, IA assume
        else if ((funnelStatus === 'EM_ANDAMENTO' || funnelStatus === 'INICIADO') && funnelId) {
            console.log(`[Funnel] Cliente respondeu enquanto funil estava ${funnelStatus}. Pausando automação.`)
            await supabase.from('contacts').update({ funnel_status: 'PAUSADO', funnel_lock_until: null }).eq('id', contactId)
            // Agora a IA poderá responder no passo 9 porque o status mudou para PAUSADO
        }
        // 8c. Funil pausado em nó de CONDIÇÃO → determinar caminho (sim/não) baseado em ai_tag
        else if (funnelStatus === 'PAUSADO' && currentNodeId && funnelId) {
            const { data: pausedNode } = await supabase.from('funnel_steps').select('node_type').eq('id', currentNodeId).maybeSingle()
            if (pausedNode?.node_type === 'condition') {
                // Detectar intenção do cliente para escolher caminho SIM ou NÃO
                const isPositive = /\b(sim|quero|pode|ok|vamos|vai|interesse|comprar|quero sim|aceito|combinado|topo|gostei|manda|tenho interesse)\b/i.test(textMessage) || (currentAiTag === 'INTERESSADO' || currentAiTag === 'QUALIFICADO')
                const handle = isPositive ? 'yes' : 'no'
                console.log(`[Funnel] Condição respondida com handle: ${handle}`)
                const lock = new Date(Date.now() + 300000).toISOString() // 5 min lock
                await supabase.from('contacts').update({ funnel_status: 'INICIADO', funnel_lock_until: lock }).eq('id', contactId)
                executeFunnelGraph(funnelId, currentNodeId, instanceName, remoteJid, contactId, handle).catch(console.error)
                return
            }
            // Funil pausado em wait_for_reply → retomar a partir do próximo nó
            if (funnelId && currentNodeId) {
                const lock = new Date(Date.now() + 300000).toISOString() // 5 min lock
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
                    const lock = new Date(Date.now() + 300000).toISOString() // 5 min lock
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
        // 8e. Se o funil ainda está ativo e NÃO foi pausado acima, não deixamos a IA responder agora
        if (funnelStatus === 'INICIADO' || funnelStatus === 'EM_ANDAMENTO') {
            console.log(`[Funnel] Automação em curso (status: ${funnelStatus}). IA silenciada.`)
            return
        }


        // 9. Configuração de IA - Bloqueio de segurança (Apenas assinantes ou trial ativo)
        // Antes de prosseguir com a IA, pegamos o status MAES RECENTE do contato para evitar responder se um funil acabou de iniciar em background
        const { data: finalContactCheck } = await supabase.from('contacts').select('funnel_status, is_funnel_active, ai_tag').eq('id', contactId).single()
        if (finalContactCheck?.funnel_status === 'INICIADO' || finalContactCheck?.funnel_status === 'EM_ANDAMENTO') {
             console.log(`[Funnel] Bloqueio final de segurança: Funil reativado, abortando IA.`)
             return
        }

        const isTrialing = profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
        const stripeStatus = profile?.stripe_subscription_status || '';
        
        // REGRA DE ACESSO: Stripe ativa OU trial válido OU admin
        // Note: O webhook da Kiwify espelha o status na coluna stripe_subscription_status
        const activeStatuses = ['active', 'paid', 'aprovado', 'approved']
        const isPaid = activeStatuses.includes(stripeStatus.toLowerCase());

        console.log(`[Webhook] 🔍 Verificação de acesso userId=${userId}: stripeStatus=${stripeStatus}, isPaid=${isPaid}, isTrialing=${isTrialing}, is_admin=${profile?.is_admin}`)

        if (profile && !profile.is_admin && !isPaid && !isTrialing) {
            console.log(`[Webhook] 🚫 IA BLOQUEADA para userId=${userId}: Sem assinatura ativa e trial expirado.`)
            return
        }

        console.log(`[Webhook] ✅ Acesso LIBERADO para userId=${userId} (paid=${isPaid}, trial=${isTrialing}, admin=${profile?.is_admin}). Prosseguindo com IA...`)

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

        // ─── Knowledge Base: busca mídias cadastradas e filtra por instância/campanha ──────
        let knowledgeQuery = supabase
            .from('ai_knowledge')
            .select('id, name, description, media_url, media_type, campaign_id')
            .eq('user_id', userId)
            .or(`instance_id.eq.${instanceId},instance_id.is.null`)

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
            // Verifica no histórico quais mídias já foram enviadas para este contato
            const { data: sentMessages } = await supabase
                .from('messages')
                .select('content')
                .eq('contact_id', contactId)
                .like('content', '[MÍDIA ENVIADA:%')

            const sentMediaIds = new Set()
            sentMessages?.forEach(m => {
                const match = m.content?.match(/\[MÍDIA ENVIADA: ([a-f0-9-]+)/i)
                if (match) sentMediaIds.add(match[1])
            })

            const list = knowledgeItems.map(k => {
                const isSent = sentMediaIds.has(k.id)
                return `  - ID:${k.id} | Tipo:${k.media_type} | Nome:"${k.name}" | Já enviado: ${isSent ? 'SIM' : 'NÃO'} | Quando enviar: "${k.description}"`
            }).join('\n')

            knowledgeContext = `

── MÍDIAS DISPONÍVEIS (USE COM SABEDORIA) ──
Você tem acesso às seguintes mídias para enviar ao cliente:
${list}

REGRAS DE USO:
- Inclua o código [SEND_MEDIA:ID_AQUI] no FINAL da sua resposta SOMENTE se o momento for propício baseado na descrição da mídia.
- NUNCA envie a mesma mídia duas vezes para o mesmo cliente, a menos que ele peça para ver de novo explicitamente. Veja o campo "Já enviado" na lista acima.
- Se o cliente pedir um vídeo/demo que você já enviou, apenas mencione que ele pode ver as mensagens acima.
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
        const { data: history } = await supabase.from('messages').select('from_me, content, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20)
        const chatMessages = (history || []).reverse().map(m => ({
            role: (m.from_me ? 'assistant' : 'user') as any,
            content: m.content || ''
        }))

        // ─── LÓGICA DE TEMPERATURA E INTERAÇÃO (PREMIUM) ──────────────────
        let lead_temperature = 1 // 1: Frio, 2: Morno, 3: Quente
        let interaction_count = 0
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
        
        // Conta interações do cliente nos últimos 10 minutos
        const recentUserMsgs = history?.filter(m => !m.from_me && new Date(m.created_at || '') > tenMinutesAgo) || []
        interaction_count = recentUserMsgs.length

        // Se o cliente respondeu mais de 3 vezes em 10 min, é Lead Quente
        if (interaction_count >= 3) lead_temperature = 3
        else if (interaction_count >= 1) lead_temperature = 2
        // ──────────────────────────────────────────────────────────────────

        // ─── CONTEXTO TEMPORAL COMPLETO (Brasília) ─────────────────────────
        // Gera informações de data/hora ricas para que a IA nunca alucine datas
        const nowBrasilia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
        const diasSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
        const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
        const diaSemanaAtual = diasSemana[nowBrasilia.getDay()]
        const diaNumero = nowBrasilia.getDate()
        const mesNome = meses[nowBrasilia.getMonth()]
        const anoAtual = nowBrasilia.getFullYear()
        const horaFormatada = nowBrasilia.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
        
        // Calcula os próximos 7 dias para que a IA saiba calcular datas relativas
        const proximosDias: string[] = []
        for (let i = 1; i <= 7; i++) {
            const futuro = new Date(nowBrasilia)
            futuro.setDate(nowBrasilia.getDate() + i)
            const nomeDia = diasSemana[futuro.getDay()]
            const diaF = futuro.getDate()
            const mesF = meses[futuro.getMonth()]
            proximosDias.push(`${nomeDia} = dia ${diaF} de ${mesF}`)
        }

        const currentDate = `HOJE É ${diaSemanaAtual.toUpperCase()}, ${diaNumero} de ${mesNome} de ${anoAtual} | Hora atual: ${horaFormatada} (Horário de Brasília)

CALENDÁRIO DOS PRÓXIMOS 7 DIAS (use para calcular datas relativas como "amanhã", "próxima quarta", etc.):
${proximosDias.join('\n')}

⚠️ REGRA CRÍTICA DE DATAS: Quando o cliente pedir para agendar em um dia específico (ex: "próxima quarta"), calcule com base no CALENDÁRIO acima. NUNCA invente datas ou use meses errados. Se hoje é ${diaSemanaAtual}, use o calendário para encontrar o dia exato.`
        // ────────────────────────────────────────────────────────────────────
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
- REGRAS PARA LINKS: Se você enviar algum link de site ou checkout, o sistema enviará o texto automaticamente para o cliente conseguir clicar. No seu áudio, NUNCA soletre o link (ex: não diga "h-t-t-p-s..."). Apenas mencione que o link está enviado no texto logo abaixo para facilitar o acesso.
${audioCapabilityNote}`

        const systemMessage = {
            role: 'system' as const,
            content: `══════════════════════════════════════
📅 CONTEXTO DE TEMPO (OBRIGATÓRIO — LEIA ANTES DE RESPONDER):
${currentDate}
══════════════════════════════════════

${aiConfig.system_prompt}

Tom: ${aiConfig.tone}.${logisticsHint || ''}${funnelContext}${knowledgeContext}${humanityRules}`
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

        // Classificação e Atualização de Inteligência (PREMIUM)
        let newAiTag = await classifyContact([...chatMessages, { role: 'assistant', content: botReply }], profile.openai_api_key)
        const messageText = (body.data.message?.conversation || body.data.message?.extendedTextMessage?.text || '').toUpperCase();
        
        // Reforço: Se a palavra FECHADO estiver na mensagem, força a tag para garantir o alerta
        if (messageText.includes('FECHADO') && newAiTag !== 'FECHADO') {
            console.log(`[Webhook] ⚠️ Reforço manual: Palavra FECHADO detectada. Forçando tag para notificação.`);
            newAiTag = 'FECHADO';
        }
        console.log(`[Webhook] 🤖 Tag final para esta interação: ${newAiTag}`);
        
        // Sintetiza a última ação da IA (versão curta para o Kanban)
        const ai_last_action = botReply.length > 50 ? botReply.slice(0, 47) + '...' : botReply

        if (newAiTag) {
            const updateData: any = { 
                ai_tag: newAiTag,
                last_message_at: new Date().toISOString(),
                lead_temperature: lead_temperature,
                ai_last_action: ai_last_action,
                interaction_count: interaction_count
            }

            // Se mudou de etapa, atualiza o timestamp do funil
            if (newAiTag !== contact.ai_tag) {
                updateData.last_stage_change_at = new Date().toISOString()
            }

            // Agora seguro para atualizar: colunas já existem no Supabase
            await supabase.from('contacts').update(updateData).eq('id', contactId)
        }

        // 1. Tentar criar pedido na Logzz se configurado
        const shouldTryLogzz = newAiTag === 'FECHADO' || botReply.toLowerCase().includes('pedido') || botReply.toLowerCase().includes('concluido')

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

        // Se for fechamento, manda a mensagem de despedida E o alerta para o dono da loja
        if (newAiTag === 'FECHADO') {
            console.log(`[Webhook] 🎯 Venda detectada como FECHADO para o contato ${phone}`)
            
            // 1. Mensagem de encerramento para o cliente
            try {
                const closeMsg = await generateClosingMessage(chatMessages, aiConfig, profile.openai_api_key)
                await evolutionApi.sendTextMessage(instanceName, remoteJid, closeMsg)
                console.log(`[Webhook] ✅ Mensagem de despedida enviada ao cliente`)
            } catch (err) {
                console.error('[Webhook] ❌ Erro ao enviar despedida:', err)
            }

            // 2. Alerta de venda para o dono da loja (se configurado e ativo)
            try {
                console.log(`[SaleNotification] 🎯 Gatilho FECHADO detectado. Iniciando alerta...`)
                const { data: ownerProfile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single()

                if (profileError) {
                    console.error('[SaleNotification] ❌ Erro ao buscar perfil do dono:', profileError)
                } else if (ownerProfile?.sale_notifications_enabled && ownerProfile?.notification_whatsapp) {
                    console.log(`[SaleNotification] 🔔 Notificações ativas para ${ownerProfile.notification_whatsapp}. Extraindo dados...`)
                    
                    const finalOrderData = await extractOrderData(
                        [...chatMessages, { role: 'assistant', content: botReply }],
                        profile.openai_api_key
                    )
                    
                    console.log('[SaleNotification] 📦 Dados extraídos:', JSON.stringify(finalOrderData))

                    console.log('[SaleNotification] 🚀 Enviando mensagem de alerta...')
                    await sendSaleNotification(
                        instanceName,
                        finalOrderData,
                        ownerProfile.notification_whatsapp
                    )
                    console.log('[SaleNotification] ✅ Alerta enviado com sucesso!')
                } else {
                    console.log('[SaleNotification] ℹ️ Notificações desativadas ou número não configurado para este usuário.')
                }
            } catch (notifErr) {
                console.error('[SaleNotification] ❌ Erro crítico no fluxo de notificação:', notifErr)
            }

            return
        }

        // Resposta Padrão (Voz ou Texto) se não for fechamento
        const typingTime = Math.min(Math.max(botReply.length * 50, 2000), 10000)
        
        if (botReply) { 
            const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|app|bond|shop|top|site|online|me|app)[^\s]*)/gi;
            const hasLink = urlRegex.test(botReply);

            if (aiConfig.audio_enabled && wantsAudio) {
                try {
                    // Se houver link, enviamos o texto PRIMEIRO para garantir que seja clicável
                    if (hasLink) {
                        await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply);
                        // Pequena pausa para o áudio vir depois do texto
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    await evolutionApi.sendPresence(instanceName, remoteJid, 'recording')
                    const audioText = cleanTextForAudio(botReply);
                    const audioB64 = await generateSpeech(audioText, aiConfig.voice_id || 'nova', profile.openai_api_key)
                    
                    await new Promise(r => setTimeout(r, Math.max(typingTime - 3000, 1000)))
                    await evolutionApi.sendWhatsAppAudio(instanceName, remoteJid, audioB64)
                } catch (err) {
                    // Se o áudio falhar e já não tivermos enviado o texto (porque não tinha link), envia agora
                    if (!hasLink) {
                        await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply)
                    }
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
                // Verificação final de segurança: evita envio duplicado mesmo se a IA ignorar o prompt
                const { data: doubleCheck } = await supabase
                    .from('messages')
                    .select('id')
                    .eq('contact_id', contactId)
                    .eq('content', `[MÍDIA ENVIADA: ${mediaTriggerItem.id} | ${mediaTriggerItem.name}]`)
                    .maybeSingle()

                if (doubleCheck) {
                    console.log(`[Knowledge] 🚫 Bloqueio de segurança: Mídia ${mediaTriggerItem.id} já enviada anteriormente para este contato.`)
                } else {
                    // Aguarda 1.5s para parecer que a vendedora está buscando o arquivo
                    await new Promise(r => setTimeout(r, 1500))
                    const mType = mediaTriggerItem.media_type as 'image' | 'video' | 'document'
                    await evolutionApi.sendMedia(instanceName, remoteJid, mediaTriggerItem.media_url, mType)
                    console.log(`[Knowledge] ✅ Mídia enviada: ${mediaTriggerItem.name}`)

                    // Salva o registro da mídia no histórico para evitar repetições futuras
                    if (conversationId) {
                        await supabase.from('messages').insert({
                            user_id: userId,
                            conversation_id: conversationId,
                            instance_id: instanceId,
                            contact_id: contactId,
                            from_me: true,
                            content: `[MÍDIA ENVIADA: ${mediaTriggerItem.id} | ${mediaTriggerItem.name}]`,
                            type: mType,
                            ai_generated: true,
                            status: 'sent'
                        })
                    }
                }
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
