import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { evolutionApi } from '@/lib/evolution'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const supabaseAdmin = getSupabaseAdmin()
    try {
        // Verifica autenticação
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getSession().then(res => ({ data: { user: res.data.session?.user || null } }))
        if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { conversationId, instanceId, contactWhatsappId, message } = await req.json()

        console.log(`[CHAT_SEND] Solicitado envio manual. ConvsID: ${conversationId} | Instance: ${instanceId} | To: ${contactWhatsappId}`);

        if (!conversationId || !instanceId || !contactWhatsappId || !message?.trim()) {
            console.error('[CHAT_SEND] Parâmetros inválidos fornecidos');
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
        }

        // Busca a instância
        const { data: instance, error: instanceErr } = await supabaseAdmin
            .from('whatsapp_instances')
            .select('*')
            .eq('id', instanceId)
            .eq('user_id', user.id)
            .single()

        if (instanceErr || !instance) {
            return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })
        }

        // Busca a conversa
        const { data: conversation } = await supabaseAdmin
            .from('conversations')
            .select('contact_id')
            .eq('id', conversationId)
            .eq('user_id', user.id)
            .single()

        if (!conversation) {
            return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
        }

        // 1. Busca o provedor e envia
        console.log(`[PROVIDER_ROUTER] Resolvendo provedor para instância ${instance.provider_type}`);
        let messageId = ''
        if (instance.provider_type === 'META') {
            const { MetaProvider } = await import('@/services/whatsapp/MetaProvider')

            const provider = new MetaProvider(
                instance.meta_config as any,
                instance.meta_access_token_encrypted
            )
            const result = await provider.sendText(contactWhatsappId, message.trim())
            if (!result.success) {
                return NextResponse.json({ error: result.error || 'Falha ao enviar via Meta API' }, { status: 500 })
            }
            messageId = result.message_id || ''
        } else {
            // Provedor Evolution (padrão)
            console.log(`[EVOLUTION_SEND] Enviando via Evolution. Instance: ${instance.instance_name} | To: ${contactWhatsappId}`);
            await evolutionApi.sendPresence(instance.instance_name, contactWhatsappId, 'composing')
            await new Promise(resolve => setTimeout(resolve, 800))
            const result = await evolutionApi.sendTextMessage(instance.instance_name, contactWhatsappId, message.trim())
            messageId = result?.key?.id || ''
            console.log(`[EVOLUTION_RESPONSE] Recebido status 200 Fake/Real. MessageID: ${messageId}`);
        }

        // 2. Salva a mensagem no banco de dados (marcada como humana, nao da IA)
        console.log(`[MESSAGE_PERSIST] Persistindo mensagem de Chat manual no DB. MessageID: ${messageId}`);
        const { data: insertedMsg, error: insertError } = await supabaseAdmin.from('messages').insert({
            user_id: user.id,
            conversation_id: conversationId,
            instance_id: instanceId,
            contact_id: conversation.contact_id,
            from_me: true,
            content: message.trim(),
            type: 'text',
            ai_generated: false,
            status: 'sent',
            message_id: messageId,
        }).select('id, content, from_me, ai_generated, type, created_at, status').single()

        if (insertError) {
            console.error('[Chat/Send] [MESSAGE_PERSIST_ERROR] Erro ao inserir mensagem no DB:', insertError)
        } else {
            console.log(`[MESSAGE_PERSIST] Mensagem salva com sucesso. Row ID: ${insertedMsg?.id}`);
        }

        // 3. Atualiza a ultima mensagem da conversa
        await supabaseAdmin.from('conversations').update({
            last_message: message.trim(),
            last_message_at: new Date().toISOString(),
        }).eq('id', conversationId)

        // 4. HANDOFF AUTOMATICO: Muda etiqueta do contato para HUMANO
        await supabaseAdmin.from('contacts').update({
            ai_tag: 'HUMANO',
            followup_stage: 0,
        }).eq('id', conversation.contact_id).eq('user_id', user.id)

        // 5. Atualiza o contador de mensagens enviadas
        await supabaseAdmin.rpc('increment_messages_sent', { instance_id_param: instanceId })

        // Retorna a mensagem inserida para o frontend atualizar a UI
        return NextResponse.json({ success: true, message: insertedMsg || null })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido'
        console.error('[Chat/Send] Erro:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

