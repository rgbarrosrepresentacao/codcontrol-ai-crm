import { createHash, randomUUID } from 'crypto'
import { getSupabaseAdmin } from './supabase-admin'
import { decrypt } from './crypto'

/**
 * Hash utility for Meta Conversions API (SHA-256)
 */
export function sha256(value: string): string {
    return createHash('sha256')
        .update(value.trim().toLowerCase())
        .digest('hex')
}

/**
 * Format Brazilian phone number:
 * - Strip all non-digits
 * - Ensure it has '55' country prefix
 */
export function formatPhoneForMeta(phone: string): string {
    const cleaned = phone.replace(/\D/g, '')
    if (!cleaned) return ''
    
    // If it's already 55 + DDD + Number (12 or 13 digits)
    if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
        return cleaned
    }
    
    // If it's just DDD + Number (10 or 11 digits)
    if (cleaned.length === 10 || cleaned.length === 11) {
        return '55' + cleaned
    }
    
    return cleaned
}

interface MetaCapiUser {
    phone?: string | null
    name?: string | null
    email?: string | null
    ipAddress?: string | null
    userAgent?: string | null
}

interface MetaCapiCustomData {
    value: number
    productName: string
    currency?: string
}

interface MetaCapiParams {
    userId: string
    pixelId: string
    capiTokenEncrypted: string
    testEventCode?: string | null
    eventName: 'PageView' | 'Lead' | 'Purchase'
    eventId?: string // Deduplication ID
    contactId?: string | null
    conversationId?: string | null
    saleId?: string | null
    user: MetaCapiUser
    custom?: MetaCapiCustomData
}

export async function sendMetaCapiEvent(params: MetaCapiParams) {
    const supabase = getSupabaseAdmin()
    const eventId = params.eventId || `evt_${randomUUID()}`
    
    let capiToken = ''
    try {
        capiToken = decrypt(params.capiTokenEncrypted)
    } catch (err: any) {
        console.error('[CAPI] Error decrypting token:', err)
        return {
            success: false,
            error: 'Erro de criptografia ao descriptografar o token de acesso CAPI.'
        }
    }

    const userData: any = {
        client_ip_address: params.user.ipAddress || '127.0.0.1',
        client_user_agent: params.user.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    // Hash user data in SHA-256 according to Meta specs
    if (params.user.phone) {
        const formatted = formatPhoneForMeta(params.user.phone)
        if (formatted) {
            userData.ph = [sha256(formatted)]
        }
    }
    
    if (params.user.email) {
        userData.em = [sha256(params.user.email)]
    }

    if (params.user.name) {
        const nameParts = params.user.name.trim().split(/\s+/)
        const firstName = nameParts[0]
        const lastName = nameParts.slice(1).join(' ')
        if (firstName) {
            userData.fn = [sha256(firstName)]
        }
        if (lastName) {
            userData.ln = [sha256(lastName)]
        }
    }

    const eventPayload: any = {
        event_name: params.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'chat',
        event_id: eventId,
        user_data: userData
    }

    if (params.custom) {
        eventPayload.custom_data = {
            currency: params.custom.currency || 'BRL',
            value: params.custom.value,
            content_type: 'product',
            contents: [
                {
                    id: params.custom.productName,
                    quantity: 1,
                    item_price: params.custom.value
                }
            ]
        }
    }

    const bodyPayload = {
        data: [eventPayload],
        ...(params.testEventCode ? { test_event_code: params.testEventCode } : {})
    }

    const url = `https://graph.facebook.com/v19.0/${params.pixelId}/events?access_token=${capiToken}`

    let status: 'sent' | 'failed' = 'failed'
    let errorMessage: string | null = null
    let responseBody: any = null

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyPayload)
        })

        responseBody = await res.json()

        if (res.ok && responseBody.events_received > 0) {
            status = 'sent'
        } else {
            status = 'failed'
            errorMessage = responseBody.error?.message || JSON.stringify(responseBody)
        }
    } catch (err: any) {
        console.error('[CAPI] Meta API request error:', err)
        status = 'failed'
        errorMessage = err.message || 'Erro de rede ou conexão com a API da Meta.'
    }

    // Save logs into database `conversion_events` table using admin client
    try {
        const { error: dbError } = await supabase
            .from('conversion_events')
            .insert({
                user_id: params.userId,
                sale_id: params.saleId || null,
                contact_id: params.contactId || null,
                conversation_id: params.conversationId || null,
                event_name: params.eventName,
                pixel_id: params.pixelId,
                event_id: eventId,
                status,
                error_message: errorMessage,
                payload: bodyPayload,
                response: responseBody,
                sent_at: status === 'sent' ? new Date().toISOString() : null
            })
            
        if (dbError) {
            console.error('[CAPI] Error logging event in database:', dbError)
        }
    } catch (err: any) {
        console.error('[CAPI] Exception logging event in database:', err)
    }

    return {
        success: status === 'sent',
        eventId,
        response: responseBody,
        error: errorMessage
    }
}
