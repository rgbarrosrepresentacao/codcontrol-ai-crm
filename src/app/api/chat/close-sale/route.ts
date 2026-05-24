export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { sendMetaCapiEvent } from '@/lib/capi'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
        }

        const {
            contactId,
            conversationId,
            productName,
            campaignId,
            value,
            currency = 'BRL',
            paymentMethod,
            status = 'confirmed',
            sendToFacebook = false,
        } = await req.json()

        if (!contactId || !productName || value == null || !paymentMethod) {
            return NextResponse.json({ error: 'Campos obrigatórios: contactId, productName, value, paymentMethod' }, { status: 400 })
        }

        // 1) Load contact info for CAPI user data
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select('id, name, push_name, phone, whatsapp_id')
            .eq('id', contactId)
            .eq('user_id', user.id)
            .single()

        if (contactError || !contact) {
            if (contactError) {
                console.error('[close-sale] Database error loading contact:', contactError)
            }
            return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
        }

        // 2) Generate unique event_id for deduplication
        const eventId = `sale_${randomUUID()}`

        // 3) Save sale record (targets 'crm_sales' to prevent conflicts)
        const { data: saleData, error: saleError } = await supabase
            .from('crm_sales')
            .insert({
                user_id: user.id,
                contact_id: contactId,
                conversation_id: conversationId || null,
                campaign_id: campaignId || null,
                product_name: productName,
                value: parseFloat(value),
                currency,
                payment_method: paymentMethod,
                status,
                event_id: eventId,
            })
            .select()
            .single()

        if (saleError) throw saleError

        // 4) Update contact tag to COMPRADOR and status to customer
        const { error: updateError } = await supabase
            .from('contacts')
            .update({
                ai_tag: 'COMPRADOR',
                status: 'customer',
                updated_at: new Date().toISOString(),
            })
            .eq('id', contactId)
            .eq('user_id', user.id)

        if (updateError) {
            console.warn('[close-sale] Warning: could not update contact tag:', updateError)
        }

        let capiResult = null

        // 5) Optionally send Purchase event to Meta CAPI
        if (sendToFacebook) {
            const { data: pixelSettings } = await supabase
                .from('facebook_tracking_settings')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .maybeSingle()

            if (pixelSettings) {
                const ipHeader = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null
                const userAgent = req.headers.get('user-agent') || null

                capiResult = await sendMetaCapiEvent({
                    userId: user.id,
                    pixelId: pixelSettings.pixel_id,
                    capiTokenEncrypted: pixelSettings.capi_token_encrypted,
                    testEventCode: pixelSettings.test_event_code,
                    eventName: 'Purchase',
                    eventId,
                    contactId,
                    conversationId: conversationId || null,
                    saleId: saleData.id,
                    user: {
                        phone: contact.phone,
                        name: contact.name || contact.push_name,
                        email: null,
                        ipAddress: ipHeader,
                        userAgent,
                    },
                    custom: {
                        value: parseFloat(value),
                        productName,
                        currency,
                    },
                })
            } else {
                // Log pending event (no pixel configured)
                await supabase.from('conversion_events').insert({
                    user_id: user.id,
                    sale_id: saleData.id,
                    contact_id: contactId,
                    conversation_id: conversationId || null,
                    event_name: 'Purchase',
                    event_id: eventId,
                    status: 'pending',
                    error_message: 'Pixel não configurado ou inativo',
                })
            }
        }

        return NextResponse.json({
            success: true,
            sale: saleData,
            capi: capiResult,
            sentToFacebook: sendToFacebook && !!capiResult,
            facebookSuccess: capiResult?.success ?? false,
        })
    } catch (error: any) {
        console.error('[close-sale] Error:', error)
        return NextResponse.json({ error: error.message || 'Erro ao registrar venda' }, { status: 500 })
    }
}
