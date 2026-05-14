import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { evolutionApi } from '@/lib/evolution'
import { MetaProvider } from '@/services/whatsapp/MetaProvider'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get('file') as File
        const conversationId = formData.get('conversationId') as string
        const instanceId = formData.get('instanceId') as string
        const contactWhatsappId = formData.get('contactWhatsappId') as string
        const caption = formData.get('caption') as string || ''

        if (!file || !conversationId || !instanceId || !contactWhatsappId) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
        }

        // 1. Busca instância e provedor
        const { data: instance, error: instanceErr } = await supabaseAdmin
            .from('whatsapp_instances')
            .select('*')
            .eq('id', instanceId)
            .eq('user_id', session.user.id)
            .single()

        if (instanceErr || !instance) {
            return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })
        }

        // 2. Determina tipo de mídia
        let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) {
            if (file.type.includes('webm')) mediaType = 'audio'
            else mediaType = 'video'
        }
        else if (file.type.startsWith('audio/')) mediaType = 'audio'
        
        console.log(`[send-media] File type: ${file.type}, Detected mediaType: ${mediaType}, Name: ${file.name}`)

        // 3. Upload para Supabase Storage
        const rawName = file.name || ''
        let fileExt = (rawName.includes('.') ? rawName.split('.').pop() : null)
        if (!fileExt || fileExt === 'blob') {
            if (file.type.includes('audio/mp4')) fileExt = 'mp4'
            else if (file.type.includes('audio/ogg')) fileExt = 'ogg'
            else if (file.type.includes('audio/mpeg')) fileExt = 'mp3'
            else if (file.type.includes('audio/webm')) fileExt = 'webm'
            else fileExt = file.type.split('/')[1]?.split(';')[0] || (mediaType === 'audio' ? 'mp3' : 'bin')
        }
        
        const fileName = `${crypto.randomUUID()}.${fileExt}`
        const filePath = `${session.user.id}/${conversationId}/${fileName}`

        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('chat-media')
            .upload(filePath, file, {
                contentType: file.type,
                cacheControl: '3600',
                upsert: false
            })

        if (uploadError) {
            console.error('[send-media] Upload error:', uploadError)
            return NextResponse.json({ error: 'Falha no upload do arquivo' }, { status: 500 })
        }

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('chat-media')
            .getPublicUrl(filePath)

        // 4. Envia via Provedor
        let messageId = ''
        try {
            if (instance.provider_type === 'META') {
                const provider = new MetaProvider(
                    instance.meta_config as any,
                    instance.meta_access_token_encrypted
                )
                
                // Tenta upload direto primeiro (muito mais confiável que link)
                const buffer = Buffer.from(await file.arrayBuffer())
                const mediaId = await provider.uploadMedia(buffer, file.type)
                
                let result;
                if (mediaId) {
                    result = await provider.sendMedia(contactWhatsappId, { id: mediaId }, mediaType, caption)
                } else {
                    console.warn('[send-media] Meta Direct Upload failed, falling back to link...')
                    result = await provider.sendMedia(contactWhatsappId, { link: publicUrl }, mediaType, caption)
                }

                if (!result.success) {
                    throw new Error(result.error || `Falha ao enviar ${mediaType} via Meta`)
                }
                messageId = result.message_id || ''
            } else {
                // Provedor Evolution (padrão)
                if (mediaType === 'audio') {
                    await evolutionApi.sendPresence(instance.instance_name, contactWhatsappId, 'recording')
                    await new Promise(r => setTimeout(r, 1500))
                    
                    // Para áudio na Evolution, enviar via Base64 é mais garantido como Nota de Voz
                    const buffer = Buffer.from(await file.arrayBuffer())
                    const base64 = buffer.toString('base64')
                    
                    const result = await evolutionApi.sendWhatsAppAudio(
                        instance.instance_name,
                        contactWhatsappId,
                        base64
                    )
                    messageId = result?.key?.id || ''
                } else {
                    await evolutionApi.sendPresence(instance.instance_name, contactWhatsappId, 'composing')
                    await new Promise(r => setTimeout(r, 1000))
                    
                    const result = await evolutionApi.sendMedia(
                        instance.instance_name,
                        contactWhatsappId,
                        publicUrl,
                        mediaType,
                        caption
                    )
                    messageId = result?.key?.id || ''
                }
            }
        } catch (error: any) {
            console.error('[send-media] Provider Error:', error.message)
            return NextResponse.json({ error: error.message || 'Falha ao enviar via provedor' }, { status: 500 })
        }

        // 5. Salva no Banco de Dados (SÓ SE CHEGOU AQUI)
        const { data: insertedMsg, error: insertError } = await supabaseAdmin
            .from('messages')
            .insert({
                user_id: session.user.id,
                conversation_id: conversationId,
                instance_id: instanceId,
                contact_id: formData.get('contactId') || null,
                from_me: true,
                content: publicUrl,
                type: mediaType,
                ai_generated: false,
                status: 'sent',
            })
            .select('*')
            .single()

        if (insertError) console.error('[send-media] DB Insert Error:', insertError)

        // 6. Atualiza Conversa
        const lastMsgLabel = {
            image: '📷 Imagem',
            video: '🎥 Vídeo',
            audio: '🎵 Áudio',
            document: '📄 Documento'
        }[mediaType]

        await supabaseAdmin
            .from('conversations')
            .update({
                last_message: lastMsgLabel,
                last_message_at: new Date().toISOString(),
                unread_count: 0 // Se eu enviei, eu li
            })
            .eq('id', conversationId)

        // 7. Handoff Automático
        const contactId = formData.get('contactId') as string
        if (contactId) {
            await supabaseAdmin.from('contacts').update({
                ai_tag: 'HUMANO',
                followup_stage: 0,
            }).eq('id', contactId).eq('user_id', session.user.id)
        }

        return NextResponse.json({ success: true, message: insertedMsg })
    } catch (error) {
        console.error('[send-media] Error:', error)
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
    }
}
