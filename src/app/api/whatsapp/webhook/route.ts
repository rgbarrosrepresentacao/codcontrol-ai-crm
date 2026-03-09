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

        // Extrai o texto da mensagem com segurança
        const textMessage =
            messageData.conversation ||
            messageData.extendedTextMessage?.text ||
            messageData.imageMessage?.caption

        if (!textMessage) {
            return NextResponse.json({ success: true, reason: 'not_text_message' })
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

        console.log(`IA Config: ${aiConfig?.instance_id ? 'Específica' : 'Global'}, Tem API Key: ${!!profile?.openai_api_key}`)

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

        // 3. Montar a requisição pra OpenAI
        const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${profile.openai_api_key}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo', // Model base, pode ser atualizado depois
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

        // 4. Enviar a resposta via Evolution API
        await evolutionApi.sendTextMessage(instanceName, remoteJid, botReply)

        return NextResponse.json({ success: true, message_sent: true })

    } catch (error: any) {
        console.error('Webhook Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
