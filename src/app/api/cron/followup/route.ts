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
const HARD_STOP_TAGS = ['PEDIDO_FECHADO', 'FECHADO', 'HUMANO', 'CANCELADO']

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Silently skip
    }

    console.log('[CRON_FOLLOWUP] Starting follow-up routine...')
    try {
        // 1. Fetch leads that are "due" for follow-up
        // LIMIT 4: each send takes ~5-10s plus 45-60s delay. 4 leads fits in 300s.
        const { data: convs, error: convError } = await supabase
            .from('conversations')
            .select(`
                id,
                user_id,
                instance_id,
                contact_id,
                last_message_at,
                contacts!inner ( id, ai_tag, followup_stage, whatsapp_id, active_campaign_id )
            `)
            .eq('status', 'open')
            .lt('last_message_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
            .order('last_message_at', { ascending: true })
            .limit(4)

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
            const isAguardando = contact.ai_tag === 'AGUARDANDO_RESPOSTA'
            const isPerdido = contact.ai_tag === 'PERDIDO'
            const isLeadFrio = diffInMinutes >= 1440 // Lead que não responde há mais de 24h

            // Se já está perdido, não fazemos follow-up automático mais
            if (isPerdido) continue

            let shouldFollowUp = false
            let followupIntent = ''

            if (isAguardando) {
                if (isLeadFrio) {
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

                if (stage >= 3) {
                    await supabase.from('contacts').update({ ai_tag: 'PERDIDO' }).eq('id', contact.id)
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

            // 3. Load credentials & config
            const { data: profile } = await supabase
                .from('profiles')
                .select('openai_api_key, is_admin, trial_ends_at, stripe_subscription_status, vapi_api_key, vapi_enabled, vapi_stage, vapi_phone_number_id, vapi_assistant_id')
                .eq('id', conversation.user_id)
                .single()

            if (!profile?.openai_api_key) continue

            // 3b. BLOQUEIO DE SEGURANÇA - Validação unificada (Admin, Stripe, Kiwify ou Trial)
            const isPaid = profile.is_admin || 
                           profile.stripe_subscription_status === 'paid' || 
                           profile.stripe_subscription_status === 'active' ||
                           profile.stripe_subscription_status === 'aprovado' || 
                           profile.stripe_subscription_status === 'approved' ||
                           profile.stripe_subscription_status === 'trialing'

            const hasTrialActive = profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()

            if (!isPaid && !hasTrialActive) {
                console.log(`[Follow-up] 🚫 Resgate bloqueado para o usuário ${conversation.user_id}: Sem assinatura ativa and sem trial vigente.`)
                continue
            }

            let { data: aiConfigs } = await supabase.from('ai_configurations').select('*').eq('user_id', conversation.user_id).eq('instance_id', conversation.instance_id).eq('is_active', true).limit(1)
            let aiConfig = aiConfigs?.[0]
            if (!aiConfig) {
                const { data: glob } = await supabase.from('ai_configurations').select('*').eq('user_id', conversation.user_id).is('instance_id', null).eq('is_active', true).limit(1)
                aiConfig = glob?.[0]
            }
            if (!aiConfig) continue

            // 3c. Sobrescrever Prompt se houver campanha ativa no contato
            if (contact.active_campaign_id) {
                const { data: campaign } = await supabase
                    .from('campaigns')
                    .select('*')
                    .eq('id', contact.active_campaign_id)
                    .single()
                
                if (campaign) {
                    console.log(`[Follow-up] 🗣️ Usando contexto da campanha: ${campaign.name}`)
                    aiConfig.system_prompt = campaign.system_prompt
                    aiConfig.bot_name = campaign.name
                }
            }

            // ── ADMIN LAB: Vapi.ai - Ligação Automática ─────────────────────────────────
            // Ativa apenas se: admin + chave Vapi + vapi_enabled + stage configurado
            const vapiTargetStage = profile.vapi_stage ?? 1
            const isVapiAllowed = profile.is_admin && profile.vapi_api_key && profile.vapi_enabled
            if (isVapiAllowed && stage === vapiTargetStage && !isLeadFrio) {
                console.log(`[CRON_FOLLOWUP] 📞 [ADMIN LAB] Iniciando ligação Vapi para contato ${contact.id}`)
                try {
                    const rawNumber = contact.whatsapp_id.replace('@s.whatsapp.net', '').replace(/\D/g, '')
                    const e164Number = rawNumber.startsWith('55') ? `+${rawNumber}` : `+55${rawNumber}`
                    const botName = aiConfig.bot_name || 'Camila'

                    const vapiBody: any = {
                        customer: { number: e164Number },
                        phoneNumberId: profile.vapi_phone_number_id || process.env.VAPI_PHONE_NUMBER_ID || undefined,
                    }

                    // Se o admin configurou um Assistant ID específico (ex: Camila), usa ele.
                    // Caso contrário, gera um assistente dinâmico baseado no prompt da campanha/config.
                    if (profile.vapi_assistant_id) {
                        vapiBody.assistantId = profile.vapi_assistant_id
                    } else {
                        vapiBody.assistant = {
                            model: {
                                provider: 'openai',
                                model: 'gpt-4o-mini',
                                messages: [{
                                    role: 'system',
                                    content: `${aiConfig.system_prompt || 'Você é uma vendedora experiente e amigável.'}\n\n` +
                                        `CONTEXTO: O cliente não responde às mensagens de WhatsApp há mais de 2 horas. ` +
                                        `Faça uma ligação curta, natural e humana para retomar o interesse, tirar dúvidas e tentar fechar a venda. ` +
                                        `Seja calorosa, não pressione. Fale como ${botName}, uma vendedora real.`
                                }]
                            },
                            voice: { provider: '11labs', voiceId: 'paula' },
                            serverUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://codcontrolpro.bond'}/api/vapi/webhook`,
                            firstMessage: `Oi! Aqui é a ${botName}. Você tinha demonstrado interesse mas não me respondeu mais, queria checar se ficou alguma dúvida que eu possa te ajudar a resolver. Tem um minutinho?`,
                            maxDurationSeconds: 180,
                        }
                    }

                    const vapiResponse = await fetch('https://api.vapi.ai/call/phone', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${profile.vapi_api_key}`
                        },
                        body: JSON.stringify(vapiBody)
                    })

                    if (vapiResponse.ok) {
                        const vapiData = await vapiResponse.json()
                        console.log(`[CRON_FOLLOWUP] 📞 Ligação Vapi iniciada: ${vapiData.id}`)
                        await supabase.from('messages').insert({
                            user_id: conversation.user_id,
                            conversation_id: conversation.id,
                            instance_id: conversation.instance_id,
                            contact_id: contact.id,
                            from_me: true,
                            content: `[📞 LIGAÇÃO AUTOMÁTICA INICIADA] A IA está ligando para o cliente agora (Vapi ID: ${vapiData.id})`,
                            type: 'text',
                            ai_generated: true,
                            status: 'sent',
                        })
                        await supabase.from('contacts').update({ followup_stage: stage + 1 }).eq('id', contact.id)
                        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id)
                        processedCount++
                    } else {
                        const errText = await vapiResponse.text()
                        console.error(`[CRON_FOLLOWUP] ❌ Erro Vapi: ${errText}`)
                        // Fallback: segue para fluxo de texto abaixo
                    }
                } catch (vapiErr: any) {
                    console.error('[CRON_FOLLOWUP] ❌ Exceção ao chamar Vapi:', vapiErr.message)
                    // Fallback: segue para fluxo de texto abaixo
                }
                await new Promise(r => setTimeout(r, 5000))
                continue
            }
            // ── FIM DO BLOCO ADMIN LAB ────────────────────────────────────────────

            // ─── Knowledge Base: busca mídias cadastradas e filtra por campanha ──────
            let knowledgeQuery = supabase
                .from('ai_knowledge')
                .select('id, name, description, media_url, media_type, campaign_id')
                .eq('user_id', conversation.user_id)

            // Se houver campanha ativa no contato, busca itens daquela campanha OU itens gerais (campaign_id is null)
            if (contact.active_campaign_id) {
                knowledgeQuery = knowledgeQuery.or(`campaign_id.eq.${contact.active_campaign_id},campaign_id.is.null`)
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
                    .eq('contact_id', contact.id)
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
Você have acesso às seguintes mídias para enviar ao cliente se julgar necessário para o resgate:
${list}

REGRAS DE USO:
- Inclua o código [SEND_MEDIA:ID_AQUI] no FINAL da sua resposta SOMENTE se o momento for propício baseado na descrição da mídia.
- NUNCA envie a mesma mídia duas vezes para o mesmo cliente. Veja o campo "Já enviado" na lista acima.
- Se o campo "Já enviado" estiver como SIM, você deve focar apenas em texto amigável para o resgate.
- Use APENAS UM envio por resposta, no máximo.
- NÃO force o envio desnecessariamente. Só envie se a descrição da mídia se encaixar naturalmente no momento do resgate.
- O código [SEND_MEDIA:ID] será removido automaticamente da mensagem. O cliente NÃO verá isso.`
            }

            const { data: inst } = await supabase.from('whatsapp_instances').select('instance_name').eq('id', conversation.instance_id).single()
            if (!inst) continue

            // ─── 4. Geração da Resposta com OpenAI ─────────────────────────────────
            const { data: history } = await supabase
                .from('messages')
                .select('role, content, from_me')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: true })
                .limit(10)

            const historyMessages = (history || []).map(m => ({
                role: m.role || (m.from_me ? 'assistant' : 'user'),
                content: m.content
            }))

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${profile.openai_api_key}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: (aiConfig.system_prompt || '') + (knowledgeContext ? `\n\n${knowledgeContext}` : '') },
                        ...historyMessages,
                        { role: 'user', content: followupIntent }
                    ],
                    temperature: 0.7
                })
            })

            const gptData = await response.json()
            if (gptData.error) {
                console.error(`[Follow-up] ❌ Erro OpenAI para ${conversation.user_id}:`, gptData.error.message)
                continue
            }

            const botReply = gptData.choices?.[0]?.message?.content
            if (!botReply) continue

            // ─── Processamento de Mídia ──────────────────────────────────────────
            const mediaMatch = botReply.match(/\[SEND_MEDIA:(.*?)\]/)
            let cleanReply = botReply.replace(/\[SEND_MEDIA:.*?\]/g, '').trim()

            // Se a limpeza deixou a mensagem vazia (só tinha o código), ou muito curta, 
            // e tem mídia, define um texto padrão para acompanhar se necessário.
            if (cleanReply === '' && mediaMatch) {
                cleanReply = "Dá uma olhadinha nisso aqui que eu te falei! 😊"
            }

            // Send & Log
            // Show "typing..." indicator for 3-5 seconds to look more human
            const typingDelay = Math.floor(Math.random() * 2000) + 3000 // 3-5s
            await evolutionApi.sendPresence(inst.instance_name, contact.whatsapp_id, 'composing')
            await new Promise(r => setTimeout(r, typingDelay))
            
            // Envia o texto limpo
            await evolutionApi.sendTextMessage(inst.instance_name, contact.whatsapp_id, cleanReply)

            // Envia a mídia se houver
            if (mediaMatch) {
                const mediaId = mediaMatch[1]
                const selectedMedia = knowledgeItems?.find(k => k.id === mediaId)

                if (selectedMedia) {
                    // Verificação final de segurança (Double Check)
                    const { data: doubleCheck } = await supabase
                        .from('messages')
                        .select('id')
                        .eq('contact_id', contact.id)
                        .eq('content', `[MÍDIA ENVIADA: ${selectedMedia.id} | ${selectedMedia.name}]`)
                        .maybeSingle()

                    if (doubleCheck) {
                        console.log(`[Follow-up] 🚫 Bloqueio de segurança: Mídia ${selectedMedia.id} já enviada anteriormente para este contato.`)
                    } else {
                        console.log(`[Follow-up] 📎 AI enviando mídia: ${selectedMedia.name} (${selectedMedia.media_type})`)
                        const mType = selectedMedia.media_type as 'image' | 'video' | 'document'
                        await evolutionApi.sendMedia(inst.instance_name, contact.whatsapp_id, selectedMedia.media_url, mType)

                        // Salva o registro da mídia no histórico para evitar repetições futuras
                        await supabase.from('messages').insert({
                            user_id: conversation.user_id,
                            conversation_id: conversation.id,
                            instance_id: conversation.instance_id,
                            contact_id: contact.id,
                            from_me: true,
                            content: `[MÍDIA ENVIADA: ${selectedMedia.id} | ${selectedMedia.name}]`,
                            type: mType,
                            ai_generated: true,
                            status: 'sent',
                        })
                    }
                }
            }

            await supabase.from('messages').insert({
                user_id: conversation.user_id, conversation_id: conversation.id, instance_id: conversation.instance_id,
                contact_id: contact.id, from_me: true, content: cleanReply, type: 'text', ai_generated: true, status: 'sent',
            })

            // Enquanto houver tentativas, mantemos em "AGUARDANDO_RESPOSTA"
            const newStage = stage + 1
            await supabase.from('contacts').update({
                followup_stage: newStage,
                ai_tag: (newStage >= 3) ? 'PERDIDO' : 'AGUARDANDO_RESPOSTA'
            }).eq('id', contact.id)

            await supabase.from('conversations').update({ last_message: cleanReply, last_message_at: new Date().toISOString() }).eq('id', conversation.id)
            await supabase.rpc('increment_messages_sent', { instance_id_param: conversation.instance_id })

            processedCount++

            // ── Anti-spam delay ──────────────────────────────────────────────────
            // Wait 45–60 seconds before the next send. This randomized pause:
            //   • Mimics natural human typing cadence
            //   • Prevents WhatsApp from detecting bulk messaging patterns
            //   • Gives the server breathing room between API calls
            const antiSpamDelay = Math.floor(Math.random() * 15000) + 45000 // 45-60s
            console.log(`[CRON_FOLLOWUP] Waiting ${Math.round(antiSpamDelay / 1000)}s before next send (anti-spam)...`)
            await new Promise(r => setTimeout(r, antiSpamDelay))
        }

        return NextResponse.json({ success: true, processed: processedCount })
    } catch (err: any) {
        console.error('[CRON_FOLLOWUP] Fatal Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
