/**
 * Webhook da API Oficial da Meta — WhatsApp API Oficial (Admin Only)
 *
 * GET  → Validação do webhook (hub.verify_token + hub.challenge)
 * POST → Recebimento de mensagens normalizadas e passagem para o motor de IA atual
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// ─── GET: Validação do Webhook pela Meta ──────────────────────────────────────
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)

    const mode      = searchParams.get('hub.mode')
    const token     = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode !== 'subscribe' || !token || !challenge) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    // Busca a instância que tem este verify_token configurado
    const supabase = await createSupabaseServerClient()
    const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, meta_config')
        .eq('provider_type', 'META')
        .single()

    const verifyToken = (instance?.meta_config as any)?.verify_token

    if (!verifyToken || token !== verifyToken) {
        console.warn('[Meta Webhook] Verify token inválido:', token)
        return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    console.log('[Meta Webhook] Webhook validado com sucesso!')
    return new NextResponse(challenge, { status: 200 })
}

// ─── POST: Recebimento de Mensagens ──────────────────────────────────────────
export async function POST(request: NextRequest) {
    const rawBody = await request.text()

    // 1. Validação de segurança: X-Hub-Signature-256
    const signature = request.headers.get('x-hub-signature-256')
    const appSecret = process.env.META_APP_SECRET

    if (appSecret && signature) {
        const expectedSig = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
        if (signature !== expectedSig) {
            console.error('[Meta Webhook] Assinatura inválida! Possível spoofing.')
            return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
        }
    }

    let payload: any
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    // 2. Normalização do payload da Meta para o formato padrão do sistema
    try {
        const entry   = payload?.entry?.[0]
        const changes = entry?.changes?.[0]
        const value   = changes?.value

        // Atualiza meta_last_webhook_at na instância
        const supabase = await createSupabaseServerClient()
        const phoneNumberId = value?.metadata?.phone_number_id
        if (phoneNumberId) {
            await supabase
                .from('whatsapp_instances')
                .update({ meta_last_webhook_at: new Date().toISOString() })
                .eq('provider_type', 'META')
                .contains('meta_config', { phone_number_id: phoneNumberId })
        }

        // Processa apenas mensagens (ignora status de leitura etc.)
        const messages = value?.messages
        if (!messages || messages.length === 0) {
            return NextResponse.json({ status: 'ok' })
        }

        for (const message of messages) {
            // Normaliza para o formato padrão do motor de IA
            const normalizedMessage = {
                provider:    'META' as const,
                remoteJid:   `${message.from}@s.whatsapp.net`,
                messageId:   message.id,
                text:        message.text?.body || message.interactive?.button_reply?.title || '',
                timestamp:   Number(message.timestamp),
                pushName:    value?.contacts?.[0]?.profile?.name || message.from,
                phoneNumberId,
            }

            // Log para auditoria
            console.log('[Meta Webhook] Mensagem normalizada:', {
                from:    normalizedMessage.remoteJid,
                text:    normalizedMessage.text?.slice(0, 60),
                msgId:   normalizedMessage.messageId,
            })

            // Fase 6: Integração com o motor de IA (ativada após validação manual)
            // await processMetaMessage(normalizedMessage)
        }

        return NextResponse.json({ status: 'ok' })
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro interno'
        console.error('[Meta Webhook] Erro no processamento:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
