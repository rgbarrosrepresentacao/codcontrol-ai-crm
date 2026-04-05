import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * POST /api/vapi/webhook
 * 
 * Recebe os eventos da Vapi.ai durante e após uma ligação telefônica.
 * Tipos de evento: call-started, call-ended, function-call, transcript
 * 
 * Ao receber 'call-ended', extrai a transcrição e envia resumo no WhatsApp.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { message } = body

        console.log('[VAPI_WEBHOOK] Evento recebido:', message?.type)

        // Ignoramos eventos intermediários, só processamos quando a ligação terminar
        if (!message || message.type !== 'end-of-call-report') {
            return NextResponse.json({ received: true })
        }

        const callId = message.call?.id
        const phoneNumber = message.call?.customer?.number // Ex: "+5511999998888"
        const transcript = message.transcript || ''
        const callDurationSeconds = message.call?.endedAt
            ? Math.round((new Date(message.call.endedAt).getTime() - new Date(message.call.startedAt).getTime()) / 1000)
            : 0

        console.log(`[VAPI_WEBHOOK] Ligação encerrada: ${callId} | Duração: ${callDurationSeconds}s | Número: ${phoneNumber}`)

        if (!phoneNumber) {
            return NextResponse.json({ received: true, warning: 'No phone number in payload' })
        }

        // Formata número para busca (remove +55 ou + inicial se necessário)
        const normalizedPhone = phoneNumber.replace(/\D/g, '') // Apenas dígitos

        // Busca o contato pelo número de WhatsApp
        const { data: contact } = await supabase
            .from('contacts')
            .select('id, user_id, whatsapp_id')
            .or(`whatsapp_id.eq.${normalizedPhone}@s.whatsapp.net,whatsapp_id.ilike.%${normalizedPhone}%`)
            .limit(1)
            .single()

        if (!contact) {
            console.warn('[VAPI_WEBHOOK] Contato não encontrado para número:', normalizedPhone)
            return NextResponse.json({ received: true, warning: 'Contact not found' })
        }

        // Busca a conversa aberta para registrar a ligação
        const { data: conversation } = await supabase
            .from('conversations')
            .select('id, instance_id')
            .eq('contact_id', contact.id)
            .eq('status', 'open')
            .order('last_message_at', { ascending: false })
            .limit(1)
            .single()

        if (!conversation) {
            console.warn('[VAPI_WEBHOOK] Conversa não encontrada para contato:', contact.id)
            return NextResponse.json({ received: true, warning: 'Conversation not found' })
        }

        // Registra log da ligação no histórico do chat
        const callLog = `[📞 LIGAÇÃO REALIZADA - ${callDurationSeconds}s] A IA realizou uma ligação telefônica para este cliente.${transcript ? ` Transcrição resumida: ${transcript.slice(0, 300)}...` : ''}`

        await supabase.from('messages').insert({
            user_id: contact.user_id,
            conversation_id: conversation.id,
            instance_id: conversation.instance_id,
            contact_id: contact.id,
            from_me: true,
            content: callLog,
            type: 'text',
            ai_generated: true,
            status: 'sent',
        })

        // Envia mensagem de acompanhamento no WhatsApp logo após a ligação
        const { data: inst } = await supabase
            .from('whatsapp_instances')
            .select('instance_name')
            .eq('id', conversation.instance_id)
            .single()

        if (inst) {
            const followupMsg = `Olá! 😊 Que bom ter te ligado agora há pouquinho! Fica à vontade para me chamar aqui se tiver mais alguma dúvida. Estou à disposição! 💚`
            await evolutionApi.sendTextMessage(inst.instance_name, contact.whatsapp_id, followupMsg)

            // Registra a mensagem de acompanhamento no histórico
            await supabase.from('messages').insert({
                user_id: contact.user_id,
                conversation_id: conversation.id,
                instance_id: conversation.instance_id,
                contact_id: contact.id,
                from_me: true,
                content: followupMsg,
                type: 'text',
                ai_generated: true,
                status: 'sent',
            })

            // Atualiza a conversa
            await supabase.from('conversations').update({
                last_message: followupMsg,
                last_message_at: new Date().toISOString()
            }).eq('id', conversation.id)
        }

        console.log(`[VAPI_WEBHOOK] ✅ Ligação processada com sucesso para contato ${contact.id}`)
        return NextResponse.json({ success: true })

    } catch (err: any) {
        console.error('[VAPI_WEBHOOK] Erro:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
