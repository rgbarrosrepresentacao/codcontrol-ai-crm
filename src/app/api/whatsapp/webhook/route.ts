import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'

// Usamos um cliente do Supabase com Service Role Key para ignorar RLS nesta rota de background e poder buscar os dados do usuário
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        console.log('Webhook Evolution Recebido:', body.event, body.instance)

        // Validar se é uma mensagem nova
        if (body.event !== 'messages.upsert') {
            return NextResponse.json({ success: true, reason: 'ignored_event' })
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

async function processWebhookInBackground(body: any) {
    try {
        const messageData = body.data?.message
        const key = body.data?.key
        const instanceName = body.instance

        // Ignora mensagens enviadas pelo próprio robô (evitar loop infinito)
        if (!key || key.fromMe || !messageData) {
            return NextResponse.json({ success: true, reason: 'from_me_or_empty' })
        }

        const remoteJid = key.remoteJid // Número do cliente final

        // Ignora mensagens de grupos
        if (remoteJid.endsWith('@g.us')) {
            return NextResponse.json({ success: true, reason: 'group_message_ignored' })
        }

        // Extrai número de telefone limpo
        const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '')
        const pushName = body.data?.pushName || null
        const messageType = body.data?.messageType || 'text'

        // 1. Achar o dono desse WhatsApp no SaaS
        const { data: instanceRecord, error: instanceError } = await supabase
            .from('whatsapp_instances')
            .select('id, user_id')
            .eq('instance_name', instanceName)
            .single()

        if (instanceError || !instanceRecord) {
            console.error(`Erro ao buscar instância ${instanceName}:`, instanceError)
            return NextResponse.json({ success: false, reason: 'instance_not_found', error: instanceError })
        }

        const userId = instanceRecord.user_id
        const instanceId = instanceRecord.id

        // 2. Salvar/Atualizar contato no CRM
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
            .select('id')
            .single()

        const contactId = contact?.id || null

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

        // 2. Buscar Configuração de IA e Dados do Trial
        const { data: profile } = await supabase.from('profiles').select('openai_api_key, is_admin, trial_ends_at, stripe_subscription_status').eq('id', userId).single()

        // Verifica o trial antes de permitir rodar a IA
        if (profile && !profile.is_admin && profile.stripe_subscription_status !== 'active' && profile.stripe_subscription_status !== 'trialing') {
            if (profile.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) {
                console.log(`[BLOQUEIO] Usuário ${userId} está com o Trial Vencido. IA não irá responder.`)
                return NextResponse.json({ success: true, reason: 'trial_expired_or_not_paid' })
            }
        }

        // Tenta buscar config específica desta instância
        let { data: aiConfig } = await supabase
            .from('ai_configurations')
            .select('*')
            .eq('user_id', userId)
            .eq('instance_id', instanceId)
            .eq('is_active', true)
            .maybeSingle()

        // Se não achar específica, tenta a global
        if (!aiConfig) {
            const { data: globalConfig } = await supabase
                .from('ai_configurations')
                .select('*')
                .eq('user_id', userId)
                .eq('instance_id', null)
                .eq('is_active', true)
                .maybeSingle()
            aiConfig = globalConfig
        }

        if (!aiConfig || !profile?.openai_api_key) {
            return NextResponse.json({
                success: true,
                reason: 'ai_inactive_or_no_key',
                details: {
                    hasConfig: !!aiConfig,
                    hasKey: !!profile?.openai_api_key
                }
            })
        }

        // 3. Extrai o texto da mensagem ou Transcreve áudio
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

                // A Evolution API descriptografa o áudio do WhatsApp e retorna em base64
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
            // Mesmo sem resposta da IA, salva a mensagem recebida no CRM
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
                // Incrementa contador de mensagens recebidas
                await supabase.rpc('increment_messages_received', { instance_id_param: instanceId })
            }
            return NextResponse.json({ success: true, reason: 'no_content_to_process' })
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
            // Atualiza última mensagem na conversa
            await supabase.from('conversations').update({
                last_message: textMessage,
                last_message_at: new Date().toISOString(),
            }).eq('id', conversationId)
            // Incrementa contador de mensagens recebidas
            await supabase.rpc('increment_messages_received', { instance_id_param: instanceId })
        }

        // 4. Montar a requisição pra OpenAI (GPT)
        const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${profile.openai_api_key}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: `${aiConfig.system_prompt}\n\nAja no tom de conversa: ${aiConfig.tone}.\nResponda em: ${aiConfig.language}. Você é o assistente ${aiConfig.bot_name}.\n\nREGRA ABSOLUTA DE COMPORTAMENTO HUMANO: Seja extremamente humano, direto e informal. Não envie mensagens robóticas, não use listas exageradas e não escreva textos muito longos (máximo 2-3 frases curtas por mensagem). Aja como uma pessoa comum digitando no WhatsApp de forma rápida e casual.` },
                    { role: 'user', content: textMessage }
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        })

        if (!openAiResponse.ok) {
            const gptError = await openAiResponse.json()
            console.error('Falha na OpenAI:', gptError)
            return NextResponse.json({ error: 'OpenAI Error' }, { status: 500 })
        }

        const gptData = await openAiResponse.json()
        const botReply = gptData.choices[0].message.content

        // 5. Enviar a resposta via Evolution API
        // Simular comportamento humano: Mostra 'digitando...' e aguarda 3 segundos
        await evolutionApi.sendPresence(instanceName, remoteJid, 'composing')
        await new Promise(resolve => setTimeout(resolve, 3000))

        await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply)

        // 6. Salvar a resposta da IA no CRM
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
            // Atualiza última mensagem (resposta da IA)
            await supabase.from('conversations').update({
                last_message: botReply,
                last_message_at: new Date().toISOString(),
            }).eq('id', conversationId)
            // Incrementa contador de mensagens enviadas
            await supabase.rpc('increment_messages_sent', { instance_id_param: instanceId })
        }

        return NextResponse.json({ success: true, message_sent: true, transcribed: !!messageData.audioMessage })

    } catch (error: any) {
        console.error('Webhook Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
