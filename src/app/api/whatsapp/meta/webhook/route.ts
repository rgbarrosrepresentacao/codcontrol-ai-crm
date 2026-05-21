export const dynamic = 'force-dynamic'
/**
 * Webhook da API Oficial da Meta — WhatsApp API Oficial (Admin Only)
 *
 * GET  → Validação do webhook (hub.verify_token + hub.challenge)
 * POST → Recebimento de mensagens normalizadas e passagem para o motor de IA
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto, { createHmac } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import { processWebhook } from '@/services/whatsapp/orchestrator'

// ─── GET: Validação do Webhook pela Meta ──────────────────────────────────────
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)

    const mode      = searchParams.get('hub.mode')
    const token     = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    console.log(`[Meta Webhook] Recebendo validação: mode=${mode}, token=${token}`)

    if (mode === 'subscribe' && token && challenge) {
        const supabase = getSupabaseAdmin()
        
        const { data: instances, error } = await supabase
            .from('whatsapp_instances')
            .select('meta_config')
            .eq('provider_type', 'META')

        if (error) {
            console.error('[Meta Webhook] Erro ao buscar instâncias no DB:', error)
            return new Response('Internal Error', { status: 500 })
        }

        const isValid = instances?.some(inst => (inst.meta_config as any)?.verify_token === token)

        if (isValid) {
            console.log(`[Meta Webhook] Validação bem-sucedida para o token: ${token}`)
            return new Response(challenge, { 
                status: 200,
                headers: { 'Content-Type': 'text/plain' }
            })
        }
        
        console.warn(`[Meta Webhook] Token de verificação não encontrado ou inválido: ${token}`)
    }

    return new Response('Forbidden', { status: 403 })
}

// ─── POST: Recebimento de Mensagens ──────────────────────────────────────────
export async function POST(request: NextRequest) {
    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256')

    let payload: any
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    // 1. Identifica a instância pelo WABA ID para buscar o App Secret
    const wabaId = payload?.entry?.[0]?.id
    
    if (!wabaId) {
        console.error('[Meta Webhook] WABA ID não encontrado no payload')
        return NextResponse.json({ error: 'WABA ID missing' }, { status: 400 })
    }

    // Usamos o cliente administrativo para buscar o Secret
    const supabaseAdmin = getSupabaseAdmin()

    const { data: instance, error: dbError } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('instance_name, meta_app_secret_encrypted, meta_access_token_encrypted')
        .eq('provider_type', 'META')
        .filter('meta_config->>waba_id', 'eq', wabaId)
        .maybeSingle()

    if (dbError || !instance || !instance.meta_app_secret_encrypted) {
        console.error(`[Meta Webhook] Instância ou Secret não encontrado para WABA: ${wabaId}`)
        return NextResponse.json({ error: 'Instance not configured' }, { status: 404 })
    }

    // 2. Validação de segurança dinâmica: X-Hub-Signature-256
    try {
        const appSecret = decrypt(instance.meta_app_secret_encrypted)
        
        if (signature) {
            const expectedSig = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
            if (signature !== expectedSig) {
                console.error('[Meta Webhook] Assinatura inválida! Possível spoofing.')
                return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
            }
        }
    } catch (decryptError) {
        console.error('[Meta Webhook] Erro ao descriptografar App Secret:', decryptError)
        return NextResponse.json({ error: 'Internal security error' }, { status: 500 })
    }

    // 3. Normaliza e encaminha para o motor de IA
    try {
        const entry   = payload?.entry?.[0]
        const changes = entry?.changes?.[0]
        const value   = changes?.value

        // Atualiza meta_last_webhook_at
        const supabase = await createSupabaseServerClient()
        const phoneNumberId = value?.metadata?.phone_number_id
        if (phoneNumberId) {
            await supabase
                .from('whatsapp_instances')
                .update({ meta_last_webhook_at: new Date().toISOString() })
                .eq('provider_type', 'META')
                .contains('meta_config', { phone_number_id: phoneNumberId })
        }

        // Ignora eventos que não são mensagens (status de leitura, etc.)
        const messages = value?.messages
        if (!messages || messages.length === 0) {
            return NextResponse.json({ status: 'ok', reason: 'no_messages' })
        }

        // Processa cada mensagem recebida
        for (const message of messages) {
            if (message.type === 'reaction' || message.type === 'status') continue

            // ── C2: Fallback obrigatório para provider_event_id ──
            let providerEventId = message.id
            if (!providerEventId) {
                const remoteJid = `${message.from || ''}@s.whatsapp.net`
                const timestamp = String(Date.now())
                const payloadString = JSON.stringify(message)
                const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex')

                const rawString = `meta:${instance.instance_name}:messages.upsert:${remoteJid}:${timestamp}:${payloadHash}`
                providerEventId = `FALLBACK_${crypto.createHash('sha256').update(rawString).digest('hex')}`
                console.log(`[Meta Webhook] provider_event_id ausente. Gerado hash de fallback: ${providerEventId}`)
            }

            let textContent = ''
            let publicUrl = ''

            // ── C4: Suporte a Áudio recebido pela Meta com Timeout de request ──
            if (message.type === 'audio' || message.type === 'voice') {
                const mediaId = message.audio?.id || message.voice?.id
                console.log(`[Meta Webhook] 🎙️ Áudio recebido (media_id: ${mediaId}). Fazendo download e upload...`)

                if (mediaId && instance.meta_access_token_encrypted) {
                    // Passo 1: Obter URL temporária do arquivo de áudio com abort timeout curto (5s)
                    const controller1 = new AbortController()
                    const timeoutId1 = setTimeout(() => controller1.abort(), 5000)
                    
                    try {
                        const accessToken = decrypt(instance.meta_access_token_encrypted)

                        const mediaInfoRes = await fetch(
                            `https://graph.facebook.com/v20.0/${mediaId}`,
                            { 
                                headers: { 'Authorization': `Bearer ${accessToken}` },
                                signal: controller1.signal
                            }
                        )
                        const mediaInfo = await mediaInfoRes.json()

                        if (mediaInfoRes.ok && mediaInfo.url) {
                            // Passo 2: Baixar o arquivo de áudio com abort timeout curto (8s)
                            const controller2 = new AbortController()
                            const timeoutId2 = setTimeout(() => controller2.abort(), 8000)

                            try {
                                const audioRes = await fetch(mediaInfo.url, {
                                    headers: { 'Authorization': `Bearer ${accessToken}` },
                                    signal: controller2.signal
                                })

                                if (audioRes.ok) {
                                    const audioBuffer = await audioRes.arrayBuffer()
                                    const fileBuffer = Buffer.from(audioBuffer)

                                    // Passo 3: Upload para o Supabase Storage
                                    const fileName = `received-audios/${instance.instance_name}/${crypto.randomUUID()}.${mediaInfo.mime_type?.split('/')[1] || 'ogg'}`
                                    const { error: uploadError } = await supabaseAdmin.storage
                                        .from('chat-media')
                                        .upload(fileName, fileBuffer, { contentType: mediaInfo.mime_type || 'audio/ogg' })

                                    if (!uploadError) {
                                        const { data: storageData } = supabaseAdmin.storage
                                            .from('chat-media')
                                            .getPublicUrl(fileName)
                                        publicUrl = storageData.publicUrl
                                        console.log(`[Meta Webhook] Áudio salvo no Storage: ${publicUrl}`)
                                    } else {
                                        console.error('[Meta Webhook] Erro no upload para Supabase Storage:', uploadError)
                                    }
                                } else {
                                    console.error('[Meta Webhook] Falha ao baixar áudio da Meta')
                                }
                            } finally {
                                clearTimeout(timeoutId2)
                            }
                        } else {
                            console.error('[Meta Webhook] Falha ao obter URL de mídia da Meta:', mediaInfo?.error?.message)
                        }
                    } catch (audioErr: any) {
                        if (audioErr.name === 'AbortError') {
                            console.error('[Meta Webhook] ⏱️ Timeout ao baixar mídia da Meta (Abortado)')
                        } else {
                            console.error('[Meta Webhook] Exceção ao baixar/upload de áudio:', audioErr)
                        }
                    } finally {
                        clearTimeout(timeoutId1)
                    }
                } else {
                    console.warn('[Meta Webhook] ⚠️ Áudio sem media_id ou token. Ignorando download.')
                }
            } else {
                textContent = message.text?.body
                    || message.interactive?.button_reply?.title
                    || message.interactive?.list_reply?.title
                    || ''
            }

            const wasAudio = message.type === 'audio' || message.type === 'voice'
            if (!textContent && !wasAudio) {
                console.log(`[Meta Webhook] Mensagem sem texto e sem áudio (tipo: ${message.type}). Ignorando.`)
                continue
            }

            const remoteJid = `${message.from}@s.whatsapp.net`
            const pushName = value?.contacts?.[0]?.profile?.name || message.from

            const syntheticBody = {
                event: 'messages.upsert',
                instance: instance.instance_name,
                provider: 'meta',
                metaAudioUrl: publicUrl || undefined,
                data: {
                    key: {
                        fromMe: false,
                        remoteJid: remoteJid,
                        id: providerEventId,
                    },
                    message: {
                        conversation: textContent || undefined,
                        ...(wasAudio && {
                            audioMessage: {
                                url: publicUrl
                            },
                            pttMessage: { url: publicUrl }
                        }),
                    },
                    pushName: pushName,
                },
            }

            const correlationId = crypto.randomUUID()
            console.log(`[Meta Webhook] [${correlationId}] Registrando job para MsgID: ${providerEventId}`)

            const { error: insertError } = await supabaseAdmin
                .from('webhook_jobs')
                .insert({
                    correlation_id: correlationId,
                    provider: 'meta',
                    instance_name: instance.instance_name,
                    event_type: 'messages.upsert',
                    provider_event_id: providerEventId,
                    payload: syntheticBody,
                    status: 'pending'
                })

            if (insertError) {
                if (insertError.code === '23505') {
                    console.log(`[WEBHOOK_DEDUP] [${correlationId}] Evento duplicado ignorado. MsgID: ${providerEventId}`)
                } else {
                    console.error(`[WEBHOOK_JOB_FAILED_CREATE] [${correlationId}] Erro ao registrar job no DB:`, insertError)
                }
            } else {
                console.log(`[WEBHOOK_JOB_CREATED] [${correlationId}] Job registrado com sucesso. MsgID: ${providerEventId}`)
            }
        }

        return NextResponse.json({ status: 'ok' })
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro interno'
        console.error('[Meta Webhook] Erro no processamento:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

