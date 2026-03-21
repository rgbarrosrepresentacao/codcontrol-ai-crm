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
        // In production, return 401 here. Keeping permissive for internal calls.
    }

    console.log('[CRON_FOLLOWUP] Starting follow-up routine...')
    try {
        // Fetch open conversations with last message older than 30 min
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

            // ── Hard Stop Tags — no follow-up ever ──────────────────────────────
            if (contact.ai_tag && HARD_STOP_TAGS.includes(contact.ai_tag)) {
                continue
            }

            const stage = contact.followup_stage || 0
            const lastMessageDate = new Date(conversation.last_message_at)
            const diffInMinutes = (Date.now() - lastMessageDate.getTime()) / (1000 * 60)
            const isLeadFrio = contact.ai_tag === 'LEAD_FRIO'

            // ── Stage / Timing Decision ──────────────────────────────────────────
            // Stages 0-2: rapid rescue cycle (30 min / 2 h / 24 h)
            // LEAD_FRIO:  daily re-engagement cadence, indefinitely
            let shouldFollowUp = false
            let followupIntent = '' // specific goal for THIS follow-up, passed to the AI

            if (isLeadFrio) {
                // Daily re-engagement: one message every 24 hours
                if (diffInMinutes >= 1440) {
                    shouldFollowUp = true
                    followupIntent = 'Este cliente é um lead frio que ainda não fechou negócio. Tente reativá-lo de forma leve e humana, resgatando o produto ou o interesse que foi discutido na conversa. Seja curioso e amigável — não insistente. Máx 2 linhas.'
                }
            } else {
                // Rapid rescue cycle for active leads
                if (stage === 0 && diffInMinutes >= 30) {
                    shouldFollowUp = true
                    followupIntent = 'O cliente parou de responder há cerca de 30-40 minutos. Faça um follow-up CURTO e NATURAL retomando exatamente o assunto onde a conversa parou, de forma amigável e sem pressão.'
                } else if (stage === 1 && diffInMinutes >= 120) {
                    shouldFollowUp = true
                    followupIntent = 'O cliente não responde há mais de 2 horas. Mande uma mensagem curta e direta com leve senso de urgência, referenciando o interesse que ele demonstrou na conversa.'
                } else if (stage === 2 && diffInMinutes >= 1440) {
                    shouldFollowUp = true
                    followupIntent = 'O cliente não responde desde ontem. Esta é a última tentativa do ciclo rápido. Avise de forma simpática que vai encerrar o atendimento, mas que ainda é possível garantir com condições especiais caso ele queira.'
                }

                // Rapid cycle exhausted with no reply → escalate to LEAD_FRIO
                if (stage >= 3) {
                    await supabase.from('contacts').update({ ai_tag: 'LEAD_FRIO' }).eq('id', contact.id)
                    console.log(`[CRON_FOLLOWUP] Contact ${contact.id} escalated to LEAD_FRIO after rapid cycle.`)
                    continue
                }
            }

            if (!shouldFollowUp) continue

            // ── Safety: only follow-up if the bot sent the last message ──────────
            // Avoids interrupting a client who re-engaged but wasn't answered yet
            const { data: lastMessage } = await supabase
                .from('messages')
                .select('from_me')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (!lastMessage || lastMessage.from_me === false) {
                continue
            }

            // ── Load profile & AI config ─────────────────────────────────────────
            const { data: profile } = await supabase
                .from('profiles')
                .select('openai_api_key, is_admin, trial_ends_at, stripe_subscription_status')
                .eq('id', conversation.user_id)
                .single()

            if (!profile?.openai_api_key) continue

            // Trial / subscription check
            if (!profile.is_admin && profile.stripe_subscription_status !== 'active' && profile.stripe_subscription_status !== 'trialing') {
                if (profile.trial_ends_at && new Date(profile.trial_ends_at) < new Date()) continue
            }

            // Load AI config for this instance (fallback to global)
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

            // ── Load real conversation history (last 20 messages) ────────────────
            const { data: history } = await supabase
                .from('messages')
                .select('role:from_me, content')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(20)

            const chatMessages = (history || [])
                .reverse()
                .map((m: any) => ({
                    role: m.role ? 'assistant' : 'user' as 'assistant' | 'user',
                    content: m.content || ''
                }))

            const currentDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

            // ── Generate intelligent, contextual follow-up with OpenAI ────────────
            // The AI receives:
            //   1. User's full system prompt (product, rules, tone — NOT generic)
            //   2. Real conversation history (what was ACTUALLY discussed)
            //   3. Specific goal for THIS follow-up message
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
                            content: `[DATA E HORA ATUAL: ${currentDate}]

Você é ${aiConfig.bot_name}.
Tom: ${aiConfig.tone}.
Idioma: ${aiConfig.language || 'Português Brasileiro'}.

── SUAS INSTRUÇÕES COMPLETAS (produto, regras, logística) ──
${aiConfig.system_prompt}

── REGRAS ABSOLUTAS PARA ESTA MENSAGEM ──
- Escreva UMA ÚNICA mensagem curta (máx 2-3 linhas).
- A mensagem DEVE ser baseada no histórico real da conversa. Mencione o produto, a dúvida ou o interesse que o cliente demonstrou. NUNCA envie algo genérico.
- Seja natural, humano e direto. Sem listas, bullet points ou linguagem robótica.
- Use no máximo 1-2 emojis.
- Se já houve conversa, RETOME o assunto onde parou. Não recomece do zero.

── OBJETIVO ESPECÍFICO DESTE FOLLOW-UP ──
${followupIntent}`
                        },
                        ...chatMessages
                    ],
                    temperature: 0.85,
                    max_tokens: 180
                })
            })

            if (!openAiResponse.ok) {
                console.error(`[CRON_FOLLOWUP] Erro OpenAI para contato ${contact.whatsapp_id}`)
                continue
            }

            const gptData = await openAiResponse.json()
            const botReply = gptData.choices[0].message.content?.trim()
            if (!botReply) continue

            // ── Send via Evolution API ───────────────────────────────────────────
            const remoteJid = contact.whatsapp_id
            await evolutionApi.sendPresence(instanceRecord.instance_name, remoteJid, 'composing')
            await new Promise(resolve => setTimeout(resolve, 2000))
            await evolutionApi.sendTextMessage(instanceRecord.instance_name, remoteJid, botReply)

            // ── Persist message in DB ────────────────────────────────────────────
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

            // ── Update stage and contact tag ─────────────────────────────────────
            const newStage = stage + 1
            await supabase.from('contacts').update({
                followup_stage: newStage,
                // Escalate to LEAD_FRIO only after rapid rescue cycle is done
                ai_tag: (!isLeadFrio && newStage >= 3) ? 'LEAD_FRIO' : contact.ai_tag
            }).eq('id', contact.id)

            await supabase.from('conversations').update({
                last_message: botReply,
                last_message_at: new Date().toISOString(),
            }).eq('id', conversation.id)

            await supabase.rpc('increment_messages_sent', { instance_id_param: conversation.instance_id })

            console.log(`[CRON_FOLLOWUP] Stage ${stage} follow-up (${isLeadFrio ? 'LEAD_FRIO daily' : 'rapid rescue'}) sent to contact ${contact.id}`)
            processedCount++
        }

        return NextResponse.json({ success: true, processed: processedCount })
    } catch (err: any) {
        console.error('[CRON_FOLLOWUP] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
