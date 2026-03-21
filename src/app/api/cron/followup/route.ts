import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'

export const maxDuration = 300 // 5 minutes max execution time
export const revalidate = 0 // Disable cache

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Only these tags silence ALL follow-ups permanently
const HARD_STOP_TAGS = ['PEDIDO_FECHADO', 'HUMANO', 'CANCELADO']

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Silently skip
    }

    console.log('[CRON_FOLLOWUP] Starting follow-up routine...')
    try {
        // 1. Fetch leads that are "due" for follow-up
        // LIMIT 35 to ensure we finish before the next 5-min cron run (35 * ~8s = ~280s)
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
            .limit(35)

        if (convError) {
            console.error('[CRON_FOLLOWUP] Error fetching conversations:', convError)
            return NextResponse.json({ error: convError.message }, { status: 500 })
        }

        if (!convs || convs.length === 0) {
            return NextResponse.json({ success: true, processed: 0 })
        }

        // 2. CONCURRENCY LOCK: Immediately update last_message_at for these leads
        // This prevents another cron run from picking up the same leads while we process them.
        const convIds = convs.map(c => c.id)
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .in('id', convIds)

        console.log(`[CRON_FOLLOWUP] Claimed ${convIds.length} conversations for processing.`)

        let processedCount = 0

        for (const item of convs) {
            const conversation = item as any
            const contact = conversation.contacts

            // Skip if blocked by tag
            if (contact.ai_tag && HARD_STOP_TAGS.includes(contact.ai_tag)) continue

            const stage = contact.followup_stage || 0
            const lastMessageDate = new Date(conversation.last_message_at) // Use original date for stage logic
            const diffInMinutes = (Date.now() - lastMessageDate.getTime()) / (1000 * 60)
            const isLeadFrio = contact.ai_tag === 'LEAD_FRIO'

            let shouldFollowUp = false
            let followupIntent = ''

            if (isLeadFrio) {
                if (diffInMinutes >= 1440) {
                    shouldFollowUp = true
                    followupIntent = 'Este cliente é um lead frio. Tente reativá-lo de forma leve e humana, resgatando o interesse anterior. Seja amigável, não insistente. Máx 2 linhas.'
                }
            } else {
                if (stage === 0 && diffInMinutes >= 30) {
                    shouldFollowUp = true
                    followupIntent = 'O cliente parou de responder há ~30 min. Faça um follow-up CURTO e NATURAL retomando o assunto de onde parou.'
                } else if (stage === 1 && diffInMinutes >= 120) {
                    shouldFollowUp = true
                    followupIntent = 'O cliente não responde há mais de 2 horas. Mande uma mensagem curta com leve senso de urgência sobre o interesse dele.'
                } else if (stage === 2 && diffInMinutes >= 1440) {
                    shouldFollowUp = true
                    followupIntent = 'O cliente não responde desde ontem. Última tentativa do ciclo rápido. Avise que vai encerrar o atendimento, mas que ainda há condições especiais.'
                }

                if (stage >= 3 && !isLeadFrio) {
                    await supabase.from('contacts').update({ ai_tag: 'LEAD_FRIO' }).eq('id', contact.id)
                    continue
                }
            }

            if (!shouldFollowUp) continue

            // Safety check: Bot must have been the last sender
            const { data: lastMsgRecord } = await supabase
                .from('messages')
                .select('from_me')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (!lastMsgRecord || !lastMsgRecord.from_me) continue

            // Load credentials & config
            const { data: profile } = await supabase.from('profiles').select('openai_api_key, is_admin, trial_ends_at, stripe_subscription_status').eq('id', conversation.user_id).single()
            if (!profile?.openai_api_key) continue

            let { data: aiConfigs } = await supabase.from('ai_configurations').select('*').eq('user_id', conversation.user_id).eq('instance_id', conversation.instance_id).eq('is_active', true).limit(1)
            let aiConfig = aiConfigs?.[0]
            if (!aiConfig) {
                const { data: glob } = await supabase.from('ai_configurations').select('*').eq('user_id', conversation.user_id).is('instance_id', null).eq('is_active', true).limit(1)
                aiConfig = glob?.[0]
            }
            if (!aiConfig) continue

            const { data: inst } = await supabase.from('whatsapp_instances').select('instance_name').eq('id', conversation.instance_id).single()
            if (!inst) continue

            // Load history
            const { data: history } = await supabase.from('messages').select('role:from_me, content').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(20)
            const chatMessages = (history || []).reverse().map((m: any) => ({ role: m.role ? 'assistant' : 'user', content: m.content || '' }))

            const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

            // Generate AI reply
            const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${profile.openai_api_key}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `[DATA/HORA: ${currentDate}]\nVocê é ${aiConfig.bot_name}.\nTom: ${aiConfig.tone}.\n\nINST: ${aiConfig.system_prompt}\n\nMérito: Escreva 1 msg curta (2-3 linhas), humana e baseada no histórico. Não seja genérico.\nOBJETIVO: ${followupIntent}`
                        },
                        ...chatMessages
                    ],
                    temperature: 0.85
                })
            })

            if (!openAiResponse.ok) continue
            const gptData = await openAiResponse.json()
            const botReply = gptData.choices[0].message.content?.trim()
            if (!botReply) continue

            // Send & Log
            await evolutionApi.sendPresence(inst.instance_name, contact.whatsapp_id, 'composing')
            await new Promise(r => setTimeout(r, 2000))
            await evolutionApi.sendTextMessage(inst.instance_name, contact.whatsapp_id, botReply)

            await supabase.from('messages').insert({
                user_id: conversation.user_id, conversation_id: conversation.id, instance_id: conversation.instance_id,
                contact_id: contact.id, from_me: true, content: botReply, type: 'text', ai_generated: true, status: 'sent',
            })

            const newStage = stage + 1
            await supabase.from('contacts').update({
                followup_stage: newStage,
                ai_tag: (!isLeadFrio && newStage >= 3) ? 'LEAD_FRIO' : contact.ai_tag
            }).eq('id', contact.id)

            await supabase.from('conversations').update({ last_message: botReply, last_message_at: new Date().toISOString() }).eq('id', conversation.id)
            await supabase.rpc('increment_messages_sent', { instance_id_param: conversation.instance_id })

            processedCount++
        }

        return NextResponse.json({ success: true, processed: processedCount })
    } catch (err: any) {
        console.error('[CRON_FOLLOWUP] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
