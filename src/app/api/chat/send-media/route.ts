import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { evolutionApi } from '@/lib/evolution'
import { MetaProvider } from '@/services/whatsapp/MetaProvider'
import {
    validateMediaFile,
    sanitizeStoragePath,
    friendlyMediaError,
    type MediaCategory,
} from '@/lib/media-validator'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const supabaseAdmin = getSupabaseAdmin()
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

        const formData = await req.formData()
        const file = formData.get('file') as File
        const conversationId = formData.get('conversationId') as string
        const instanceId = formData.get('instanceId') as string
        const contactWhatsappId = formData.get('contactWhatsappId') as string
        const caption = formData.get('caption') as string || ''

        if (!file || !conversationId || !instanceId || !contactWhatsappId) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
        }

        // ── 1. Validação de Mídia ─────────────────────────────────────────────
        const logCtx = `send-media/${user.id}/${conversationId}`
        console.log(`[MEDIA_VALIDATE] [${logCtx}] Recebido: name="${file.name}" mime="${file.type}" size=${file.size}`)

        const validation = await validateMediaFile(file, undefined, logCtx)

        if (!validation.valid) {
            console.warn(`[MEDIA_REJECTED] [${logCtx}] ${validation.error} | mime=${file.type} | size=${file.size}`)
            return NextResponse.json(
                { error: friendlyMediaError(validation) },
                { status: 422 }
            )
        }

        const mediaCategory = validation.category as MediaCategory

        // ── 2. Busca instância e provedor ─────────────────────────────────────
        const { data: instance, error: instanceErr } = await supabaseAdmin
            .from('whatsapp_instances')
            .select('*')
            .eq('id', instanceId)
            .eq('user_id', user.id)
            .single()

        if (instanceErr || !instance) {
            return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })
        }

        // ── 3. Detecta tipo de mídia para o WhatsApp ──────────────────────────
        // Usa a categoria validada como fonte de verdade, não o MIME raw.
        let mediaType: 'image' | 'video' | 'audio' | 'document' = mediaCategory
        // WebM gravado pelo recorder pode ter MIME video/webm mas é áudio
        if (file.type.includes('webm') && mediaType === 'video') mediaType = 'audio'

        console.log(`[MEDIA_VALIDATE] [${logCtx}] category=${mediaCategory} | whatsapp_type=${mediaType}`)

        // ── 4. Upload para Supabase Storage (caminho sanitizado) ─────────────
        // NUNCA usa o nome original do arquivo como path final.
        // Path sempre: {userId}/{conversationId}/{UUID}.{ext}
        const filePath = sanitizeStoragePath(
            file.name || 'upload',
            validation.mimeType,
            `${user.id}/${conversationId}`
        )

        console.log(`[MEDIA_UPLOAD_START] [${logCtx}] path=${filePath} | size=${validation.sizeBytes}`)

        const { error: uploadError } = await supabaseAdmin.storage
            .from('chat-media')
            .upload(filePath, file, {
                contentType: validation.mimeType,
                cacheControl: '3600',
                upsert: false
            })

        if (uploadError) {
            console.error(`[MEDIA_UPLOAD_FAILED] [${logCtx}] ${uploadError.message}`)
            return NextResponse.json({ error: 'Falha no upload do arquivo' }, { status: 500 })
        }

        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('chat-media')
            .getPublicUrl(filePath)

        console.log(`[MEDIA_UPLOAD_DONE] [${logCtx}] url=${publicUrl}`)

        // ── 5. Envia via Provedor ─────────────────────────────────────────────
        let messageId = ''
        try {
            if (instance.provider_type === 'META') {
                const provider = new MetaProvider(
                    instance.meta_config as any,
                    instance.meta_access_token_encrypted
                )

                // Upload direto para Meta — buffer já validado em tamanho (seguro em RAM)
                const buffer = Buffer.from(await file.arrayBuffer())
                const mediaId = await provider.uploadMedia(buffer, validation.mimeType)

                let result;
                if (mediaId) {
                    result = await provider.sendMedia(contactWhatsappId, { id: mediaId }, mediaType, caption)
                } else {
                    console.warn(`[MEDIA_UPLOAD_FAILED] [${logCtx}] Meta Direct Upload falhou, usando link público`)
                    result = await provider.sendMedia(contactWhatsappId, { link: publicUrl }, mediaType, caption)
                }

                if (!result.success) {
                    throw new Error(result.error || `Falha ao enviar ${mediaType} via Meta`)
                }
                messageId = result.message_id || ''
            } else {
                // Provedor Evolution
                if (mediaType === 'audio') {
                    await evolutionApi.sendPresence(instance.instance_name, contactWhatsappId, 'recording')
                    await new Promise(r => setTimeout(r, 1500))

                    // Base64 é mais confiável para Nota de Voz na Evolution.
                    // Buffer já validado (máx 15 MB) — seguro em RAM.
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
            console.error(`[MEDIA_UPLOAD_FAILED] [${logCtx}] Provider error: ${error.message}`)
            return NextResponse.json({ error: error.message || 'Falha ao enviar via provedor' }, { status: 500 })
        }

        // ── 6. Salva no Banco de Dados ───────────────────────────────────────
        const { data: insertedMsg, error: insertError } = await supabaseAdmin
            .from('messages')
            .insert({
                user_id: user.id,
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

        if (insertError) console.error(`[MEDIA_UPLOAD_FAILED] [${logCtx}] DB insert: ${insertError.message}`)

        // ── 7. Atualiza Conversa ─────────────────────────────────────────────
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
                unread_count: 0
            })
            .eq('id', conversationId)

        // ── 8. Handoff Automático ────────────────────────────────────────────
        const contactId = formData.get('contactId') as string
        if (contactId) {
            await supabaseAdmin.from('contacts').update({
                ai_tag: 'HUMANO',
                followup_stage: 0,
            }).eq('id', contactId).eq('user_id', user.id)
        }

        return NextResponse.json({ success: true, message: insertedMsg })
    } catch (error) {
        console.error('[MEDIA_UPLOAD_FAILED] [send-media] Erro inesperado:', error)
        return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
    }
}
