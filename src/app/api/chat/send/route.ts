import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/evolution'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
    try {
        // Verifica autenticação
        const supabase = await createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const { conversationId, instanceId, contactWhatsappId, message } = await req.json()

        if (!conversationId || !instanceId || !contactWhatsappId || !message?.trim()) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
        }

        // Busca o nome da instância pelo ID
        const { data: instance, error: instanceErr } = await supabaseAdmin
            .from('whatsapp_instances')
            .select('instance_name')
            .eq('id', instanceId)
            .eq('user_id', user.id)
            .single()

        if (instanceErr || !instance) {
            return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })
        }

        // Busca o contact_id vinculado a essa conversa
        const { data: conversation } = await supabaseAdmin
            .from('conversations')
            .select('contact_id')
            .eq('id', conversationId)
            .eq('user_id', user.id)
            .single()

        if (!conversation) {
            return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
        }

        // 1. Envia a mensagem pelo WhatsApp via Evolution API
        await evolutionApi.sendPresence(instance.instance_name, contactWhatsappId, 'composing')
        await new Promise(resolve => setTimeout(resolve, 800))
        await evolutionApi.sendTextMessage(instance.instance_name, contactWhatsappId, message.trim())

        // 2. Salva a mensagem no banco de dados (marcada como humana, nao da IA)
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
        }).select('id, content, from_me, ai_generated, type, created_at, status').single()

        if (insertError) {
            console.error('[Chat/Send] Erro ao inserir mensagem no DB:', insertError)
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
