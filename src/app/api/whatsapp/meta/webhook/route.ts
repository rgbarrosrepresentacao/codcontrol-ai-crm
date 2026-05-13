/**
 * Webhook da API Oficial da Meta — WhatsApp API Oficial (Admin Only)
 *
 * GET  → Validação do webhook (hub.verify_token + hub.challenge)
 * POST → Recebimento de mensagens normalizadas e passagem para o motor de IA
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import { processWebhook } from '@/app/api/whatsapp/webhook/route'

// ─── GET: Validação do Webhook pela Meta ──────────────────────────────────────
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)

    const mode      = searchParams.get('hub.mode')
    const token     = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    console.log(`[Meta Webhook] Recebendo validação: mode=${mode}, token=${token}`)

    if (mode === 'subscribe' && token && challenge) {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
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
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: instance, error: dbError } = await supabaseAdmin
        .from('whatsapp_instances')
        .select('instance_name, meta_app_secret_encrypted')
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
            // Ignora mensagens enviadas pelo próprio número (eco)
            if (message.type === 'reaction' || message.type === 'status') continue

            // Extrai o texto da mensagem (texto, botão interativo, etc.)
            const textContent = message.text?.body
                || message.interactive?.button_reply?.title
                || message.interactive?.list_reply?.title
                || ''

            if (!textContent) {
                console.log(`[Meta Webhook] Mensagem sem texto (tipo: ${message.type}). Ignorando.`)
                continue
            }

            const remoteJid   = `${message.from}@s.whatsapp.net`
            const pushName    = value?.contacts?.[0]?.profile?.name || message.from
            const messageId   = message.id

            console.log('[Meta Webhook] 📩 Mensagem recebida:', {
                from:   remoteJid,
                text:   textContent.slice(0, 60),
                msgId:  messageId,
            })

            // ──────────────────────────────────────────────────────────────────
            // BRIDGE: Monta corpo sintético no formato Evolution e chama o motor
            // de IA principal. Isso reutiliza 100% da lógica de funis, IA,
            // base de conhecimento e envio híbrido — sem duplicar nada.
            // ──────────────────────────────────────────────────────────────────
            const syntheticBody = {
                event:    'messages.upsert',
                instance: instance.instance_name,
                data: {
                    key: {
                        fromMe:    false,
                        remoteJid: remoteJid,
                        id:        messageId,
                    },
                    message: {
                        conversation: textContent,
                    },
                    pushName: pushName,
                },
            }

            // Dispara em background para responder 200 OK imediatamente à Meta
            processWebhook(syntheticBody).catch(err =>
                console.error('[Meta Webhook] Erro no motor de IA:', err)
            )
        }

        return NextResponse.json({ status: 'ok' })
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro interno'
        console.error('[Meta Webhook] Erro no processamento:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
