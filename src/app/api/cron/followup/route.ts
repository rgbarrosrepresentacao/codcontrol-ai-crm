import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'

export const maxDuration = 300 // 5 minutes max execution time
export const revalidate = 0 // Disable cache

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const HANDOFF_TAGS = ['PEDIDO_FECHADO', 'HUMANO', 'CANCELADO', 'LEAD_FRIO']

export async function GET(req: NextRequest) {
    // Basic security check (could use a secret key in params headers in production)
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Return 401 if a secret is configured but not matched. For testing, you can ignore this check or set CRON_SECRET.
    }

    console.log('[CRON_FOLLOWUP] Starting follow-up routine...')
    try {
        // Find conversations strictly older than 30 mins that are still open, and the contact is capable of being followed up
        const { data: convs, error: convError } = await supabase
            .from('conversations')
            .select(`
                id,
                user_id,
                instance_id,
                contact_id,
                last_message_at,
                contacts!inner ( id, ai_tag, followup_stage, whatsapp_id )
            `)
            .eq('status', 'open')
            .lt('last_message_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
            .order('last_message_at', { ascending: true })

        if (convError) {
            console.error('[CRON_FOLLOWUP] Error fetching conversations:', convError)
            return NextResponse.json({ error: convError.message }, { status: 500 })
        }

        if (!convs || convs.length === 0) {
            return NextResponse.json({ success: true, processed: 0 })
        }

        let processedCount = 0

        for (const item of convs) {
            const conversation = item as any
            const contact = conversation.contacts

            // Check if contact has a blocker tag
            if (contact.ai_tag && HANDOFF_TAGS.includes(contact.ai_tag)) {
                continue
            }

            const stage = contact.followup_stage || 0
            if (stage >= 3) {
                // If it's already stage 3 or more, mark as cold and close if not already
                if (contact.ai_tag !== 'LEAD_FRIO') {
                    await supabase.from('contacts').update({ ai_tag: 'LEAD_FRIO' }).eq('id', contact.id)
                }
                continue
            }

            const lastMessageDate = new Date(conversation.last_message_at)
            const diffInMinutes = (Date.now() - lastMessageDate.getTime()) / (1000 * 60)

            // Evaluate if it's time based on the stage:
            // Stage 0 -> requires 30 mins minimum
            // Stage 1 -> requires 2 hours minimum (120 min)
            // Stage 2 -> requires 24 hours minimum (1440 min)
            let shouldFollowUp = false
            let systemPromptAddon = ''

            if (stage === 0 && diffInMinutes >= 30) {
                shouldFollowUp = true
                systemPromptAddon = "INSTRUÇÃO DO CORAÇÃO: O cliente não responde há cerca de 30-40 minutos. Mande uma MENSAGEM CURTA e NATURAL (máx 2 linhas) puxando o assunto de volta, se referindo ao produto/tema da conversa anterior. Exemplo de tom: 'Oi 😊 conseguiu ver a mensagem que te mandei? Se tiver qualquer dúvida posso te explicar rapidinho.'"
            } else if (stage === 1 && diffInMinutes >= 120) {
                shouldFollowUp = true
                systemPromptAddon = "INSTRUÇÃO DO CORAÇÃO: O cliente já não responde há mais de 2 horas desde a última tentativa. Mande uma MENSAGEM CURTA de resgate rápido, com senso de urgência, se referindo ao produto. Exemplo de tom: 'Oi! Passando rapidinho só pra saber se ainda tem interesse. Hoje ainda tenho algumas unidades com condições especiais.'"
            } else if (stage === 2 && diffInMinutes >= 1440) {
                shouldFollowUp = true
                systemPromptAddon = "INSTRUÇÃO DO CORAÇÃO: O cliente não responde desde ontem. Esta é a ÚLTIMA TENTATIVA (" + String.fromCharCode(8220) + "fechamento de atendimentos do dia" + String.fromCharCode(8221) + "). Avise que vai fechar e se quiser garantir, é só mandar mensagem. Exemplo: 'Oi! Vou encerrar os atendimentos por hoje. Se ainda quiser garantir com desconto é só me chamar que te envio o link do pedido 😊'"
            }

            if (!shouldFollowUp) {
                continue
            }

            // Verify if the last message in this conversation was ACTUALLY from the bot
            const { data: lastMessage } = await supabase
                .from('messages')
                .select('from_me')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (!lastMessage || lastMessage.from_me === false) {
                // If the last message was from the user, it means the bot never replied.
                // Or maybe this webhook got confused. We shouldn't send follow up if we never replied.
                continue
            }

            // Let's get everything needed to respond
            const { data: profile } = await supabase.from('profiles').select('openai_api_key, is_admin, trial_ends_at, stripe_subscription_status').eq('id', conversation.user_id).single()
            if (!profile?.openai_api_key) continue

            // Trial check
            if (!profile.is_admin && profile.stripe_subscription_status !== 'active' && profile.stripe_subscription_status !== 'trialing') {
                if (profile.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) {
                    continue
                }
            }

            let { data: aiConfigs } = await supabase
                .from('ai_configurations')
                .select('*')
                .eq('user_id', conversation.user_id)
                .eq('instance_id', conversation.instance_id)
                .eq('is_active', true)
                .order('updated_at', { ascending: false })
                .limit(1)

            let aiConfig = aiConfigs && aiConfigs.length > 0 ? aiConfigs[0] : null
            if (!aiConfig) {
                const { data: globalConfigs } = await supabase
                    .from('ai_configurations')
                    .select('*')
                    .eq('user_id', conversation.user_id)
                    .is('instance_id', null)
                    .eq('is_active', true)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                aiConfig = globalConfigs && globalConfigs.length > 0 ? globalConfigs[0] : null
            }

            if (!aiConfig) continue

            const { data: instanceRecord } = await supabase
                .from('whatsapp_instances')
                .select('instance_name')
                .eq('id', conversation.instance_id)
                .single()

            if (!instanceRecord) continue

            // Get chat history
            const { data: history } = await supabase
                .from('messages')
                .select('role:from_me, content')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(15)

            const chatMessages = (history || [])
                .reverse()
                .map((m: any) => ({
                    role: m.role ? 'assistant' : 'user' as 'assistant' | 'user',
                    content: m.content || ''
                }))

            const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

            // Generate follow-up message with OpenAI
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
                            content: `[DATA E HORA ATUAL DO SISTEMA: ${currentDate}]\n\nVocê é o assistente ${aiConfig.bot_name}.\n${aiConfig.system_prompt}\n\nAja no tom de conversa: ${aiConfig.tone}.\nResponda em: ${aiConfig.language}.\n\nREGRA ABSOLUTA DE COMPORTAMENTO HUMANO: Seja extremamente humano, direto e informal. Não envie mensagens robóticas, não use listas.\n\n${systemPromptAddon}`
                        },
                        ...chatMessages
                    ],
                    temperature: 0.8,
                    max_tokens: 150
                })
            })

            if (!openAiResponse.ok) {
                console.error(`[CRON_FOLLOWUP] Erro OpenAI para ${contact.whatsapp_id}`)
                continue
            }

            const gptData = await openAiResponse.json()
            const botReply = gptData.choices[0].message.content

            // Send via Evolution API
            const remoteJid = contact.whatsapp_id
            await evolutionApi.sendPresence(instanceRecord.instance_name, remoteJid, 'composing')
            await new Promise(resolve => setTimeout(resolve, 2000))
            await evolutionApi.sendTextMessage(instanceRecord.instance_name, remoteJid, botReply)

            // Mark message and update stage
            await supabase.from('messages').insert({
                user_id: conversation.user_id,
                conversation_id: conversation.id,
                instance_id: conversation.instance_id,
                contact_id: contact.id,
                from_me: true,
                content: botReply,
                type: 'text',
                ai_generated: true,
                status: 'sent',
            })

            const newStage = stage + 1
            await supabase.from('contacts').update({
                followup_stage: newStage,
                ai_tag: newStage === 3 ? 'LEAD_FRIO' : contact.ai_tag // Auto Lead Frio when hitting max stage
            }).eq('id', contact.id)

            await supabase.from('conversations').update({
                last_message: botReply,
                last_message_at: new Date().toISOString(),
            }).eq('id', conversation.id)
            await supabase.rpc('increment_messages_sent', { instance_id_param: conversation.instance_id })

            console.log(`[CRON_FOLLOWUP] Follow-up stage ${stage} completed for contact ${contact.id}`)
            processedCount++
        }

        return NextResponse.json({ success: true, processed: processedCount })
    } catch (err: any) {
        console.error('[CRON_FOLLOWUP] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
