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
        console.log('Webhook Evolution Recebido:', JSON.stringify(body))

        // Validar se é uma mensagem nova
        if (body.event !== 'messages.upsert') {
            return NextResponse.json({ success: true, reason: 'ignored_event' })
        }

        const messageData = body.data?.message
        const key = body.data?.key
        const instanceName = body.instance

        // Ignora mensagens enviadas pelo próprio robô (evitar loop infinito)
        if (!key || key.fromMe || !messageData) {
            return NextResponse.json({ success: true, reason: 'from_me_or_empty' })
        }

        const remoteJid = key.remoteJid // Número do cliente final

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

        // 2. Buscar Configuração de IA (Tenta específica da instância, depois global) e API Key do dono
        const { data: profile } = await supabase.from('profiles').select('openai_api_key').eq('id', userId).single()

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

        // Se for áudio, vamos transcrever
        if (!textMessage && messageData.audioMessage) {
            console.log('Detectado mensagem de áudio, iniciando transcrição...')
            try {
                // Tenta pegar o base64 se estiver disponível, senão tenta baixar pela URL
                let blob: Blob

                if (body.data.base64) {
                    const buffer = Buffer.from(body.data.base64, 'base64')
                    blob = new Blob([buffer as any], { type: messageData.audioMessage.mimetype || 'audio/ogg' })
                } else if (messageData.audioMessage.url) {
                    const audioRes = await fetch(messageData.audioMessage.url)
                    blob = await audioRes.blob()
                } else {
                    throw new Error('Não foi possível obter o conteúdo do áudio')
                }

                // Criar FormData para enviar para a OpenAI (Whisper)
                const formData = new FormData()
                formData.append('file', blob, 'audio.ogg')
                formData.append('model', 'whisper-1')
                formData.append('language', 'pt') // Opcional: forçar português

                const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${profile.openai_api_key}`
                    },
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
            } catch (err) {
                console.error('Falha ao processar áudio:', err)
            }
        }

        if (!textMessage) {
            return NextResponse.json({ success: true, reason: 'no_content_to_process' })
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
                    { role: 'system', content: `${aiConfig.system_prompt}\n\nAja no tom de conversa: ${aiConfig.tone}.\nResponda em: ${aiConfig.language}. Você é o assistente ${aiConfig.bot_name}.` },
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
        await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply)

        return NextResponse.json({ success: true, message_sent: true, transcribed: !!messageData.audioMessage })

    } catch (error: any) {
        console.error('Webhook Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
